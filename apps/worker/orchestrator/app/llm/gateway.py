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


def extraction_model(runtime: RuntimeConfig | None, default: str) -> str:
    """The model for the extraction call — classification, not composition.

    Deliberately layered *on top of* `resolve_model`/`base_model` rather than
    beside them. `default` is whatever the turn already resolved for
    generation, so with nothing configured this returns exactly that and
    tiering is a no-op. Both planes still resolve their primary model through
    the shared helpers; this only ever narrows one call site.

    Precedence: per-tenant runtime → deployment default → the generation model.
    """
    override = (
        getattr(runtime, "extraction_model_id", None) if runtime else None
    ) or settings.extraction_model_id
    return override or default


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
    """One chat completion. The seam extraction and generation call through.

    Kept as a 2-tuple deliberately: it is what the parity replayer stubs, and
    neither of those two call sites has any use for reasoning — they strip it.
    """
    text, stats, _reasoning = await _chat_full(
        messages, model=model, temperature=temperature, disable_thinking=disable_thinking
    )
    return text, stats


async def _chat_full(
    messages: list[dict], *, model: str, temperature: float, disable_thinking: bool
) -> tuple[str, LLMCallStats, str]:
    """One chat completion with transport retry + thinking-kwarg fallback.

    Returns `(content, stats, reasoning)`. `content` is exactly what the model
    put in the content field — `<think>` blocks included, where the backend
    inlines them — because the downstream parsers strip them and changing that
    here would alter what extraction and generation see.
    """
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
        message = resp.choices[0].message
        content = message.content or ""
        return content, stats, reasoning_of(message, content)

    raise LLMUnavailable(f"LLM unreachable after retry: {last_exc}") from last_exc


# --------------------------------------------------------------------------- #
# Extraction — temperature 0.1, JSON-only
# --------------------------------------------------------------------------- #
_FENCE_RE = re.compile(r"```(?:json)?|```", re.IGNORECASE)
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)
#: Same shape, but capturing, for reading reasoning out rather than deleting it.
_THINK_CAPTURE_RE = re.compile(r"<think>(.*?)</think>", re.DOTALL)

#: Where a backend might put reasoning when it does not inline it. Bedrock's
#: `bedrock-mantle` passthrough for MiniMax M2 uses `reasoning` and leaves
#: `content` completely free of `<think>` tags — verified against a live call.
#: The others are here because this is a passthrough of a third-party API and
#: the field name is not something we control.
_REASONING_FIELDS = ("reasoning", "reasoning_content", "reasoning_details")


def _reasoning_text(value: object) -> str:
    """Flatten whatever shape a backend uses into plain text.

    Seen in the wild: a bare string (Bedrock/MiniMax), and a list of blocks
    with `text` or `summary` keys (the `reasoning_details` convention).
    """
    if not value:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        return str(value.get("text") or value.get("summary") or "").strip()
    if isinstance(value, list):
        return "\n".join(filter(None, (_reasoning_text(item) for item in value)))
    return ""


def reasoning_of(message: object, content: str) -> str:
    """Reasoning for one completion, from either shape.

    Separate field first — that is what Bedrock actually returns — then inline
    `<think>` blocks, which is what vLLM and Ollama produce. A backend only
    ever uses one, but the caller should not have to know which.
    """
    extra = getattr(message, "model_extra", None) or {}
    for field in _REASONING_FIELDS:
        found = _reasoning_text(getattr(message, field, None) or extra.get(field))
        if found:
            return found
    return "\n".join(m.strip() for m in _THINK_CAPTURE_RE.findall(content or "")).strip()


class ChatResponse:
    """One completion: text, stats, and the reasoning that produced it.

    Unpacks as `(text, stats)` so it is a drop-in for the 2-tuple `chat_text`
    used to return. Callers that want reasoning read `.reasoning`; callers that
    don't — and test doubles that still return a plain tuple — are unaffected.
    """

    __slots__ = ("text", "stats", "reasoning")

    def __init__(self, text: str, stats: LLMCallStats, reasoning: str = "") -> None:
        self.text = text
        self.stats = stats
        self.reasoning = reasoning

    def __iter__(self):
        return iter((self.text, self.stats))

    def __repr__(self) -> str:  # pragma: no cover — debugging aid
        return f"ChatResponse(text={self.text[:40]!r}…, reasoning={len(self.reasoning)} chars)"


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


async def generate_streaming(
    *, model: str, messages: list[dict], on_token
) -> GenerationCall:
    """Generation, emitting tokens as they arrive.

    Only ever reached in copilot — see `egress` and the generation node. The
    caller supplies `on_token`; failures in it are swallowed, because losing
    the live preview must not lose the reply.
    """
    started = time.monotonic()
    client = get_client()
    kwargs: dict = {}
    if settings.llm_max_output_tokens:
        kwargs["max_tokens"] = settings.llm_max_output_tokens

    chunks: list[str] = []
    try:
        stream = await client.chat.completions.create(
            model=model, messages=messages,
            temperature=settings.llm_generate_temperature,
            stream=True, **kwargs,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            piece = chunk.choices[0].delta.content or ""
            if piece:
                chunks.append(piece)
                try:
                    await on_token(piece)
                except Exception:  # noqa: BLE001 — the preview is not the reply
                    logger.debug("token callback failed", exc_info=True)
    except _TRANSIENT as exc:
        raise LLMUnavailable(f"LLM unreachable while streaming: {exc}") from exc

    text = "".join(chunks)
    stats = LLMCallStats(latency_ms=int((time.monotonic() - started) * 1000))
    return GenerationCall(
        output=GenerationOutput(messages=_split_bubbles(text)),
        raw_text=text,
        stats=stats,
    )


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
) -> ChatResponse:
    """One chat completion for the Operator loop.

    Returns a `ChatResponse`, which unpacks as `(text, stats)` for anything
    that still expects the old 2-tuple. `.reasoning` carries the model's own
    working-out, which the loop feeds back across tool calls — for MiniMax M2
    that reasoning *is* its working memory, and dropping it degrades planning
    on multi-step toolchains.

    `disable_thinking=True` is still passed: it is a no-op on Bedrock (which
    exposes no switch) and on backends where it works, an absent reasoning
    field simply means there is nothing to carry.
    """
    started = time.monotonic()
    text, stats, reasoning = await _chat_full(
        messages, model=model, temperature=temperature, disable_thinking=True
    )
    stats.latency_ms = int((time.monotonic() - started) * 1000)
    return ChatResponse(text, stats, reasoning)


async def ping() -> bool:
    try:
        await get_client().with_options(timeout=3.0).models.list()
        return True
    except Exception:  # noqa: BLE001
        return False
