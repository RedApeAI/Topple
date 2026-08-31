"""Application settings, loaded from environment / .env via pydantic-settings."""
from __future__ import annotations

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "plucia-orchestrator"

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
    llm_timeout_seconds: float = 30.0
    llm_max_retries: int = 1  # transport retries before total failure (503)

    # Ceiling on generated tokens. Unset by default so self-hosted backends keep
    # their own limits; worth setting on Bedrock, where thinking tokens are
    # billed output and MiniMax M2 caps at 8K anyway.
    llm_max_output_tokens: int | None = None

    llm_extract_temperature: float = 0.1
    llm_generate_temperature: float = 0.7

    # --- Stores ---
    mongo_url: str = "mongodb://localhost:27017"
    mongo_db: str = "blackbox"
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str | None = None  # required for Qdrant Cloud; unused locally

    # --- Event bus (Dragonfly, Redis-protocol) ---
    dragonfly_url: str = "redis://localhost:6379"

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
