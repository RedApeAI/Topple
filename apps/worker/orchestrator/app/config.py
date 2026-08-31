"""Application settings, loaded from environment / .env via pydantic-settings."""
from __future__ import annotations

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "redape-orchestrator"

    # --- LLM (OpenAI-compatible endpoint) ---
    # Backend `vllm` (self-hosted): multi-LoRA, per-request `model` = adapter_id
    #   or model_id.
    # Backend `ollama` (local dev): adapters are bypassed, `model` is always
    #   OLLAMA_MODEL.
    # Backend `bedrock` (managed): Amazon Bedrock's OpenAI-compatible
    #   `bedrock-mantle` endpoint. Adapters are bypassed like ollama — Bedrock
    #   serves whole models, not LoRA adapters (see BEDROCK_MODEL_ID below).
    llm_base_url: str = "http://localhost:11434/v1"
    llm_api_key: str = "ollama"
    llm_backend: Literal["vllm", "ollama", "bedrock"] = "ollama"
    ollama_model: str = "qwen3.5:9b"

    # --- Amazon Bedrock (only read when llm_backend="bedrock") ---
    bedrock_region: str = "us-east-1"
    # Bedrock model id. MiniMax M2 is `minimax.minimax-m2` — no version suffix
    # and no regional prefix, because it supports neither geo nor global
    # cross-region inference profiles.
    bedrock_model_id: str = "minimax.minimax-m2"
    # A long-term Bedrock API key, sent as a bearer token. Generated in the
    # Bedrock console; this is not an AWS access key pair.
    bedrock_api_key: str | None = None

    # A reasoning model spends output tokens thinking before it answers, so 30s
    # is tight for Bedrock — raise LLM_TIMEOUT_SECONDS (120 is a safe start).
    #
    # This bounds one HTTP call. Per-*node* budgets live below: this value has
    # to be sized for generation, which meant a hung extraction (0.7-3s in
    # practice) was allowed the same two minutes.
    llm_timeout_seconds: float = 30.0

    # --- Per-node budgets (seconds) ---
    # Measured p95 on Bedrock: extraction 3.7s on minimax / 0.9s on a small
    # model, generation 10.8s. These are generous multiples of that, chosen so
    # a genuinely slow call still completes and a hung one is caught early.
    node_timeout_extract: float = 30.0
    node_timeout_generate: float = 150.0
    node_timeout_retrieval: float = 10.0
    node_timeout_store: float = 15.0  # the Mongo-touching nodes
    node_timeout_operator_step: float = 90.0
    # Wall-clock budget for a whole Operator command. MAX_STEPS bounds how
    # many times the model is asked; this bounds how long the salesperson
    # waits, which is the number they actually care about.
    operator_deadline_seconds: float = 120.0
    llm_max_retries: int = 1  # transport retries before total failure (503)

    # Ceiling on generated tokens. Unset by default so self-hosted backends keep
    # their own limits; worth setting on Bedrock, where thinking tokens are
    # billed output and MiniMax M2 caps at 8K anyway.
    llm_max_output_tokens: int | None = None

    # Deployment-wide default for the extraction call. Extraction is a
    # classification task: on Bedrock, MiniMax M2 spends ~93% of its output
    # tokens reasoning before emitting a four-field JSON object, at ~3.1s a
    # call. A small non-thinking model does the same job in a fraction of that.
    #
    # Unset by default, so tiering is a no-op until someone configures it. A
    # per-tenant `runtime.extraction_model_id` overrides this.
    extraction_model_id: str | None = None

    # How the Operator loop replays the model's own reasoning across tool
    # calls within one command. MiniMax M2 uses interleaved reasoning as
    # working memory, so discarding it between tool calls costs planning
    # quality on multi-step chains.
    #   inline — re-embed as <think>…</think> in the assistant message.
    #            Portable: it is what vLLM and Ollama emit natively, and
    #            Bedrock accepts it (verified).
    #   field  — send a separate `reasoning` field on the assistant message.
    #            Symmetric with what Bedrock returns, but non-standard, so a
    #            stricter backend may 400.
    #   off    — previous behaviour: reasoning discarded every step.
    operator_reasoning_feedback: Literal["inline", "field", "off"] = "inline"

    llm_extract_temperature: float = 0.1
    llm_generate_temperature: float = 0.7

    # --- Stores ---
    mongo_url: str = "mongodb://localhost:27017"
    mongo_db: str = "blackbox"
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str | None = None  # required for Qdrant Cloud; unused locally

    # --- Event bus (Dragonfly, Redis-protocol) ---
    dragonfly_url: str = "redis://localhost:6379"

    # --- Per-tenant feature flags ---
    # Comma-separated tenant ids, or "*" for everyone. Behaviour-changing graph
    # work ships dark and is enabled per tenant, so a regression is one tenant's
    # problem rather than everyone's.
    #
    # Note on naming: this began life as "graph vs legacy", but the graph is now
    # the only implementation and is at parity. What actually needs gating is
    # the behaviour-changing work built on top of it, so the flags are per
    # feature rather than one switch.
    graph_pipeline_enabled: str = ""      # the whole Phase 4 set, coarse switch
    graph_parallel_fanout: str = ""       # 4a
    graph_speculative_retrieval: str = "" # 4b
    graph_repair_violations: str = ""     # 4c
    graph_stream_copilot: str = ""        # 4d

    # --- CORS (the dashboard connects to /v1/events directly for SSE) ---
    cors_origins: list[str] = ["http://localhost:3000"]

    # --- The BFF (apps/api) ---
    # It owns the users' OAuth grants, so anything needing a mailbox goes
    # through it. Same shared secret in both directions.
    bff_base_url: str | None = None

    # --- Outbound (channel adapters live in another service) ---
    outbound_webhook_url: str | None = None
    # Shared secret proving a dispatch really came from the orchestrator. The
    # BFF's outbound endpoint has no session cookie to authenticate against, so
    # without this it would send mail for any caller who knew a user_id.
    outbound_webhook_secret: str | None = None


settings = Settings()
