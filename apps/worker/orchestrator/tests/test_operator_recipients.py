"""The Operator agent reaching people who are not already CRM contacts.

Regression cover for the failure that motivated this work: asking the agent to
email someone produced "No contacts named 'Ariyaman' were found", both for the
name and for a full email address, because `send_message` required a
`contact_id` and the CRM was therefore a gate on sending.
"""
from __future__ import annotations

import json

import pytest

from app.llm import gateway
from app.llm.gateway import LLMCallStats
from app.operator import agent
from app.outbound import dispatcher
from app.stores import directory


class FakeAgentLLM:
    def __init__(self):
        self.outputs: list[str] = []
        self.calls: list[list[dict]] = []

    async def chat_text(self, *, model, messages, temperature=0.3):
        self.calls.append(messages)
        text = self.outputs.pop(0) if self.outputs else json.dumps(
            {"thought": "done", "operator_output": "Done."}
        )
        return text, LLMCallStats(latency_ms=3, prompt_tokens=50, completion_tokens=20)


@pytest.fixture()
def agent_llm(monkeypatch) -> FakeAgentLLM:
    fake = FakeAgentLLM()
    monkeypatch.setattr(gateway, "chat_text", fake.chat_text)
    return fake


@pytest.fixture()
def sent(monkeypatch) -> list[dict]:
    calls: list[dict] = []

    async def fake_dispatch(**kwargs):
        calls.append(kwargs)

    monkeypatch.setattr(dispatcher, "dispatch", fake_dispatch)
    return calls


@pytest.fixture(autouse=True)
def empty_mailbox(monkeypatch):
    async def _empty(tenant_id, user_id):
        return []

    monkeypatch.setattr(directory, "entries_for", _empty)


def _mailbox(monkeypatch, entries):
    async def _entries(tenant_id, user_id):
        return entries

    monkeypatch.setattr(directory, "entries_for", _entries)


# --------------------------------------------------------------------------- #
# Sending to a bare address
# --------------------------------------------------------------------------- #
async def test_emails_a_stranger_and_adds_them_to_the_crm(db, agent_llm, sent):
    agent_llm.outputs = [
        json.dumps(
            {
                "thought": "The command carries an address, so send straight there.",
                "tool": "send_message",
                "args": {
                    "to": "Ariyaman@Plucia.com",
                    "channel": "email",
                    "text": "hello test email",
                },
            }
        ),
        json.dumps({"thought": "Sent.", "operator_output": "Emailed Ariyaman."}),
    ]

    result = await agent.run_command(
        db,
        tenant_id="plucia",
        text='Send an email to ariyaman@plucia.com saying "hello test email"',
        mode="autopilot",
        user_id="user-1",
    )

    assert result["message"]["action"]["status"] == "sent"

    # The address was canonicalised on the way out.
    assert len(sent) == 1
    assert sent[0]["to"] == "ariyaman@plucia.com"
    assert sent[0]["channel"] == "email"
    assert sent[0]["user_id"] == "user-1"
    assert sent[0]["subject"], "email dispatch must carry a subject"

    # ...and they are now in the CRM, attributed and marked as agent-created.
    contact = await db.contacts.find_one(
        {"identities.external_id": "ariyaman@plucia.com"}
    )
    assert contact is not None
    assert contact["source"] == "agent"
    assert contact["user_id"] == "user-1"
    assert contact["last_contacted_at"] is not None


async def test_second_send_reuses_the_same_contact(db, agent_llm, sent):
    """Differently-formatted addresses must not fork the contact."""
    for address in ("ariyaman@plucia.com", "Ariyaman@Plucia.COM"):
        agent_llm.outputs = [
            json.dumps(
                {
                    "thought": "send",
                    "tool": "send_message",
                    "args": {"to": address, "channel": "email", "text": "hi there"},
                }
            ),
            json.dumps({"thought": "done", "operator_output": "Sent."}),
        ]
        await agent.run_command(
            db, tenant_id="plucia", text="email them", mode="autopilot"
        )

    matches = await db.contacts.find(
        {"identities.external_id": "ariyaman@plucia.com"}
    ).to_list(length=10)
    assert len(matches) == 1


async def test_send_without_any_recipient_fails_clearly(db, agent_llm, sent):
    agent_llm.outputs = [
        json.dumps(
            {
                "thought": "send",
                "tool": "send_message",
                "args": {"channel": "email", "text": "hello"},
            }
        ),
        json.dumps({"thought": "failed", "operator_output": "I need an address."}),
    ]
    await agent.run_command(
        db, tenant_id="plucia", text="send an email", mode="autopilot"
    )
    assert sent == []


async def test_unresolvable_name_does_not_send(db, agent_llm, sent):
    agent_llm.outputs = [
        json.dumps(
            {
                "thought": "send",
                "tool": "send_message",
                "args": {"to": "Someone Unknown", "channel": "email", "text": "hi"},
            }
        ),
        json.dumps({"thought": "failed", "operator_output": "Who?"}),
    ]
    result = await agent.run_command(
        db, tenant_id="plucia", text="email Someone Unknown", mode="autopilot"
    )
    assert result["message"]["action"]["status"] == "failed"
    assert sent == []


# --------------------------------------------------------------------------- #
# find_recipient
# --------------------------------------------------------------------------- #
async def test_find_recipient_surfaces_a_mailbox_contact(db, agent_llm, monkeypatch):
    _mailbox(
        monkeypatch,
        [
            {
                "email": "ariyaman@plucia.com",
                "name": "Ariyaman",
                "sent": 3,
                "received": 1,
                "lastSeen": "2026-08-01T10:00:00+00:00",
            }
        ],
    )
    agent_llm.outputs = [
        json.dumps(
            {
                "thought": "look them up",
                "tool": "find_recipient",
                "args": {"query": "Ariyaman"},
            }
        ),
        json.dumps({"thought": "found", "operator_output": "Found them."}),
    ]
    result = await agent.run_command(
        db, tenant_id="plucia", text="who is Ariyaman", mode="copilot", user_id="u1"
    )
    observation = result["message"]["steps"][1]["observation"]
    assert observation["matches"][0]["name"] == "Ariyaman"
    assert observation["matches"][0]["source"] == "gmail"


async def test_empty_result_tells_the_model_it_may_send_direct(db, agent_llm):
    agent_llm.outputs = [
        json.dumps(
            {
                "thought": "look up",
                "tool": "find_recipient",
                "args": {"query": "nobody@nowhere.com"},
            }
        ),
        json.dumps({"thought": "none", "operator_output": "Not found."}),
    ]
    result = await agent.run_command(
        db, tenant_id="plucia", text="find nobody", mode="copilot", user_id="u1"
    )
    observation = result["message"]["steps"][1]["observation"]
    assert observation["matches"] == []
    assert "to" in observation["note"], "an empty result must be actionable, not a dead end"


async def test_old_tool_name_still_dispatches(db, agent_llm):
    """The protocol is prompt-engineered, so a model may emit the former name."""
    agent_llm.outputs = [
        json.dumps(
            {"thought": "look up", "tool": "find_contact", "args": {"query": "Ada"}}
        ),
        json.dumps({"thought": "none", "operator_output": "Nothing."}),
    ]
    result = await agent.run_command(
        db, tenant_id="plucia", text="find Ada", mode="copilot", user_id="u1"
    )
    assert "error" not in result["message"]["steps"][1]["observation"]


# --------------------------------------------------------------------------- #
# Cross-turn candidate memory
# --------------------------------------------------------------------------- #
async def test_offered_candidates_persist_for_the_next_turn(db, agent_llm, monkeypatch):
    _mailbox(
        monkeypatch,
        [
            {
                "email": "ariyaman.a@plucia.com",
                "name": "Ariyaman A",
                "sent": 1,
                "received": 0,
                "lastSeen": "2026-08-01T10:00:00+00:00",
            },
            {
                "email": "ariyaman.b@plucia.com",
                "name": "Ariyaman B",
                "sent": 1,
                "received": 0,
                "lastSeen": "2026-07-01T10:00:00+00:00",
            },
        ],
    )
    agent_llm.outputs = [
        json.dumps(
            {"thought": "two of them", "tool": "find_recipient", "args": {"query": "Ariyaman"}}
        ),
        json.dumps(
            {
                "thought": "ambiguous",
                "operator_output": "Two matches: 1. Ariyaman A 2. Ariyaman B. Which one?",
            }
        ),
    ]
    first = await agent.run_command(
        db, tenant_id="plucia", text="email Ariyaman", mode="copilot", user_id="u1"
    )

    stored = await db.operator_messages.find_one({"_id": first["message"]["_id"]})
    assert stored["candidates"], "an unanswered pick-list must be retained"
    assert stored["candidates"][0]["name"] == "Ariyaman A", "most recent first"

    # Next turn: the list is replayed into the prompt so "the first one" resolves.
    agent_llm.outputs = [
        json.dumps({"thought": "the first", "operator_output": "Sending to Ariyaman A."})
    ]
    await agent.run_command(
        db,
        tenant_id="plucia",
        text="the first one",
        mode="copilot",
        thread_id=first["thread_id"],
        user_id="u1",
    )
    replayed = "\n".join(
        message["content"] for message in agent_llm.calls[-1] if message["role"] == "system"
    )
    assert "ariyaman.a@plucia.com" in replayed
    assert "ariyaman.b@plucia.com" in replayed


async def test_completed_send_stores_no_candidates(db, agent_llm, sent):
    """A stale pick-list would misdirect the next turn."""
    agent_llm.outputs = [
        json.dumps(
            {
                "thought": "send",
                "tool": "send_message",
                "args": {"to": "ada@example.com", "channel": "email", "text": "hi"},
            }
        ),
        json.dumps({"thought": "sent", "operator_output": "Sent."}),
    ]
    result = await agent.run_command(
        db, tenant_id="plucia", text="email ada@example.com", mode="autopilot"
    )
    stored = await db.operator_messages.find_one({"_id": result["message"]["_id"]})
    assert stored["candidates"] is None
