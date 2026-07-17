"""Guardrails: pre-checks that can trigger handoff, and post-checks on the
generated reply (numeric grounding + forbidden phrases).

Numeric grounding: every currency amount, percentage, and year in the reply
must appear in the FACTS block or in the conversation history (including the
buyer's own messages). Numbers are canonicalised (commas stripped, k/M —
and legacy lakh/crore — multipliers expanded) before comparison, so
"AED 1.35M" in FACTS grounds "1350000" in a reply and vice versa.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from ..playbooks.loader import GuardrailsConfig, Playbook
from ..schemas.envelope import Handoff
from ..schemas.llm import ExtractionResult


@dataclass
class Check:
    name: str
    passed: bool
    detail: str | None = None

    def as_doc(self) -> dict:
        return {"name": self.name, "passed": self.passed, "detail": self.detail}


# --------------------------------------------------------------------------- #
# Pre-checks (before generation) — can trigger handoff
# --------------------------------------------------------------------------- #
def pre_check(
    playbook: Playbook, extraction: ExtractionResult, strikes_in: int
) -> tuple[list[Check], Handoff, int]:
    """Returns (checks, handoff, low_confidence_strikes_out)."""
    g: GuardrailsConfig = playbook.guardrails
    checks: list[Check] = []
    handoff = Handoff(triggered=False, reason=None)

    if extraction.intent in g.handoff_intents:
        handoff = Handoff(triggered=True, reason=f"handoff_intent:{extraction.intent}")
        checks.append(Check("handoff_intent", False, f"intent={extraction.intent}"))
    else:
        checks.append(Check("handoff_intent", True))

    if extraction.sentiment in g.handoff_on_sentiment:
        if not handoff.triggered:
            handoff = Handoff(triggered=True, reason=f"sentiment:{extraction.sentiment}")
        checks.append(Check("handoff_sentiment", False, f"sentiment={extraction.sentiment}"))
    else:
        checks.append(Check("handoff_sentiment", True))

    # low-confidence strikes are consecutive, tracked on the conversation doc
    if extraction.confidence < g.low_confidence_threshold:
        strikes_out = strikes_in + 1
        detail = f"confidence={extraction.confidence:.2f} strike {strikes_out}/{g.low_confidence_strikes}"
        if strikes_out >= g.low_confidence_strikes:
            if not handoff.triggered:
                handoff = Handoff(triggered=True, reason="low_confidence_strikes")
            checks.append(Check("low_confidence", False, detail))
        else:
            checks.append(Check("low_confidence", True, detail))
    else:
        strikes_out = 0
        checks.append(Check("low_confidence", True))

    return checks, handoff, strikes_out


# --------------------------------------------------------------------------- #
# Numeric grounding
# --------------------------------------------------------------------------- #
_MULTIPLIERS = {
    "k": 1_000,
    "m": 1_000_000,
    "mn": 1_000_000,
    "million": 1_000_000,
    "l": 100_000,
    "lakh": 100_000,
    "lakhs": 100_000,
    "lac": 100_000,
    "lacs": 100_000,
    "cr": 10_000_000,
    "crore": 10_000_000,
    "crores": 10_000_000,
}

# Currency-prefixed amounts may take any multiplier suffix ("AED 1.2 M");
# bare numbers only a GLUED k/m ("950k", "1.2M") or the full word "million" —
# a spaced bare "m" is metres ("25 m lap pool"), not millions.
_MONEY_RE = re.compile(
    r"(?:aed|dhs?\.?|د\.إ|₹|rs\.?\s?|inr\s?)\s*([\d][\d,]*(?:\.\d+)?)\s*(million|mn|m|k|lakhs?|lacs?|crores?|cr|l)?\b"
    r"|([\d][\d,]*(?:\.\d+)?)\s*(million|mn|lakhs?|lacs?|crores?|cr)\b"
    r"|([\d][\d,]*(?:\.\d+)?)([km])\b",
    re.IGNORECASE,
)
_PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
_YEAR_RE = re.compile(r"\b((?:19|20)\d{2})\b")
# comma-grouped (Indian or western) or 4+ digit bare numbers
_BIGNUM_RE = re.compile(r"\b\d{1,3}(?:,\d{2,3})+(?:\.\d+)?\b|\b\d{4,}\b")


def _canon(num: str) -> str:
    num = num.replace(",", "")
    if "." in num:
        num = num.rstrip("0").rstrip(".")
    return num


def numeric_tokens(text: str) -> set[str]:
    """Canonical number tokens appearing in `text`."""
    tokens: set[str] = set()
    for m in _MONEY_RE.finditer(text):
        raw = m.group(1) or m.group(3) or m.group(5)
        suffix = (m.group(2) or m.group(4) or m.group(6) or "").lower()
        base = _canon(raw)
        if suffix in _MULTIPLIERS:
            # "AED 2.15M" means 2150000 — the bare "2.15" is not a fact itself
            tokens.add(_canon(str(float(base) * _MULTIPLIERS[suffix])))
        else:
            tokens.add(base)
    for m in _PERCENT_RE.finditer(text):
        tokens.add(_canon(m.group(1)) + "%")
    for m in _YEAR_RE.finditer(text):
        tokens.add(m.group(1))
    for m in _BIGNUM_RE.finditer(text):
        tokens.add(_canon(m.group(0)))
    return tokens


def grounding_violations(reply_text: str, allowed_corpus: str) -> list[str]:
    """Number tokens in the reply that appear nowhere in the allowed corpus."""
    return sorted(numeric_tokens(reply_text) - numeric_tokens(allowed_corpus))


# --------------------------------------------------------------------------- #
# Post-checks (after generation)
# --------------------------------------------------------------------------- #
def post_check(
    playbook: Playbook, reply_messages: list[str], facts_text: str, history_text: str
) -> tuple[list[Check], list[str]]:
    """Returns (checks, violation_feedback) — feedback lines are fed back to
    the LLM on the single regeneration attempt."""
    g = playbook.guardrails
    reply_text = "\n".join(reply_messages)
    checks: list[Check] = []
    feedback: list[str] = []

    if g.numeric_grounding:
        bad = grounding_violations(reply_text, facts_text + "\n" + history_text)
        if bad:
            detail = f"ungrounded numbers: {', '.join(bad)}"
            checks.append(Check("numeric_grounding", False, detail))
            feedback.append(
                f"- These numbers do not exist in FACTS or the conversation: {', '.join(bad)}. "
                "Remove them or replace with numbers from FACTS."
            )
        else:
            checks.append(Check("numeric_grounding", True))

    lowered = reply_text.lower()
    hits = [p for p in g.forbidden_phrases if p.lower() in lowered]
    if hits:
        detail = f"forbidden phrases: {', '.join(hits)}"
        checks.append(Check("forbidden_phrases", False, detail))
        feedback.append(f"- Forbidden phrasing used: {', '.join(hits)}. Never say this.")
    else:
        checks.append(Check("forbidden_phrases", True))

    return checks, feedback
