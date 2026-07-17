"""Shapes exchanged with the LLM gateway.

Extraction is strict JSON (validated here, one retry upstream); generation is
1-3 short messages plus per-call accounting used by the turn trace.
"""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

SENTIMENTS = ("positive", "neutral", "negative", "angry")


class ExtractionResult(BaseModel):
    """What the extraction call must return (playbook supplies the intent set
    and the entity keys; unknown intents/sentiments are coerced, not fatal)."""

    intent: str = "other"
    entities: dict = Field(default_factory=dict)
    sentiment: str = "neutral"
    confidence: float = 0.0

    @field_validator("sentiment", mode="before")
    @classmethod
    def _known_sentiment(cls, v):
        v = str(v or "neutral").lower()
        return v if v in SENTIMENTS else "neutral"

    @field_validator("confidence", mode="before")
    @classmethod
    def _clamp_confidence(cls, v):
        try:
            return min(1.0, max(0.0, float(v)))
        except (TypeError, ValueError):
            return 0.0


class LLMCallStats(BaseModel):
    """Accounting attached to every gateway call for the turn trace."""

    latency_ms: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    retries: int = 0


class ExtractionCall(BaseModel):
    result: ExtractionResult
    stats: LLMCallStats


class GenerationOutput(BaseModel):
    """1-3 short channel messages ("bubbles")."""

    messages: list[str] = Field(default_factory=list)


class GenerationCall(BaseModel):
    output: GenerationOutput
    raw_text: str = ""
    stats: LLMCallStats
