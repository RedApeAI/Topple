"""The Operator agent plane: salesperson commands → tools → mode-gated action.

The turn pipeline speaks AS the sales persona TO a buyer. This module is the
other side of the product: an agent working FOR the salesperson. It reads a
command ("say hi to Priya Patel"), reasons about intent, gathers what it needs
with tools, asks ONE clarifying question when a required parameter is missing,
and finally acts — in copilot mode any customer-facing message lands as a draft
for approval; in autopilot it dispatches immediately.

Protocol: prompt-engineered JSON (same convention as extraction) rather than
native tool-calling, so it works identically on ollama, vllm and bedrock.

The loop itself is `app/graph/operator_graph.py`; the tools are `tools.py` and
the prompt is `prompt.py`. What remains here is the entry point and the module
other code imports.
"""
from __future__ import annotations

import logging

from datetime import datetime, timedelta, timezone

from ..config import settings
from ..graph.checkpointer import get_checkpointer
from ..graph.context import GraphContext
from ..graph.operator_graph import OPERATOR_GRAPH, RECURSION_LIMIT, resolve_thread
from ..graph.operator_state import OperatorState
from ..schemas.envelope import RuntimeConfig

# Re-exported: `main.py` catches ThreadNotFound, and both names are part of
# this module's long-standing surface.
from .prompt import (  # noqa: F401
    HISTORY_WINDOW,
    MAX_STEPS,
    SYSTEM_PROMPT,
    ThreadNotFound,
    now_for_prompt as _now_for_prompt,
    resolve_agent_model as _resolve_agent_model,
)
from .tools import (  # noqa: F401
    ACTION_CHANNELS,
    TOOLS,
    tool_get_conversation as _tool_get_conversation,
)

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def run_command(
    db,
    *,
    tenant_id: str,
    text: str,
    mode: str,
    thread_id: str | None = None,
    preferred_channel: str | None = None,
    runtime: RuntimeConfig | None = None,
    client_ref: str | None = None,
    user_id: str | None = None,
    session_id: str | None = None,
    time_zone: str | None = None,
) -> dict:
    """One salesperson command through the full loop. Returns the persisted
    operator reply (with steps + action result) and the thread id.

    `client_ref` correlates the live `operator.step` events (streamed as the
    loop runs) back to the dashboard that issued the command, so it can show
    the reasoning happening in real time.
    """
    # Resolved before anything is written: on vLLM this raises when the runtime
    # is missing, and it should do so without having created a thread first.
    model = _resolve_agent_model(runtime)

    state = OperatorState(
        tenant_id=tenant_id,
        text=text,
        mode=mode,
        requested_thread_id=thread_id,
        preferred_channel=preferred_channel,
        runtime=runtime,
        client_ref=client_ref,
        user_id=user_id,
        session_id=session_id,
        time_zone=time_zone,
        model=model,
        deadline_at=_now() + timedelta(seconds=settings.operator_deadline_seconds),
    )

    # Identity before state: the checkpointer is keyed on the thread, so the
    # thread has to exist before the run that would be checkpointed under it.
    state.thread_id = str(await resolve_thread(db, state))

    await get_checkpointer().ensure_indexes()

    final = await OPERATOR_GRAPH.ainvoke(
        state,
        context=GraphContext(db=db),
        config={
            "recursion_limit": RECURSION_LIMIT,
            "configurable": {"thread_id": state.thread_id},
        },
    )
    return {"thread_id": state.thread_id, "message": final["reply"]}
