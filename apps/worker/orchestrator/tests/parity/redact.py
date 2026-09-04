"""Deterministic redaction of tenant-identifying content.

Fixtures are checked into the repository, so anything recorded from real
traffic has to be scrubbed. Two constraints shape this:

1. **It must be deterministic and consistent across a recording.** The same
   phone number appearing in the envelope, in the extraction prompt and in the
   generated reply has to map to the same pseudonym, or the replayed turn stops
   being coherent.
2. **It must not change what the pipeline does.** That rules out touching
   numbers: the numeric-grounding guardrail compares every currency amount,
   percentage and year in the reply against the FACTS block and the history, so
   rewriting "AED 1,350,000" would silently flip a guardrail. Phone numbers are
   the exception — they are replaced with equal-length digit strings so
   `normalize_phone` produces the same shape.

What is *not* attempted: general-purpose PII detection in free text. Names in
buyer messages are not found automatically. Pass them via `extra_terms` when
recording from real traffic.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

_EMAIL_RE = re.compile(r"\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b")
# Deliberately narrow: a leading + and 8-15 digits, optionally spaced/bracketed.
# A looser pattern would eat prices and years.
_PHONE_RE = re.compile(r"\+\d[\d\s()\-.]{7,17}\d")
#: RFC 2606 reserves `.invalid`, so a pseudonym can never reach a real inbox.
_EMAIL_DOMAIN = "@example.invalid"


def _token(kind: str, value: str, salt: str) -> str:
    digest = hashlib.sha256(f"{salt}:{kind}:{value}".encode()).hexdigest()
    return digest[:10]


@dataclass
class Redactor:
    """Stable pseudonyms for one recording session."""

    salt: str = "plucia-parity"
    #: Literal strings to scrub wherever they appear (names, company names).
    extra_terms: list[str] = field(default_factory=list)
    _map: dict[str, str] = field(default_factory=dict)
    _replacements: set[str] = field(default_factory=set)

    # ------------------------------------------------------------------ #
    def _remember(self, original: str, replacement: str) -> str:
        self._map[original] = replacement
        self._replacements.add(replacement)
        return replacement

    def tenant(self, value: str | None) -> str | None:
        if not value:
            return value
        if value in self._map:
            return self._map[value]
        return self._remember(value, f"tenant_{_token('tenant', value, self.salt)}")

    def actor(self, kind: str, value: str | None) -> str | None:
        """`user_id` / `session_id` — opaque either way, but not ours to keep."""
        if not value:
            return value
        if value in self._map:
            return self._map[value]
        return self._remember(value, f"{kind}_{_token(kind, value, self.salt)}")

    def _already_redacted(self, value: str) -> bool:
        """Scrubbing must be idempotent.

        A generated address still matches the email and phone patterns, so
        re-scrubbing already-clean text would map pseudonyms to fresh
        pseudonyms — and the recorded Qdrant query would stop matching the
        query the replayed envelope produces.
        """
        return value in self._replacements or value.endswith(_EMAIL_DOMAIN)

    def email(self, value: str) -> str:
        if self._already_redacted(value):
            return value
        if value in self._map:
            return self._map[value]
        return self._remember(
            value, f"buyer-{_token('email', value.lower(), self.salt)[:8]}{_EMAIL_DOMAIN}"
        )

    def phone(self, value: str) -> str:
        """Same digit count, so identity normalisation behaves identically."""
        if self._already_redacted(value):
            return value
        if value in self._map:
            return self._map[value]
        digits = re.sub(r"\D", "", value)
        stream = hashlib.sha256(f"{self.salt}:phone:{digits}".encode()).hexdigest()
        replacement = "+" + "".join(
            str(int(stream[i % len(stream)], 16) % 10) for i in range(len(digits))
        )
        return self._remember(value, replacement)

    def address(self, channel: str, value: str) -> str:
        """An `external_contact_id`, redacted per the channel's shape."""
        if channel == "email" or _EMAIL_RE.fullmatch(value):
            return self.email(value)
        if re.fullmatch(r"\+?[\d\s()\-.]+", value.strip()):
            return self.phone(value)
        if self._already_redacted(value):
            return value
        if value in self._map:
            return self._map[value]
        return self._remember(value, f"handle_{_token('handle', value, self.salt)[:8]}")

    # ------------------------------------------------------------------ #
    def scrub(self, text: str) -> str:
        """Apply every mapping learned so far, then catch stragglers.

        Learned mappings run first so a value already pseudonymised in the
        envelope keeps the same pseudonym when it reappears inside a prompt.
        """
        if not text:
            return text
        for term in sorted(self.extra_terms, key=len, reverse=True):
            if term:
                text = re.sub(re.escape(term), "[redacted]", text, flags=re.IGNORECASE)
        for original, replacement in sorted(
            self._map.items(), key=lambda kv: len(kv[0]), reverse=True
        ):
            text = text.replace(original, replacement)
        text = _EMAIL_RE.sub(lambda m: self.email(m.group(0)), text)
        text = _PHONE_RE.sub(lambda m: self.phone(m.group(0)), text)
        return text

    def scrub_messages(self, messages: list[dict]) -> list[dict]:
        return [
            {**message, "content": self.scrub(str(message.get("content", "")))}
            for message in messages
        ]

    def envelope(self, envelope: dict) -> dict:
        """Redact an `OrchestratorInput` dict in place-safe fashion.

        Order matters: identity fields are mapped first so `scrub` knows about
        them by the time it reaches the free-text message body.
        """
        out = {**envelope}
        out["tenant_id"] = self.tenant(envelope.get("tenant_id"))
        if envelope.get("user_id"):
            out["user_id"] = self.actor("user", envelope["user_id"])
        if envelope.get("session_id"):
            out["session_id"] = self.actor("session", envelope["session_id"])

        message = {**envelope["message"]}
        message["external_contact_id"] = self.address(
            envelope["channel"], message["external_contact_id"]
        )
        message["text"] = self.scrub(message.get("text", ""))
        out["message"] = message
        return out
