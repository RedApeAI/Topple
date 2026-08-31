"""`merge_identities` is transactional where the deployment allows it.

HLD §8 gap 3: four writes across three collections with no transaction. A crash
after the duplicate is deleted loses its profile outright and orphans its
conversations against a `contact_id` that no longer exists — and there is no
way to repair that from either side afterwards.

The real assertion needs a replica set, so it is marked `integration`. What
runs everywhere is the fallback: that a deployment without transactions still
merges, and says so loudly.
"""
from __future__ import annotations

import logging

import pytest

from app.engine import contacts


async def _pair(db, tenant="redape"):
    primary = await contacts.resolve_or_create(db, tenant, "whatsapp", "+971500000001")
    duplicate = await contacts.resolve_or_create(db, tenant, "email", "dup@example.com")
    await db.contacts.update_one(
        {"_id": duplicate["_id"]},
        {"$set": {"lead": {"budget_min_aed": 900000, "qualification_score": 30},
                  "profile": {"name": "Dup Person", "name_lower": "dup person"}}},
    )
    convo = await db.conversations.insert_one(
        {"tenant_id": tenant, "contact_id": duplicate["_id"], "channel": "email"}
    )
    return primary["_id"], duplicate["_id"], convo.inserted_id


# --------------------------------------------------------------------------- #
# Runs everywhere: the no-transaction fallback
# --------------------------------------------------------------------------- #
async def test_merge_still_works_without_transaction_support(db, caplog):
    primary_id, duplicate_id, convo_id = await _pair(db)

    with caplog.at_level(logging.WARNING):
        merged = await contacts.merge_identities(db, primary_id, duplicate_id)

    channels = {i["channel"] for i in merged["identities"]}
    assert channels == {"whatsapp", "email"}
    assert merged["lead"]["budget_min_aed"] == 900000
    assert await db.contacts.find_one({"_id": duplicate_id}) is None

    convo = await db.conversations.find_one({"_id": convo_id})
    assert convo["contact_id"] == primary_id, "conversations must be repointed"


async def test_the_fallback_is_loud(db, caplog):
    """Silently dropping the guarantee is how it stays dropped."""
    primary_id, duplicate_id, _ = await _pair(db)

    with caplog.at_level(logging.WARNING):
        await contacts.merge_identities(db, primary_id, duplicate_id)

    assert any(
        "WITHOUT a transaction" in record.message for record in caplog.records
    ), "a deployment losing atomicity must say so"


async def test_a_real_session_failure_is_not_swallowed(db, monkeypatch):
    """Only 'this deployment cannot open a session' degrades. A genuine error —
    auth, a network partition — must propagate rather than silently dropping
    to the un-transacted path."""
    primary_id, duplicate_id, _ = await _pair(db)

    async def refuse(*args, **kwargs):
        raise RuntimeError("not authorized on admin to execute startSession")

    monkeypatch.setattr(db.client, "start_session", refuse)
    with pytest.raises(RuntimeError, match="not authorized"):
        await contacts.merge_identities(db, primary_id, duplicate_id)

    assert await db.contacts.find_one({"_id": duplicate_id}) is not None, (
        "nothing may be applied when the session could not be opened"
    )


def test_unsupported_detection_distinguishes_the_two_cases():
    assert contacts._transactions_unsupported(
        Exception("Transaction numbers are only allowed on a replica set member")
    )
    assert contacts._transactions_unsupported(NotImplementedError())
    assert contacts._transactions_unsupported(AttributeError("start_session"))
    assert not contacts._transactions_unsupported(
        Exception("E11000 duplicate key error collection: contacts")
    )
    assert not contacts._transactions_unsupported(
        RuntimeError("not authorized on admin to execute startSession")
    )


# --------------------------------------------------------------------------- #
# Needs a replica set
# --------------------------------------------------------------------------- #
@pytest.mark.integration
async def test_merge_rolls_back_entirely_on_failure(real_mongo):
    """The point of the transaction: a mid-merge failure leaves *nothing*
    applied, rather than a deleted duplicate and un-repointed conversations.

    Requires a real MongoDB replica set — `pytest -m integration`. Not run in
    the environment this was written in (no Docker daemon), so this test has
    never executed.
    """
    db = real_mongo
    primary_id, duplicate_id, convo_id = await _pair(db, tenant="txn")

    original = db.turns.update_many

    async def fail_last(*args, **kwargs):
        raise RuntimeError("simulated crash after the delete")

    db.turns.update_many = fail_last
    try:
        with pytest.raises(RuntimeError, match="simulated crash"):
            await contacts.merge_identities(db, primary_id, duplicate_id)
    finally:
        db.turns.update_many = original

    assert await db.contacts.find_one({"_id": duplicate_id}) is not None, (
        "the duplicate must survive a rolled-back merge"
    )
    convo = await db.conversations.find_one({"_id": convo_id})
    assert convo["contact_id"] == duplicate_id, "no partial repointing"
