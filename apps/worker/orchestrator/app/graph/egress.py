"""The one path to a buyer's inbox.

Both planes send outward-facing messages, and until now only one of them
checked anything. The turn pipeline ran numeric grounding, forbidden phrases,
sanitisation and the mode gate; the Operator's `send_message` wrote a message
document and called the dispatcher directly. Two routes out, one safety story —
so a forbidden phrase the turn pipeline would have caught went straight to the
buyer if the salesperson asked the agent to send it.

This module is that shared exit. The callers legitimately differ, so the
differences are a **policy object** rather than branches:

| Check                      | Turn graph | Operator |
|----------------------------|-----------|----------|
| Numeric grounding          | yes       | no — nothing retrieved to ground against |
| Forbidden phrases          | yes       | yes      |
| Output sanitisation        | yes       | yes      |
| Mode gate (draft vs send)  | yes       | yes      |
| Stage transition effects   | yes       | no       |

**Rule for the future — please keep this true.** If a caller needs a *check*
the others don't, it is a field on `EgressPolicy`. If it needs different
*sequencing*, it is a different subgraph. The moment this file grows an
`if caller == ...` the abstraction has stopped paying for itself.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from ..engine import guardrails as guardrails_engine
from ..operator.sanitize import sanitize_customer_text
from ..playbooks.loader import Playbook

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EgressPolicy:
    """What this caller wants checked on the way out."""

    name: str
    #: Every number in the reply must appear in FACTS or the conversation.
    #: Off for the Operator: it retrieves nothing, so there is no corpus to
    #: ground against and every figure would fail.
    numeric_grounding: bool
    #: Playbook forbidden phrases. On for everyone — this is the check the
    #: Operator was missing.
    forbidden_phrases: bool
    #: Strip ids, JSON and tool names from customer-facing text.
    sanitise: bool
    #: `copilot` drafts, `autopilot` sends. On for everyone.
    mode_gate: bool
    #: Only the turn graph advances the funnel.
    stage_effects: bool


TURN_EGRESS = EgressPolicy(
    name="turn",
    numeric_grounding=True,
    forbidden_phrases=True,
    sanitise=True,
    mode_gate=True,
    stage_effects=True,
)

OPERATOR_EGRESS = EgressPolicy(
    name="operator",
    numeric_grounding=False,
    forbidden_phrases=True,
    sanitise=True,
    mode_gate=True,
    stage_effects=False,
)


@dataclass
class EgressResult:
    """What the checks decided."""

    text: str | None
    checks: list = field(default_factory=list)
    violations: list[str] = field(default_factory=list)
    #: A violation forces a draft regardless of mode — the same invariant the
    #: turn pipeline has always had for a post-check that survives remediation.
    forced_draft: bool = False

    @property
    def blocked(self) -> bool:
        """Nothing usable survived. The send fails rather than leaking."""
        return not self.text


def check(
    text: str,
    *,
    policy: EgressPolicy,
    playbook: Playbook | None = None,
    facts_text: str = "",
    history_text: str = "",
) -> EgressResult:
    """Run one caller's checks over one outbound message.

    Deliberately pure: no I/O, no state. The callers persist and dispatch
    differently enough that sharing *those* would be forcing it — what has to
    be shared is the verdict.
    """
    checks: list = []
    violations: list[str] = []
    working = text or ""

    if policy.sanitise:
        working = sanitize_customer_text(working) or ""
        if not working:
            return EgressResult(text=None, checks=checks, violations=["empty_after_sanitise"])

    if playbook is not None and (policy.numeric_grounding or policy.forbidden_phrases):
        guard = playbook.guardrails
        if policy.numeric_grounding and guard.numeric_grounding:
            bad = guardrails_engine.grounding_violations(
                working, f"{facts_text}\n{history_text}"
            )
            if bad:
                detail = f"ungrounded numbers: {', '.join(bad)}"
                checks.append(guardrails_engine.Check("numeric_grounding", False, detail))
                violations.append(detail)
            else:
                checks.append(guardrails_engine.Check("numeric_grounding", True))

        if policy.forbidden_phrases:
            lowered = working.lower()
            hits = [p for p in guard.forbidden_phrases if p.lower() in lowered]
            if hits:
                detail = f"forbidden phrases: {', '.join(hits)}"
                checks.append(guardrails_engine.Check("forbidden_phrases", False, detail))
                violations.append(detail)
            else:
                checks.append(guardrails_engine.Check("forbidden_phrases", True))

    return EgressResult(
        text=working,
        checks=checks,
        violations=violations,
        forced_draft=bool(violations),
    )


def decide_status(mode: str, *, policy: EgressPolicy, forced_draft: bool) -> str:
    """`draft` or `sent`. The one place either plane reads `mode`."""
    if not policy.mode_gate:
        return "sent"
    return "draft" if (mode == "copilot" or forced_draft) else "sent"


# --------------------------------------------------------------------------- #
# The copilot interrupt (6c)
# --------------------------------------------------------------------------- #
@dataclass
class Approval:
    """A human's answer to a copilot draft."""

    approved: bool
    #: The salesperson's edit, when they changed the text before approving.
    edited_text: str | None = None

    @classmethod
    def parse(cls, resumed: object) -> "Approval":
        """Tolerant of what `Command(resume=...)` carried.

        Callers resume with a dict from an HTTP handler, so this normalises
        rather than trusting the shape.
        """
        if isinstance(resumed, bool):
            return cls(approved=resumed)
        if isinstance(resumed, dict):
            edited = resumed.get("text") or resumed.get("edited_text")
            return cls(
                approved=bool(resumed.get("approved", True)),
                edited_text=str(edited) if edited else None,
            )
        return cls(approved=bool(resumed))


def request_approval(payload: dict) -> Approval:
    """Pause the graph until a human decides.

    LangGraph's `interrupt` checkpoints here and raises; the run resumes from
    this exact point when the caller invokes with `Command(resume=...)`. That
    is why the Operator graph is checkpointed on `thread_id`.

    **Only the Operator plane uses this.** The turn graph deliberately has no
    checkpointer — `turns.request_id` uniqueness already owns turn identity,
    and adding a checkpoint namespace beside it is the second locking scheme
    CLAUDE.md decision 4 rules out. So the turn plane keeps draft-then-approve
    through `approve_draft`, and this is not the single unified mechanism 6c
    envisaged. Unifying it means giving the turn graph a checkpointer, which is
    a decision about turn identity, not about interrupts.
    """
    from langgraph.types import interrupt

    return Approval.parse(interrupt(payload))


def approval_trace(model_text: str, approval: Approval) -> dict:
    """What the human did to what the model wrote.

    Both halves are recorded deliberately: an edit is a labelled correction of
    a specific generation, which is the most valuable training signal this
    product produces, and it is worthless if only the final text survives.
    """
    return {
        "model_text": model_text,
        "approved": approval.approved,
        "edited": bool(approval.edited_text and approval.edited_text != model_text),
        "final_text": approval.edited_text or model_text,
    }
