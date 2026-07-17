"""Outbound dispatch stub.

The real channel adapters (WhatsApp / email / voice / Instagram) live in
another service. This stub logs every dispatch and, when
`OUTBOUND_WEBHOOK_URL` is configured, POSTs the OutboundMessage payload there.
Delivery failures are logged, never raised — a webhook outage must not fail
the turn (the message doc is already persisted as `sent`)."""
from __future__ import annotations

import logging

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


async def dispatch(
    *, tenant_id: str, channel: str, to: str, conversation_id: str, messages: list[str]
) -> None:
    payload = {
        "tenant_id": tenant_id,
        "channel": channel,
        "to": to,
        "conversation_id": conversation_id,
        "messages": messages,
    }
    logger.info(
        "OUTBOUND %s/%s -> %s: %d message(s)", tenant_id, channel, to, len(messages)
    )
    if not settings.outbound_webhook_url:
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(settings.outbound_webhook_url, json=payload)
            resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        logger.error("outbound webhook delivery failed: %s", exc)
