"""LLM gateway: model resolution + the two call shapes (extract / generate).

One OpenAI-compatible endpoint serves everything. Backend semantics:

- `vllm` (production, multi-LoRA): the per-request `model` field selects the
  LoRA adapter — `runtime.adapter_id` when present, else `runtime.model_id`.
- `ollama` (local dev): no per-request adapters — `model` is always the
  configured `OLLAMA_MODEL`; a warning is logged that adapter selection is
  bypassed.
- `bedrock` (managed): Amazon Bedrock's `bedrock-mantle` endpoint, which speaks
  the OpenAI Chat Completions API, so the same client works with only a
  base URL and key change. Bedrock serves whole models rather than LoRA
  adapters, so `adapter_id` is bypassed exactly as on ollama.

Every call: 30s timeout, one transport retry, then `LLMUnavailable` (the API
maps it to HTTP 503 after the error turn document is written).
"""
from __future__ import annotations

import json
import logging
import re
import time

from openai import (
    APIConnectionError,
    APITimeoutError,
    AsyncOpenAI,
    BadRequestError,
    InternalServerError,
)

from ..config import settings
from ..schemas.envelope import RuntimeConfig
from ..schemas.llm import (
    ExtractionCall,
    ExtractionResult,
    GenerationCall,
    GenerationOutput,
    LLMCallStats,
)

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None

# How "no thinking" is spelled depends on the serving runtime: vLLM honours
# the chat-template kwarg; Ollama's OpenAI endpoint ignores it but honours
# reasoning_effort="none".
def _thinking_off_body() -> dict:
    if settings.llm_backend == "ollama":
        return {"reasoning_effort": "none"}
    if settings.llm_backend == "bedrock":
        # Bedrock exposes no portable thinking switch, and MiniMax M2 reasons
        # by design. Send nothing and let the `<think>` stripper downstream
        # handle the output — an unknown field here is a 400, not a no-op.
        return {}
    return {"chat_template_kwargs": {"enable_thinking": False}}


# Set to False the first time the runtime rejects the thinking-off kwarg so we
# stop sending it (graceful fallback).
_thinking_kwarg_ok: bool = True

_TRANSIENT = (APIConnectionError, APITimeoutError, InternalServerError)


class LLMUnavailable(Exception):
    """Total LLM failure after retry — surfaces as HTTP 503."""


def _endpoint() -> tuple[str, str]:
    """(base_url, api_key) for the configured backend."""
    if settings.llm_backend == "bedrock":
        if not settings.bedrock_api_key:
            raise LLMUnavailable(
                "LLM_BACKEND=bedrock but BEDROCK_API_KEY is not set — "
                "generate a long-term API key in the Bedrock console."
            )
        # `bedrock-mantle` is the OpenAI-compatible endpoint AWS recommends;
        # `bedrock-runtime` also serves Chat Completions but expects SigV4.
        return (
            f"https://bedrock-mantle.{settings.bedrock_region}.api.aws/v1",
            settings.bedrock_api_key,
        )
    return settings.llm_base_url, settings.llm_api_key


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        base_url, api_key = _endpoint()
        _client = AsyncOpenAI(
            base_url=base_url,
            api_key=api_key,
            timeout=settings.llm_timeout_seconds,
            max_retries=0,  # retries are counted explicitly below
        )
    return _client


def reset_client() -> None:
    """Drop the cached client so a settings change takes effect. Tests only."""
    global _client
    _client = None


def base_model() -> str:
    """The single model a non-adapter backend serves.

    Shared by both planes deliberately. The Operator agent used to decide this
    for itself and defaulted to `ollama_model` for every non-vllm backend, so
    adding a backend here silently left the agent talking to the old one.
    """
    if settings.llm_backend == "bedrock":
        return settings.bedrock_model_id
    return settings.ollama_model


def resolve_model(runtime: RuntimeConfig) -> str:
    """What goes into the request's `model` field for this tenant turn."""
    if settings.llm_backend == "vllm":
        return runtime.adapter_id or runtime.model_id

    # Neither managed Bedrock nor local ollama serves per-request LoRA
    # adapters, so a tenant's fine-tune is silently not in play — say so.
    served = base_model()
    if runtime.adapter_id:
        logger.warning(
            "LLM_BACKEND=%s: adapter selection bypassed (adapter_id=%r); using model %r",
            settings.llm_backend,
            runtime.adapter_id,
            served,
        )
    return served


async def _chat(
    messages: list[dict], *, model: str, temperature: float, disable_thinking: bool
) -> tuple[str, LLMCallStats]:
    """One chat completion with transport retry + thinking-kwarg fallback."""
    global _thinking_kwarg_ok
    client = get_client()
    retries = 0
    started = time.monotonic()
    last_exc: Exception | None = None

    for attempt in range(1 + settings.llm_max_retries):
        retries = attempt
        kwargs: dict = {}
        if settings.llm_max_output_tokens:
            kwargs["max_tokens"] = settings.llm_max_output_tokens
        if disable_thinking and _thinking_kwarg_ok:
            thinking_off = _thinking_off_body()
            if thinking_off:
                kwargs["extra_body"] = thinking_off
        try:
            resp = await client.chat.completions.create(
                model=model, messages=messages, temperature=temperature, **kwargs
            )
        except BadRequestError as exc:
            if "extra_body" in kwargs:
                # runtime rejected chat_template_kwargs — fall back without it
                logger.warning("runtime rejected thinking-disable kwarg, retrying without: %s", exc)
                _thinking_kwarg_ok = False
                kwargs.pop("extra_body")
                try:
                    resp = await client.chat.completions.create(
                        model=model, messages=messages, temperature=temperature, **kwargs
                    )
                except _TRANSIENT as exc2:
                    last_exc = exc2
                    continue
            else:
                raise LLMUnavailable(f"LLM rejected request: {exc}") from exc
        except _TRANSIENT as exc:
            last_exc = exc
            continue

        stats = LLMCallStats(
            latency_ms=int((time.monotonic() - started) * 1000),
            prompt_tokens=getattr(resp.usage, "prompt_tokens", 0) or 0,
            completion_tokens=getattr(resp.usage, "completion_tokens", 0) or 0,
            retries=retries,
        )
        return (resp.choices[0].message.content or ""), stats

    raise LLMUnavailable(f"LLM unreachable after retry: {last_exc}") from last_exc


# --------------------------------------------------------------------------- #
# Extraction — temperature 0.1, JSON-only
# --------------------------------------------------------------------------- #
_FENCE_RE = re.compile(r"```(?:json)?|```", re.IGNORECASE)
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


def _parse_json_block(text: str) -> dict:
    text = _THINK_RE.sub("", text)
    text = _FENCE_RE.sub("", text).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError(f"no JSON object in LLM output: {text[:200]!r}")
    return json.loads(text[start : end + 1])


async def extract(*, model: str, messages: list[dict]) -> ExtractionCall:
    """Strict JSON extraction. Strip fences; one parse retry; second failure
    degrades to intent=other, confidence=0 (never a 5xx)."""
    started = time.monotonic()
    total = LLMCallStats()
    parse_retries = 0

    for attempt in range(2):
        text, stats = await _chat(
            messages, model=model,
            temperature=settings.llm_extract_temperature,
            disable_thinking=True,
        )
        total.prompt_tokens += stats.prompt_tokens
        total.completion_tokens += stats.completion_tokens
        total.retries += stats.retries
        try:
            data = _parse_json_block(text)
            result = ExtractionResult.model_validate(data)
            break
        except (ValueError, json.JSONDecodeError) as exc:
            parse_retries += 1
            logger.warning("extraction JSON parse failed (attempt %d): %s", attempt + 1, exc)
            if attempt == 0:
                messages = messages + [
                    {"role": "assistant", "content": text},
                    {
                        "role": "user",
                        "content": "That was not valid JSON. Reply with ONLY the JSON object, nothing else.",
                    },
                ]
    else:
        result = ExtractionResult(intent="other", entities={}, sentiment="neutral", confidence=0.0)

    total.retries += parse_retries
    total.latency_ms = int((time.monotonic() - started) * 1000)
    return ExtractionCall(result=result, stats=total)


# --------------------------------------------------------------------------- #
# Generation — temperature 0.7, thinking disabled
# --------------------------------------------------------------------------- #
_BUBBLE_SPLIT_RE = re.compile(r"^\s*-{3,}\s*$", re.MULTILINE)


def _split_bubbles(text: str) -> list[str]:
    text = _THINK_RE.sub("", text)
    text = _FENCE_RE.sub("", text)
    parts = [p.strip() for p in _BUBBLE_SPLIT_RE.split(text)]
    # models sometimes glue the separator to a bubble instead of giving it
    # its own line — trim those stray dashes
    parts = [re.sub(r"^\s*-{3,}\s*|\s*-{3,}\s*$", "", p).strip() for p in parts]
    bubbles = [p for p in parts if p]
    return bubbles[:3] if bubbles else []


async def generate(*, model: str, messages: list[dict]) -> GenerationCall:
    """One reply generation → 1-3 short messages."""
    started = time.monotonic()
    text, stats = await _chat(
        messages, model=model,
        temperature=settings.llm_generate_temperature,
        disable_thinking=True,
    )
    stats.latency_ms = int((time.monotonic() - started) * 1000)
    return GenerationCall(
        output=GenerationOutput(messages=_split_bubbles(text)),
        raw_text=text,
        stats=stats,
    )


# --------------------------------------------------------------------------- #
# Plain chat — used by the operator agent loop (JSON protocol lives upstream)
# --------------------------------------------------------------------------- #
async def chat_text(
    *, model: str, messages: list[dict], temperature: float = 0.3
) -> tuple[str, LLMCallStats]:
    """One chat completion, raw text back. Thinking disabled — the agent
    protocol carries its reasoning explicitly in the JSON `thought` field."""
    started = time.monotonic()
    text, stats = await _chat(
        messages, model=model, temperature=temperature, disable_thinking=True
    )
    stats.latency_ms = int((time.monotonic() - started) * 1000)
    return text, stats


async def ping() -> bool:
    try:
        await get_client().with_options(timeout=3.0).models.list()
        return True
    except Exception:  # noqa: BLE001
        return False
