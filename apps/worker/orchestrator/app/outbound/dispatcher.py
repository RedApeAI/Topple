"""Outbound dispatch.

The real channel adapters (WhatsApp / email / voice / Instagram) live in
another service. This POSTs the OutboundMessage payload to
`OUTBOUND_WEBHOOK_URL` — in this deployment that is the BFF, which owns the
users' OAuth grants and turns an `email` dispatch into a Gmail send on behalf
of `user_id`.

Delivery failures are logged, never raised — a webhook outage must not fail
the turn (the message doc is already persisted as `sent`)."""
from __future__ import annotations

import logging

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


async def dispatch(
    *,
    tenant_id: str,
    channel: str,
    to: str,
    conversation_id: str,
    messages: list[str],
    user_id: str | None = None,
    subject: str | None = None,
) -> None:
    payload = {
        "tenant_id": tenant_id,
        # Whose grant to send under. Without it the BFF has no mailbox to act
        # on and will reject an email dispatch.
        "user_id": user_id,
        "channel": channel,
        "to": to,
        "conversation_id": conversation_id,
        "messages": messages,
        "subject": subject,
    }
    logger.info(
        "OUTBOUND %s/%s user=%s -> %s: %d message(s)",
        tenant_id,
        channel,
        user_id,
        to,
        len(messages),
    )
    if not settings.outbound_webhook_url:
        return

    headers = {}
    if settings.outbound_webhook_secret:
        headers["X-Outbound-Secret"] = settings.outbound_webhook_secret

    try:
        # Sending real mail is slower than the old log-only stub; 5s was enough
        # for a no-op webhook but not for a Gmail round trip.
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                settings.outbound_webhook_url, json=payload, headers=headers
            )
            resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        logger.error("outbound webhook delivery failed: %s", exc)
