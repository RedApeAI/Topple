"""The turn graph's state — which is the turn document.

The document fields below are declared one-for-one with what the pipeline used
to assemble incrementally, so `to_turn_document()` is a *projection* rather
than an assembly step: there is no second place where a turn document gets
built, and no way for the two to drift.

State is strictly a superset of the document, because nodes need things a turn
document has no business carrying — the loaded `Playbook`, the raw contact and
conversation docs, the retrieved chunks. Those are `exclude=True`, so
`model_dump()` drops them and the projection stays honest.
"""
from __future__ import annotations

import operator
from datetime import datetime, timezone
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field

from ..llm.gateway import LLMCallStats
from ..playbooks.loader import Playbook
from ..schemas.envelope import OrchestratorInput, Reply
from .policy import NodeError


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _empty_handoff() -> dict:
    return {"triggered": False, "reason": None}


def _empty_totals() -> dict:
    return {"latency_ms": 0, "prompt_tokens": 0, "completion_tokens": 0}


def _empty_eval() -> dict:
    return {"human_rating": None, "auto_score": None, "labels": []}


class TurnState(BaseModel):
    # `model_id` collides with pydantic's protected `model_` namespace, and
    # arbitrary types are needed for ObjectId / Playbook.
    model_config = ConfigDict(arbitrary_types_allowed=True, protected_namespaces=())

    # ------------------------------------------------------------------ #
    # Turn document — these fields, and only these, are what gets written
    # ------------------------------------------------------------------ #
    request_id: str
    tenant_id: str
    # The relational key reads filter on, and the eval grouping key
    # `/v1/metrics/summary` aggregates on. Both are on the idempotency stub, so
    # omitting them here would delete them when the finished document replaces
    # it — which is exactly what the previous incremental writer did.
    user_id: str | None = None
    session_id: str | None = None
    conversation_id: Any = None
    contact_id: Any = None
    channel: str
    ts_start: datetime = Field(default_factory=_now)
    ts_end: datetime | None = None
    model_id: str
    adapter_id: str | None = None
    resolved_model: str | None = None  # what was actually sent to the LLM
    #: The extraction call may run on a smaller model than generation. Recorded
    #: separately or you cannot tell, months later, which model produced a
    #: given classification.
    extraction_model: str | None = None
    playbook_id: str
    playbook_version: int
    prompt_version: str
    mode: str
    extraction: dict | None = None
    retrieval: dict | None = None
    #: How the speculative retrieval turned out — kept / requeried / unused.
    #: On the document rather than working state, because the whole point of
    #: 4b is being able to measure the waste rate afterwards.
    speculation: dict | None = None
    state: dict | None = None
    generation: dict | None = None
    guardrails: dict | None = None
    handoff: dict = Field(default_factory=_empty_handoff)
    totals: dict = Field(default_factory=_empty_totals)
    error: dict | None = None
    eval: dict = Field(default_factory=_empty_eval)
    status: str = "in_progress"
    result: dict | None = None  # OrchestratorResult snapshot, replayed on dedupe

    # ------------------------------------------------------------------ #
    # Working state — never reaches the document
    # ------------------------------------------------------------------ #
    envelope: OrchestratorInput = Field(exclude=True)
    turn_id: Any = Field(default=None, exclude=True)

    playbook: Playbook | None = Field(default=None, exclude=True)
    contact: dict | None = Field(default=None, exclude=True)
    convo: dict | None = Field(default=None, exclude=True)
    inbound_id: Any = Field(default=None, exclude=True)
    lead: dict = Field(default_factory=dict, exclude=True)
    history: list[dict] = Field(default_factory=list, exclude=True)
    hits: list[dict] = Field(default_factory=list, exclude=True)
    #: Retrieval fired before the stage gate was known (4b). `retrieval_gate`
    #: decides whether it becomes `hits`/`retrieval` or is thrown away.
    speculative_hits: list[dict] = Field(default_factory=list, exclude=True)
    speculative_retrieval: dict | None = Field(default=None, exclude=True)
    #: The parsed `ExtractionResult`. `extraction` above is its document form;
    #: the guardrails and the state machine want the object.
    extraction_result: Any = Field(default=None, exclude=True)

    stage_in: str = Field(default="", exclude=True)
    stage_out: str = Field(default="", exclude=True)
    return_stage: str | None = Field(default=None, exclude=True)
    transition_reason: str = Field(default="", exclude=True)
    score: int = Field(default=0, exclude=True)
    strikes: int = Field(default=0, exclude=True)

    pre_checks: list[Any] = Field(default_factory=list, exclude=True)
    post_checks: list[Any] = Field(default_factory=list, exclude=True)
    feedback: list[str] = Field(default_factory=list, exclude=True)
    regenerated: bool = Field(default=False, exclude=True)
    repair_attempted: bool = Field(default=False, exclude=True)
    repair_structure_ok: bool = Field(default=True, exclude=True)
    forced_draft: bool = Field(default=False, exclude=True)
    facts_text: str = Field(default="", exclude=True)
    history_text: str = Field(default="", exclude=True)

    reply: Reply | None = Field(default=None, exclude=True)
    #: The dispatch that still has to happen when the response returns.
    #: Persisted before responding so a crash mid-drain is recoverable.
    outbox: dict | None = Field(default=None, exclude=True)
    handoff_triggered: bool = Field(default=False, exclude=True)
    already_handed_off: bool = Field(default=False, exclude=True)

    # Reducer fields. `flags` and `token_stats` are appended from several
    # nodes, so last-write-wins would silently drop the earlier ones.
    flags: Annotated[list[str], operator.add] = Field(default_factory=list, exclude=True)
    token_stats: Annotated[list[LLMCallStats], operator.add] = Field(
        default_factory=list, exclude=True
    )
    #: Failures survived by `@best_effort` nodes.
    errors: Annotated[list[NodeError], operator.add] = Field(
        default_factory=list, exclude=True
    )

    # ------------------------------------------------------------------ #
    @classmethod
    def from_envelope(cls, envelope: OrchestratorInput, turn_id: Any) -> "TurnState":
        return cls(
            envelope=envelope,
            turn_id=turn_id,
            request_id=envelope.request_id,
            tenant_id=envelope.tenant_id,
            user_id=envelope.user_id,
            session_id=envelope.session_id,
            channel=envelope.channel.value,
            model_id=envelope.runtime.model_id,
            adapter_id=envelope.runtime.adapter_id,
            playbook_id=envelope.runtime.playbook_id,
            playbook_version=envelope.runtime.playbook_version,
            prompt_version=envelope.runtime.prompt_version,
            mode=envelope.mode.value,
            lead={},
        )

    def summed_totals(self) -> dict:
        """Token totals across every LLM call this turn made."""
        return {
            "latency_ms": self.totals.get("latency_ms", 0),
            "prompt_tokens": sum(s.prompt_tokens for s in self.token_stats),
            "completion_tokens": sum(s.completion_tokens for s in self.token_stats),
        }

    def to_turn_document(self) -> dict:
        """The document to persist. A projection of state, not an assembly."""
        doc = self.model_dump()
        ts_end = doc["ts_end"] or _now()
        doc["ts_end"] = ts_end
        doc["totals"] = {
            **self.summed_totals(),
            "latency_ms": int((ts_end - self.ts_start).total_seconds() * 1000),
        }
        return doc
