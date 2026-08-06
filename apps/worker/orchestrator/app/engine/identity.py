"""Canonical form for a contact identity.

An identity is a `(channel, external_id)` pair, and `uniq_tenant_identity` is a
byte-exact unique index over it. Without canonicalisation `Ada@Example.com` and
`ada@example.com`, or `+971 50 123 4567` and `+971501234567`, are different
people to Mongo — the index cannot catch the duplicate, and every formatting
variation silently forks a lead.

Normalisation runs on both sides of every comparison: at write time so stored
ids are canonical, and at lookup time so a query written by a human (or an LLM)
matches what was stored.

This is deliberately conservative. It is not a phone-number library: it will not
infer a country code, because guessing one wrongly would merge two genuinely
different people, which is far worse than leaving a duplicate for the existing
`POST /v1/contacts/merge` to resolve.
"""
from __future__ import annotations

import re

# Channels whose external_id is a phone number.
_PHONE_CHANNELS = frozenset({"whatsapp", "voice", "sms"})
# Channels whose external_id is a social handle.
_HANDLE_CHANNELS = frozenset({"instagram", "linkedin", "twitter"})

_NON_DIAL = re.compile(r"[^\d+]")
_EMAIL_SHAPE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(value: str) -> str:
    """Lowercase and trim. The local part is case-sensitive per RFC 5321, but no
    mail provider in practice treats it that way, and treating it as sensitive
    forks far more contacts than it protects."""
    return value.strip().lower()


def normalize_phone(value: str) -> str:
    """Strip everything that isn't a digit or a leading `+`.

    `+971 (50) 123-4567` and `+971501234567` converge. A number with no country
    code is left as its digits — it will not match the same person's
    international form, which is the conservative outcome.
    """
    cleaned = _NON_DIAL.sub("", value.strip())
    if not cleaned:
        return ""
    # A `+` is only meaningful at the front; strip any others the regex kept.
    lead = "+" if cleaned.startswith("+") else ""
    return lead + cleaned.lstrip("+").replace("+", "")


def normalize_handle(value: str) -> str:
    """Lowercase, trim, drop a leading `@` and any profile-URL wrapper."""
    handle = value.strip().lower().lstrip("@")
    # People paste profile URLs as often as handles.
    if "/" in handle:
        handle = handle.rstrip("/").rsplit("/", 1)[-1]
    return handle


def normalize(channel: str, external_id: str) -> str:
    """Canonical `external_id` for a channel. Unknown channels are trimmed only."""
    if external_id is None:
        return ""
    if channel == "email":
        return normalize_email(external_id)
    if channel in _PHONE_CHANNELS:
        return normalize_phone(external_id)
    if channel in _HANDLE_CHANNELS:
        return normalize_handle(external_id)
    return external_id.strip()


def normalize_identity(identity: dict) -> dict:
    """A `{channel, external_id}` pair with its id canonicalised.

    A missing id becomes `""`, never the string "none" — `str(None)` would
    otherwise store a contact reachable at an address spelled "none".
    """
    channel = identity.get("channel", "")
    raw = identity.get("external_id")
    return {
        **identity,
        "channel": channel,
        "external_id": normalize(channel, "" if raw is None else str(raw)),
    }


def looks_like_email(value: str) -> bool:
    return bool(_EMAIL_SHAPE.match(value.strip()))


def looks_like_phone(value: str) -> bool:
    """True for something a human would recognise as a phone number.

    Requires 7+ digits so a street number or a short numeric name doesn't get
    treated as a destination.
    """
    digits = re.sub(r"\D", "", value)
    return len(digits) >= 7 and bool(re.fullmatch(r"[\d\s+()\-.]+", value.strip()))


def channel_for_address(value: str) -> str | None:
    """The channel a raw address belongs to, or None if it isn't an address.

    Used to let a command name a destination directly ("email ada@example.com")
    without a CRM lookup standing in the way.
    """
    if looks_like_email(value):
        return "email"
    if looks_like_phone(value):
        return "whatsapp"
    return None
