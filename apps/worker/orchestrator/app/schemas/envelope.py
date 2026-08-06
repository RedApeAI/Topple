"""The input/output contract of the orchestrator.

`OrchestratorInput` is the envelope produced by the upstream auth/onboarding
service: already verified, already resolved. Validation is strict — unknown
fields are rejected so contract drift between services fails loudly.

`OrchestratorResult` is the API response and the full debugging surface for a
single turn.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Channel(str, Enum):
    whatsapp = "whatsapp"
    email = "email"
    voice = "voice"
    instagram = "instagram"


class Mode(str, Enum):
    autopilot = "autopilot"
    copilot = "copilot"


class RuntimeConfig(BaseModel):
    """Tenant runtime config resolved upstream — no Postgres in this service."""

    model_config = ConfigDict(extra="forbid", protected_namespaces=())

    playbook_id: str
    knowledge_source_id: str  # = Qdrant collection name
    model_id: str
    adapter_id: str | None = None
    playbook_version: int
    prompt_version: str


class InboundMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_contact_id: str  # phone / email / handle
    # Only 'text' is implemented; other known types are accepted by the schema
    # and rejected with a clear 422 by the endpoint.
    type: Literal["text", "image", "audio", "video", "document", "location"] = "text"
    text: str = ""
    media: list[dict] = Field(default_factory=list)
    channel_timestamp: datetime
    raw_ref: str | None = None


class OrchestratorInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: str  # idempotency key
    received_at: datetime
    tenant_id: str
    # The signed-in person this turn belongs to. Stored as a relational key on
    # every document the turn writes, so operations can be attributed to a user
    # and not only to a tenant. Optional so existing callers keep working.
    user_id: str | None = None
    # Opaque grouping key for evaluation. Minted by the dashboard per working
    # session and carried, unread by the pipeline, onto the turn document —
    # metrics slice on it to compare runs.
    session_id: str | None = None
    channel: Channel
    granted_scopes: list[str]
    runtime: RuntimeConfig
    message: InboundMessage
    mode: Mode


# --------------------------------------------------------------------------- #
# Result
# --------------------------------------------------------------------------- #
class RetrievalHit(BaseModel):
    doc_id: str
    chunk_id: str
    score: float
    used: bool


class Reply(BaseModel):
    status: Literal["sent", "draft", "suppressed"]
    messages: list[str] = Field(default_factory=list)


class Handoff(BaseModel):
    triggered: bool = False
    reason: str | None = None


class Totals(BaseModel):
    latency_ms: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0


class OrchestratorResult(BaseModel):
    turn_id: str
    request_id: str
    deduped: bool = False
    conversation_id: str
    contact_id: str
    stage_in: str
    stage_out: str
    lead_profile: dict
    extraction: dict
    retrieval_hits: list[RetrievalHit] = Field(default_factory=list)
    reply: Reply
    guardrail_flags: list[str] = Field(default_factory=list)
    handoff: Handoff
    totals: Totals
