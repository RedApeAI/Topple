"""`run_turn(envelope)` — the entry point for one AI turn.

The work itself is `app/graph/turn_graph.py`. What lives here is everything
that must happen *around* the graph:

 1. the defence-in-depth scope assertion (403)
 2. the idempotency protocol — insert-as-lock on `request_id`, then replay a
    stored result, take over a failed attempt, or 409
 3. writing the turn document exactly once, including on every error path

Steps 2 and 3 are deliberately outside the graph. `request_id` uniqueness is
already the lock, and turn identity is not something a graph node should be
able to reassign halfway through.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from pymongo.errors import DuplicateKeyError

from ..graph.context import GraphContext
from ..graph.policy import failed_node
from ..graph.turn_graph import graph_for
from ..graph.turn_state import TurnState
from ..outbound import dispatcher
from ..schemas.envelope import OrchestratorInput, OrchestratorResult
from ..stores import mongo
from .background import Background

logger = logging.getLogger(__name__)


class ScopeDenied(Exception):
    """Envelope channel not covered by granted_scopes → 403."""


class TurnInProgress(Exception):
    """Same request_id is being processed right now → 409."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _result_from_stored(stored: dict) -> OrchestratorResult:
    data = dict(stored["result"])
    data["deduped"] = True
    return OrchestratorResult.model_validate(data)


async def _reserve_turn(db, envelope: OrchestratorInput):
    """Take the lock for this `request_id`.

    Returns the turn's `_id` on success, or an `OrchestratorResult` when this
    is a replay of a turn that already completed. Raises `TurnInProgress` when
    another attempt holds the lock.
    """
    stub = {
        "request_id": envelope.request_id,
        "tenant_id": envelope.tenant_id,
        "user_id": envelope.user_id,
        "session_id": envelope.session_id,
        "channel": envelope.channel.value,
        "status": "in_progress",
        "ts_start": _now(),
        "result": None,
        "error": None,
    }
    try:
        insert = await db.turns.insert_one(stub)
        return insert.inserted_id
    except DuplicateKeyError:
        existing = await db.turns.find_one({"request_id": envelope.request_id})
        if existing and existing.get("result"):
            logger.info("dedupe hit for request_id=%s", envelope.request_id)
            return _result_from_stored(existing)
        if existing and existing.get("error"):
            # A previous attempt failed (e.g. a transient LLM outage) — take over.
            stub.pop("_id", None)  # insert_one set it on the rejected dict
            stub["ts_start"] = _now()
            replaced = await db.turns.find_one_and_replace(
                {"request_id": envelope.request_id, "error": {"$ne": None}}, stub
            )
            if replaced is None:
                raise TurnInProgress(envelope.request_id) from None
            return replaced["_id"]
        raise TurnInProgress(envelope.request_id) from None


async def _write_turn(db, state: TurnState) -> None:
    """Replace the idempotency stub with the finished document.

    The one and only write of a turn *document*. Everything else that touches
    `turns` — the stub insert, the completing marker — is a targeted field
    update on a document that already exists.
    """
    document = state.to_turn_document()
    document["_id"] = state.turn_id
    await db.turns.replace_one({"_id": state.turn_id}, document)


async def _mark_completing(db, state: TurnState) -> None:
    """Persist enough, before responding, to reconstruct the turn after a crash.

    The window this closes: the response has gone out, so the caller believes
    the turn happened, but the background drain has not run — the turn document
    is still a stub and nothing has been dispatched. Without this the stub
    would sit in `in_progress` forever and a retry of the same `request_id`
    would 409 rather than replay.

    Writing `result` here is what makes it recoverable, and it does so through
    the *existing* protocol rather than a new one: a retry now takes the
    replay-on-result branch and returns the same answer it would have got.
    `outbox` is the dispatch that still owes, for `recover_incomplete_turns`.

    Delivery is at-least-once, as it already was. A crash between the dispatch
    POST landing and the drain finishing can re-send on recovery; the
    alternative is dropping messages, which is worse.
    """
    await db.turns.update_one(
        {"_id": state.turn_id},
        {
            "$set": {
                "status": "completing",
                "result": state.result,
                "outbox": state.outbox,
            }
        },
    )


async def recover_incomplete_turns(db, limit: int = 100) -> int:
    """Finish turns whose background drain never ran. Returns how many.

    Safe to call on every startup: a turn is only picked up when it has a
    `result` (so it is genuinely mid-drain rather than mid-flight) and its
    dispatch has not already been attempted.
    """
    stranded = await db.turns.find(
        {"status": "completing", "result": {"$ne": None}}
    ).to_list(length=limit)

    for turn in stranded:
        outbox = turn.get("outbox")
        if outbox and not turn.get("outbox_attempted_at"):
            # Marked *before* the attempt: a crash mid-dispatch must not put
            # this turn back in the queue to send again on the next boot.
            await db.turns.update_one(
                {"_id": turn["_id"]}, {"$set": {"outbox_attempted_at": _now()}}
            )
            try:
                await dispatcher.dispatch(**outbox)
            except Exception:  # noqa: BLE001 — recovery is best-effort too
                logger.exception("recovery dispatch failed for %s", turn.get("request_id"))
        await db.turns.update_one(
            {"_id": turn["_id"]}, {"$set": {"status": "completed", "outbox": None}}
        )

    if stranded:
        logger.warning("recovered %d turn(s) stranded mid-drain", len(stranded))
    return len(stranded)


async def run_turn(
    envelope: OrchestratorInput, *, background: Background | None = None
) -> OrchestratorResult:
    """One turn.

    `background` is where the post-response work goes: the outbound dispatch,
    the turn document write, and the completion event. Pass one and the caller
    drains it after the response is sent; omit it and everything is drained
    before this returns, which is the original ordering exactly. That is what
    keeps the tests and the parity harness meaningful — deferral moves the
    drain, not the work.
    """
    db = mongo.get_db()
    deferred = background if background is not None else Background()

    # 1. defence in depth — everything else about the request is pre-verified
    required_scope = f"channel:{envelope.channel.value}"
    if required_scope not in envelope.granted_scopes:
        raise ScopeDenied(
            f"channel {envelope.channel.value!r} not in granted_scopes {envelope.granted_scopes}"
        )

    # 2. idempotency
    reserved = await _reserve_turn(db, envelope)
    if isinstance(reserved, OrchestratorResult):
        return reserved

    # 3. run the graph, keeping the latest state as it goes.
    #
    # `astream` rather than `ainvoke` specifically so a failure still has
    # something to write: it emits state after every superstep and only then
    # raises, so the work completed before a critical node died — the
    # extraction, say — is preserved on the turn document.
    state = TurnState.from_envelope(envelope, reserved)
    try:
        async for values in graph_for(envelope.tenant_id).astream(
            state,
            context=GraphContext(db=db, background=deferred),
            stream_mode="values",
        ):
            state = state.model_copy(update=values)
    except Exception as exc:  # noqa: BLE001 — every failure still writes the turn
        state.error = {
            "step": failed_node(exc),
            "type": type(exc).__name__,
            "message": str(exc),
        }
        state.status = "error"
        # The error path stays inline. There is no response to get out of the
        # way of — the caller is about to receive a 5xx — and the turn document
        # is the only record that this happened.
        deferred.tasks.clear()
        try:
            await _write_turn(db, state)
        except Exception:  # noqa: BLE001
            logger.exception("failed to write error turn for %s", envelope.request_id)
        raise

    # Everything after this point is off the response path.
    deferred.defer("write_turn", lambda: _write_turn(db, state))
    await _mark_completing(db, state)

    if background is None:
        await deferred.drain()

    return OrchestratorResult.model_validate(state.result)
