"""resolve_model: vllm+adapter → adapter, vllm+null → model_id,
ollama → configured local model with a bypass warning."""
from __future__ import annotations

import logging

from app.config import settings
from app.llm.gateway import resolve_model
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
