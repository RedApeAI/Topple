"""Who does the salesperson mean?

The Operator agent used to answer this from the CRM alone, with an unranked
substring regex — so anyone not already an imported lead was simply
unreachable, and the agent correctly stalled rather than inventing an id.

This resolves against both sources the user actually has:

  * the CRM (Mongo `contacts`) — leads, with conversation history
  * their mailbox directory (cached in Dragonfly) — everyone they have really
    corresponded with

and returns ONE ranked list, so the model never has to decide which source to
consult. Ranking is exactness first, then recency, because "most recently
spoken to" is the strongest disambiguator a salesperson has in their head.

A raw address is a destination in its own right: `resolve_destination` answers
"where do I send this" without requiring anyone to exist anywhere first.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from ..stores import directory
from .identity import channel_for_address, normalize

# Ceiling on candidates handed to the model — a long list invites a bad pick
# and burns context.
MAX_CANDIDATES = 5

# Exactness tiers. The gap between them is wide enough that no recency bonus
# can promote a substring hit over an exact one.
_EXACT = 300
_PREFIX = 200
_WORD_PREFIX = 150
_SUBSTRING = 100


def _epoch(value) -> float:
    """Sort key for a timestamp that may be a datetime, an ISO string, or absent."""
    if isinstance(value, datetime):
        at = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return at.timestamp()
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return 0.0
    return 0.0


def _match_score(query: str, name: str | None, addresses: list[str]) -> int:
    """How well a candidate matches, or 0 for no match at all."""
    q = query.strip().lower()
    if not q:
        return 0

    haystacks = [h for h in [(name or "").strip().lower(), *addresses] if h]
    best = 0
    for haystack in haystacks:
        if haystack == q:
            best = max(best, _EXACT)
        elif haystack.startswith(q):
            best = max(best, _PREFIX)
        # "ariyaman" should match "Dev Ariyaman", not just names starting with it.
        elif any(word.startswith(q) for word in re.split(r"[\s._@-]+", haystack)):
            best = max(best, _WORD_PREFIX)
        elif q in haystack:
            best = max(best, _SUBSTRING)
    return best


async def _crm_candidates(db, tenant_id: str, query: str) -> list[dict]:
    """CRM contacts matching by name or by any identity.

    `name_lower` and the identity index carry the exact-match cases; the regex
    leg is the fallback for partial names and stays capped.
    """
    q = query.strip().lower()
    address_channel = channel_for_address(query)

    clauses: list[dict] = [
        {"profile.name_lower": q},
        {"profile.name_lower": {"$regex": f"^{re.escape(q)}", "$options": "i"}},
        {"profile.name": {"$regex": re.escape(query), "$options": "i"}},
        {"identities.external_id": {"$regex": re.escape(query), "$options": "i"}},
    ]
    if address_channel:
        # An address query can hit the unique index directly.
        clauses.insert(
            0,
            {
                "identities": {
                    "$elemMatch": {
                        "channel": address_channel,
                        "external_id": normalize(address_channel, query),
                    }
                }
            },
        )

    docs = await db.contacts.find(
        {"tenant_id": tenant_id, "$or": clauses}
    ).to_list(length=25)

    out = []
    for doc in docs:
        identities = doc.get("identities", [])
        addresses = [i["external_id"] for i in identities]
        score = _match_score(query, (doc.get("profile") or {}).get("name"), addresses)
        if not score:
            continue
        out.append(
            {
                "contact_id": str(doc["_id"]),
                "name": (doc.get("profile") or {}).get("name"),
                "channels": [
                    {"channel": i["channel"], "id": i["external_id"]} for i in identities
                ],
                "qualification_score": (doc.get("lead") or {}).get(
                    "qualification_score", 0
                ),
                "source": "crm",
                "_score": score,
                "_recency": _epoch(doc.get("last_contacted_at")),
            }
        )
    return out


def _directory_candidates(entries: list[dict], query: str) -> list[dict]:
    """Mailbox correspondents matching the query."""
    out = []
    for entry in entries:
        email = str(entry.get("email", ""))
        if not email:
            continue
        score = _match_score(query, entry.get("name"), [email])
        if not score:
            continue
        out.append(
            {
                "contact_id": None,
                "name": entry.get("name") or email.split("@")[0],
                "channels": [{"channel": "email", "id": email}],
                "qualification_score": 0,
                "source": "gmail",
                "_score": score,
                "_recency": _epoch(entry.get("lastSeen")),
                "_sent": int(entry.get("sent") or 0),
            }
        )
    return out


async def find_recipients(
    db, tenant_id: str, user_id: str | None, query: str
) -> list[dict]:
    """Ranked candidates for a name or address, best first.

    Order is exactness, then most recent contact — the pick-list a salesperson
    is shown reads newest-first, which is how they think about "which Ariyaman".
    A CRM contact wins ties against a bare mailbox address because it carries
    conversation history the agent can use.
    """
    if not query.strip():
        return []

    crm = await _crm_candidates(db, tenant_id, query)
    gmail = (
        _directory_candidates(await directory.entries_for(tenant_id, user_id), query)
        if user_id
        else []
    )

    # Dedupe across sources on normalised address; the CRM entry is richer, but
    # inherits the mailbox's recency when the CRM has never recorded contact.
    by_address: dict[str, dict] = {}
    merged: list[dict] = []
    for candidate in [*crm, *gmail]:
        addresses = [
            normalize(c["channel"], c["id"]) for c in candidate["channels"]
        ]
        existing = next((by_address[a] for a in addresses if a in by_address), None)
        if existing:
            existing["_score"] = max(existing["_score"], candidate["_score"])
            existing["_recency"] = max(existing["_recency"], candidate["_recency"])
            continue
        for address in addresses:
            by_address[address] = candidate
        merged.append(candidate)

    merged.sort(
        key=lambda c: (
            c["_score"],
            c["_recency"],
            1 if c["source"] == "crm" else 0,
            c.get("_sent", 0),
        ),
        reverse=True,
    )
    return merged[:MAX_CANDIDATES]


def public_candidate(candidate: dict) -> dict:
    """Strip the internal ranking fields before the model sees it."""
    return {k: v for k, v in candidate.items() if not k.startswith("_")}


async def resolve_destination(
    db, tenant_id: str, user_id: str | None, query: str, channel: str
) -> tuple[str | None, str | None]:
    """Where to send, for a query that may be an address or a name.

    Returns `(external_id, display_name)`. A raw address resolves to itself —
    the whole point: nobody needs to exist in the CRM to be emailed.
    """
    if channel_for_address(query) == channel:
        return normalize(channel, query), None

    candidates = await find_recipients(db, tenant_id, user_id, query)
    for candidate in candidates:
        for entry in candidate["channels"]:
            if entry["channel"] == channel:
                return normalize(channel, entry["id"]), candidate.get("name")
    return None, None
