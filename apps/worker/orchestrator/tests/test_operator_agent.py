"""Operator agent loop: tools, clarification, mode-gated actions, persistence."""
from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from app.llm import gateway
from app.llm.gateway import LLMCallStats
from app.operator import agent
from app.outbound import dispatcher


def _now():
    return datetime.now(timezone.utc)


async def seed_contact(db, name="Priya Patel", channels=(("whatsapp", "+971561239876"),)):
    doc = {
        "tenant_id": "plucia",
        "identities": [{"channel": c, "external_id": e} for c, e in channels],
        "profile": {"name": name, "language": None},
        "lead": {"qualification_score": 40},
        "created_at": _now(),
        "updated_at": _now(),
    }
    res = await db.contacts.insert_one(doc)
    doc["_id"] = res.inserted_id
    return doc


class FakeAgentLLM:
    """Queue of raw completions for gateway.chat_text."""

    def __init__(self):
        self.outputs: list[str] = []
        self.calls: list[list[dict]] = []

    async def chat_text(self, *, model, messages, temperature=0.3):
        self.calls.append(messages)
        text = self.outputs.pop(0) if self.outputs else json.dumps(
            {"thought": "done", "operator_output": "Done.", "action": None}
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


# --------------------------------------------------------------------------- #
# The copilot happy path: find contact → draft
# --------------------------------------------------------------------------- #
async def test_copilot_command_drafts_message(db, agent_llm, sent):
    contact = await seed_contact(db)
    agent_llm.outputs = [
        json.dumps(
            {
                "thought": "I need to find Priya in the CRM first.",
                "tool": "find_contact",
                "args": {"query": "Priya Patel"},
            }
        ),
        json.dumps(
            {
                "thought": "One match, only on WhatsApp — no need to ask.",
                "operator_output": "Drafted a WhatsApp hello to Priya for your approval.",
                "action": {
                    "type": "send_message",
                    "contact_id": str(contact["_id"]),
                    "channel": "whatsapp",
                    "text": "Hi Priya! 👋",
                },
            }
        ),
    ]

    result = await agent.run_command(
        db, tenant_id="plucia", text="say Hi to Priya Patel", mode="copilot"
    )

    msg = result["message"]
    assert msg["role"] == "operator"
    assert "approval" in msg["text"]
    # trace: a thought + a tool step with its observation, then the final thought
    kinds = [s["type"] for s in msg["steps"]]
    assert kinds == ["thought", "tool", "thought"]
    assert msg["steps"][1]["tool"] == "find_contact"
    assert msg["steps"][1]["observation"]["matches"][0]["name"] == "Priya Patel"

    # the action produced a DRAFT, nothing dispatched
    assert msg["action"]["status"] == "draft"
    assert sent == []
    draft = await db.messages.find_one({"text": "Hi Priya! 👋"})
    assert draft["status"] == "draft"
    assert draft["direction"] == "outbound"
    convo = await db.conversations.find_one({"_id": draft["conversation_id"]})
    assert convo["channel"] == "whatsapp"
    assert convo["contact_id"] == contact["_id"]

    # both sides of the exchange persisted on the thread
    thread_msgs = await db.operator_messages.find(
        {"thread_id": draft and (await db.operator_threads.find_one({}))["_id"]}
    ).to_list(length=10)
    assert [m["role"] for m in thread_msgs] == ["user", "operator"]


async def test_autopilot_command_sends_and_dispatches(db, agent_llm, sent):
    contact = await seed_contact(db)
    agent_llm.outputs = [
        json.dumps(
            {
                "thought": "Send it.",
                "operator_output": "Sent Priya a WhatsApp hello.",
                "action": {
                    "type": "send_message",
                    "contact_id": str(contact["_id"]),
                    "channel": "whatsapp",
                    "text": "Hi Priya!",
                },
            }
        ),
    ]

    result = await agent.run_command(
        db, tenant_id="plucia", text="say hi to priya", mode="autopilot"
    )

    assert result["message"]["action"]["status"] == "sent"
    assert len(sent) == 1
    assert sent[0]["to"] == "+971561239876"
    stored = await db.messages.find_one({"text": "Hi Priya!"})
    assert stored["status"] == "sent"


# --------------------------------------------------------------------------- #
# Clarification, continuation, and failure paths
# --------------------------------------------------------------------------- #
async def test_clarifying_question_takes_no_action(db, agent_llm, sent):
    await seed_contact(db, channels=(("whatsapp", "+9715551"), ("email", "p@x.ae")))
    agent_llm.outputs = [
        json.dumps(
            {
                "thought": "She's on two channels and the command names none.",
                "operator_output": "Priya is on WhatsApp and email — which should I use?",
                "action": None,
            }
        ),
    ]

    result = await agent.run_command(
        db, tenant_id="plucia", text="message Priya", mode="copilot"
    )

    assert "which" in result["message"]["text"].lower()
    assert result["message"]["action"] is None
    assert await db.messages.count_documents({}) == 0
    assert sent == []


async def test_thread_continuation_carries_history(db, agent_llm):
    first = await agent.run_command(
        db, tenant_id="plucia", text="find Priya", mode="copilot"
    )
    agent_llm.outputs = [
        json.dumps({"thought": "ok", "operator_output": "Using WhatsApp.", "action": None})
    ]
    second = await agent.run_command(
        db,
        tenant_id="plucia",
        text="use whatsapp",
        mode="copilot",
        thread_id=first["thread_id"],
    )

    assert second["thread_id"] == first["thread_id"]
    # the second call's prompt must include the first exchange as history
    prompt_text = json.dumps(agent_llm.calls[-1])
    assert "find Priya" in prompt_text
    msgs = await db.operator_messages.find({}).to_list(length=10)
    assert len(msgs) == 4  # two user + two operator


async def test_unknown_thread_raises(db, agent_llm):
    with pytest.raises(agent.ThreadNotFound):
        await agent.run_command(
            db,
            tenant_id="plucia",
            text="hi",
            mode="copilot",
            thread_id="6a5e11c03b0fe69f46de2cd0",
        )


async def test_unparseable_output_degrades_to_text(db, agent_llm):
    agent_llm.outputs = ["not json at all", "still not json"]
    result = await agent.run_command(
        db, tenant_id="plucia", text="do something odd", mode="copilot"
    )
    assert result["message"]["text"] == "still not json"
    assert result["message"]["action"] is None


async def test_action_on_missing_channel_identity_fails_cleanly(db, agent_llm, sent):
    contact = await seed_contact(db)  # whatsapp only
    agent_llm.outputs = [
        json.dumps(
            {
                "thought": "email her",
                "operator_output": "Emailing Priya.",
                "action": {
                    "type": "send_message",
                    "contact_id": str(contact["_id"]),
                    "channel": "email",
                    "text": "Hello!",
                },
            }
        ),
    ]
    result = await agent.run_command(
        db, tenant_id="plucia", text="email priya", mode="autopilot"
    )
    assert result["message"]["action"]["status"] == "failed"
    assert "no email identity" in result["message"]["action"]["reason"]
    assert sent == []
    assert await db.messages.count_documents({}) == 0


async def test_get_conversation_tool_summarizes(db, agent_llm):
    contact = await seed_contact(db)
    convo = {
        "tenant_id": "plucia",
        "contact_id": contact["_id"],
        "channel": "whatsapp",
        "stage": "QUALIFYING",
        "status": "active",
        "last_message_at": _now(),
        "created_at": _now(),
    }
    res = await db.conversations.insert_one(convo)
    await db.messages.insert_one(
        {
            "tenant_id": "plucia",
            "conversation_id": res.inserted_id,
            "direction": "inbound",
            "text": "Looking for a 2BR",
            "status": "received",
            "created_at": _now(),
        }
    )

    observation = await agent._tool_get_conversation(
        db, "plucia", {"contact_id": str(contact["_id"])}
    )
    summary = observation["conversation"]
    assert summary["stage"] == "QUALIFYING"
    assert summary["recent_messages"] == [{"from": "customer", "text": "Looking for a 2BR"}]
