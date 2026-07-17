"""Motor client, collection handles, idempotent index bootstrap.

MongoDB (database `blackbox`) is the single source of truth for all agent data
and audit trails. The client is module-level but injectable (`set_client`) so
tests can swap in mongomock-motor without patching internals.
"""
from __future__ import annotations

import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from ..config import settings

logger = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None
_db_name: str = settings.mongo_db

# raw_events: pass-through storage if the envelope ever carries an inline raw
# payload; for now only referenced via message.raw_ref.
COLLECTIONS = ("raw_events", "contacts", "conversations", "messages", "turns")


def set_client(client, db_name: str | None = None) -> None:
    """Inject a (motor-compatible) client. Used by tests and startup."""
    global _client, _db_name
    _client = client
    if db_name:
        _db_name = db_name


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        # Atlas needs SRV DNS + a TLS handshake + replica-set discovery
        # across remote nodes; 3s (fine for local Docker Mongo) routinely
        # timed out on the very first connection over the real internet.
        _client = AsyncIOMotorClient(settings.mongo_url, serverSelectionTimeoutMS=10000)
    return _client


def get_db() -> AsyncIOMotorDatabase:
    return get_client()[_db_name]


async def init_indexes(db=None) -> None:
    """Create all indexes; safe to run on every startup."""
    db = db if db is not None else get_db()

    # contacts: one doc per person per tenant; identities is the bifurcation
    # surface (same person on several channels).
    await db.contacts.create_index(
        [("tenant_id", 1), ("identities.channel", 1), ("identities.external_id", 1)],
        unique=True,
        name="uniq_tenant_identity",
    )

    await db.conversations.create_index(
        [("tenant_id", 1), ("contact_id", 1), ("channel", 1)],
        name="tenant_contact_channel",
    )

    await db.messages.create_index(
        [("conversation_id", 1), ("created_at", 1)], name="convo_created"
    )

    # turns: request_id uniqueness IS the idempotency mechanism.
    await db.turns.create_index([("request_id", 1)], unique=True, name="uniq_request_id")
    await db.turns.create_index([("tenant_id", 1), ("ts_start", 1)], name="tenant_ts")
    await db.turns.create_index(
        [("tenant_id", 1), ("adapter_id", 1), ("ts_start", 1)], name="tenant_adapter_ts"
    )
    await db.turns.create_index(
        [("conversation_id", 1), ("ts_start", 1)], name="convo_ts"
    )

    logger.info("mongo indexes ensured on database %r", _db_name)


async def ping() -> bool:
    try:
        await get_client().admin.command("ping")
        return True
    except Exception:  # noqa: BLE001
        return False
