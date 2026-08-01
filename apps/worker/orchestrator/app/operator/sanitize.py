"""Guardrails for operator output that reaches a human.

The reasoning *trace* (thoughts + tool calls) is shown deliberately — it is
the transparency layer, and legitimately contains tool names, contact ids,
and JSON observations. But two strings must never leak internals:

- `operator_output` — the report shown to the salesperson.
- the customer-facing message `text` — what the lead actually receives.

Neither may contain a Mongo ObjectId, a JSON blob, or a tool name. These
helpers redact those, and fall back to a clean deterministic summary when
redaction would gut the text.
"""
from __future__ import annotations

import json
import re

# 24-hex-char Mongo ObjectIds (contact_id / conversation_id / message_id).
_OBJECTID = re.compile(r"\b[0-9a-fA-F]{24}\b")
# Non-nested JSON object / array blobs.
_JSON_OBJ = re.compile(r"\{[^{}]*\}")
_JSON_ARR = re.compile(r"\[[^\[\]]*\]")
# A quoted JSON key followed by a colon (`"operator_output":`) — the tell of
# raw protocol debris that leaks when the model emits malformed JSON with no
# opening brace to anchor the object regex (e.g. a dangling
# `…approval.", "operator_output": "…"}`).
_JSON_KEY = re.compile(r'"\s*[A-Za-z_][\w-]*\s*"\s*:')
# The agent's own tool names.
_TOOL_NAMES = re.compile(r"\b(find_contact|get_conversation|send_message)\b", re.IGNORECASE)
# Protocol field names that never occur in natural prose. Deliberately excludes
# "thought" — an ordinary English word; its JSON-key form is caught by _JSON_KEY.
_PROTOCOL_WORDS = re.compile(
    r"\b(operator_output|contact_id|conversation_id|message_id)\b", re.IGNORECASE
)
# Structural braces/brackets left dangling after a blob is partially stripped.
_BRACES = re.compile(r"[{}\[\]]")
_WS = re.compile(r"\s{2,}")

_FORBIDDEN = (_OBJECTID, _JSON_OBJ, _JSON_ARR, _JSON_KEY, _TOOL_NAMES, _PROTOCOL_WORDS, _BRACES)

# Pulls the value of an `operator_output` field out of a raw (possibly
# malformed) completion so a JSON slip degrades to the intended report.
_OPERATOR_OUTPUT_RE = re.compile(r'"operator_output"\s*:\s*"((?:[^"\\]|\\.){0,800})"')


def contains_forbidden(text: str) -> bool:
    return any(p.search(text or "") for p in _FORBIDDEN)


def _redact(text: str) -> str:
    text = _OBJECTID.sub("", text)
    # a couple of passes catches adjacent / just-unwrapped blobs
    for _ in range(2):
        text = _JSON_OBJ.sub("", text)
        text = _JSON_ARR.sub("", text)
    text = _JSON_KEY.sub("", text)
    text = _TOOL_NAMES.sub("", text)
    text = _PROTOCOL_WORDS.sub("", text)
    text = _BRACES.sub("", text)
    text = _WS.sub(" ", text)
    return text.strip(" ,.;:-\n\t\"'")


def salvage_operator_output(raw: str) -> str | None:
    """Best-effort recovery of the intended report from malformed JSON the
    parser couldn't load: pull the `operator_output` string out by hand so a
    parse slip degrades to the clean report instead of dumping the raw object.
    Returns None when there's nothing to recover."""
    match = _OPERATOR_OUTPUT_RE.search(raw or "")
    if not match:
        return None
    try:
        value = json.loads(f'"{match.group(1)}"')  # unescape \n, \" etc.
    except (ValueError, json.JSONDecodeError):
        value = match.group(1)
    return value.strip() or None


def sanitize_operator_output(text: str, fallback: str) -> str:
    """The salesperson's report — redact leaks; if that guts it, use the
    structured fallback so the report is always clean AND coherent."""
    text = (text or "").strip()
    if not text:
        return fallback
    if not contains_forbidden(text):
        return text
    cleaned = _redact(text)
    # redaction removed most of the message → the model was mostly dumping
    # internals; the deterministic summary reads better
    if len(cleaned) < 12 or len(cleaned) < 0.5 * len(text):
        return fallback
    return cleaned


def sanitize_customer_text(text: str) -> str | None:
    """The outgoing customer message — redact leaks; None if nothing usable
    remains (the send is then failed rather than leaking internals)."""
    text = (text or "").strip()
    if not text:
        return None
    cleaned = _redact(text) if contains_forbidden(text) else text
    return cleaned or None
