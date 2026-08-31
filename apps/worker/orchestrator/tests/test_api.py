"""API-level behavior: scope 403, dedupe, non-text 422, observability reads,
and the copilot drafts loop."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

from .conftest import envelope_dict


@pytest.fixture()
def client(db, llm, retrieval):
    with TestClient(app) as c:
        yield c


def test_wrong_scope_403(client):
    body = envelope_dict(granted_scopes=["channel:email"])
    resp = client.post("/v1/turns", json=body)
    assert resp.status_code == 403
    assert resp.json()["error"] == "scope_denied"


def test_non_text_message_422(client):
    body = envelope_dict()
    body["message"]["type"] = "image"
    resp = client.post("/v1/turns", json=body)
    assert resp.status_code == 422
    assert "only 'text' is supported" in resp.json()["detail"]


def test_turn_then_dedupe(client, llm):
    body = envelope_dict(request_id="req-dedupe-1")
    first = client.post("/v1/turns", json=body)
    assert first.status_code == 200, first.text
    r1 = first.json()
    assert r1["deduped"] is False
    assert r1["reply"]["status"] == "sent"
    assert llm.extract_calls == 1

    second = client.post("/v1/turns", json=body)
    assert second.status_code == 200
    r2 = second.json()
    assert r2["deduped"] is True
    assert r2["turn_id"] == r1["turn_id"]
    # the pipeline did NOT re-run
    assert llm.extract_calls == 1
    assert llm.generate_calls == 1


def test_observability_reads(client):
    body = envelope_dict(request_id="req-reads-1")
    result = client.post("/v1/turns", json=body).json()

    turn = client.get("/v1/turns/req-reads-1")
    assert turn.status_code == 200
    doc = turn.json()
    assert doc["status"] == "completed"
    assert doc["extraction"]["intent"] == "provide_info"
    assert doc["state"]["stage_in"] == "GREETING"

    convo = client.get(f"/v1/conversations/{result['conversation_id']}")
    assert convo.status_code == 200
    transcript = convo.json()["messages"]
    assert transcript[0]["direction"] == "inbound"
    assert any(m["direction"] == "outbound" for m in transcript)

    contact = client.get(f"/v1/contacts/{result['contact_id']}")
    assert contact.status_code == 200
    assert contact.json()["identities"][0]["external_id"] == "+971501234567"

    assert client.get("/v1/turns/nope").status_code == 404


def test_list_conversations_and_turns(client):
    client.post("/v1/turns", json=envelope_dict(request_id="req-lists-1"))

    rows = client.get("/v1/conversations", params={"tenant_id": "redape"}).json()
    assert len(rows) == 1
    assert rows[0]["contact"]["identities"][0]["external_id"] == "+971501234567"
    assert rows[0]["last_message"]["direction"] == "outbound"
    assert client.get("/v1/conversations", params={"tenant_id": "nobody"}).json() == []

    turns = client.get("/v1/turns", params={"tenant_id": "redape"}).json()
    assert any(t["request_id"] == "req-lists-1" for t in turns)
    assert turns[0]["stage_out"] == "QUALIFYING"
    assert turns[0]["reply_status"] == "sent"


def test_copilot_draft_approve_and_discard(client):
    body = envelope_dict(request_id="req-draft-1", mode="copilot")
    result = client.post("/v1/turns", json=body).json()
    assert result["reply"]["status"] == "draft"

    drafts = client.get("/v1/drafts", params={"tenant_id": "redape"}).json()
    assert len(drafts) == len(result["reply"]["messages"])

    approved = client.post(
        f"/v1/drafts/{drafts[0]['_id']}/approve", json={"edited_text": "Edited reply"}
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    assert approved.json()["text"] == "Edited reply"
    # approving twice conflicts
    assert client.post(f"/v1/drafts/{drafts[0]['_id']}/approve").status_code == 409

    if len(drafts) > 1:
        discarded = client.post(f"/v1/drafts/{drafts[1]['_id']}/discard")
        assert discarded.json()["status"] == "discarded"


def test_metrics_summary(client):
    client.post("/v1/turns", json=envelope_dict(request_id="req-m1"))
    client.post("/v1/turns", json=envelope_dict(request_id="req-m2"))
    resp = client.get("/v1/metrics/summary", params={"tenant_id": "redape"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["by_adapter"], data
    row = next(r for r in data["by_adapter"] if r["adapter_id"] == "real-estate-v2")
    assert row["turns"] >= 2
    assert row["prompt_tokens"] > 0
