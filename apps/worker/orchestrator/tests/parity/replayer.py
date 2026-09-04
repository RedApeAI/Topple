"""Run a fixture through one pipeline implementation.

Everything non-deterministic is pinned:

- `gateway._chat` returns the recorded responses in the order they were
  recorded. Patching there rather than at `extract`/`generate` keeps the real
  response handling in play — fence stripping, the extraction parse retry,
  `<think>` removal, bubble splitting.
- retrieval comes from the backend (recorded, or a real seeded Qdrant).
- `events.publish` is silenced. It cannot fail a turn, but a live Redis
  connection attempt per turn would dominate the runtime.
- `dispatcher.dispatch` is captured rather than called, and the fact that it
  *was* called is a compared field.
"""
from __future__ import annotations

import importlib
from dataclasses import dataclass, field
from typing import Any, Callable

from app.llm import gateway
from app.llm.gateway import LLMCallStats
from app.outbound import dispatcher
from app.schemas.envelope import OrchestratorInput
from app.stores import events

from .backends import Backend
from .observation import observe

#: `--impl <name>` → the module exposing `run_turn`.
IMPLS: dict[str, str] = {
    "legacy": "tests.parity.legacy",
    "graph": "app.engine.pipeline",
    # Same pipeline, but with the dispatch / turn-document write / completion
    # event deferred the way the HTTP handler defers them, and drained at the
    # end of the turn. Comparing this against `legacy` is what proves moving
    # that work off the response path did not move any *behaviour* with it.
    "graph-deferred": "app.engine.pipeline",
    # Phase 4a/4b: fan out after admit, retrieve speculatively. Diffs against
    # `legacy` are expected here and are the point — this impl exists so they
    # are enumerated rather than assumed.
    "graph-parallel": "app.engine.pipeline",
}

#: Impls that exercise the post-response deferral.
DEFERRED_IMPLS = frozenset({"graph-deferred"})
#: Impls that force the 4a/4b topology on regardless of tenant flags.
PARALLEL_IMPLS = frozenset({"graph-parallel"})


def load_impl(name: str) -> Callable:
    if name not in IMPLS:
        raise ValueError(f"unknown impl {name!r} — known: {', '.join(sorted(IMPLS))}")
    run_turn = getattr(importlib.import_module(IMPLS[name]), "run_turn")

    if name in PARALLEL_IMPLS:
        import app.engine.pipeline as pipeline
        from app.graph.turn_graph import TURN_GRAPH_PARALLEL

        async def parallel_run_turn(envelope):
            original = pipeline.graph_for
            pipeline.graph_for = lambda _tenant: TURN_GRAPH_PARALLEL
            try:
                return await run_turn(envelope)
            finally:
                pipeline.graph_for = original

        return parallel_run_turn

    if name not in DEFERRED_IMPLS:
        return run_turn

    from app.engine.background import Background

    async def deferred_run_turn(envelope):
        background = Background()
        try:
            return await run_turn(envelope, background=background)
        finally:
            # The handler drains after the response; here we drain at the end
            # of the turn, which is the same ordering from the observer's point
            # of view and keeps the replay single-threaded.
            await background.drain()

    return deferred_run_turn


class ExhaustedRecording(RuntimeError):
    """The implementation asked for more LLM calls than were recorded.

    Not swallowed: it means the two implementations disagree about how many
    times the model gets consulted, which is exactly the kind of divergence
    this harness exists to catch.
    """


@dataclass
class _ScriptedChat:
    """Replays recorded `_chat` responses, one turn at a time."""

    queue: list[dict] = field(default_factory=list)
    consumed: int = 0

    def load(self, calls: list[dict]) -> None:
        self.queue = list(calls)
        self.consumed = 0

    async def __call__(self, messages, *, model, temperature, disable_thinking):
        if not self.queue:
            raise ExhaustedRecording(
                f"implementation made {self.consumed + 1} LLM calls; "
                f"the recording has {self.consumed}"
            )
        call = self.queue.pop(0)
        self.consumed += 1
        return call["response"], LLMCallStats(
            latency_ms=0, prompt_tokens=0, completion_tokens=0, retries=0
        )


async def apply_setup(db, steps: list[dict], envelope: dict) -> None:
    """Fixture-declared preconditions, applied before a turn runs.

    Only one kind so far: an `in_progress` turn stub with neither result nor
    error, which is how a fixture reaches the 409 branch — that state is
    otherwise unreachable without a genuinely concurrent request.
    """
    from datetime import datetime, timezone

    for step in steps:
        if step["kind"] == "in_flight_stub":
            await db.turns.insert_one(
                {
                    "request_id": step["request_id"],
                    "tenant_id": envelope["tenant_id"],
                    "status": "in_progress",
                    "ts_start": datetime.now(timezone.utc),
                    "result": None,
                    "error": None,
                }
            )
        else:
            raise ValueError(f"unknown setup step {step['kind']!r}")


async def replay(fixture: dict, impl: str, backend: Backend) -> list[dict]:
    """Run every turn of one fixture. Returns one observation per turn."""
    run_turn = load_impl(impl)
    db = await backend.fresh_db()
    # Speculative topologies retrieve on turns the recording never did.
    await backend.install_retrieval(
        fixture["turns"], strict=impl not in PARALLEL_IMPLS
    )

    chat = _ScriptedChat()
    dispatched: list[dict] = []

    async def capture_dispatch(**kwargs: Any) -> None:
        dispatched.append(kwargs)

    async def silent_publish(*_args: Any, **_kwargs: Any) -> bool:
        return True

    original = (gateway._chat, dispatcher.dispatch, events.publish)
    gateway._chat = chat
    dispatcher.dispatch = capture_dispatch
    events.publish = silent_publish

    observations: list[dict] = []
    try:
        for turn in fixture["turns"]:
            chat.load(turn.get("llm") or [])
            dispatched.clear()
            await apply_setup(db, turn.get("setup") or [], turn["envelope"])

            envelope = OrchestratorInput.model_validate(turn["envelope"])
            outcome = "ok"
            try:
                await run_turn(envelope)
            except Exception as exc:  # noqa: BLE001 — the outcome is the datum
                outcome = f"raised:{type(exc).__name__}"

            turn_doc = await db.turns.find_one({"request_id": envelope.request_id})
            messages = await (
                db.messages.find({})
                .sort([("created_at", 1), ("_id", 1)])
                .to_list(length=200)
            )
            observations.append(
                observe(
                    turn_doc,
                    messages,
                    dispatched=bool(dispatched),
                    outcome=outcome,
                )
            )
    finally:
        gateway._chat, dispatcher.dispatch, events.publish = original

    return observations
