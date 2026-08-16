"""The shared egress policy (6b), and the gap it closes.

Until this existed there were two routes to a buyer's inbox and only one of
them enforced the safety story. The turn pipeline ran numeric grounding,
forbidden phrases, sanitisation and the mode gate. The Operator's
`send_message` wrote a message document and called the dispatcher — so a
forbidden phrase the turn pipeline blocks reached the buyer intact whenever the
salesperson asked the agent to send it instead.
"""
from __future__ import annotations

import json

import pytest

from app.graph import egress
from app.llm.gateway import LLMCallStats
from app.llm import gateway
from app.operator import agent
from app.outbound import dispatcher
from app.playbooks.loader import load_playbook
from app.schemas.envelope import RuntimeConfig
from app.stores import directory

PLAYBOOK = load_playbook("real-estate-v1", 8)
RUNTIME = RuntimeConfig.model_validate({
    "playbook_id": "real-estate-v1", "knowledge_source_id": "plucia_re",
    "model_id": "m", "adapter_id": None, "playbook_version": 8,
    "prompt_version": "2026-06-01",
})
FORBIDDEN = "This project offers guaranteed returns for every investor."


@pytest.fixture(autouse=True)
def _no_mailbox(monkeypatch):
    async def _empty(tenant_id, user_id):
        return []
    monkeypatch.setattr(directory, "entries_for", _empty)


@pytest.fixture()
def sent(monkeypatch) -> list[dict]:
    calls: list[dict] = []
    async def capture(**kwargs):
        calls.append(kwargs)
    monkeypatch.setattr(dispatcher, "dispatch", capture)
    return calls


# --------------------------------------------------------------------------- #
# The policy table
# --------------------------------------------------------------------------- #
def test_the_policies_differ_only_where_the_table_says():
    turn, operator = egress.TURN_EGRESS, egress.OPERATOR_EGRESS
    assert (turn.numeric_grounding, operator.numeric_grounding) == (True, False)
    assert turn.forbidden_phrases and operator.forbidden_phrases
    assert turn.sanitise and operator.sanitise
    assert turn.mode_gate and operator.mode_gate
    assert (turn.stage_effects, operator.stage_effects) == (True, False)


def test_operator_skips_grounding_because_it_retrieves_nothing():
    """With no FACTS corpus every figure would be 'ungrounded' and the agent
    could never quote a price the salesperson just gave it."""
    result = egress.check(
        "The 1 Bedroom is AED 1,350,000.",
        policy=egress.OPERATOR_EGRESS, playbook=PLAYBOOK,
    )
    assert result.violations == []
    assert not result.forced_draft


def test_turn_policy_does_catch_an_ungrounded_number():
    result = egress.check(
        "Yours for AED 777,000.",
        policy=egress.TURN_EGRESS, playbook=PLAYBOOK,
        facts_text="1 Bedroom from AED 1,350,000.", history_text="",
    )
    assert result.forced_draft
    assert "777000" in result.violations[0]


def test_both_policies_catch_a_forbidden_phrase():
    for policy in (egress.TURN_EGRESS, egress.OPERATOR_EGRESS):
        result = egress.check(FORBIDDEN, policy=policy, playbook=PLAYBOOK)
        assert result.forced_draft, policy.name
        assert "guaranteed returns" in result.violations[0]


def test_sanitisation_still_strips_internals():
    result = egress.check(
        "Sent via send_message to 507f1f77bcf86cd799439011",
        policy=egress.OPERATOR_EGRESS, playbook=PLAYBOOK,
    )
    assert "send_message" not in result.text
    assert "507f1f77bcf86cd799439011" not in result.text


def test_a_message_gutted_by_sanitisation_is_blocked():
    result = egress.check("{}", policy=egress.OPERATOR_EGRESS, playbook=PLAYBOOK)
    assert result.blocked


def test_mode_gate_is_the_only_place_mode_is_read():
    decide = egress.decide_status
    assert decide("copilot", policy=egress.TURN_EGRESS, forced_draft=False) == "draft"
    assert decide("autopilot", policy=egress.TURN_EGRESS, forced_draft=False) == "sent"
    assert decide("autopilot", policy=egress.TURN_EGRESS, forced_draft=True) == "draft"


# --------------------------------------------------------------------------- #
# End to end: the gap is closed
# --------------------------------------------------------------------------- #
def _scripted(monkeypatch, text: str):
    outputs = [
        json.dumps({"thought": "send it", "tool": "send_message",
                    "args": {"to": "buyer@example.com", "channel": "email", "text": text}}),
        json.dumps({"thought": "done", "operator_output": "Handled."}),
    ]
    async def chat(*, model, messages, temperature=0.3):
        return outputs.pop(0), LLMCallStats()
    monkeypatch.setattr(gateway, "chat_text", chat)


async def test_operator_autopilot_cannot_send_a_forbidden_phrase(db, monkeypatch, sent):
    """The regression this whole subgraph exists for."""
    _scripted(monkeypatch, FORBIDDEN)

    result = await agent.run_command(
        db, tenant_id="plucia", text="tell them about the returns",
        mode="autopilot", runtime=RUNTIME,
    )

    action = result["message"]["action"]
    assert action["status"] == "draft", "a forbidden phrase must not autosend"
    assert sent == [], "nothing may reach the buyer"

    message = await db.messages.find_one({"direction": "outbound"})
    assert message["status"] == "draft"


async def test_a_clean_operator_message_still_sends(db, monkeypatch, sent):
    _scripted(monkeypatch, "Happy to help — shall I book you a viewing?")

    result = await agent.run_command(
        db, tenant_id="plucia", text="ask about a viewing",
        mode="autopilot", runtime=RUNTIME,
    )

    assert result["message"]["action"]["status"] == "sent"
    assert len(sent) == 1


async def test_operator_without_a_runtime_still_sanitises(db, monkeypatch, sent):
    """No runtime means no playbook and so no forbidden-phrase list. That is a
    real gap, but sanitisation must still run."""
    _scripted(monkeypatch, "Message from send_message tool")

    result = await agent.run_command(
        db, tenant_id="plucia", text="say hi", mode="autopilot", runtime=None,
    )

    action = result["message"]["action"]
    assert action["status"] == "sent"
    assert "send_message" not in action["text"]
