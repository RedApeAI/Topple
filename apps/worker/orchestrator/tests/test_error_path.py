"""Every LLM/store failure path must still write the turn document with
`error` populated — and total LLM failure surfaces as HTTP 503."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.engine.pipeline import run_turn
from app.llm.gateway import LLMUnavailable
from app.main import app

from .conftest import envelope_dict, make_envelope


async def test_turn_written_on_extract_failure(db, llm, retrieval):
    llm.extract_error = LLMUnavailable("LLM unreachable after retry: boom")
    with pytest.raises(LLMUnavailable):
        await run_turn(make_envelope(request_id="req-err-1"))

    turn = await db.turns.find_one({"request_id": "req-err-1"})
    assert turn is not None
    assert turn["status"] == "error"
    assert turn["error"]["step"] == "extract"
    assert turn["error"]["type"] == "LLMUnavailable"
    assert "boom" in turn["error"]["message"]
    assert turn["ts_end"] is not None
    assert turn["result"] is None


async def test_turn_written_on_generate_failure(db, llm, retrieval):
    llm.generate_error = LLMUnavailable("mid-turn outage")
    with pytest.raises(LLMUnavailable):
        await run_turn(make_envelope(request_id="req-err-2"))

    turn = await db.turns.find_one({"request_id": "req-err-2"})
    assert turn["error"]["step"] == "generate"
    # extraction had already succeeded and is preserved in the trace
    assert turn["extraction"]["intent"] == "provide_info"


async def test_failed_request_id_can_be_retried(db, llm, retrieval):
    llm.extract_error = LLMUnavailable("transient")
    with pytest.raises(LLMUnavailable):
        await run_turn(make_envelope(request_id="req-retry-1"))

    llm.extract_error = None
    result = await run_turn(make_envelope(request_id="req-retry-1"))
    assert result.deduped is False
    assert result.reply.status == "sent"
    turn = await db.turns.find_one({"request_id": "req-retry-1"})
    assert turn["status"] == "completed"
    assert turn["error"] is None


def test_llm_failure_maps_to_503(db, llm, retrieval):
    llm.extract_error = LLMUnavailable("down")
    with TestClient(app) as client:
        resp = client.post("/v1/turns", json=envelope_dict(request_id="req-err-http"))
    assert resp.status_code == 503
    assert resp.json()["error"] == "llm_unavailable"
