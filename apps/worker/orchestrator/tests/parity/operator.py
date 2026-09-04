"""Operator parity: compare outcomes, not trajectory.

The turn pipeline is replayable step for step — the playbook owns control flow
and the LLM only produces data. The Operator plane is the opposite: the model
decides each hop, so two runs of the same command legitimately take different
routes. Comparing trajectories would fail on differences nobody cares about.

What must not vary is the **outcome**: which tools were called with which
arguments, what was sent or drafted, and the final sanitised reply. That is
what this differ compares.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from app.llm import gateway
from app.llm.gateway import LLMCallStats
from app.operator import agent
from app.outbound import dispatcher
from app.schemas.envelope import RuntimeConfig
from app.stores import directory, events

#: Commands normally carry the tenant's runtime, and without it there is no
#: playbook — so no forbidden-phrase list. Scenarios that exercise guardrails
#: must supply one or they silently test nothing.
PARITY_RUNTIME = RuntimeConfig.model_validate({
    "playbook_id": "real-estate-v1", "knowledge_source_id": "plucia_re",
    "model_id": "m", "adapter_id": None, "playbook_version": 8,
    "prompt_version": "2026-06-01",
})

#: Compared, in report order.
OPERATOR_FIELDS: tuple[str, ...] = (
    "tool_calls",       # [(name, canonical args)] — what the agent did
    "action_status",    # sent | draft | failed | None
    "action_text",      # what the buyer would receive
    "action_channel",
    "dispatched",       # did anything actually leave
    "reply",            # the sanitised report to the salesperson
    "outcome",
)

#: Excluded: step ordering, thoughts, reasoning, latencies, ids. All of these
#: legitimately vary between runs of a model-driven loop.
EXCLUDED = ("steps", "thought", "reasoning", "latency", "thread_id", "message_id")


def _canonical_args(args: dict) -> dict:
    """Drop what cannot be compared across runs, keep what decides behaviour."""
    return {
        key: value
        for key, value in sorted((args or {}).items())
        if key not in ("contact_id",)  # a fresh ObjectId every run
    }


@dataclass
class OperatorScenario:
    id: str
    case: str
    description: str
    command: str
    mode: str
    #: Raw model responses in call order.
    responses: list[str]
    #: Off only for the scenario that deliberately exercises the no-runtime gap.
    with_runtime: bool = True


async def observe_operator(db, scenario: OperatorScenario, monkeypatch) -> dict:
    """Run one scenario and reduce it to the compared fields."""
    sent: list[dict] = []

    async def capture(**kwargs: Any) -> None:
        sent.append(kwargs)

    async def silent(*_a: Any, **_k: Any) -> bool:
        return True

    async def no_mailbox(tenant_id, user_id):
        return []

    queue = list(scenario.responses)

    async def scripted(*, model, messages, temperature=0.3):
        text = queue.pop(0) if queue else json.dumps(
            {"thought": "done", "operator_output": "Done."}
        )
        return text, LLMCallStats()

    monkeypatch.setattr(dispatcher, "dispatch", capture)
    monkeypatch.setattr(events, "publish", silent)
    monkeypatch.setattr(directory, "entries_for", no_mailbox)
    monkeypatch.setattr(gateway, "chat_text", scripted)

    outcome = "ok"
    result = None
    try:
        result = await agent.run_command(
            db, tenant_id="parity", text=scenario.command, mode=scenario.mode,
            runtime=PARITY_RUNTIME if scenario.with_runtime else None,
        )
    except Exception as exc:  # noqa: BLE001 — the outcome is the datum
        outcome = f"raised:{type(exc).__name__}"

    message = (result or {}).get("message") or {}
    action = message.get("action") or {}
    return {
        "tool_calls": [
            (step["tool"], _canonical_args(step.get("args", {})))
            for step in message.get("steps", [])
            if step.get("type") == "tool"
        ],
        "action_status": action.get("status"),
        "action_text": action.get("text"),
        "action_channel": action.get("channel"),
        "dispatched": bool(sent),
        "reply": message.get("text"),
        "outcome": outcome,
    }


def diff_operator(left: dict, right: dict) -> list[str]:
    """Field names that differ, in report order."""
    return [name for name in OPERATOR_FIELDS if left.get(name) != right.get(name)]


# --------------------------------------------------------------------------- #
# Scenarios
# --------------------------------------------------------------------------- #
def _send(to: str, text: str, channel: str = "email") -> str:
    return json.dumps({
        "thought": "sending",
        "tool": "send_message",
        "args": {"to": to, "channel": channel, "text": text},
    })


def _report(text: str) -> str:
    return json.dumps({"thought": "done", "operator_output": text})


def _lookup(query: str) -> str:
    return json.dumps({"thought": "looking", "tool": "find_recipient", "args": {"query": query}})


SCENARIOS: list[OperatorScenario] = [
    OperatorScenario(
        "op-send-autopilot", "send",
        "A clean autopilot send reaches the dispatcher.",
        "email ada@example.com about the viewing", "autopilot",
        [_send("ada@example.com", "Happy to help — shall I book a viewing?"),
         _report("Emailed Ada.")],
    ),
    OperatorScenario(
        "op-send-copilot", "send",
        "The same send in copilot drafts and dispatches nothing.",
        "email ada@example.com about the viewing", "copilot",
        [_send("ada@example.com", "Happy to help — shall I book a viewing?"),
         _report("Drafted for Ada.")],
    ),
    OperatorScenario(
        "op-forbidden-blocked", "guardrail",
        "A forbidden phrase is forced to draft even in autopilot — the gap 6b closed.",
        "tell ada about the guaranteed returns", "autopilot",
        [_send("ada@example.com", "This project offers guaranteed returns."),
         _report("Sent.")],
    ),
    OperatorScenario(
        "op-lookup-then-send", "multi_step",
        "Two tool calls: resolve, then send.",
        "email ada about pricing", "autopilot",
        [_lookup("ada"), _send("ada@example.com", "Pricing attached."), _report("Done.")],
    ),
    OperatorScenario(
        "op-clarify-no-action", "clarify",
        "An ambiguous command asks rather than acting.",
        "email them", "autopilot",
        [_report("Which contact did you mean?")],
    ),
    OperatorScenario(
        "op-dedupe", "guardrail",
        "The same send twice in one command fires once.",
        "email ada twice", "autopilot",
        [_send("ada@example.com", "Same words."),
         _send("ada@example.com", "Same words."),
         _report("Sent once.")],
    ),
    OperatorScenario(
        "op-unparseable", "recovery",
        "One malformed reply is nudged, then recovered.",
        "say hi", "copilot",
        ["not json at all", _report("Recovered.")],
    ),
    OperatorScenario(
        "op-salvage", "recovery",
        "Two malformed replies salvage the intended report.",
        "say hi", "copilot",
        ["not json", 'debris "operator_output": "Salvaged report." more'],
    ),
    OperatorScenario(
        "op-unknown-tool", "recovery",
        "An invented tool name is a soft observation, not a crash.",
        "do something odd", "copilot",
        [json.dumps({"thought": "try", "tool": "teleport", "args": {}}),
         _report("That is not something I can do.")],
    ),
    OperatorScenario(
        "op-no-runtime", "guardrail",
        "Without a runtime there is no playbook, so no forbidden-phrase list — "
        "sanitisation still runs, but this is a real hole and the fixture says so.",
        "tell ada about the guaranteed returns", "autopilot",
        [_send("ada@example.com", "This project offers guaranteed returns."),
         _report("Sent.")],
        with_runtime=False,
    ),
    OperatorScenario(
        "op-bad-channel", "guardrail",
        "An unsupported channel fails cleanly and sends nothing.",
        "fax ada", "autopilot",
        [_send("ada@example.com", "hello", channel="fax"), _report("Cannot fax.")],
    ),
]
