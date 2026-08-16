"""Post-response work: what moves off the response path, and what survives a crash.

The turn used to await the outbound dispatch — an HTTP POST to the BFF which
then calls Gmail — before returning. Delivery was always best-effort, so the
wait bought nothing. Moving it introduces exactly one new failure mode: the
process dies after the response and before the deferred work runs. These tests
pin down what is guaranteed in that window.
"""
from __future__ import annotations

import pytest

from app.engine.background import Background
from app.engine.pipeline import recover_incomplete_turns, run_turn
from app.llm.gateway import LLMUnavailable
from app.outbound import dispatcher

from .conftest import make_envelope


@pytest.fixture()
def sent(monkeypatch) -> list[dict]:
    calls: list[dict] = []

    async def capture(**kwargs):
        calls.append(kwargs)

    monkeypatch.setattr(dispatcher, "dispatch", capture)
    return calls


# --------------------------------------------------------------------------- #
# What actually leaves the response path
# --------------------------------------------------------------------------- #
async def test_dispatch_has_not_happened_when_the_response_is_ready(db, llm, retrieval, sent):
    background = Background()
    result = await run_turn(make_envelope(request_id="req-def-1"), background=background)

    assert result.reply.status == "sent"
    assert sent == [], "the caller must not wait on a Gmail round trip"
    assert [name for name, _ in background.tasks] == ["dispatch", "write_turn"]

    await background.drain()
    assert len(sent) == 1


async def test_the_turn_document_is_written_once(db, llm, retrieval, sent, monkeypatch):
    import app.engine.pipeline as pipeline

    writes: list[str] = []
    original = pipeline._write_turn

    async def count(db_, state):
        writes.append(state.request_id)
        return await original(db_, state)

    monkeypatch.setattr(pipeline, "_write_turn", count)

    background = Background()
    await run_turn(make_envelope(request_id="req-def-2"), background=background)
    await background.drain()

    assert writes == ["req-def-2"], "exactly one turn *document* write per turn"
    # And the completing marker is a field update, not a second document write.
    turn = await db.turns.find_one({"request_id": "req-def-2"})
    assert turn["status"] == "completed"


async def test_omitting_the_background_keeps_the_old_ordering(db, llm, retrieval, sent):
    """The tests and the parity harness rely on this: no background means the
    drain happens before `run_turn` returns."""
    result = await run_turn(make_envelope(request_id="req-def-3"))
    assert result.reply.status == "sent"
    assert len(sent) == 1, "dispatch must already have happened"

    turn = await db.turns.find_one({"request_id": "req-def-3"})
    assert turn["status"] == "completed"


async def test_a_draft_defers_no_dispatch(db, llm, retrieval, sent):
    background = Background()
    await run_turn(
        make_envelope(request_id="req-def-4", mode="copilot"), background=background
    )
    assert [name for name, _ in background.tasks] == ["write_turn"]
    await background.drain()
    assert sent == []


# --------------------------------------------------------------------------- #
# The crash window
# --------------------------------------------------------------------------- #
async def test_state_before_the_drain_is_recoverable(db, llm, retrieval, sent):
    """Simulates the crash: run the turn, never drain."""
    background = Background()
    await run_turn(make_envelope(request_id="req-def-5"), background=background)

    turn = await db.turns.find_one({"request_id": "req-def-5"})
    assert turn["status"] == "completing"
    assert turn["result"] is not None, "the answer must survive the crash"
    assert turn["outbox"]["to"] == "+971501234567"
    assert sent == []


async def test_a_retry_after_a_crash_replays_rather_than_reruns(db, llm, retrieval, sent):
    """The existing dedupe protocol is what makes the window safe: a persisted
    `result` means a retry takes the replay branch instead of 409-ing forever."""
    background = Background()
    first = await run_turn(make_envelope(request_id="req-def-6"), background=background)
    # crash: background never drains

    replay = await run_turn(make_envelope(request_id="req-def-6"))
    assert replay.deduped is True
    assert replay.reply.messages == first.reply.messages
    assert llm.generate_calls == 1, "the pipeline must not have run twice"


async def test_recovery_finishes_a_stranded_turn(db, llm, retrieval, sent):
    background = Background()
    await run_turn(make_envelope(request_id="req-def-7"), background=background)
    assert sent == []

    recovered = await recover_incomplete_turns(db)

    assert recovered == 1
    assert len(sent) == 1, "the message owed to the buyer is sent on recovery"
    turn = await db.turns.find_one({"request_id": "req-def-7"})
    assert turn["status"] == "completed"
    assert turn["outbox"] is None


async def test_recovery_does_not_send_twice(db, llm, retrieval, sent):
    background = Background()
    await run_turn(make_envelope(request_id="req-def-8"), background=background)

    await recover_incomplete_turns(db)
    await recover_incomplete_turns(db)

    assert len(sent) == 1, "a second sweep must not re-send"


async def test_recovery_ignores_turns_still_in_flight(db, llm, retrieval, sent):
    """An `in_progress` stub with no result is a live request, not a casualty."""
    await db.turns.insert_one(
        {"request_id": "req-inflight", "status": "in_progress", "result": None, "error": None}
    )
    assert await recover_incomplete_turns(db) == 0
    assert sent == []


async def test_a_completed_turn_is_not_swept(db, llm, retrieval, sent):
    await run_turn(make_envelope(request_id="req-def-9"))
    assert len(sent) == 1
    assert await recover_incomplete_turns(db) == 0
    assert len(sent) == 1


# --------------------------------------------------------------------------- #
# Failure paths
# --------------------------------------------------------------------------- #
async def test_the_error_path_stays_inline(db, llm, retrieval, sent):
    """There is no response to get out of the way of, and the turn document is
    the only record that the failure happened."""
    llm.extract_error = LLMUnavailable("down")
    background = Background()

    with pytest.raises(LLMUnavailable):
        await run_turn(make_envelope(request_id="req-def-err"), background=background)

    turn = await db.turns.find_one({"request_id": "req-def-err"})
    assert turn["status"] == "error"
    assert turn["error"]["step"] == "extract"
    assert background.tasks == [], "nothing may be left owing on an error path"


async def test_a_failing_dispatch_does_not_break_the_drain(db, llm, retrieval, monkeypatch):
    async def explode(**_kwargs):
        raise ConnectionError("BFF unreachable")

    monkeypatch.setattr(dispatcher, "dispatch", explode)

    background = Background()
    await run_turn(make_envelope(request_id="req-def-10"), background=background)
    await background.drain()

    assert background.failures == ["dispatch"]
    # The turn document still landed — it is queued after the dispatch.
    turn = await db.turns.find_one({"request_id": "req-def-10"})
    assert turn["status"] == "completed"
