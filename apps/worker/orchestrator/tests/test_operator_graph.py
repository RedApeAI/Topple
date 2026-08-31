"""Phase 5: the operator graph's own bounds, boundary and recovery nodes.

The loop is cyclic and the model owns control flow, so what has to be pinned is
everything the model does *not* get to decide: the step budget, the wall-clock
deadline, what survives a user-turn boundary, and what happens when it emits
something unparseable.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest

from app.config import settings
from app.graph import checkpointer as checkpointer_module
from app.graph.checkpointer import MongoCheckpointer
from app.graph.operator_graph import build_operator_graph, compact_node
from app.graph.operator_state import RESET, OperatorState, _append_or_reset, _union
from app.llm import gateway
from app.llm.gateway import LLMCallStats
from app.operator import agent
from app.stores import directory


@pytest.fixture(autouse=True)
def _no_mailbox(monkeypatch):
    async def _empty(tenant_id, user_id):
        return []
    monkeypatch.setattr(directory, "entries_for", _empty)


def _script(monkeypatch, outputs):
    calls = {"n": 0}
    async def chat(*, model, messages, temperature=0.3):
        calls["n"] += 1
        return (outputs.pop(0) if outputs else
                json.dumps({"thought": "done", "operator_output": "Done."})), LLMCallStats()
    monkeypatch.setattr(gateway, "chat_text", chat)
    return calls


# --------------------------------------------------------------------------- #
# Reducers
# --------------------------------------------------------------------------- #
def test_append_or_reset_appends_then_clears():
    assert _append_or_reset(["a"], ["b"]) == ["a", "b"]
    assert _append_or_reset(["a", "b"], RESET) == []


def test_union_is_order_preserving_and_idempotent():
    assert _union(["a"], ["b", "a"]) == ["a", "b"]
    assert _union(["a", "b"], ["a"]) == ["a", "b"]


# --------------------------------------------------------------------------- #
# The compact node — the Phase 1c retention rule, isolated
# --------------------------------------------------------------------------- #
async def test_compact_strips_reasoning_from_prior_turns():
    state = OperatorState(
        tenant_id="t", text="hi", mode="copilot", model="m",
        history=[
            {"role": "assistant", "content": "<think>old plan</think>Sent it."},
            {"role": "user", "content": "thanks"},
        ],
    )
    update = await compact_node(state, None)
    assert update["history"][0]["content"] == "Sent it."
    assert "old plan" not in json.dumps(update["history"])


async def test_compact_trims_to_the_history_window():
    from app.operator.prompt import HISTORY_WINDOW

    state = OperatorState(
        tenant_id="t", text="hi", mode="copilot", model="m",
        history=[{"role": "user", "content": f"m{i}"} for i in range(HISTORY_WINDOW + 5)],
    )
    update = await compact_node(state, None)
    assert len(update["history"]) == HISTORY_WINDOW
    assert update["history"][-1]["content"] == f"m{HISTORY_WINDOW + 4}"


# --------------------------------------------------------------------------- #
# Bounds
# --------------------------------------------------------------------------- #
async def test_step_budget_still_bounds_the_loop(db, monkeypatch):
    calls = _script(monkeypatch, [
        json.dumps({"thought": "again", "tool": "get_conversation", "args": {}})
    ] * 20)
    result = await agent.run_command(db, tenant_id="t", text="loop", mode="copilot")
    assert calls["n"] == agent.MAX_STEPS
    assert "ran out of steps" in result["message"]["text"]


async def test_the_wall_clock_deadline_also_stops_it(db, monkeypatch):
    """MAX_STEPS bounds how many times the model is asked, not how long that
    takes — eight steps against a slow model is minutes."""
    monkeypatch.setattr(settings, "operator_deadline_seconds", -1)  # already past
    calls = _script(monkeypatch, [
        json.dumps({"thought": "again", "tool": "get_conversation", "args": {}})
    ] * 20)

    result = await agent.run_command(db, tenant_id="t", text="loop", mode="copilot")

    assert calls["n"] < agent.MAX_STEPS, "the deadline must bite before the step budget"
    assert "longer than I'm allowed" in result["message"]["text"]


# --------------------------------------------------------------------------- #
# Malformed JSON, as explicit nodes
# --------------------------------------------------------------------------- #
async def test_one_bad_reply_costs_exactly_one_extra_round_trip(db, monkeypatch):
    calls = _script(monkeypatch, [
        "not json",
        json.dumps({"thought": "ok", "operator_output": "Recovered."}),
    ])
    result = await agent.run_command(db, tenant_id="t", text="hi", mode="copilot")
    assert result["message"]["text"] == "Recovered."
    assert calls["n"] == 2, "the nudge costs one extra model call, no more"


async def test_two_bad_replies_salvage_without_a_third_call(db, monkeypatch):
    calls = _script(monkeypatch, [
        "not json",
        'garbage "operator_output": "Emailed Priya." trailing',
    ])
    result = await agent.run_command(db, tenant_id="t", text="hi", mode="copilot")
    assert result["message"]["text"] == "Emailed Priya."
    assert calls["n"] == 2, "salvage must not cost a further round trip"


def test_the_json_recovery_path_is_two_declared_nodes():
    nodes = set(build_operator_graph().nodes)
    assert {"nudge_json", "salvage_json"} <= nodes


# --------------------------------------------------------------------------- #
# Checkpointing
# --------------------------------------------------------------------------- #
async def test_send_dedupe_survives_across_commands_in_a_thread(db, monkeypatch, ):
    """Previously a per-run set. With a thread-keyed checkpointer, asking twice
    a minute apart is still caught."""
    sent: list[dict] = []
    from app.outbound import dispatcher
    async def capture(**kwargs):
        sent.append(kwargs)
    monkeypatch.setattr(dispatcher, "dispatch", capture)

    send = json.dumps({
        "thought": "send", "tool": "send_message",
        "args": {"to": "a@example.com", "channel": "email", "text": "same words"},
    })
    done = json.dumps({"thought": "done", "operator_output": "Sent."})

    _script(monkeypatch, [send, done])
    first = await agent.run_command(db, tenant_id="t", text="email a", mode="autopilot")

    _script(monkeypatch, [send, done])
    await agent.run_command(
        db, tenant_id="t", text="email a again", mode="autopilot",
        thread_id=first["thread_id"],
    )

    assert len(sent) == 1, "the identical re-send must be deduped across commands"


async def test_steps_do_not_accumulate_across_commands(db, monkeypatch):
    """`steps` is per-command; a checkpointer that carried them would make each
    reply show every step the thread had ever taken."""
    _script(monkeypatch, [json.dumps({"thought": "t1", "operator_output": "One."})])
    first = await agent.run_command(db, tenant_id="t", text="a", mode="copilot")

    _script(monkeypatch, [json.dumps({"thought": "t2", "operator_output": "Two."})])
    second = await agent.run_command(
        db, tenant_id="t", text="b", mode="copilot", thread_id=first["thread_id"]
    )

    assert len(second["message"]["steps"]) == 1
    assert second["message"]["steps"][0]["text"] == "t2"


async def test_checkpoints_round_trip_bson(db):
    """State is full of ObjectIds and the serialiser is msgpack-based."""
    from bson import ObjectId

    cp = MongoCheckpointer(db)
    oid = ObjectId()
    dumped = cp._dump({"thread_id": oid, "nested": [{"id": oid}]})
    restored = cp._load(dumped)

    assert restored["thread_id"] == oid
    assert isinstance(restored["nested"][0]["id"], ObjectId)


async def test_checkpointer_follows_the_injected_client(db):
    """It is compiled into the graph once, but tests swap the db underneath."""
    checkpointer_module.reset_checkpointer()
    cp = checkpointer_module.get_checkpointer()
    assert cp.db.name == db.name


# --------------------------------------------------------------------------- #
# Repeated read tools — regression cover
# --------------------------------------------------------------------------- #
# A real run called find_recipient twice with identical arguments before doing
# anything useful. Read tools are pure within a command, so the repeat bought
# nothing and cost one of only eight steps.
async def test_an_identical_read_is_served_from_the_previous_result(db, monkeypatch):
    lookups = {"n": 0}
    from app.operator import tools as tools_module

    original = tools_module.tool_find_recipient

    async def counted(db_, tenant_id, args, user_id=None):
        lookups["n"] += 1
        return await original(db_, tenant_id, args, user_id)

    monkeypatch.setattr(tools_module, "tool_find_recipient", counted)
    look = json.dumps({"thought": "look", "tool": "find_recipient", "args": {"query": "Ariyaman"}})
    _script(monkeypatch, [look, look, json.dumps({"thought": "done", "operator_output": "Asked."})])

    result = await agent.run_command(db, tenant_id="t", user_id="u", text="find", mode="copilot")

    assert lookups["n"] == 1, "the second identical lookup must not re-run"
    steps = [s for s in result["message"]["steps"] if s["type"] == "tool"]
    assert len(steps) == 2, "both attempts still appear in the trace"
    assert steps[1].get("cached") is True
    assert "already called this" in steps[1]["observation"]["note"]


async def test_a_different_query_still_runs(db, monkeypatch):
    lookups = {"n": 0}
    from app.operator import tools as tools_module

    original = tools_module.tool_find_recipient

    async def counted(db_, tenant_id, args, user_id=None):
        lookups["n"] += 1
        return await original(db_, tenant_id, args, user_id)

    monkeypatch.setattr(tools_module, "tool_find_recipient", counted)
    _script(monkeypatch, [
        json.dumps({"thought": "a", "tool": "find_recipient", "args": {"query": "Ariyaman"}}),
        json.dumps({"thought": "b", "tool": "find_recipient", "args": {"query": "Priya"}}),
        json.dumps({"thought": "done", "operator_output": "Asked."}),
    ])
    await agent.run_command(db, tenant_id="t", user_id="u", text="find", mode="copilot")
    assert lookups["n"] == 2


async def test_a_repeated_send_is_not_served_from_cache(db, monkeypatch):
    """`send_message` has its own dedupe, which records an *attempt* and
    reports `duplicate`. Replaying the first result instead would tell the
    model a second message went out."""
    from app.outbound import dispatcher

    sent: list[dict] = []

    async def capture(**kwargs):
        sent.append(kwargs)

    monkeypatch.setattr(dispatcher, "dispatch", capture)
    send = json.dumps({"thought": "send", "tool": "send_message",
                       "args": {"to": "a@example.com", "channel": "email", "text": "hi"}})
    _script(monkeypatch, [send, send, json.dumps({"thought": "done", "operator_output": "Sent."})])

    result = await agent.run_command(db, tenant_id="t", text="email a", mode="autopilot")

    steps = [s for s in result["message"]["steps"] if s["type"] == "tool"]
    assert steps[1]["observation"]["status"] == "duplicate"
    assert steps[1].get("cached") is not True
    assert len(sent) == 1
