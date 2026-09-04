"""What a run is reduced to before comparison.

The field list is fixed and deliberately narrow: the decisions a turn made,
and nothing that varies legitimately between two runs of the same input. Two
executions of the same envelope will never agree on `ts_start`, `latency_ms` or
`prompt_tokens`, so including them would drown every real difference in noise.

`system_prompt_hash` earns its place by proxy — it is the only compared field
that reflects *prompt construction*, so a change in how the system prompt is
assembled surfaces here rather than silently altering generations.
"""
from __future__ import annotations

from typing import Any

#: Compared, in report order. Dotted names are cosmetic — the observation is a
#: flat dict keyed by exactly these strings.
COMPARED_FIELDS: tuple[str, ...] = (
    "stage_in",
    "stage_out",
    "transition_reason",
    "qualification_score",
    "extraction.intent",
    "extraction.entities",
    "extraction.sentiment",
    "generation.system_prompt_hash",
    "generation.output_messages",
    "guardrails.checks",
    "guardrails.regenerated",
    "guardrails.final_action",
    "handoff.triggered",
    "handoff.reason",
    "retrieval.hits",  # [{doc_id, used}] only — score and text excluded
    "message_status",
    "dispatched",
    # One field beyond the specified list, because without it a run that raises
    # and a run that succeeds can compare equal on everything else when the
    # turn document is sparse either way. A divergence here is the single most
    # serious kind, so it is not something to leave unobserved.
    "outcome",
)

#: Excluded on purpose, recorded here so the omission is a decision rather than
#: an oversight.
EXCLUDED_FIELDS: tuple[str, ...] = (
    "ts_start", "ts_end", "turn_id", "conversation_id", "contact_id",
    "totals.latency_ms", "totals.prompt_tokens", "totals.completion_tokens",
    "extraction.latency_ms", "extraction.prompt_tokens",
    "extraction.completion_tokens", "extraction.retries",
    "generation.latency_ms", "generation.prompt_tokens",
    "generation.completion_tokens", "generation.retries",
    "retrieval.latency_ms", "retrieval.hits[].score",
    "extraction.confidence",  # float; drives strikes, and strikes show up in
                              # guardrails.checks detail, which *is* compared
)


def observe(
    turn: dict | None,
    messages: list[dict],
    *,
    dispatched: bool,
    outcome: str,
) -> dict[str, Any]:
    """Reduce one turn to its comparable form."""
    turn = turn or {}
    state = turn.get("state") or {}
    extraction = turn.get("extraction") or {}
    generation = turn.get("generation") or {}
    guardrails = turn.get("guardrails") or {}
    handoff = turn.get("handoff") or {}
    retrieval = turn.get("retrieval") or {}

    return {
        "stage_in": state.get("stage_in"),
        "stage_out": state.get("stage_out"),
        "transition_reason": state.get("transition_reason"),
        "qualification_score": state.get("qualification_score"),
        "extraction.intent": extraction.get("intent"),
        "extraction.entities": extraction.get("entities"),
        "extraction.sentiment": extraction.get("sentiment"),
        "generation.system_prompt_hash": generation.get("system_prompt_hash"),
        "generation.output_messages": generation.get("output_messages"),
        "guardrails.checks": guardrails.get("checks"),
        "guardrails.regenerated": guardrails.get("regenerated"),
        "guardrails.final_action": guardrails.get("final_action"),
        "handoff.triggered": handoff.get("triggered"),
        "handoff.reason": handoff.get("reason"),
        "retrieval.hits": [
            {"doc_id": hit.get("doc_id"), "used": hit.get("used")}
            for hit in (retrieval.get("hits") or [])
        ],
        "message_status": [
            {"direction": m.get("direction"), "status": m.get("status")}
            for m in messages
        ],
        "dispatched": dispatched,
        "outcome": outcome,
    }
