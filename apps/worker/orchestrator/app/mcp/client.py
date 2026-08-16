"""MCP client for the connectors the BFF exposes.

The BFF hosts the MCP server because it — and only it — holds the users' OAuth
grants. This service connects as a client, naming the user it acts for; the
shared secret is what makes that name trustworthy.

Connectors are discovered at runtime rather than compiled in: whatever tools
the server advertises for that user become tools the Operator agent can call.
A user who hasn't connected Calendar simply sees no calendar tools, so the
model is never offered something that would fail.

Every failure here is soft. A connector outage must degrade the agent to its
built-in tools, never break the command.
"""
from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from mcp import ClientSession
from mcp.client.streamable_http import create_mcp_http_client, streamable_http_client

from ..config import settings
from . import cache

logger = logging.getLogger(__name__)

T = TypeVar("T")

# A tool call reaches a third-party API (Google) through two hops, so it needs
# more headroom than a plain BFF call.
TIMEOUT_SECONDS = 60.0


def _endpoint() -> str | None:
    if not settings.bff_base_url:
        return None
    return f"{settings.bff_base_url.rstrip('/')}/api/v1/mcp"


def _headers(user_id: str, mode: str | None = None) -> dict[str, str]:
    headers = {"X-Plucia-User-Id": user_id}
    # Mode travels as a header so the server can bind what a tool may do —
    # notifying external people is gated there, not by anything the model says.
    if mode:
        headers["X-Plucia-Mode"] = mode
    if settings.outbound_webhook_secret:
        headers["X-Outbound-Secret"] = settings.outbound_webhook_secret
    return headers


async def _with_session(
    user_id: str,
    run: Callable[[ClientSession], Awaitable[T]],
    mode: str | None = None,
) -> T | None:
    """Open one short-lived MCP session and hand it to `run`.

    The callback shape is not incidental. MCP's transports are anyio task
    groups, and a cancel scope must be exited by the task that entered it — so
    wrapping these context managers in an object with `__aenter__`/`__aexit__`
    raises "Attempted to exit cancel scope in a different task" during teardown,
    which a broad `except` then silently turns into an empty tool list. Keeping
    the whole lifecycle inside a single `async with` chain avoids that entirely.

    The server is stateless, so nothing is lost by not pooling — and a per-call
    session means a connector granted seconds ago works on the next call.
    """
    url = _endpoint()
    if not url:
        logger.debug("BFF_BASE_URL not configured — MCP connectors disabled")
        return None

    async with create_mcp_http_client(headers=_headers(user_id, mode)) as http:
        # mcp 2.x yields a 2-tuple here; older releases yielded a third
        # session-id getter, which this deployment does not use anyway.
        async with streamable_http_client(url, http_client=http) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                return await run(session)


async def discover_tools(user_id: str, mode: str | None = None) -> list[dict] | None:
    """One live `tools/list` round trip.

    Returns the tool list on success — including `[]`, which legitimately means
    "this user has connected nothing". Returns **None** when discovery could
    not be performed at all: the BFF is unconfigured or unreachable.

    That distinction is the whole point of splitting this out of `list_tools`.
    Both cases used to collapse to `[]`, and caching the failure would turn a
    brief BFF outage into a minute of every command silently losing its
    connectors.
    """
    async def _list(session: ClientSession) -> list[dict]:
        result = await session.list_tools()
        return [
            {
                "name": tool.name,
                "description": tool.description or "",
                "input_schema": tool.input_schema or {},
            }
            for tool in result.tools
        ]

    try:
        return await _with_session(user_id, _list, mode)
    except Exception as exc:  # noqa: BLE001 — connectors are optional
        logger.warning("MCP tool discovery failed for user=%s: %s", user_id, exc)
        return None


async def list_tools(user_id: str | None, mode: str | None = None) -> list[dict]:
    """Tools this user's connectors expose, as JSON-schema descriptors.

    Cached per (user, mode) for a short TTL — this runs before every Operator
    prompt is assembled, and the answer only changes when someone connects or
    disconnects a connector.

    Returns [] when nothing is connected, when the BFF is unreachable, or when
    the server advertises no tool capability at all — the last of which is a
    normal `Method not found`, not an error worth surfacing.
    """
    if not user_id:
        return []

    cached = await cache.read(user_id, mode)
    if cached is not None:
        return cached

    tools = await discover_tools(user_id, mode)
    if tools is None:
        # Discovery failed. Degrade to the built-in toolset exactly as before,
        # and cache nothing — see the note in `cache`.
        return []

    await cache.write(user_id, mode, tools)
    return tools


def _flatten(result: Any) -> Any:
    """MCP returns content blocks; ours are JSON strings. Parse where we can so
    the agent sees structured data rather than a string containing JSON."""
    if getattr(result, "structuredContent", None):
        return result.structuredContent

    texts: list[str] = []
    for block in getattr(result, "content", []) or []:
        text = getattr(block, "text", None)
        if text:
            texts.append(text)
    if not texts:
        return {"ok": True}

    joined = "\n".join(texts)
    try:
        return json.loads(joined)
    except (json.JSONDecodeError, TypeError):
        return {"text": joined}


async def call_tool(
    user_id: str | None, name: str, arguments: dict, mode: str | None = None
) -> dict:
    """Invoke one connector tool. Never raises — a failure is an observation the
    agent can reason about and report, not a crashed command."""
    if not user_id:
        return {"error": "no signed-in user for this command"}
    async def _call(session: ClientSession) -> dict:
        result = await session.call_tool(name, arguments)
        payload = _flatten(result)
        if getattr(result, "isError", False):
            # The tool ran and refused; surface why so the agent can adapt.
            if isinstance(payload, dict) and "error" in payload:
                return payload
            return {"error": payload}
        return payload if isinstance(payload, dict) else {"result": payload}

    try:
        outcome = await _with_session(user_id, _call, mode)
        if outcome is None:
            return {"error": "connectors are not configured on this deployment"}
        return outcome
    except Exception as exc:  # noqa: BLE001
        logger.warning("MCP tool %r failed for user=%s: %s", name, user_id, exc)
        return {"error": f"{name} is unavailable right now"}
