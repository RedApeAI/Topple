"""The turn document keeps its attribution keys.

Regression cover for a bug found while moving the pipeline onto LangGraph: the
idempotency stub carried `user_id` and `session_id`, but the finished document
that replaced it did not, so both were silently deleted at the end of every
turn. HLD §4.9 lists them as turn document fields, `turns` carries indexes on
them (`tenant_user_ts`, `tenant_session_ts`), and both the turn list and the
metrics rollup filter on them — so the effect was that
`GET /v1/turns?user_id=…` matched nothing and `by_session` was always empty.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.engine.pipeline import run_turn
from app.llm.gateway import LLMUnavailable
from app.main import app

from .conftest import envelope_dict, make_envelope


async def test_turn_document_keeps_user_and_session(db, llm, retrieval):
    await run_turn(
        make_envelope(request_id="req-attrib-1", user_id="u-42", session_id="s-99")
    )

    turn = await db.turns.find_one({"request_id": "req-attrib-1"})
    assert turn["user_id"] == "u-42"
    assert turn["session_id"] == "s-99"
    assert turn["status"] == "completed", "attribution must survive a *finished* turn"


async def test_attribution_survives_the_error_path_too(db, llm, retrieval):
    llm.extract_error = LLMUnavailable("down")
    with pytest.raises(LLMUnavailable):
        await run_turn(
            make_envelope(request_id="req-attrib-2", user_id="u-42", session_id="s-99")
        )

    turn = await db.turns.find_one({"request_id": "req-attrib-2"})
    assert turn["user_id"] == "u-42"
    assert turn["session_id"] == "s-99"


def test_turns_can_be_listed_by_user(db, llm, retrieval):
    with TestClient(app) as client:
        client.post(
            "/v1/turns",
            json=envelope_dict(request_id="req-attrib-3", user_id="u-42", session_id="s-99"),
        )
        listed = client.get("/v1/turns", params={"tenant_id": "redape", "user_id": "u-42"})

    assert listed.status_code == 200
    rows = listed.json()
    assert [r["request_id"] for r in rows] == ["req-attrib-3"]
    assert rows[0]["session_id"] == "s-99"
