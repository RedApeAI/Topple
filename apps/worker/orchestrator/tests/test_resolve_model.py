"""resolve_model: vllm+adapter → adapter, vllm+null → model_id,
ollama/bedrock → the configured served model with a bypass warning.

The bypass warning matters: a tenant configured with a fine-tuned adapter that
silently is not in play would otherwise be invisible."""
from __future__ import annotations

import logging

import pytest

from app.config import settings
from app.llm.gateway import (
    LLMUnavailable,
    _endpoint,
    _thinking_off_body,
    resolve_model,
)
from app.schemas.envelope import RuntimeConfig


def _runtime(adapter_id: str | None) -> RuntimeConfig:
    return RuntimeConfig(
        playbook_id="real-estate-v1",
        knowledge_source_id="plucia_re",
        model_id="qwen3.5-9b-base",
        adapter_id=adapter_id,
        playbook_version=8,
        prompt_version="2026-06-01",
    )


def test_vllm_with_adapter_uses_adapter(monkeypatch):
    monkeypatch.setattr(settings, "llm_backend", "vllm")
    assert resolve_model(_runtime("real-estate-v2")) == "real-estate-v2"


def test_vllm_without_adapter_uses_model_id(monkeypatch):
    monkeypatch.setattr(settings, "llm_backend", "vllm")
    assert resolve_model(_runtime(None)) == "qwen3.5-9b-base"


def test_ollama_uses_env_model_and_warns(monkeypatch, caplog):
    monkeypatch.setattr(settings, "llm_backend", "ollama")
    monkeypatch.setattr(settings, "ollama_model", "qwen3.5:9b")
    with caplog.at_level(logging.WARNING):
        assert resolve_model(_runtime("real-estate-v2")) == "qwen3.5:9b"
    assert any("bypassed" in r.message for r in caplog.records)


def test_ollama_without_adapter_no_warning(monkeypatch, caplog):
    monkeypatch.setattr(settings, "llm_backend", "ollama")
    with caplog.at_level(logging.WARNING):
        assert resolve_model(_runtime(None)) == settings.ollama_model
    assert not any("bypassed" in r.message for r in caplog.records)


# --------------------------------------------------------------------------- #
# Bedrock — managed models, no per-request LoRA adapters
# --------------------------------------------------------------------------- #
def test_bedrock_uses_configured_model_and_warns(monkeypatch, caplog):
    monkeypatch.setattr(settings, "llm_backend", "bedrock")
    monkeypatch.setattr(settings, "bedrock_model_id", "minimax.minimax-m2")
    with caplog.at_level(logging.WARNING):
        assert resolve_model(_runtime("real-estate-v2")) == "minimax.minimax-m2"
    assert any("bypassed" in r.message for r in caplog.records)


def test_bedrock_without_adapter_no_warning(monkeypatch, caplog):
    monkeypatch.setattr(settings, "llm_backend", "bedrock")
    monkeypatch.setattr(settings, "bedrock_model_id", "minimax.minimax-m2")
    with caplog.at_level(logging.WARNING):
        assert resolve_model(_runtime(None)) == "minimax.minimax-m2"
    assert not any("bypassed" in r.message for r in caplog.records)


def test_bedrock_ignores_the_envelope_model_id(monkeypatch):
    """The envelope names a self-hosted model; Bedrock must not forward it."""
    monkeypatch.setattr(settings, "llm_backend", "bedrock")
    monkeypatch.setattr(settings, "bedrock_model_id", "minimax.minimax-m2")
    assert resolve_model(_runtime(None)) != "qwen3.5-9b-base"


# --------------------------------------------------------------------------- #
# Endpoint selection
# --------------------------------------------------------------------------- #
def test_bedrock_endpoint_is_regional_mantle(monkeypatch):
    monkeypatch.setattr(settings, "llm_backend", "bedrock")
    monkeypatch.setattr(settings, "bedrock_region", "ap-south-1")
    monkeypatch.setattr(settings, "bedrock_api_key", "bedrock-key")
    base_url, api_key = _endpoint()
    assert base_url == "https://bedrock-mantle.ap-south-1.api.aws/v1"
    assert api_key == "bedrock-key"


def test_bedrock_without_a_key_fails_loudly(monkeypatch):
    """Better a clear 503 than an opaque 401 from AWS on the first turn."""
    monkeypatch.setattr(settings, "llm_backend", "bedrock")
    monkeypatch.setattr(settings, "bedrock_api_key", None)
    with pytest.raises(LLMUnavailable, match="BEDROCK_API_KEY"):
        _endpoint()


def test_non_bedrock_backends_keep_the_generic_endpoint(monkeypatch):
    monkeypatch.setattr(settings, "llm_backend", "ollama")
    monkeypatch.setattr(settings, "llm_base_url", "http://localhost:11434/v1")
    assert _endpoint()[0] == "http://localhost:11434/v1"


# --------------------------------------------------------------------------- #
# Thinking control
# --------------------------------------------------------------------------- #
def test_bedrock_sends_no_thinking_kwarg(monkeypatch):
    """An unknown field is a 400 on Bedrock, not a silently ignored no-op."""
    monkeypatch.setattr(settings, "llm_backend", "bedrock")
    assert _thinking_off_body() == {}


def test_ollama_and_vllm_still_disable_thinking(monkeypatch):
    monkeypatch.setattr(settings, "llm_backend", "ollama")
    assert _thinking_off_body() == {"reasoning_effort": "none"}
    monkeypatch.setattr(settings, "llm_backend", "vllm")
    assert _thinking_off_body() == {"chat_template_kwargs": {"enable_thinking": False}}


# --------------------------------------------------------------------------- #
# The Operator agent resolves its own model — regression cover
# --------------------------------------------------------------------------- #
# Adding the bedrock backend to `resolve_model` alone left the Operator agent
# still asking for `ollama_model`, so every command 404'd against Bedrock with
# "The model 'qwen3.5:9b' does not exist". Both planes now share `base_model()`.
def test_agent_model_follows_the_backend(monkeypatch):
    from app.operator.agent import _resolve_agent_model

    monkeypatch.setattr(settings, "llm_backend", "bedrock")
    monkeypatch.setattr(settings, "bedrock_model_id", "minimax.minimax-m2")
    assert _resolve_agent_model(_runtime("real-estate-v2")) == "minimax.minimax-m2"


def test_agent_model_on_ollama_unchanged(monkeypatch):
    from app.operator.agent import _resolve_agent_model

    monkeypatch.setattr(settings, "llm_backend", "ollama")
    monkeypatch.setattr(settings, "ollama_model", "qwen3.5:9b")
    assert _resolve_agent_model(_runtime(None)) == "qwen3.5:9b"


def test_agent_model_on_vllm_uses_base_not_adapter(monkeypatch):
    """The adapter is the buyer-facing voice; the agent needs the instruct model."""
    from app.operator.agent import _resolve_agent_model

    monkeypatch.setattr(settings, "llm_backend", "vllm")
    assert _resolve_agent_model(_runtime("real-estate-v2")) == "qwen3.5-9b-base"


def test_base_model_matches_what_the_agent_picks(monkeypatch):
    """The two planes must never drift apart again."""
    from app.llm.gateway import base_model
    from app.operator.agent import _resolve_agent_model

    for backend, attr, value in [
        ("bedrock", "bedrock_model_id", "minimax.minimax-m2"),
        ("ollama", "ollama_model", "qwen3.5:9b"),
    ]:
        monkeypatch.setattr(settings, "llm_backend", backend)
        monkeypatch.setattr(settings, attr, value)
        assert base_model() == _resolve_agent_model(_runtime(None)) == value
