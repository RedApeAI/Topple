"""Dragonfly pub/sub — the event bus of the agentic architecture.

Every state change the orchestrator makes (messages, conversations, drafts,
contacts, operator activity) is published to a per-tenant channel; the SSE
endpoint fans events out to dashboards, and future consumers (channel
gateways, automations) subscribe to the same bus.

Dragonfly speaks the Redis protocol, so this uses redis-py's asyncio client —
locally it works identically against a Dragonfly container or a plain Redis;
in production it points at the Dragonfly instance on EC2.

The bus is deliberately best-effort: a publish failure logs a warning and the
request continues — the UI falls back to polling when the bus is down, and
losing an event must never lose a customer message.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import AsyncIterator

import redis.asyncio as redis

from ..config import settings

logger = logging.getLogger(__name__)

_client: redis.Redis | None = None
_warned_down = False

CHANNEL_PREFIX = "redape:events"

# A publish/ping must never hang a request, but the client carries NO socket
# read timeout — a pub/sub subscriber blocks waiting for events, and any read
# timeout would kill an idle stream. So short operations are bounded here with
# wait_for instead.
OP_TIMEOUT_SECONDS = 5.0

# How long a subscriber waits for the next event before emitting a heartbeat —
# keeps idle SSE connections alive and lets us notice client disconnects.
HEARTBEAT_SECONDS = 15.0


def channel_for(tenant_id: str) -> str:
    return f"{CHANNEL_PREFIX}:{tenant_id}"


def get_client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(
            settings.dragonfly_url,
            decode_responses=True,
            socket_connect_timeout=2,
        )
    return _client


def set_client(client) -> None:
    """Inject a (redis-compatible) client. Used by tests."""
    global _client
    _client = client


async def publish(tenant_id: str, event_type: str, data: dict) -> bool:
    """Fire one event onto the tenant's channel. Never raises."""
    global _warned_down
    event = {
        "type": event_type,
        "tenant_id": tenant_id,
        "ts": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }
    try:
        await asyncio.wait_for(
            get_client().publish(channel_for(tenant_id), json.dumps(event, default=str)),
            timeout=OP_TIMEOUT_SECONDS,
        )
        _warned_down = False
        return True
    except Exception as exc:  # noqa: BLE001 — the bus must never break a request
        if not _warned_down:
            logger.warning("event bus unreachable (is Dragonfly up?): %s", exc)
            _warned_down = True
        return False


async def subscribe(tenant_id: str) -> AsyncIterator[dict | None]:
    """Yield events from the tenant's channel until the consumer disconnects.

    Yields `None` as a heartbeat every HEARTBEAT_SECONDS of silence so the SSE
    layer can keep the connection warm and detect a gone client. Polls with
    `get_message` rather than the blocking `listen()` so an idle subscriber
    never sits on a read that a socket timeout could kill."""
    pubsub = get_client().pubsub()
    await pubsub.subscribe(channel_for(tenant_id))
    try:
        while True:
            try:
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=HEARTBEAT_SECONDS
                )
            except (redis.RedisError, asyncio.TimeoutError):
                yield None  # bus hiccup — heartbeat and let get_message retry
                continue
            if message is None:
                yield None  # idle — heartbeat
                continue
            try:
                yield json.loads(message["data"])
            except (json.JSONDecodeError, TypeError):
                logger.warning("dropping malformed event: %r", message["data"])
    finally:
        await pubsub.aclose()


async def ping() -> bool:
    try:
        return bool(await asyncio.wait_for(get_client().ping(), timeout=OP_TIMEOUT_SECONDS))
    except Exception:  # noqa: BLE001
        return False
