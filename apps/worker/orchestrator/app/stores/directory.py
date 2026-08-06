"""The user's correspondent directory, cached in Dragonfly.

The CRM only knows imported leads. The user's mailbox knows everyone they have
actually corresponded with, which is a far better answer to "who is Ariyaman?" —
so the BFF harvests that directory from Gmail and this module caches it.

The BFF owns the OAuth grant and this service owns Dragonfly, so the traffic
goes orchestrator → BFF (the same direction the outbound webhook already runs,
authenticated with the same shared secret). Nothing here reaches into Gmail
directly.

Like the event bus, this cache is best-effort infra: every Redis failure falls
through to a live fetch rather than failing the command that needed it. A slow
answer beats a broken one.
"""
from __future__ import annotations

import asyncio
import json
import logging

import httpx

from ..config import settings
from . import events

logger = logging.getLogger(__name__)

KEY_PREFIX = "plucia:directory"
TTL_SECONDS = 24 * 60 * 60
OP_TIMEOUT_SECONDS = 5.0
FETCH_TIMEOUT_SECONDS = 120.0  # a cold harvest is hundreds of Gmail round trips


def key_for(tenant_id: str, user_id: str) -> str:
    return f"{KEY_PREFIX}:{tenant_id}:{user_id}"


async def _fetch_from_bff(user_id: str, limit: int | None = None) -> list[dict]:
    """Ask the BFF to harvest the mailbox. Returns [] when it isn't configured."""
    if not settings.bff_base_url:
        logger.warning("BFF_BASE_URL not configured — directory lookups disabled")
        return []

    payload: dict = {"user_id": user_id}
    if limit:
        payload["limit"] = limit
    headers = {}
    if settings.outbound_webhook_secret:
        headers["X-Outbound-Secret"] = settings.outbound_webhook_secret

    url = f"{settings.bff_base_url.rstrip('/')}/api/v1/mail/directory"
    async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_SECONDS) as client:
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        body = response.json()
    return (body.get("data") or {}).get("correspondents") or []


async def _read_cache(tenant_id: str, user_id: str) -> list[dict] | None:
    try:
        raw = await asyncio.wait_for(
            events.get_client().get(key_for(tenant_id, user_id)),
            timeout=OP_TIMEOUT_SECONDS,
        )
    except Exception as exc:  # noqa: BLE001 — cache miss and cache outage are the same to us
        logger.warning("directory cache unreadable (is Dragonfly up?): %s", exc)
        return None
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        logger.warning("dropping malformed directory cache entry")
        return None


async def _write_cache(tenant_id: str, user_id: str, entries: list[dict]) -> bool:
    try:
        await asyncio.wait_for(
            events.get_client().set(
                key_for(tenant_id, user_id),
                json.dumps(entries, default=str),
                ex=TTL_SECONDS,
            ),
            timeout=OP_TIMEOUT_SECONDS,
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("directory cache unwritable: %s", exc)
        return False


async def sync(tenant_id: str, user_id: str, limit: int | None = None) -> int:
    """Harvest the mailbox and replace the cached directory. Returns the count."""
    entries = await _fetch_from_bff(user_id, limit)
    if entries:
        await _write_cache(tenant_id, user_id, entries)
    logger.info(
        "directory sync tenant=%s user=%s entries=%d", tenant_id, user_id, len(entries)
    )
    return len(entries)


async def entries_for(tenant_id: str, user_id: str) -> list[dict]:
    """Cached directory, harvesting on a miss so the first command still works."""
    cached = await _read_cache(tenant_id, user_id)
    if cached is not None:
        return cached

    try:
        entries = await _fetch_from_bff(user_id)
    except Exception as exc:  # noqa: BLE001 — the agent falls back to the CRM
        logger.warning("directory fetch failed for user=%s: %s", user_id, exc)
        return []

    if entries:
        await _write_cache(tenant_id, user_id, entries)
    return entries


async def invalidate(tenant_id: str, user_id: str) -> None:
    try:
        await asyncio.wait_for(
            events.get_client().delete(key_for(tenant_id, user_id)),
            timeout=OP_TIMEOUT_SECONDS,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("directory cache invalidate failed: %s", exc)
