"""Reasoning is carried across tool calls, bounded at user turns, never leaked.

Background, verified against a live Bedrock call: the `bedrock-mantle`
passthrough for `minimax.minimax-m2` returns reasoning in a **separate
`reasoning` field** and leaves `content` entirely free of `<think>` tags. The
gateway's inline stripper was therefore a no-op on the production backend, and
reasoning was being paid for (~93% of extraction output tokens) and discarded.

vLLM and Ollama do the opposite and inline it. Both shapes must work.
"""
from __future__ import annotations

import json

import pytest

from app.config import settings
from app.llm import gateway
from app.llm.gateway import ChatResponse, LLMCallStats
from app.operator import agent, reasoning
from app.operator.sanitize import sanitize_customer_text, sanitize_operator_output
from app.stores import directory

REASONED = "The command names two people. I should look up the first before sending."


@pytest.fixture(autouse=True)
def _no_mailbox(monkeypatch):
    async def _empty(tenant_id, user_id):
        return []

    monkeypatch.setattr(directory, "entries_for", _empty)


# --------------------------------------------------------------------------- #
# Reading reasoning out of either response shape
# --------------------------------------------------------------------------- #
class _Message:
    """Stands in for an OpenAI message object with backend-specific extras."""

    def __init__(self, **extra):
        self.model_extra = extra


def test_reads_the_separate_field_bedrock_shape():
    assert gateway.reasoning_of(_Message(reasoning=REASONED), "391") == REASONED


def test_reads_alternative_field_names():
    assert gateway.reasoning_of(_Message(reasoning_content=REASONED), "x") == REASONED


def test_reads_the_block_list_shape():
    message = _Message(reasoning_details=[{"text": "first"}, {"summary": "second"}])
    assert gateway.reasoning_of(message, "x") == "first\nsecond"


def test_reads_inline_think_vllm_ollama_shape():
    content = f"<think>{REASONED}</think>\n{{\"tool\": \"x\"}}"
    assert gateway.reasoning_of(_Message(), content) == REASONED


def test_separate_field_wins_when_a_backend_somehow_sends_both():
    message = _Message(reasoning="from the field")
    assert gateway.reasoning_of(message, "<think>inline</think>") == "from the field"


def test_absent_reasoning_is_empty_not_none():
    assert gateway.reasoning_of(_Message(), "just content") == ""


def test_chat_response_still_unpacks_as_the_old_two_tuple():
    """Callers and test doubles that expect `(text, stats)` must keep working."""
    text, stats = ChatResponse("hello", LLMCallStats(), "thinking")
    assert text == "hello" and isinstance(stats, LLMCallStats)


# --------------------------------------------------------------------------- #
# Replay format
# --------------------------------------------------------------------------- #
def test_inline_mode_embeds_reasoning(monkeypatch):
    monkeypatch.setattr(settings, "operator_reasoning_feedback", "inline")
    message = reasoning.assistant_message('{"tool":"x"}', REASONED)
    assert message["content"] == f"<think>{REASONED}</think>\n{{\"tool\":\"x\"}}"
    assert "reasoning" not in message


def test_field_mode_sends_it_separately(monkeypatch):
    monkeypatch.setattr(settings, "operator_reasoning_feedback", "field")
    message = reasoning.assistant_message('{"tool":"x"}', REASONED)
    assert message["reasoning"] == REASONED
    assert "<think>" not in message["content"]


def test_off_mode_restores_the_previous_behaviour(monkeypatch):
    monkeypatch.setattr(settings, "operator_reasoning_feedback", "off")
    assert reasoning.assistant_message('{"tool":"x"}', REASONED) == {
        "role": "assistant",
        "content": '{"tool":"x"}',
    }


def test_nested_think_blocks_are_never_produced(monkeypatch):
    """The content passed in may itself carry a block; embedding one inside
    another produces nonsense the model cannot parse."""
    monkeypatch.setattr(settings, "operator_reasoning_feedback", "inline")
    message = reasoning.assistant_message(f"<think>stale</think>\n{{\"a\":1}}", REASONED)
    assert message["content"].count("<think>") == 1
    assert "stale" not in message["content"]


# --------------------------------------------------------------------------- #
# End to end through the loop
# --------------------------------------------------------------------------- #
def _scripted(monkeypatch, pairs: list[tuple[str, str]]):
    """Queue (content, reasoning) pairs; record the prompts each call saw."""
    seen: list[list[dict]] = []

    async def chat(*, model, messages, temperature=0.3):
        seen.append([dict(m) for m in messages])
        content, reason = pairs.pop(0)
        return ChatResponse(content, LLMCallStats(), reason)

    monkeypatch.setattr(gateway, "chat_text", chat)
    return seen


async def test_reasoning_is_replayed_on_the_next_step(db, monkeypatch):
    monkeypatch.setattr(settings, "operator_reasoning_feedback", "inline")
    seen = _scripted(
        monkeypatch,
        [
            (json.dumps({"thought": "look", "tool": "get_conversation", "args": {}}), REASONED),
            (json.dumps({"thought": "done", "operator_output": "Nothing found."}), "second"),
        ],
    )

    await agent.run_command(db, tenant_id="t", text="find someone", mode="copilot")

    second_prompt = seen[1]
    assistant = [m for m in second_prompt if m["role"] == "assistant"]
    assert assistant, "the tool step must appear as an assistant turn"
    assert REASONED in assistant[-1]["content"], "reasoning must survive to the next step"


async def test_reasoning_is_dropped_at_the_user_turn_boundary(db, monkeypatch):
    """Retained within a command; gone by the next one, or the prompt grows
    without bound — reasoning routinely exceeds the answer in length."""
    monkeypatch.setattr(settings, "operator_reasoning_feedback", "inline")
    _scripted(
        monkeypatch,
        [
            (json.dumps({"thought": "look", "tool": "get_conversation", "args": {}}), REASONED),
            (json.dumps({"thought": "done", "operator_output": "Nothing found."}), "second"),
        ],
    )
    first = await agent.run_command(db, tenant_id="t", text="find someone", mode="copilot")

    seen = _scripted(
        monkeypatch, [(json.dumps({"thought": "ok", "operator_output": "Sure."}), "")]
    )
    await agent.run_command(
        db, tenant_id="t", text="what about now", mode="copilot",
        thread_id=first["thread_id"],
    )

    replayed = json.dumps(seen[0])
    assert REASONED not in replayed
    assert "<think>" not in replayed


async def test_reasoning_is_never_persisted(db, monkeypatch):
    monkeypatch.setattr(settings, "operator_reasoning_feedback", "inline")
    _scripted(
        monkeypatch,
        [
            (json.dumps({"thought": "look", "tool": "get_conversation", "args": {}}), REASONED),
            (json.dumps({"thought": "done", "operator_output": "Nothing found."}), "more"),
        ],
    )
    result = await agent.run_command(db, tenant_id="t", text="find", mode="copilot")

    stored = json.dumps(
        await db.operator_messages.find({}).to_list(length=50), default=str
    )
    assert REASONED not in stored
    assert "<think>" not in stored
    assert REASONED not in json.dumps(result["message"], default=str)


async def test_an_inlining_backend_still_carries_reasoning(db, monkeypatch):
    """A stub returning a plain tuple with <think> — the vLLM/Ollama shape."""
    monkeypatch.setattr(settings, "operator_reasoning_feedback", "inline")
    seen: list[list[dict]] = []
    queue = [
        f"<think>{REASONED}</think>\n"
        + json.dumps({"thought": "look", "tool": "get_conversation", "args": {}}),
        json.dumps({"thought": "done", "operator_output": "Done."}),
    ]

    async def chat(*, model, messages, temperature=0.3):
        seen.append([dict(m) for m in messages])
        return queue.pop(0), LLMCallStats()  # plain 2-tuple, no .reasoning

    monkeypatch.setattr(gateway, "chat_text", chat)
    await agent.run_command(db, tenant_id="t", text="find", mode="copilot")

    assistant = [m for m in seen[1] if m["role"] == "assistant"]
    assert REASONED in assistant[-1]["content"]


# --------------------------------------------------------------------------- #
# Leak guards
# --------------------------------------------------------------------------- #
def test_reasoning_never_reaches_the_salesperson():
    leaked = f"<think>{REASONED}</think>I emailed Priya."
    assert sanitize_operator_output(leaked, "fallback") == "I emailed Priya."


def test_reasoning_never_reaches_the_buyer():
    assert sanitize_customer_text(f"<think>{REASONED}</think>Hi there!") == "Hi there!"


def test_a_truncated_reasoning_block_is_still_stripped():
    """A completion cut off mid-thought has an opening tag and no closing one."""
    assert sanitize_operator_output(f"Sent.<think>{REASONED}", "fallback") == "Sent."


def test_output_that_is_only_reasoning_falls_back():
    assert sanitize_operator_output(f"<think>{REASONED}</think>", "Done.") == "Done."


async def test_double_parse_failure_does_not_dump_reasoning(db, monkeypatch):
    """The salvage path hands the *raw* completion through when it cannot find
    an operator_output — on an inlining backend that raw text is mostly
    reasoning."""
    raw = f"<think>{REASONED}</think> not json at all"

    async def chat(*, model, messages, temperature=0.3):
        return raw, LLMCallStats()

    monkeypatch.setattr(gateway, "chat_text", chat)
    result = await agent.run_command(db, tenant_id="t", text="hi", mode="copilot")

    assert REASONED not in result["message"]["text"]
    assert "<think>" not in result["message"]["text"]


# --------------------------------------------------------------------------- #
# Timezone handling in tool results — regression cover
# --------------------------------------------------------------------------- #
# Asked to book "10PM tonight", a run queried 9-11PM IST, received a free slot
# of 15:30Z-17:30Z — which IS 9-11PM IST, i.e. the whole window free — read the
# "15" as an hour, and told the salesperson they were unavailable. It then
# mis-stated its own numbers as "9:00-11:30 PM".
#
# The real fix is that `calendar_find_free_slots` now answers in the caller's
# offset with a human label, so there is no arithmetic to get wrong. These
# assert the belt-and-braces prompt rules that cover every other tool.
async def _system_prompt(db, monkeypatch, **kwargs) -> str:
    seen = _scripted(
        monkeypatch, [(json.dumps({"thought": "ok", "operator_output": "Done."}), "")]
    )
    await agent.run_command(
        db, tenant_id="t", user_id="u", text="hello", mode="copilot", **kwargs
    )
    return seen[0][0]["content"]


async def test_prompt_warns_that_z_timestamps_are_not_local(db, monkeypatch):
    system_prompt = await _system_prompt(db, monkeypatch, time_zone="Asia/Kolkata")
    assert 'ending in "Z" in a tool result is UTC' in system_prompt
    assert "NOT the salesperson's local time" in system_prompt


async def test_prompt_forbids_contradicting_an_availability_result(db, monkeypatch):
    system_prompt = await _system_prompt(db, monkeypatch)
    assert "If a tool says a window is free, it is free" in system_prompt
    assert "do not offer alternatives to a time that was never blocked" in system_prompt
