"""Per-call-site model selection.

Extraction is classification; generation is composition. Measured on Bedrock,
MiniMax M2 spends ~93% of its extraction output tokens reasoning before
emitting four JSON fields, at ~3.1s a call — so the two call sites want
different models.

The rule that must not break: both planes still resolve their *primary* model
through the shared `base_model()` / `resolve_model()` helpers. The Operator
agent having its own resolver is what previously made every command 404 when
Bedrock was added to `resolve_model` alone, so tiering is layered on top of
those helpers rather than beside them.
"""
from __future__ import annotations

import pytest

from app.config import settings
from app.llm import gateway
from app.operator import prompt as operator_prompt
from app.schemas.envelope import RuntimeConfig

from .conftest import make_envelope


def _runtime(**overrides) -> RuntimeConfig:
    base = {
        "playbook_id": "real-estate-v1",
        "knowledge_source_id": "plucia_re",
        "model_id": "qwen3.5-9b-base",
        "adapter_id": "real-estate-v2",
        "playbook_version": 8,
        "prompt_version": "2026-06-01",
    }
    return RuntimeConfig.model_validate({**base, **overrides})


# --------------------------------------------------------------------------- #
# Default: nothing changes
# --------------------------------------------------------------------------- #
def test_unconfigured_extraction_uses_the_generation_model():
    runtime = _runtime()
    generation = gateway.resolve_model(runtime)
    assert gateway.extraction_model(runtime, generation) == generation


async def test_turn_records_both_models_and_they_match_by_default(db, llm, retrieval):
    from app.engine.pipeline import run_turn

    await run_turn(make_envelope(request_id="req-tier-default"))
    turn = await db.turns.find_one({"request_id": "req-tier-default"})
    assert turn["resolved_model"] == turn["extraction_model"]


# --------------------------------------------------------------------------- #
# Configured
# --------------------------------------------------------------------------- #
def test_runtime_override_wins():
    runtime = _runtime(extraction_model_id="haiku-small")
    assert gateway.extraction_model(runtime, "big-model") == "haiku-small"


def test_deployment_default_applies_when_the_runtime_is_silent(monkeypatch):
    monkeypatch.setattr(settings, "extraction_model_id", "deployment-small")
    assert gateway.extraction_model(_runtime(), "big-model") == "deployment-small"


def test_runtime_beats_the_deployment_default(monkeypatch):
    monkeypatch.setattr(settings, "extraction_model_id", "deployment-small")
    runtime = _runtime(extraction_model_id="tenant-small")
    assert gateway.extraction_model(runtime, "big-model") == "tenant-small"


def test_extraction_model_is_tolerant_of_a_missing_runtime():
    """The Operator plane may have no runtime at all on non-vllm backends."""
    assert gateway.extraction_model(None, "big-model") == "big-model"


async def test_the_two_call_sites_use_different_models_once_configured(
    db, llm, retrieval, monkeypatch
):
    from app.engine.pipeline import run_turn

    monkeypatch.setattr(settings, "extraction_model_id", "small-classifier")
    seen: list[str] = []

    original_extract, original_generate = llm.extract, llm.generate

    async def note_extract(*, model, messages):
        seen.append(("extract", model))
        return await original_extract(model=model, messages=messages)

    async def note_generate(*, model, messages):
        seen.append(("generate", model))
        return await original_generate(model=model, messages=messages)

    monkeypatch.setattr(gateway, "extract", note_extract)
    monkeypatch.setattr(gateway, "generate", note_generate)

    await run_turn(make_envelope(request_id="req-tier-split"))

    assert ("extract", "small-classifier") in seen
    generation_models = [m for kind, m in seen if kind == "generate"]
    assert generation_models and all(m != "small-classifier" for m in generation_models)

    turn = await db.turns.find_one({"request_id": "req-tier-split"})
    assert turn["extraction_model"] == "small-classifier"
    assert turn["resolved_model"] != "small-classifier"


# --------------------------------------------------------------------------- #
# The shared-helper rule (HLD §4.6)
# --------------------------------------------------------------------------- #
def test_tiering_does_not_touch_the_agent_model(monkeypatch):
    """The Operator's model must keep coming from `base_model()`.

    Regression cover for the failure this rule exists to prevent: a model
    change applied to one resolver and not the other, which 404'd every
    Operator command.
    """
    monkeypatch.setattr(settings, "extraction_model_id", "small-classifier")
    monkeypatch.setattr(settings, "llm_backend", "bedrock")
    assert operator_prompt.resolve_agent_model(None) == gateway.base_model()
    assert operator_prompt.resolve_agent_model(None) != "small-classifier"


def test_generation_model_is_unaffected_by_the_extraction_default(monkeypatch):
    monkeypatch.setattr(settings, "extraction_model_id", "small-classifier")
    assert gateway.resolve_model(_runtime()) != "small-classifier"


def test_envelope_still_rejects_unknown_runtime_fields():
    """`extra="forbid"` is an invariant; adding a field must not relax it."""
    with pytest.raises(Exception):
        _runtime(not_a_real_field="x")
