"""The operator graph: a salesperson's typed command becomes an action.

The model owns control flow here — that is the point of this plane, and the
opposite of the turn graph. `call_model` decides each hop and the routers only
read what it decided, so the cycle `call_model → run_tool → call_model` is
driven entirely by model output.

What is *not* the model's to decide: the step budget, whether an action is a
draft or a send, and what the salesperson is finally told. Those stay on the
edges and in the terminal node.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from bson import ObjectId
from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime

from ..config import settings
from ..llm import gateway
from ..llm.gateway import _parse_json_block
from ..mcp import client as mcp_client
from ..operator import prompt as prompt_module
from ..operator import reasoning
from ..operator import tools as tools_module
from ..operator.prompt import MAX_STEPS, SYSTEM_PROMPT, ThreadNotFound
from ..operator.sanitize import salvage_operator_output, sanitize_operator_output
from ..stores import events
from .checkpointer import get_checkpointer
from .context import GraphContext
from .operator_state import RESET, OperatorState
from .policy import best_effort, critical, register

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _publish_step(state: OperatorState, step: dict) -> None:
    """Stream one step live to the issuing dashboard.

    `events.publish` never raises, which is why this can sit inside a critical
    node: losing the live trace must not lose the command.
    """
    await events.publish(
        state.tenant_id,
        "operator.step",
        {
            "thread_id": state.thread_id,
            "client_ref": state.client_ref,
            "step": step,
        },
    )


# --------------------------------------------------------------------------- #
# Nodes
# --------------------------------------------------------------------------- #
@best_effort("discover_connectors", timeout=settings.node_timeout_retrieval)
async def discover_connectors_node(
    state: OperatorState, runtime: Runtime[GraphContext]
) -> dict:
    """Whatever the user has connected becomes callable this run.

    Discovery is per command so a connector granted a moment ago is usable
    immediately, and a connector outage degrades to the built-in tools.
    """
    connectors = await mcp_client.list_tools(state.user_id, state.mode)
    return {
        "tool_registry": connectors,
        "connector_names": [tool["name"] for tool in connectors],
    }


async def resolve_thread(db, state_like) -> ObjectId:
    """Find or create the operator thread.

    Outside the graph because the checkpointer is keyed on it: the config for
    the run has to name the thread before the run starts. Identity first, then
    state — the same order the turn plane reserves `request_id` in.
    """
    if state_like.requested_thread_id:
        thread_id = ObjectId(state_like.requested_thread_id)
        thread = await db.operator_threads.find_one(
            {"_id": thread_id, "tenant_id": state_like.tenant_id}
        )
        if thread is None:
            raise ThreadNotFound(state_like.requested_thread_id)
        return thread_id

    res = await db.operator_threads.insert_one(
        {
            "tenant_id": state_like.tenant_id,
            "user_id": state_like.user_id,
            "session_id": state_like.session_id,
            "title": state_like.text[:60],
            "created_at": _now(),
            "last_message_at": _now(),
        }
    )
    return res.inserted_id


@critical("load_thread")
async def load_thread_node(state: OperatorState, runtime: Runtime[GraphContext]) -> dict:
    """Clear the previous command's working state, then read the thread.

    The reset is here rather than in its own node because it has to happen
    before anything appends: a thread-keyed checkpointer carries channel values
    across commands, and `conversation`/`steps` are per-command.

    `prior_candidates` still comes from the persisted message rather than from
    checkpointed state. Checkpoints are a runtime convenience that a retention
    policy will eventually prune; the pick-list is behaviour the product
    depends on, and it should not vanish when a checkpoint does.
    """
    db = runtime.context.db
    thread_id = ObjectId(state.thread_id)
    history = await prompt_module.thread_history(db, thread_id)
    prior_candidates = await prompt_module.last_candidates(db, thread_id)
    await db.operator_messages.insert_one(
        {
            "tenant_id": state.tenant_id,
            "user_id": state.user_id,
            "session_id": state.session_id,
            "thread_id": thread_id,
            "role": "user",
            "text": state.text,
            "created_at": _now(),
        }
    )
    return {
        "history": history,
        "prior_candidates": prior_candidates,
        "conversation": RESET,
        "steps": RESET,
        "steps_used": 0,
        "parse_failures": 0,
        "pending": None,
        "action_result": None,
        "operator_output": "",
        "reply": None,
        "last_reasoning": "",
    }


@critical("compact")
async def compact_node(state: OperatorState, runtime: Runtime[GraphContext]) -> dict:
    """The user-turn boundary, as one testable node.

    Implements the retention rule from Phase 1c: the model's reasoning is
    replayed across tool calls *within* a command, and dropped for prior
    commands. Reasoning routinely exceeds the answer in length — measured at
    ~93% of extraction output tokens and ~71% of generation — so retaining it
    across user turns would grow the prompt without bound.

    Also trims to the history window. Both jobs belong at the same boundary,
    and putting them in one node means "what does the model remember from
    before?" has exactly one answer to read.
    """
    trimmed = state.history[-prompt_module.HISTORY_WINDOW :]
    return {
        "history": [
            {**message, "content": reasoning.strip(str(message.get("content", "")))}
            for message in trimmed
        ]
    }


@critical("build_prompt")
async def build_prompt_node(state: OperatorState, runtime: Runtime[GraphContext]) -> dict:
    system = SYSTEM_PROMPT.format(
        mode=state.mode,
        preferred_channel=state.preferred_channel or "whatsapp",
        connector_tools=prompt_module.connector_tool_block(state.tool_registry),
        now=prompt_module.now_for_prompt(state.time_zone),
    )
    conversation: list[dict] = [{"role": "system", "content": system}]
    if state.prior_candidates:
        conversation.append(
            {
                "role": "system",
                "content": prompt_module.candidates_block(state.prior_candidates),
            }
        )
    conversation += [*state.history, {"role": "user", "content": state.text}]
    return {"conversation": conversation}


@critical("call_model", timeout=settings.node_timeout_operator_step)
async def call_model_node(state: OperatorState, runtime: Runtime[GraphContext]) -> dict:
    response = await gateway.chat_text(model=state.model, messages=state.conversation)
    raw, _stats = response
    update: dict = {
        "steps_used": state.steps_used + 1,
        # Carried on `pending` so `run_tool` can replay it on the assistant
        # turn it builds. Not persisted anywhere — see `operator/reasoning.py`.
        "last_reasoning": reasoning.of(response, raw),
    }

    try:
        data = _parse_json_block(raw)
    except (ValueError, json.JSONDecodeError):
        # The recovery is two explicit nodes, not a branch here — see
        # `nudge_json` / `salvage_json`.
        update["parse_failures"] = state.parse_failures + 1
        update["pending"] = {"kind": "unparseable", "raw": raw}
        return update

    thought = str(data.get("thought") or "").strip()
    if thought:
        step = {"type": "thought", "text": thought}
        update["steps"] = [step]
        await _publish_step(state, step)

    if data.get("tool"):
        update["pending"] = {"kind": "tool", "data": data}
    else:
        update["pending"] = {"kind": "final"}
        update["operator_output"] = str(data.get("operator_output") or "").strip()
    return update


@critical("run_tool", timeout=settings.node_timeout_operator_step)
async def run_tool_node(state: OperatorState, runtime: Runtime[GraphContext]) -> dict:
    data = state.pending["data"]
    name = str(data.get("tool"))
    args = data.get("args") or {}

    # Read tools are pure within a command, so an identical repeat is the model
    # having lost track — and it costs a step from a budget of 8. Serve the
    # previous observation and tell it, rather than paying for the round trip
    # again. Only reads: `send_message` has its own dedupe, which has to record
    # an *attempt* rather than replay one.
    repeat_key = f"{name}\x1f{json.dumps(args, sort_keys=True, default=str)}"
    if name != "send_message":
        for previous in reversed(state.steps):
            if previous.get("type") == "tool" and previous.get("repeat_key") == repeat_key:
                cached = dict(previous["observation"])
                cached["note"] = (
                    "You already called this with the same arguments in this "
                    "command; this is the same result. Act on it rather than "
                    "repeating the call."
                )
                step = {"type": "tool", "tool": name, "args": args,
                        "observation": cached, "repeat_key": repeat_key,
                        "cached": True}
                await _publish_step(state, step)
                return {
                    "steps": [step],
                    "conversation": [
                        reasoning.assistant_message(json.dumps(data), state.last_reasoning),
                        {"role": "user",
                         "content": f"Tool result:\n{json.dumps(cached, default=str)}"},
                    ],
                }

    sent_keys = set(state.sent_keys)
    observation = await tools_module.run_tool(
        runtime.context.db,
        state.tenant_id,
        state.mode,
        state.runtime,
        name,
        args,
        sent_keys,
        state.user_id,
        frozenset(state.connector_names),
    )
    update: dict = {"sent_keys": sorted(sent_keys - set(state.sent_keys))}

    if name == "find_recipient" and observation.get("matches"):
        update["offered_candidates"] = observation["matches"]

    # send_message is the acting tool — its result drives the UI action.
    if name == "send_message" and observation.get("type") == "send_message":
        update["action_result"] = observation
        log = logger.warning if observation["status"] == "failed" else logger.info
        log("operator send tenant=%s %s", state.tenant_id, observation)
        if observation["status"] in ("draft", "sent"):
            await events.publish(
                state.tenant_id,
                "message.created",
                {
                    "conversation_id": observation["conversation_id"],
                    "channel": observation["channel"],
                    "direction": "outbound",
                    "status": observation["status"],
                },
            )

    step = {
        "type": "tool", "tool": name, "args": args,
        "observation": observation, "repeat_key": repeat_key,
    }
    await _publish_step(state, step)
    update["steps"] = [step]
    update["conversation"] = [
        # The model's own reasoning rides along, so the next step plans from
        # where it left off rather than re-deriving from the observation trail.
        reasoning.assistant_message(json.dumps(data), state.last_reasoning),
        {"role": "user", "content": f"Tool result:\n{json.dumps(observation, default=str)}"},
    ]
    return update


@critical("nudge_json")
async def nudge_json_node(state: OperatorState, runtime: Runtime[GraphContext]) -> dict:
    """First unparseable reply: show it back and restate the protocol.

    Its own node because it costs a full extra model round trip, and a cost
    that size should be visible in the graph rather than buried in an
    `except`. Fixture data says how often it fires — see the Phase 5 report.
    """
    raw = (state.pending or {}).get("raw", "")
    return {
        "conversation": [
            {"role": "assistant", "content": raw},
            {
                "role": "user",
                "content": "That was not valid JSON. Reply with ONLY one JSON object per the protocol.",
            },
        ]
    }


@critical("salvage_json")
async def salvage_json_node(state: OperatorState, runtime: Runtime[GraphContext]) -> dict:
    """Twice unparseable: recover the intended report by hand.

    Pull `operator_output` out of the malformed text if it is in there, else
    fall through to the raw. The terminal node scrubs protocol debris and
    reasoning either way, so neither reaches the salesperson.
    """
    raw = (state.pending or {}).get("raw", "")
    return {"operator_output": salvage_operator_output(raw) or raw.strip()}


@critical("exhausted")
async def exhausted_node(state: OperatorState, runtime: Runtime[GraphContext]) -> dict:
    if state.deadline_at is not None and _now() >= state.deadline_at:
        return {
            "operator_output": "That took longer than I'm allowed — try a more specific command."
        }
    return {
        "operator_output": "I ran out of steps before finishing — try a more specific command."
    }


@critical("finalize")
async def finalize_node(state: OperatorState, runtime: Runtime[GraphContext]) -> dict:
    """Terminal node: scrub the report, persist the reply, announce it."""
    db = runtime.context.db

    # Guardrail: the salesperson's report never leaks an id / json / tool name.
    # When nothing usable survives, prefer a summary of what actually happened;
    # with no action, a rephrase prompt beats a hollow "Done." for a failed run.
    fallback = (
        prompt_module.fallback_report(state.action_result)
        if state.action_result
        else "I couldn't complete that cleanly — could you rephrase the command?"
    )
    operator_output = sanitize_operator_output(state.operator_output, fallback)

    reply = {
        "tenant_id": state.tenant_id,
        "user_id": state.user_id,
        "session_id": state.session_id,
        "thread_id": ObjectId(state.thread_id),
        "role": "operator",
        "text": operator_output,
        "steps": list(state.steps),
        "action": state.action_result,
        # Only meaningful when the agent stopped to ask; a completed send needs
        # no pick-list, and keeping a stale one would misdirect the next turn.
        "candidates": state.offered_candidates if state.action_result is None else None,
        "created_at": _now(),
    }
    ins = await db.operator_messages.insert_one(reply)
    reply["_id"] = ins.inserted_id
    await db.operator_threads.update_one(
        {"_id": ObjectId(state.thread_id)}, {"$set": {"last_message_at": _now()}}
    )
    logger.info(
        "operator command tenant=%s thread=%s steps=%d action=%s",
        state.tenant_id, state.thread_id, len(state.steps),
        (state.action_result or {}).get("status", "none"),
    )
    await events.publish(
        state.tenant_id, "operator.updated", {"thread_id": state.thread_id}
    )
    return {"operator_output": operator_output, "reply": reply}


# --------------------------------------------------------------------------- #
# Edges
# --------------------------------------------------------------------------- #
def _budget_left(state: OperatorState) -> bool:
    """Both bounds: how many times the model may be asked, and for how long.

    A step count alone is not an SLO — eight steps against a slow reasoning
    model is minutes, and the salesperson is waiting.
    """
    if state.steps_used >= MAX_STEPS:
        return False
    if state.deadline_at is not None and _now() >= state.deadline_at:
        return False
    return True


def _after_model(state: OperatorState) -> str:
    kind = (state.pending or {}).get("kind")
    if kind == "tool":
        return "run_tool"
    if kind == "unparseable":
        if state.parse_failures >= 2:
            return "salvage_json"
        return "nudge_json" if _budget_left(state) else "exhausted"
    return "finalize"  # a final report


def _after_nudge(state: OperatorState) -> str:
    return "call_model" if _budget_left(state) else "exhausted"


def _after_tool(state: OperatorState) -> str:
    return "call_model" if _budget_left(state) else "exhausted"


def build_operator_graph() -> StateGraph:
    builder = StateGraph(OperatorState, context_schema=GraphContext)
    register(
        builder,
        discover_connectors_node,
        load_thread_node,
        compact_node,
        build_prompt_node,
        nudge_json_node,
        salvage_json_node,
        call_model_node,
        run_tool_node,
        exhausted_node,
        finalize_node,
    )

    builder.add_edge(START, "discover_connectors")
    builder.add_edge("discover_connectors", "load_thread")
    builder.add_edge("load_thread", "compact")
    builder.add_edge("compact", "build_prompt")
    builder.add_edge("build_prompt", "call_model")

    builder.add_conditional_edges(
        "call_model", _after_model,
        ["run_tool", "nudge_json", "salvage_json", "exhausted", "finalize"],
    )
    builder.add_conditional_edges("nudge_json", _after_nudge, ["call_model", "exhausted"])
    builder.add_edge("salvage_json", "finalize")
    builder.add_conditional_edges(
        "run_tool", _after_tool, ["call_model", "exhausted"]
    )
    builder.add_edge("exhausted", "finalize")
    builder.add_edge("finalize", END)
    return builder


#: A full-length run is 3 setup nodes + MAX_STEPS × (call_model, run_tool) +
#: exhausted + finalize. LangGraph's default limit of 25 sits just under that,
#: and overrunning it raises instead of letting the agent report the overrun.
RECURSION_LIMIT = 3 * MAX_STEPS + 12

#: No checkpointer: a command runs to completion within one request, and the
#: thread history in Mongo — not a paused graph — is what carries continuity
#: between commands.
#: Checkpointed on `thread_id`. Two things need it: the copilot interrupt
#: (6c), which cannot resume without persisted state, and the send-dedupe keys,
#: which now survive across commands in a thread rather than one run.
OPERATOR_GRAPH = build_operator_graph().compile(
    name="operator", checkpointer=get_checkpointer()
)
