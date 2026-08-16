"""Carrying the model's reasoning across tool calls within one command.

The gateway used to throw reasoning away on every step. For MiniMax M2 that is
the wrong default: its interleaved reasoning is working memory, and a loop that
discards it between tool calls makes the model re-derive its plan from the
observation trail every step, which is where multi-step chains lose the thread
and stop self-correcting.

**Retention rule.** Reasoning is replayed across tool-call turns *within one
user turn*, and dropped at user-turn boundaries. The boundary falls out of the
existing design rather than needing enforcement: prior turns are rebuilt by
`prompt.thread_history` from the persisted `text` field, which has never
contained reasoning and still doesn't. Nothing here is persisted — reasoning
lives only in the in-memory conversation for the current run.

That bound matters. Reasoning is routinely longer than the answer (measured on
Bedrock: ~93% of extraction output tokens, ~71% of generation), so retaining it
across user turns would grow the prompt without limit.

**It must never reach a human.** Reasoning is not the `thought` field of the
agent protocol — that one is deliberately shown as the transparency layer.
This is the model's raw internal monologue, and `sanitize` strips it from both
the salesperson's report and any customer-facing text.
"""
from __future__ import annotations

import re

from ..config import settings

#: Matches an inline reasoning block in either direction — reading one out of a
#: completion, or recognising one we embedded ourselves.
THINK_RE = re.compile(r"<think>.*?</think>\s*", re.DOTALL | re.IGNORECASE)


def strip(text: str) -> str:
    """Remove inline reasoning blocks. Safe on text that has none."""
    return THINK_RE.sub("", text or "").strip()


def assistant_message(content: str, reasoning: str) -> dict:
    """The assistant turn to replay, carrying reasoning per the configured mode.

    `content` is the protocol JSON the loop reconstructed, never the raw
    completion — the raw text may carry a `<think>` block of its own, and
    embedding one inside another produces nonsense.
    """
    clean = strip(content)
    mode = settings.operator_reasoning_feedback

    if not reasoning or mode == "off":
        return {"role": "assistant", "content": clean}

    if mode == "field":
        # Symmetric with what Bedrock returns. Non-standard as a *request*
        # field, so backends that validate strictly may reject it — which is
        # why it is not the default.
        return {"role": "assistant", "content": clean, "reasoning": reasoning}

    return {"role": "assistant", "content": f"<think>{reasoning}</think>\n{clean}"}


def of(response: object, raw_text: str) -> str:
    """Reasoning for one completion, whatever the caller handed back.

    Tolerates a plain `(text, stats)` tuple — test doubles and older stubs
    return one — by falling back to inline extraction, so a scripted
    `<think>` block still exercises the retention path.
    """
    carried = getattr(response, "reasoning", "") or ""
    if carried:
        return carried
    from ..llm.gateway import reasoning_of

    return reasoning_of(None, raw_text)
