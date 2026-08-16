"""Declarative node failure policy.

Every node in both graphs is tagged `@critical` or `@best_effort`, and
`register` refuses to add an untagged one. That replaces the previous
arrangement, where "which failures are survivable" was inferred from
try/except blocks scattered across the store modules.

- `@best_effort` — the node catches, appends to `state.errors`, and the graph
  continues. This is the existing invariant "best-effort infra never fails a
  turn": losing an event, a Qdrant collection, or an outbound webhook must
  never lose a customer message.
- `@critical` — the node lets the exception propagate, but stamps its own name
  on it first so the caller can record *where* the run died. The exception
  object itself is re-raised unchanged, because callers upstream match on its
  type (`LLMUnavailable` becomes a 503) and would break if it were wrapped.

Note on LangGraph: `add_node(..., error_handler=...)` looks like it implements
`best_effort`, but it does not. It catches the exception and applies the
handler's state update, then **stops** — the failed node's outgoing edge is
never traversed. Hence the decorator.
"""
from __future__ import annotations

import asyncio
import functools
import logging
from typing import Any, Callable

from pydantic import BaseModel

logger = logging.getLogger(__name__)

CRITICAL = "critical"
BEST_EFFORT = "best_effort"


class NodeTimeout(Exception):
    """A node exceeded its own budget.

    Distinct from the transport timeout inside the gateway: that one bounds a
    single HTTP call, this one bounds a step of the turn. A node that retries
    internally can stay under the transport limit and still overrun.
    """

#: Stamped onto a propagating exception by `@critical` so the run's caller can
#: fill in `error.step` without wrapping the exception in another type.
_NODE_ATTR = "_plucia_failed_node"


class NodeError(BaseModel):
    """A survived failure. Accumulated on `state.errors` by `@best_effort`."""

    node: str
    type: str
    message: str


async def _run_bounded(fn: Callable, step: str, timeout: float | None, args, kwargs):
    """Await `fn`, converting an overrun into `NodeTimeout`."""
    if timeout is None:
        return await fn(*args, **kwargs)
    try:
        async with asyncio.timeout(timeout):
            return await fn(*args, **kwargs)
    except TimeoutError as exc:
        raise NodeTimeout(f"node {step!r} exceeded {timeout}s") from exc


def best_effort(
    step: str, *, node: str | None = None, timeout: float | None = None
) -> Callable:
    """Tag a node whose failure must not fail the run.

    `step` is the label recorded against the failure; `node` is the graph key,
    defaulting to `step`. They differ only where one logical step runs at two
    points in the graph (see `critical`). `timeout` bounds this node
    specifically — see the note there.
    """

    def decorate(fn: Callable) -> Callable:
        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> dict:
            try:
                return await _run_bounded(fn, step, timeout, args, kwargs)
            except Exception as exc:  # noqa: BLE001 — that is the whole point
                logger.warning("best-effort node %r failed: %s", step, exc, exc_info=True)
                return {
                    "errors": [
                        NodeError(node=step, type=type(exc).__name__, message=str(exc))
                    ]
                }

        wrapper.node_name = node or step  # type: ignore[attr-defined]
        wrapper.node_step = step  # type: ignore[attr-defined]
        wrapper.node_policy = BEST_EFFORT  # type: ignore[attr-defined]
        wrapper.node_timeout = timeout  # type: ignore[attr-defined]
        return wrapper

    return decorate


def critical(
    step: str, *, node: str | None = None, timeout: float | None = None
) -> Callable:
    """Tag a node whose failure must abort the run.

    `step` is what lands in `error.step` on the turn document; `node` is the
    graph key. The guardrail post-check runs twice — once after generation and
    once after the regeneration — and both must report `guardrails_post`, so
    the second registers under a distinct graph key with the same step label.

    `timeout` is per node, and replaces relying on the single global
    `LLM_TIMEOUT_SECONDS`. That one is set for generation — 120s on Bedrock,
    where thinking tokens are billed output and take real time — which means a
    hung *extraction* call, a step that takes 0.7-3s in practice, was also
    allowed to run for two minutes before anything noticed.
    """

    def decorate(fn: Callable) -> Callable:
        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> dict:
            try:
                return await _run_bounded(fn, step, timeout, args, kwargs)
            except Exception as exc:  # noqa: BLE001 — re-raised below, untouched
                # Keep the innermost name if something has already stamped it,
                # and tolerate exception types that reject attributes.
                try:
                    if getattr(exc, _NODE_ATTR, None) is None:
                        setattr(exc, _NODE_ATTR, step)
                except (AttributeError, TypeError):  # pragma: no cover — exotic
                    pass
                raise

        wrapper.node_name = node or step  # type: ignore[attr-defined]
        wrapper.node_step = step  # type: ignore[attr-defined]
        wrapper.node_policy = CRITICAL  # type: ignore[attr-defined]
        wrapper.node_timeout = timeout  # type: ignore[attr-defined]
        return wrapper

    return decorate


def failed_node(exc: BaseException) -> str:
    """Which node raised this, for `error.step` on the turn document."""
    return getattr(exc, _NODE_ATTR, None) or "unknown"


def register(builder: Any, *nodes: Callable) -> None:
    """Add tagged nodes to a `StateGraph`, keyed by their declared name.

    Untagged functions are rejected here rather than in a test, so
    "every node is tagged" holds by construction.
    """
    for fn in nodes:
        policy = getattr(fn, "node_policy", None)
        if policy not in (CRITICAL, BEST_EFFORT):
            raise TypeError(
                f"node {getattr(fn, '__name__', fn)!r} is not tagged "
                "@critical or @best_effort"
            )
        builder.add_node(fn.node_name, fn)
