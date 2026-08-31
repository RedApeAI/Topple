"""The single LLM call surface both planes go through.

Model tiering, per-call timeouts and deadline propagation were spread across
three places: `gateway.resolve_model`, `prompt.resolve_agent_model` and the
node decorators. Spread is how they drift — adding Bedrock to `resolve_model`
alone once left every Operator command asking for the old Ollama model and
404ing, which is why HLD §4.6 says both planes must resolve through
`base_model()`.

This does not replace `gateway`; the transport, retry and parsing stay there.
What lives here is the *policy* about which model a call site gets and how long
it may take.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from ..config import settings
from ..llm import gateway
from ..schemas.envelope import RuntimeConfig

logger = logging.getLogger(__name__)

Purpose = Literal["generation", "extraction", "repair", "agent"]


class DeadlineExceeded(Exception):
    """The run's wall-clock budget is gone before this call could start."""


@dataclass(frozen=True)
class CallBudget:
    """How long this call may take, and when the whole run gives up."""

    timeout: float
    deadline_at: datetime | None = None

    def remaining(self) -> float:
        """Seconds left, never more than this call's own timeout.

        Deadline propagation: a node's budget is meaningless if the run has
        already overrun — a 150s generation started 5s before the deadline
        should not run for 150s.
        """
        if self.deadline_at is None:
            return self.timeout
        left = (self.deadline_at - datetime.now(timezone.utc)).total_seconds()
        if left <= 0:
            raise DeadlineExceeded("run deadline passed before the call started")
        return min(self.timeout, left)


def model_for(purpose: Purpose, runtime: RuntimeConfig | None) -> str:
    """Which model this call site gets.

    Both planes resolve through `gateway.base_model()` / `resolve_model()`;
    tiering only ever narrows from there. Keeping that layering explicit is the
    point of this function existing at all.
    """
    if purpose == "agent":
        if settings.llm_backend == "vllm":
            if runtime is None:
                raise ValueError("runtime (model_id) is required on the vllm backend")
            return runtime.model_id
        return gateway.base_model()

    if runtime is None:
        base = gateway.base_model()
    else:
        base = gateway.resolve_model(runtime)

    if purpose in ("extraction", "repair"):
        return gateway.extraction_model(runtime, base)
    return base


def budget_for(purpose: Purpose, deadline_at: datetime | None = None) -> CallBudget:
    timeouts = {
        "extraction": settings.node_timeout_extract,
        "repair": settings.node_timeout_extract,
        "generation": settings.node_timeout_generate,
        "agent": settings.node_timeout_operator_step,
    }
    return CallBudget(timeout=timeouts[purpose], deadline_at=deadline_at)


async def bounded(coro, budget: CallBudget):
    """Await `coro` under the call budget."""
    async with asyncio.timeout(budget.remaining()):
        return await coro
