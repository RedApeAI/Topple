"""Shared fixtures: in-memory Mongo (mongomock-motor), a scriptable fake LLM
gateway, mocked retrieval, and envelope builders."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from mongomock_motor import AsyncMongoMockClient

from app.llm import gateway
from app.schemas.envelope import OrchestratorInput
from app.schemas.llm import (
    ExtractionCall,
    ExtractionResult,
    GenerationCall,
    GenerationOutput,
    LLMCallStats,
)
from app.stores import mongo, qdrant


@pytest.fixture()
def db():
    client = AsyncMongoMockClient()
    mongo.set_client(client, db_name="blackbox_test")
    return client["blackbox_test"]


@pytest.fixture(autouse=True)
async def _indexes(db):
    await mongo.init_indexes(db)


class FakeLLM:
    """Scriptable stand-in for the gateway. Queue extraction dicts and raw
    generation texts; falls back to sane defaults when queues run dry."""

    def __init__(self):
        self.extractions: list[dict] = []
        self.generations: list[str] = []
        self.extract_calls = 0
        self.generate_calls = 0
        self.extract_error: Exception | None = None
        self.generate_error: Exception | None = None
        self.default_extraction = {
            "intent": "provide_info",
            "entities": {},
            "sentiment": "neutral",
            "confidence": 0.9,
        }
        self.default_generation = "Happy to help!\n---\nWhat are you looking for?"

    async def extract(self, *, model: str, messages: list[dict]) -> ExtractionCall:
        self.extract_calls += 1
        if self.extract_error:
            raise self.extract_error
        data = self.extractions.pop(0) if self.extractions else self.default_extraction
        return ExtractionCall(
            result=ExtractionResult.model_validate(data),
            stats=LLMCallStats(latency_ms=5, prompt_tokens=120, completion_tokens=30),
        )

    async def generate(self, *, model: str, messages: list[dict]) -> GenerationCall:
        self.generate_calls += 1
        if self.generate_error:
            raise self.generate_error
        text = self.generations.pop(0) if self.generations else self.default_generation
        bubbles = [b.strip() for b in text.split("\n---\n") if b.strip()][:3]
        return GenerationCall(
            output=GenerationOutput(messages=bubbles),
            raw_text=text,
            stats=LLMCallStats(latency_ms=8, prompt_tokens=300, completion_tokens=60),
        )


@pytest.fixture()
def llm(monkeypatch) -> FakeLLM:
    fake = FakeLLM()
    monkeypatch.setattr(gateway, "extract", fake.extract)
    monkeypatch.setattr(gateway, "generate", fake.generate)
    return fake


class FakeRetrieval:
    def __init__(self):
        self.hits: list[dict] = []
        self.flag: str | None = None
        self.calls: list[dict] = []

    async def retrieve(self, collection, query_text, top_k, min_score):
        self.calls.append(
            {"collection": collection, "query": query_text, "top_k": top_k, "min_score": min_score}
        )
        return list(self.hits), self.flag


@pytest.fixture()
def retrieval(monkeypatch) -> FakeRetrieval:
    fake = FakeRetrieval()
    monkeypatch.setattr(qdrant, "retrieve", fake.retrieve)
    return fake


# --------------------------------------------------------------------------- #
# Envelope builders
# --------------------------------------------------------------------------- #
def envelope_dict(**overrides) -> dict:
    base = {
        "request_id": "req-001",
        "received_at": datetime.now(timezone.utc).isoformat(),
        "tenant_id": "plucia",
        "channel": "whatsapp",
        "granted_scopes": ["channel:whatsapp"],
        "runtime": {
            "playbook_id": "real-estate-v1",
            "knowledge_source_id": "plucia_re",
            "model_id": "qwen3.5-9b-base",
            "adapter_id": "real-estate-v2",
            "playbook_version": 8,
            "prompt_version": "2026-06-01",
        },
        "message": {
            "external_contact_id": "+971501234567",
            "type": "text",
            "text": "Hi, I'm looking for a flat",
            "media": [],
            "channel_timestamp": datetime.now(timezone.utc).isoformat(),
            "raw_ref": None,
        },
        "mode": "autopilot",
    }
    base.update(overrides)
    return base


def make_envelope(**overrides) -> OrchestratorInput:
    return OrchestratorInput.model_validate(envelope_dict(**overrides))


def insurance_overrides(**extra) -> dict:
    base = {
        "tenant_id": "acme",
        "runtime": {
            "playbook_id": "insurance-v1",
            "knowledge_source_id": "acme_insurance",
            "model_id": "qwen3.5-9b-base",
            "adapter_id": None,
            "playbook_version": 4,
            "prompt_version": "2026-06-01",
        },
    }
    base.update(extra)
    return base
