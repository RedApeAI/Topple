"""Recipient resolution: ranking, merging, and sending to a bare address.

The behaviour under test is the fix for an agent that could only contact people
already in the CRM.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.engine import contacts as contacts_engine
from app.engine import recipients
from app.stores import directory


def _now():
    return datetime.now(timezone.utc)


async def _contact(db, name, channel, external_id, *, contacted_days_ago=None):
    doc = await contacts_engine.resolve_or_create(
        db, "redape", channel, external_id, name=name
    )
    if contacted_days_ago is not None:
        await db.contacts.update_one(
            {"_id": doc["_id"]},
            {"$set": {"last_contacted_at": _now() - timedelta(days=contacted_days_ago)}},
        )
    return doc


@pytest.fixture()
def no_directory(monkeypatch):
    """Default to an empty mailbox so CRM behaviour is tested in isolation."""

    async def _empty(tenant_id, user_id):
        return []

    monkeypatch.setattr(directory, "entries_for", _empty)


def _mailbox(monkeypatch, entries):
    async def _entries(tenant_id, user_id):
        return entries

    monkeypatch.setattr(directory, "entries_for", _entries)


# --------------------------------------------------------------------------- #
# Ranking
# --------------------------------------------------------------------------- #
async def test_exact_name_beats_substring(db, no_directory):
    await _contact(db, "Ari", "email", "ari@redape.com", contacted_days_ago=90)
    await _contact(db, "Ariyaman Dev", "email", "ariyaman@redape.com", contacted_days_ago=1)

    found = await recipients.find_recipients(db, "redape", "u1", "Ari")
    assert found[0]["name"] == "Ari", "exact match must outrank a more recent substring"


async def test_recency_breaks_ties(db, no_directory):
    await _contact(db, "Ariyaman Old", "email", "old@redape.com", contacted_days_ago=100)
    await _contact(db, "Ariyaman New", "email", "new@redape.com", contacted_days_ago=2)

    found = await recipients.find_recipients(db, "redape", "u1", "Ariyaman")
    assert [c["name"] for c in found] == ["Ariyaman New", "Ariyaman Old"]


async def test_matches_a_middle_word(db, no_directory):
    """'ariyaman' should find 'Dev Ariyaman', not only names starting with it."""
    await _contact(db, "Dev Ariyaman", "email", "dev@redape.com")
    found = await recipients.find_recipients(db, "redape", "u1", "ariyaman")
    assert [c["name"] for c in found] == ["Dev Ariyaman"]


async def test_address_query_finds_the_contact_regardless_of_formatting(db, no_directory):
    await _contact(db, "Ada", "email", "ada@example.com")
    found = await recipients.find_recipients(db, "redape", "u1", "ADA@Example.com")
    assert len(found) == 1
    assert found[0]["name"] == "Ada"


async def test_no_match_returns_empty(db, no_directory):
    await _contact(db, "Ada", "email", "ada@example.com")
    assert await recipients.find_recipients(db, "redape", "u1", "Nobody") == []


# --------------------------------------------------------------------------- #
# Mailbox directory
# --------------------------------------------------------------------------- #
async def test_finds_someone_only_in_the_mailbox(db, monkeypatch):
    """The exact failure that started this: not in the CRM, but corresponded with."""
    _mailbox(
        monkeypatch,
        [
            {
                "email": "ariyaman@redape.com",
                "name": "Ariyaman",
                "sent": 4,
                "received": 2,
                "lastSeen": _now().isoformat(),
            }
        ],
    )
    found = await recipients.find_recipients(db, "redape", "u1", "Ariyaman")
    assert len(found) == 1
    assert found[0]["source"] == "gmail"
    assert found[0]["contact_id"] is None
    assert found[0]["channels"] == [{"channel": "email", "id": "ariyaman@redape.com"}]


async def test_crm_and_mailbox_dedupe_on_address(db, monkeypatch):
    await _contact(db, "Ada Lovelace", "email", "ada@example.com", contacted_days_ago=5)
    _mailbox(
        monkeypatch,
        [
            {
                "email": "Ada@Example.com",
                "name": "Ada",
                "sent": 9,
                "received": 1,
                "lastSeen": _now().isoformat(),
            }
        ],
    )
    found = await recipients.find_recipients(db, "redape", "u1", "Ada")
    assert len(found) == 1, "same address from both sources must collapse to one"
    assert found[0]["source"] == "crm", "the CRM entry is richer and wins"


async def test_mailbox_is_skipped_without_a_user(db, monkeypatch):
    _mailbox(monkeypatch, [{"email": "x@y.com", "name": "X", "lastSeen": ""}])
    assert await recipients.find_recipients(db, "redape", None, "X") == []


async def test_candidate_list_is_capped(db, monkeypatch):
    _mailbox(
        monkeypatch,
        [
            {
                "email": f"ariyaman{i}@redape.com",
                "name": f"Ariyaman {i}",
                "sent": 1,
                "received": 0,
                "lastSeen": _now().isoformat(),
            }
            for i in range(20)
        ],
    )
    found = await recipients.find_recipients(db, "redape", "u1", "Ariyaman")
    assert len(found) == recipients.MAX_CANDIDATES


async def test_public_candidate_hides_ranking_internals(db, no_directory):
    await _contact(db, "Ada", "email", "ada@example.com")
    found = await recipients.find_recipients(db, "redape", "u1", "Ada")
    public = recipients.public_candidate(found[0])
    assert not [key for key in public if key.startswith("_")]


# --------------------------------------------------------------------------- #
# Destination resolution
# --------------------------------------------------------------------------- #
async def test_raw_address_resolves_to_itself(db, no_directory):
    """Nobody needs to exist anywhere to be emailed."""
    external_id, name = await recipients.resolve_destination(
        db, "redape", "u1", "Ariyaman@RedApe.com", "email"
    )
    assert external_id == "ariyaman@redape.com"
    assert name is None


async def test_name_resolves_to_the_channel_address(db, no_directory):
    await _contact(db, "Ada", "email", "ada@example.com")
    external_id, name = await recipients.resolve_destination(
        db, "redape", "u1", "Ada", "email"
    )
    assert (external_id, name) == ("ada@example.com", "Ada")


async def test_unresolvable_name_returns_nothing(db, no_directory):
    assert await recipients.resolve_destination(
        db, "redape", "u1", "Nobody At All", "email"
    ) == (None, None)


async def test_wrong_channel_does_not_resolve(db, no_directory):
    """An email-only contact is not reachable on WhatsApp."""
    await _contact(db, "Ada", "email", "ada@example.com")
    assert await recipients.resolve_destination(
        db, "redape", "u1", "Ada", "whatsapp"
    ) == (None, None)
