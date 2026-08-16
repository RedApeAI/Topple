"""Node failure policy, and the two loop bounds the graphs are responsible for.

Every node in both graphs is tagged `critical` or `best_effort`. That tagging
is the declarative replacement for try/except scattered through the store
modules, so it needs cover of its own: the tags exist, they cannot be omitted,
and each one actually behaves as advertised.
"""
from __future__ import annotations

import json
import operator
from typing import Annotated

import pytest
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from app.graph import policy
from app.graph.operator_graph import build_operator_graph
from app.graph.turn_graph import build_turn_graph
from app.llm import gateway
from app.llm.gateway import LLMCallStats, LLMUnavailable
from app.operator import agent
from app.stores import qdrant

from .conftest import make_envelope


def _policies(builder) -> dict[str, str]:
    """Node name → declared policy, read back off the built graph."""
    return {
        name: getattr(spec.runnable.afunc, "node_policy", None)
        for name, spec in builder.nodes.items()
    }


# --------------------------------------------------------------------------- #
# The tagging itself
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "build", [build_turn_graph, build_operator_graph], ids=["turn", "operator"]
)
def test_every_node_declares_a_failure_policy(build):
    undeclared = [
        name for name, tag in _policies(build()).items()
        if tag not in (policy.CRITICAL, policy.BEST_EFFORT)
    ]
    assert undeclared == []


def test_infrastructure_nodes_are_the_best_effort_ones():
    """Losing an event, a retrieval or an outbound webhook must not lose a
    customer message; anything that shapes the reply must not be swallowed.

    The speculative pair is survivable for the same reason and then some — a
    retrieval fired before we know it is needed must cost nothing when it
    fails, and the gate falls back to no facts rather than no reply.
    """
    tags = _policies(build_turn_graph())
    survivable = {name for name, tag in tags.items() if tag == policy.BEST_EFFORT}
    assert survivable == {
        "publish_inbound",
        "retrieval",
        "dispatch",
        "speculate_retrieval",
        "retrieval_gate",
    }


def test_register_refuses_an_untagged_node():
    async def bare(state):  # no decorator
        return {}

    with pytest.raises(TypeError, match="not tagged"):
        policy.register(StateGraph(dict), bare)


# --------------------------------------------------------------------------- #
# What each tag does
# --------------------------------------------------------------------------- #
class _Toy(BaseModel):
    trace: Annotated[list[str], operator.add] = Field(default_factory=list)
    errors: Annotated[list[policy.NodeError], operator.add] = Field(default_factory=list)


def _toy_graph(first):
    @policy.critical("after")
    async def after(state: _Toy) -> dict:
        return {"trace": ["after"]}

    builder = StateGraph(_Toy)
    policy.register(builder, first, after)
    builder.add_edge(START, first.node_name)
    builder.add_edge(first.node_name, "after")
    builder.add_edge("after", END)
    return builder.compile()


async def test_best_effort_records_the_failure_and_lets_the_graph_continue():
    @policy.best_effort("flaky")
    async def flaky(state: _Toy) -> dict:
        raise RuntimeError("bus unreachable")

    final = await _toy_graph(flaky).ainvoke(_Toy())

    assert final["trace"] == ["after"], "the following node must still run"
    (recorded,) = final["errors"]
    assert recorded.node == "flaky"
    assert recorded.type == "RuntimeError"
    assert "bus unreachable" in recorded.message


async def test_critical_reraises_the_original_exception_and_names_the_node():
    @policy.critical("fatal")
    async def fatal(state: _Toy) -> dict:
        raise LLMUnavailable("model down")

    # The type must survive: callers upstream map LLMUnavailable to a 503, and
    # wrapping it in anything else would break that.
    with pytest.raises(LLMUnavailable) as caught:
        await _toy_graph(fatal).ainvoke(_Toy())

    assert policy.failed_node(caught.value) == "fatal"


def test_failed_node_is_honest_when_nothing_stamped_it():
    assert policy.failed_node(RuntimeError("raised outside any node")) == "unknown"


# --------------------------------------------------------------------------- #
# End to end: best-effort infra never fails a turn
# --------------------------------------------------------------------------- #
async def test_retrieval_outage_does_not_fail_the_turn(db, llm, retrieval, monkeypatch):
    from app.engine.pipeline import run_turn

    # Warm up GREETING→QUALIFYING, then qualify fully so the next turn reaches
    # RECOMMENDING and the retrieval gate actually opens.
    await run_turn(make_envelope(request_id="req-retrieval-warmup"))
    llm.extractions = [
        {
            "intent": "ask_price",
            "entities": {"budget_min_aed": 15_000_000, "localities": ["dubai marina"]},
            "sentiment": "neutral",
            "confidence": 0.95,
        }
    ]

    async def exploding_retrieve(*args, **kwargs):
        raise ConnectionError("qdrant unreachable")

    monkeypatch.setattr(qdrant, "retrieve", exploding_retrieve)

    result = await run_turn(make_envelope(request_id="req-retrieval-down"))
    assert result.reply.status == "sent", "a retrieval outage must not suppress the reply"

    turn = await db.turns.find_one({"request_id": "req-retrieval-down"})
    assert turn["status"] == "completed"
    assert turn["error"] is None
    # Retrieval never completed, so the section stays empty rather than lying.
    assert turn["retrieval"] is None


# --------------------------------------------------------------------------- #
# The operator step budget
# --------------------------------------------------------------------------- #
async def test_operator_stops_at_the_step_budget(db, monkeypatch):
    """A model that never finishes must be cut off by the budget and say so.

    The budget is counted in state rather than delegated to LangGraph's
    recursion limit, which would raise `GraphRecursionError` and lose this
    message entirely.
    """
    calls = {"n": 0}

    async def never_finishes(*, model, messages, temperature=0.3):
        calls["n"] += 1
        return (
            json.dumps({"thought": "still looking", "tool": "get_conversation", "args": {}}),
            LLMCallStats(),
        )

    monkeypatch.setattr(gateway, "chat_text", never_finishes)

    result = await agent.run_command(
        db, tenant_id="plucia", text="find someone", mode="copilot"
    )

    assert calls["n"] == agent.MAX_STEPS
    assert "ran out of steps" in result["message"]["text"]
    assert result["message"]["action"] is None
