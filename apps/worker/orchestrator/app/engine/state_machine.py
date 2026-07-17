"""Generic, playbook-driven state machine.

The engine knows nothing about verticals: it interprets the playbook's
`transitions` list in order and applies the first rule whose `from` matches
the working stage and whose condition holds. Supported conditions:

- `always`
- `fields_known` — every entry in `fields` is known on the lead;
  an entry `"a|b"` is satisfied when ANY of the alternatives is known
- `intent` — the extracted intent equals `intent`
- `handoff_triggered` — the guardrail pre-checks raised a handoff

`return_to_previous: true` on a rule (e.g. the objection detour) records the
stage we came from; on a later turn, if no rule targeting the detour stage
still matches, the conversation pops back to the recorded stage *before*
rules are evaluated — so an intent like `request_visit` still fires from the
restored stage on the same turn.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..playbooks.loader import Playbook, Transition


@dataclass
class StateResult:
    stage_out: str
    transition_reason: str
    return_stage: str | None  # persisted on the conversation doc


def _fields_known(fields: list[str] | None, lead: dict) -> bool:
    from .contacts import NULLISH

    for entry in fields or []:
        alternatives = entry.split("|")
        if not any(lead.get(alt) not in NULLISH for alt in alternatives):
            return False
    return True


def _condition_holds(
    t: Transition, intent: str, lead: dict, handoff_triggered: bool
) -> bool:
    if t.when == "always":
        return True
    if t.when == "fields_known":
        return _fields_known(t.fields, lead)
    if t.when == "intent":
        return intent == t.intent
    if t.when == "handoff_triggered":
        return handoff_triggered
    return False


def next_stage(
    playbook: Playbook,
    stage_in: str,
    intent: str,
    lead: dict,
    handoff_triggered: bool,
    return_stage: str | None = None,
) -> StateResult:
    reasons: list[str] = []
    working = stage_in

    # pop back from a detour stage (e.g. OBJECTION_HANDLING) when nothing
    # keeps us there anymore
    if return_stage and return_stage != stage_in:
        detour_rules = [
            t for t in playbook.transitions if t.return_to_previous and t.to == stage_in
        ]
        if detour_rules and not any(
            _condition_holds(t, intent, lead, handoff_triggered) for t in detour_rules
        ):
            working = return_stage
            return_stage = None
            reasons.append(f"return_to_previous:{working}")

    # a triggered handoff pre-empts everything else, regardless of where the
    # playbook author listed the rule — safety rules must not lose to `always`
    ordered = playbook.transitions
    if handoff_triggered:
        ordered = sorted(ordered, key=lambda t: t.when != "handoff_triggered")

    for t in ordered:
        if t.from_ != "*" and t.from_ != working:
            continue
        if not _condition_holds(t, intent, lead, handoff_triggered):
            continue
        if t.to == working:
            break  # already there; nothing to do
        if t.return_to_previous:
            return_stage = working
        detail = {"always": "always", "handoff_triggered": "handoff"}.get(t.when)
        if t.when == "intent":
            detail = f"intent={t.intent}"
        elif t.when == "fields_known":
            detail = f"fields_known={','.join(t.fields or [])}"
        reasons.append(f"{working}->{t.to} ({detail})")
        working = t.to
        break

    return StateResult(
        stage_out=working,
        transition_reason="; ".join(reasons) if reasons else "no_transition",
        return_stage=return_stage,
    )
