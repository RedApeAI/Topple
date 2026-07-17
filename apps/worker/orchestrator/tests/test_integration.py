"""Opt-in integration test against real Mongo + Qdrant from docker-compose.

Skipped by default (pytest.ini deselects the `integration` marker). Run with:

    docker compose up -d
    python seeds/seed_qdrant.py
    pytest -m integration
"""
from __future__ import annotations

import pytest

from app.stores import mongo as mongo_store
from app.stores import qdrant as qdrant_store

pytestmark = pytest.mark.integration


@pytest.fixture()
def real_mongo():
    from motor.motor_asyncio import AsyncIOMotorClient

    from app.config import settings

    client = AsyncIOMotorClient(settings.mongo_url, serverSelectionTimeoutMS=2000)
    mongo_store.set_client(client, db_name="blackbox_it")
    yield client
    client.close()


async def test_mongo_roundtrip_and_idempotency_index(real_mongo, llm, retrieval):
    from app.engine.pipeline import run_turn

    from .conftest import make_envelope

    db = real_mongo["blackbox_it"]
    await db.turns.drop()
    await db.contacts.drop()
    await db.conversations.drop()
    await db.messages.drop()
    await mongo_store.init_indexes(db)

    first = await run_turn(make_envelope(request_id="it-req-1"))
    assert first.reply.status == "sent"
    calls = llm.extract_calls

    deduped = await run_turn(make_envelope(request_id="it-req-1"))
    assert deduped.deduped is True
    assert llm.extract_calls == calls  # unique index enforced by real Mongo


async def test_qdrant_retrieval_roundtrip():
    pytest.importorskip("fastembed")
    client = qdrant_store.get_client()
    if not await client.collection_exists("plucia_re"):
        pytest.skip("run seeds/seed_qdrant.py first")

    hits, flag = await qdrant_store.retrieve(
        "plucia_re", "2 bedroom price in Dubai Marina", top_k=4, min_score=0.35
    )
    assert flag is None
    assert hits, "expected at least one hit from the seeded collection"
    assert any("AED" in h["text"] for h in hits)

    hits, flag = await qdrant_store.retrieve("missing_collection", "x", 4, 0.35)
    assert hits == []
    assert flag == "knowledge_source_missing"
