"""`resolve_identity` — who is this, and which conversation are we in.

Extracted from two real callers rather than guessed at: the turn graph resolves
a contact and conversation at its front, and the Operator's `send_message` does
the same thing before it can write an outbound message. They had drifted — the
Operator's copy defaulted the stage differently and stamped `source: "agent"` —
so the differences are parameters here rather than two implementations.

Identity normalisation runs on both sides of every comparison. That is not a
detail: the unique index over `(tenant, channel, external_id)` is byte-exact,
so `Ada@Example.com` and `ada@example.com` are two different people to Mongo
unless both the write and the lookup are canonicalised.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from ..engine import contacts as contacts_engine

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class ResolvedIdentity:
    contact: dict
    conversation: dict
    #: True when this call created the conversation, which the turn graph needs
    #: in order to know it is at the playbook's initial stage.
    conversation_created: bool


async def resolve_identity(
    db,
    *,
    tenant_id: str,
    channel: str,
    external_id: str,
    initial_stage: str,
    mode: str,
    user_id: str | None = None,
    name: str | None = None,
    source: str = "pipeline",
) -> ResolvedIdentity:
    """Find or create the contact, then find or create their conversation.

    `source` records how the contact came to exist — `"pipeline"` for an
    inbound turn, `"agent"` when the Operator messaged someone new. It is only
    used at creation; an existing contact is never re-stamped.
    """
    contact = await contacts_engine.resolve_or_create(
        db, tenant_id, channel, external_id, name=name, user_id=user_id, source=source
    )

    query = {"tenant_id": tenant_id, "contact_id": contact["_id"], "channel": channel}
    existing = await db.conversations.find_one({**query, "status": {"$ne": "closed"}})
    if existing:
        return ResolvedIdentity(contact, existing, conversation_created=False)

    document: dict[str, Any] = {
        **query,
        "user_id": user_id,
        "stage": initial_stage,
        "previous_stage": None,
        "return_stage": None,
        "mode": mode,
        "status": "active",
        "low_confidence_strikes": 0,
        "last_message_at": None,
        "created_at": _now(),
    }
    result = await db.conversations.insert_one(document)
    document["_id"] = result.inserted_id
    return ResolvedIdentity(contact, document, conversation_created=True)
