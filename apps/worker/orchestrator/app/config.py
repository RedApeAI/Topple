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
    # Backend `vllm` (prod): multi-LoRA, per-request `model` = adapter_id or model_id.
    # Backend `ollama` (dev): adapters are bypassed, `model` is always OLLAMA_MODEL.
    llm_base_url: str = "http://localhost:11434/v1"
    llm_api_key: str = "ollama"
    llm_backend: Literal["vllm", "ollama"] = "ollama"
    ollama_model: str = "qwen3.5:9b"

    llm_timeout_seconds: float = 30.0
    llm_max_retries: int = 1  # transport retries before total failure (503)

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
