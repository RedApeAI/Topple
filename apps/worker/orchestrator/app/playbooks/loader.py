"""Load + validate playbook YAML, cache by (playbook_id, version).

The engine is generic — ALL vertical behavior (stages, qualification schema,
transitions, prompts, guardrails) comes from these files. A mismatch between
the envelope's `playbook_version` and the file's version logs a warning and
proceeds with the file (the file is the deployable unit).
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

logger = logging.getLogger(__name__)

PLAYBOOK_DIR = Path(__file__).parent

_cache: dict[tuple[str, int], "Playbook"] = {}


class FieldSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["int", "float", "str", "list", "enum", "bool"]
    values: list[str] | None = None  # for enum
    weight: int = 0


class Transition(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_: str = Field(alias="from")  # stage name or "*"
    to: str
    when: Literal["always", "fields_known", "intent", "handoff_triggered"]
    fields: list[str] | None = None  # for fields_known; "a|b" means a OR b
    intent: str | None = None  # for intent
    return_to_previous: bool = False


class RetrievalConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled_from_stage: str
    top_k: int = 4
    min_score: float = 0.35


class PromptsConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    system: str
    stage_instructions: dict[str, str] = Field(default_factory=dict)
    handoff_message: str | None = None  # optional; absent → handoff is suppressed


class GuardrailsConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    numeric_grounding: bool = True
    forbidden_phrases: list[str] = Field(default_factory=list)
    handoff_intents: list[str] = Field(default_factory=list)
    handoff_on_sentiment: list[str] = Field(default_factory=list)
    low_confidence_threshold: float = 0.4
    low_confidence_strikes: int = 2


class Playbook(BaseModel):
    model_config = ConfigDict(extra="forbid")

    playbook_id: str
    version: int
    stages: list[str]
    initial_stage: str
    qualification_schema: dict[str, FieldSpec]
    intents: list[str]
    transitions: list[Transition]
    retrieval: RetrievalConfig
    prompts: PromptsConfig
    guardrails: GuardrailsConfig

    @model_validator(mode="after")
    def _check_stage_refs(self) -> "Playbook":
        known = set(self.stages)
        if self.initial_stage not in known:
            raise ValueError(f"initial_stage {self.initial_stage!r} not in stages")
        if self.retrieval.enabled_from_stage not in known:
            raise ValueError(
                f"retrieval.enabled_from_stage {self.retrieval.enabled_from_stage!r} not in stages"
            )
        for t in self.transitions:
            if t.from_ != "*" and t.from_ not in known:
                raise ValueError(f"transition from unknown stage {t.from_!r}")
            if t.to not in known:
                raise ValueError(f"transition to unknown stage {t.to!r}")
        return self

    def stage_index(self, stage: str) -> int:
        return self.stages.index(stage)


class PlaybookNotFound(Exception):
    pass


def load_playbook(playbook_id: str, requested_version: int | None = None) -> Playbook:
    """Load `<playbook_id>.yaml`, validate, cache by (id, file version)."""
    path = PLAYBOOK_DIR / f"{playbook_id}.yaml"
    if not path.exists():
        raise PlaybookNotFound(f"no playbook file for id {playbook_id!r}")

    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    file_version = int(raw.get("version", 0))
    key = (playbook_id, file_version)
    if key not in _cache:
        _cache[key] = Playbook.model_validate(raw)

    playbook = _cache[key]
    if requested_version is not None and requested_version != playbook.version:
        logger.warning(
            "playbook version mismatch for %r: envelope wants v%s, file is v%s — proceeding with the file",
            playbook_id,
            requested_version,
            playbook.version,
        )
    return playbook


def clear_cache() -> None:
    _cache.clear()
