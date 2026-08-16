"""State for the operator graph.

Unlike the turn graph, there is no document this mirrors — the persisted
artefact is one `operator_messages` row, built by the terminal node. So this is
a working state object, and the fields fall into three groups: the command as
issued, what was resolved before the loop started, and what the loop has
accumulated.
"""
from __future__ import annotations

import operator
from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field

from ..schemas.envelope import RuntimeConfig
from .policy import NodeError


#: Sentinel a node returns to clear an accumulating list. Needed because a
#: thread-keyed checkpointer carries channel values from one command into the
#: next, and `conversation`/`steps` are per-command — the reply shows its own
#: steps, not every step the thread has ever taken.
RESET: list[Any] = ["__reset__"]


def _append_or_reset(existing: list[Any], incoming: list[Any]) -> list[Any]:
    if incoming is RESET:
        return []
    return list(existing) + list(incoming)


def _union(existing: list[Any], incoming: list[Any]) -> list[Any]:
    """Set-union that keeps insertion order — a plain `set` would not survive
    checkpoint serialisation cleanly, and order makes the trace readable."""
    merged = list(existing)
    for item in incoming:
        if item not in merged:
            merged.append(item)
    return merged


class OperatorState(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    # ---- the command as issued -------------------------------------------
    tenant_id: str
    text: str
    mode: str
    requested_thread_id: str | None = None
    preferred_channel: str | None = None
    runtime: RuntimeConfig | None = None
    client_ref: str | None = None
    user_id: str | None = None
    session_id: str | None = None
    time_zone: str | None = None

    # ---- resolved before the loop ----------------------------------------
    model: str
    #: Whatever the user's connectors advertise this run. `tool_registry` is
    #: the descriptors the prompt renders; `connector_names` is the set the
    #: dispatcher checks a model-chosen name against.
    tool_registry: list[dict] = Field(default_factory=list)
    #: A list, not a frozenset, for the same serialisation reason. Rebuilt into
    #: a set at the one place that does membership checks.
    connector_names: list[str] = Field(default_factory=list)
    #: The operator thread, as a string. Checkpointed state has to survive
    #: msgpack, and an ObjectId does not — it is re-wrapped at the Mongo
    #: boundary rather than carried as one.
    thread_id: str = ""
    history: list[dict] = Field(default_factory=list)
    prior_candidates: list[dict] = Field(default_factory=list)

    # ---- accumulated by the loop -----------------------------------------
    #: The message list sent to the model. Appended to by both the parse-retry
    #: path and every tool result, so it needs a reducer.
    conversation: Annotated[list[dict], _append_or_reset] = Field(default_factory=list)
    #: The reasoning trace persisted on the reply and streamed live.
    steps: Annotated[list[dict], _append_or_reset] = Field(default_factory=list)
    errors: Annotated[list[NodeError], operator.add] = Field(default_factory=list)

    #: LLM calls made. The budget is counted here rather than through
    #: LangGraph's recursion limit, which would raise instead of letting the
    #: agent report that it ran out of room.
    #: Wall-clock budget. MAX_STEPS bounds how many times the model is asked;
    #: it does not bound how long that takes, and eight steps against a slow
    #: reasoning model is minutes. The router checks both.
    deadline_at: datetime | None = None
    steps_used: int = 0
    parse_failures: int = 0
    #: The reasoning behind the most recent completion, replayed onto the
    #: assistant turn that `run_tool` builds. Last-write, not accumulating —
    #: each step supersedes the previous one, and it never leaves this run.
    last_reasoning: str = ""
    #: What the last model call decided — see `_after_model` in operator_graph.
    pending: dict | None = None

    #: Identical sends, deduped. Set-union rather than last-write: with a
    #: thread-keyed checkpointer these survive across commands in a thread, so
    #: "resend that" a minute later is still caught. Stored as joined strings
    #: because a tuple comes back from msgpack as a list and would stop
    #: comparing equal.
    sent_keys: Annotated[list[str], _union] = Field(default_factory=list)
    #: The most recent find_recipient result, carried onto the reply so the
    #: next turn can resolve "the first one" without re-searching.
    offered_candidates: list[dict] | None = None
    #: Last send_message result — drives the UI.
    action_result: dict | None = None

    operator_output: str = ""
    #: The persisted `operator_messages` row, set by the terminal node.
    reply: dict | None = None
