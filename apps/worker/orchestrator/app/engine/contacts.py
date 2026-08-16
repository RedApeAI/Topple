"""Contact resolution + bifurcation merge.

A contact is one person per tenant; `identities` is the list of
(channel, external_id) pairs that map to them. The same person writing on
WhatsApp and email initially shows up as two contacts — the merge below is the
manual bifurcation fix.

TODO: automatic identity matching (same name + overlapping lead fields across
channels) is future work; today merging is an explicit admin action via
`POST /v1/contacts/merge`.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from ..playbooks.loader import Playbook
from .identity import normalize, normalize_identity

logger = logging.getLogger(__name__)

NULLISH = (None, "", [], {})


def _now() -> datetime:
    return datetime.now(timezone.utc)


def display_name(name: str | None) -> str | None:
    """Lowercased name for indexed lookup; `profile.name` keeps the real casing."""
    return name.strip().lower() if name and name.strip() else None


async def resolve_or_create(
    db,
    tenant_id: str,
    channel: str,
    external_id: str,
    *,
    name: str | None = None,
    user_id: str | None = None,
    source: str = "pipeline",
) -> dict:
    """Find the contact owning this identity, or create a fresh one.

    `external_id` is normalised on the way in, so the same person written two
    ways resolves to one contact rather than forking (see `.identity`).

    `source` records how the contact came to exist — "pipeline" for an inbound
    turn, "agent" when the Operator agent messaged someone new. `name` is only
    used at creation; an existing contact's name is never overwritten here.
    """
    external_id = normalize(channel, external_id)
    query = {
        "tenant_id": tenant_id,
        "identities": {"$elemMatch": {"channel": channel, "external_id": external_id}},
    }
    contact = await db.contacts.find_one(query)
    if contact:
        return contact

    doc = {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "identities": [{"channel": channel, "external_id": external_id}],
        "profile": {"name": name, "name_lower": display_name(name), "language": None},
        "lead": {"qualification_score": 0},
        "source": source,
        "last_contacted_at": None,
        "created_at": _now(),
        "updated_at": _now(),
    }
    try:
        res = await db.contacts.insert_one(doc)
        doc["_id"] = res.inserted_id
        return doc
    except DuplicateKeyError:
        # lost a race with a concurrent turn — the winner's doc is authoritative
        winner = await db.contacts.find_one(query)
        if winner is None:
            # The insert was rejected but nothing matches: the identity was
            # claimed and then removed, or the write failed for another reason.
            # Returning None would AttributeError on the caller's next access.
            raise ContactRaceLost(
                f"identity {channel}:{external_id} could not be resolved or created"
            )
        return winner


class ContactRaceLost(RuntimeError):
    """A concurrent writer claimed this identity and it then vanished."""


async def touch_contacted(db, contact_id, when: datetime | None = None) -> None:
    """Record that we just exchanged a message with this contact.

    Denormalised onto the contact so recipient ranking can order by recency
    without aggregating over every conversation.
    """
    await db.contacts.update_one(
        {"_id": contact_id},
        {"$set": {"last_contacted_at": when or _now(), "updated_at": _now()}},
    )


# --------------------------------------------------------------------------- #
# Lead profile
# --------------------------------------------------------------------------- #
def _coerce(value, spec):
    """Coerce an extracted entity to its playbook type; None if unusable."""
    try:
        if spec.type == "int":
            if isinstance(value, str):
                value = value.replace(",", "").strip()
            return int(float(value))
        if spec.type == "float":
            return float(str(value).replace(",", ""))
        if spec.type == "bool":
            if isinstance(value, str):
                return value.strip().lower() in ("true", "yes", "1")
            return bool(value)
        if spec.type == "list":
            if isinstance(value, str):
                value = [value]
            return [str(v).strip() for v in value if str(v).strip()] or None
        if spec.type == "enum":
            norm = str(value).strip().lower().replace(" ", "_")
            return norm if spec.values and norm in spec.values else None
        return str(value).strip() or None
    except (TypeError, ValueError):
        return None


def qualification_score(lead: dict, playbook: Playbook) -> int:
    """Sum of playbook weights for fields that are known (0-100 by convention)."""
    return sum(
        spec.weight
        for name, spec in playbook.qualification_schema.items()
        if lead.get(name) not in NULLISH
    )


def merge_entities(lead: dict, entities: dict, playbook: Playbook) -> tuple[dict, int]:
    """Merge extracted entities into the lead profile.

    Never overwrites a known value with null (or with anything that fails
    type coercion); new non-null values do replace old ones — buyers change
    their minds. Returns (new_lead, qualification_score).
    """
    lead = dict(lead)
    for name, spec in playbook.qualification_schema.items():
        raw = entities.get(name)
        if raw in NULLISH:
            continue
        coerced = _coerce(raw, spec)
        if coerced in NULLISH or coerced is None:
            continue
        lead[name] = coerced
    lead["qualification_score"] = qualification_score(lead, playbook)
    return lead, lead["qualification_score"]


async def update_lead(db, contact_id, lead: dict) -> None:
    await db.contacts.update_one(
        {"_id": contact_id}, {"$set": {"lead": lead, "updated_at": _now()}}
    )


# --------------------------------------------------------------------------- #
# Bulk lead import (CSV/Excel upload)
# --------------------------------------------------------------------------- #
async def import_lead(
    db,
    tenant_id: str,
    name: str | None,
    identities: list[dict],
    user_id: str | None = None,
) -> tuple[dict | None, str, str | None]:
    """Create or update one contact from an imported row.

    `identities` is the set of (channel, external_id) pairs parsed from the
    row — a row can carry several (whatsapp + email, say) for the same
    person. Matches an existing contact by ANY of them (mirrors
    `resolve_or_create`'s per-identity lookup, generalized to a set), unions
    in any identities the existing contact doesn't already have, and fills
    `profile.name` only if it isn't already set — imported names never
    clobber a name the conversation pipeline already learned.

    Returns (contact_doc, status, reason) where status is one of
    "created" / "updated" / "skipped". A row with no usable identities is
    skipped outright — there is nothing to contact them on.
    """
    if not identities:
        return None, "skipped", "no channel identities provided"

    # Canonicalise before matching or storing — otherwise a spreadsheet's
    # "+971 50 123 4567" never matches the "+971501234567" already on file.
    identities = [normalize_identity(i) for i in identities]
    identities = [i for i in identities if i["external_id"]]
    if not identities:
        return None, "skipped", "no channel identities provided"

    query = {
        "tenant_id": tenant_id,
        "$or": [
            {"identities": {"$elemMatch": {"channel": i["channel"], "external_id": i["external_id"]}}}
            for i in identities
        ],
    }
    existing = await db.contacts.find_one(query)

    if existing is None:
        doc = {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "identities": identities,
            "profile": {
                "name": name,
                "name_lower": display_name(name),
                "language": None,
            },
            "lead": {"qualification_score": 0},
            "source": "import",
            "last_contacted_at": None,
            "created_at": _now(),
            "updated_at": _now(),
        }
        try:
            res = await db.contacts.insert_one(doc)
            doc["_id"] = res.inserted_id
            return doc, "created", None
        except DuplicateKeyError:
            # one of these identities was just claimed by a concurrent row —
            # fall through and treat it as an update against the winner.
            existing = await db.contacts.find_one(query)
            if existing is None:
                return None, "skipped", "identity conflict"

    merged = list(existing.get("identities", []))
    seen = {(i["channel"], i["external_id"]) for i in merged}
    for ident in identities:
        if (ident["channel"], ident["external_id"]) not in seen:
            merged.append(ident)
            seen.add((ident["channel"], ident["external_id"]))

    profile = dict(existing.get("profile") or {})
    if name and not profile.get("name"):
        profile["name"] = name
        profile["name_lower"] = display_name(name)

    update = {"identities": merged, "profile": profile, "updated_at": _now()}
    try:
        await db.contacts.update_one({"_id": existing["_id"]}, {"$set": update})
    except DuplicateKeyError:
        # a new identity in this row belongs to a different contact —
        # partial collision; leave both docs alone rather than guess.
        return existing, "skipped", "identity conflict"

    existing.update(update)
    return existing, "updated", None


# --------------------------------------------------------------------------- #
# Bifurcation merge
# --------------------------------------------------------------------------- #
class ContactNotFound(Exception):
    pass


#: "This deployment cannot open a session at all", as distinct from "this
#: transaction failed". Only ever consulted for the failure to *open* a
#: session, before any write — see `merge_identities`.
#:
#: Matched on type and message because the sources differ: mongomock raises
#: NotImplementedError, a driver without session support raises AttributeError,
#: and a replica-set-less mongod reports it in the message.
_NO_SESSION_TYPES = (AttributeError, NotImplementedError)
_NO_SESSION_MARKERS = (
    "transaction numbers are only allowed on a replica set",
    "transactions are not supported",
    "sessions are not supported",
    "start_session",
)


def _transactions_unsupported(exc: Exception) -> bool:
    if isinstance(exc, _NO_SESSION_TYPES):
        return True
    text = f"{exc}".lower()
    return any(marker in text for marker in _NO_SESSION_MARKERS)


async def merge_identities(db, primary_contact_id, duplicate_contact_id) -> dict:
    """Fold `duplicate` into `primary`: union identities, fill lead/profile
    gaps (primary's known values win), repoint conversations/messages/turns,
    delete the duplicate. Returns the merged primary doc."""
    primary_id = ObjectId(primary_contact_id)
    duplicate_id = ObjectId(duplicate_contact_id)
    if primary_id == duplicate_id:
        raise ValueError("primary and duplicate are the same contact")

    primary = await db.contacts.find_one({"_id": primary_id})
    duplicate = await db.contacts.find_one({"_id": duplicate_id})
    if primary is None or duplicate is None:
        raise ContactNotFound("primary or duplicate contact not found")
    if primary["tenant_id"] != duplicate["tenant_id"]:
        raise ValueError("cannot merge contacts across tenants")

    identities = list(primary.get("identities", []))
    seen = {(i["channel"], i["external_id"]) for i in identities}
    for ident in duplicate.get("identities", []):
        if (ident["channel"], ident["external_id"]) not in seen:
            identities.append(ident)

    lead = dict(duplicate.get("lead", {}))
    lead.update({k: v for k, v in primary.get("lead", {}).items() if v not in NULLISH})
    # score is recomputed against the playbook on the next turn; take the max
    # of the two as the interim value
    lead["qualification_score"] = max(
        primary.get("lead", {}).get("qualification_score", 0),
        duplicate.get("lead", {}).get("qualification_score", 0),
    )

    profile = dict(duplicate.get("profile", {}))
    profile.update({k: v for k, v in primary.get("profile", {}).items() if v not in NULLISH})

    merged = {
        "identities": identities,
        "lead": lead,
        "profile": profile,
        "updated_at": _now(),
    }

    async def _apply(session=None) -> None:
        # The duplicate goes FIRST so the unique identity index never sees the
        # same identity on two documents.
        await db.contacts.delete_one({"_id": duplicate_id}, session=session)
        await db.contacts.update_one(
            {"_id": primary_id}, {"$set": merged}, session=session
        )
        await db.conversations.update_many(
            {"contact_id": duplicate_id},
            {"$set": {"contact_id": primary_id}},
            session=session,
        )
        await db.turns.update_many(
            {"contact_id": duplicate_id},
            {"$set": {"contact_id": primary_id}},
            session=session,
        )

    # Four writes across three collections. Un-transacted, a crash after the
    # delete loses the duplicate's profile outright and orphans its
    # conversations against a contact_id that no longer exists — HLD §8 gap 3.
    #
    # Support is probed by opening the session, *before* anything is written.
    # Catching broadly around the writes instead would risk re-running them on
    # top of a partially-applied merge, which is worse than the bug being fixed.
    session = None
    try:
        session = await db.client.start_session()
    except Exception as exc:  # noqa: BLE001 — see `_transactions_unsupported`
        if not _transactions_unsupported(exc):
            raise

    if session is None:
        # Standalone MongoDB (and mongomock) have no transactions. Degrading is
        # right for a hand-triggered admin merge — refusing to merge at all on
        # a single-node deployment would be worse than the window we are
        # narrowing — but it must be loud, because the guarantee is gone.
        logger.warning(
            "merging %s into %s WITHOUT a transaction — no session support on "
            "this deployment, so a crash mid-merge is unrecoverable",
            duplicate_id, primary_id,
        )
        await _apply()
    else:
        # Anything raised in here propagates, and the transaction rolls back.
        async with session:
            async with session.start_transaction():
                await _apply(session)

    logger.info("merged contact %s into %s", duplicate_id, primary_id)
    return await db.contacts.find_one({"_id": primary_id})
