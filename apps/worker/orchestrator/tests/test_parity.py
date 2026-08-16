"""The parity harness, run as part of the normal suite.

Two things are checked here, and the second matters as much as the first:

1. Every fixture produces identical observations under the pre-migration
   pipeline and the LangGraph one.
2. The harness actually *detects* divergence. A comparison that always reports
   success is worse than no comparison, because it is trusted. Each mutation
   below breaks the graph implementation in a specific way and asserts the
   differ notices, and on the right fields.

The mutations patch `app.engine.pipeline.TURN_GRAPH` directly rather than the
module-level `turn_graph.TURN_GRAPH`, because `pipeline` binds the compiled
graph by value at import — rebuilding the module attribute alone is a no-op,
which is a trap worth leaving documented.
"""
from __future__ import annotations

import pytest

from app.graph import turn_graph
from app.graph.policy import best_effort, critical
from app.schemas.envelope import Reply
import app.engine.pipeline as graph_pipeline

from .parity.backends import MemoryBackend
from .parity.differ import compare
from .parity.observation import COMPARED_FIELDS
from .parity.recorder import cases, load_fixtures
from .parity.replayer import replay

#: Every case the harness is required to cover.
REQUIRED_CASES = {
    "happy_path",
    "handoff_intent",
    "handoff_sentiment",
    "low_confidence_strikes",
    "postcheck_regen_ok",
    "postcheck_forces_draft",
    "retrieval_gated_off",
    "qdrant_missing",
    "copilot",
    "autopilot",
    "duplicate_request_id",
}


@pytest.fixture()
async def backend():
    made = MemoryBackend()
    await made.start()
    yield made
    await made.stop()


async def _diff(fixture: dict, backend: MemoryBackend):
    left = await replay(fixture, "legacy", backend)
    right = await replay(fixture, "graph", backend)
    return compare(fixture, left, right)


# --------------------------------------------------------------------------- #
# Coverage
# --------------------------------------------------------------------------- #
def test_every_required_case_has_fixtures():
    covered = cases()
    assert REQUIRED_CASES - set(covered) == set()
    assert sum(covered.values()) >= 30


# --------------------------------------------------------------------------- #
# Parity
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("fixture", load_fixtures(), ids=lambda f: f["id"])
async def test_graph_matches_legacy(fixture, backend):
    result = await _diff(fixture, backend)
    assert result.ok, "\n".join(
        [result.structural or ""] + [d.render("legacy", "graph") for d in result.diffs]
    )


# --------------------------------------------------------------------------- #
# The harness detects breakage
# --------------------------------------------------------------------------- #
def _install(**replacements):
    """Swap graph nodes and recompile into the object the pipeline resolves to.

    The pipeline picks its topology per turn via `graph_for`, so the mutation
    has to replace that rather than a module-level constant — and pinning it to
    one compiled graph is also what keeps these tests independent of whichever
    feature flags happen to be set.
    """
    saved = {name: getattr(turn_graph, name) for name in replacements}
    saved["__graph_for__"] = graph_pipeline.graph_for
    for name, value in replacements.items():
        setattr(turn_graph, name, value)
    mutated = turn_graph.build_turn_graph().compile()
    graph_pipeline.graph_for = lambda _tenant_id: mutated
    return saved


def _restore(saved):
    graph_pipeline.graph_for = saved.pop("__graph_for__")
    for name, value in saved.items():
        setattr(turn_graph, name, value)


async def test_detects_a_copilot_gate_that_stopped_gating(backend):
    original = turn_graph.compose_reply_node

    @critical("compose_reply")
    async def always_send(state, runtime):
        update = await original(state, runtime)
        update["reply"] = Reply(status="sent", messages=update["reply"].messages)
        update["guardrails"] = {**update["guardrails"], "final_action": "sent"}
        return update

    saved = _install(compose_reply_node=always_send)
    try:
        fixture = next(f for f in load_fixtures() if f["id"] == "copilot-01-greeting")
        result = await _diff(fixture, backend)
    finally:
        _restore(saved)

    assert not result.ok
    assert {"dispatched", "guardrails.final_action"} <= {
        d.field_name for d in result.diffs
    }


async def test_detects_retrieval_being_skipped(backend):
    @best_effort("retrieval")
    async def no_retrieval(state, runtime):
        return {}

    saved = _install(retrieval_node=no_retrieval)
    try:
        fixture = next(
            f for f in load_fixtures() if f["id"] == "happy-02-qualify-to-recommend"
        )
        result = await _diff(fixture, backend)
    finally:
        _restore(saved)

    assert not result.ok
    # The FACTS block feeds the system prompt, so a skipped retrieval must show
    # up in the prompt hash as well as in the hits.
    assert {"retrieval.hits", "generation.system_prompt_hash"} <= {
        d.field_name for d in result.diffs
    }


async def test_detects_a_skipped_regeneration(backend):
    saved = _install(_after_post_check=lambda state: "compose_reply")
    try:
        fixture = next(
            f for f in load_fixtures() if f["id"] == "regen-ok-01-ungrounded-number"
        )
        result = await _diff(fixture, backend)
    finally:
        _restore(saved)

    assert not result.ok
    assert {"guardrails.regenerated", "generation.output_messages"} <= {
        d.field_name for d in result.diffs
    }


async def test_detects_a_frozen_state_machine(backend):
    original = turn_graph.state_node

    @critical("state")
    async def frozen(state, runtime):
        update = await original(state, runtime)
        update["stage_out"] = state.stage_in
        update["state"] = {**update["state"], "stage_out": state.stage_in}
        return update

    saved = _install(state_node=frozen)
    try:
        fixture = next(f for f in load_fixtures() if f["id"] == "happy-01-greeting")
        result = await _diff(fixture, backend)
    finally:
        _restore(saved)

    assert not result.ok
    assert "stage_out" in {d.field_name for d in result.diffs}


async def test_detects_broken_idempotency(backend):
    original = graph_pipeline._reserve_turn

    async def no_dedupe(db, envelope):
        await db.turns.delete_many({"request_id": envelope.request_id})
        return await original(db, envelope)

    graph_pipeline._reserve_turn = no_dedupe
    try:
        fixture = next(f for f in load_fixtures() if f["id"] == "dupe-01-replay")
        result = await _diff(fixture, backend)
    finally:
        graph_pipeline._reserve_turn = original

    assert not result.ok
    # A re-run rather than a replay changes the stage as well as the transcript.
    assert {"stage_in", "stage_out", "message_status"} <= {
        d.field_name for d in result.diffs
    }


def test_excluded_fields_are_not_secretly_compared():
    """Timestamps and token counts must stay out of the comparison."""
    for name in ("ts_start", "ts_end", "totals.latency_ms", "generation.retries"):
        assert name not in COMPARED_FIELDS
