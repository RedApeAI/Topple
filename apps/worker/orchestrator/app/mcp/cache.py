"""Cache for MCP tool discovery.

`tools/list` is a full round trip — orchestrator → BFF → per-user connector
introspection — and it runs before *every* Operator prompt is assembled, on the
critical path of every command. The answer changes only when the user connects
or disconnects something, so a short TTL buys most of the latency back while
keeping "a connector granted a moment ago is usable immediately" close enough
to true.

Two degradations, both deliberate, both matching how the directory cache
behaves:

- Dragonfly unreachable → live discovery. A slow answer beats a broken one.
- Live discovery failed → the built-in toolset, exactly as before.

The second is why failures are not cached. `list_tools` returns `[]` both for
"this user has no connectors" and for "the BFF is down", and caching the latter
would extend a 2-second outage into a 60-second one for every command. Only
*successful* discovery is written, which is why this module needs the
success/failure distinction that `list_tools` alone does not expose.
"""
from __future__ import annotations

import asyncio
import json
import logging

from ..stores import events

logger = logging.getLogger(__name__)

KEY_PREFIX = "plucia:mcp:tools"
#: Short on purpose. This trades "a connector connected in the last minute may
#: not appear yet" for removing a network round trip from every command.
TTL_SECONDS = 60
#: The cache must never become the thing that makes a command slow.
OP_TIMEOUT_SECONDS = 2.0


def key_for(user_id: str, mode: str | None) -> str:
    # Mode is part of the key because the BFF binds a different toolset per
    # mode — copilot's calendar tools do not notify anyone, autopilot's do.
    # One cache entry for both would hand autopilot's toolset to copilot.
    return f"{KEY_PREFIX}:{user_id}:{mode or 'none'}"


async def read(user_id: str, mode: str | None) -> list[dict] | None:
    """Cached tools, or None for a miss *or* an unreachable cache."""
    try:
        raw = await asyncio.wait_for(
            events.get_client().get(key_for(user_id, mode)),
            timeout=OP_TIMEOUT_SECONDS,
        )
    except Exception as exc:  # noqa: BLE001 — a miss and an outage are the same to us
        logger.warning("MCP tool cache unreadable (is Dragonfly up?): %s", exc)
        return None
    if raw is None:
        return None
    try:
        tools = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        logger.warning("dropping malformed MCP tool cache entry")
        return None
    return tools if isinstance(tools, list) else None


async def write(user_id: str, mode: str | None, tools: list[dict]) -> bool:
    """Store a *successful* discovery result. Empty is a valid answer here —
    it means the user genuinely has no connectors, which callers establish
    before calling this."""
    try:
        await asyncio.wait_for(
            events.get_client().set(
                key_for(user_id, mode),
                json.dumps(tools, default=str),
                ex=TTL_SECONDS,
            ),
            timeout=OP_TIMEOUT_SECONDS,
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("MCP tool cache unwritable: %s", exc)
        return False


async def invalidate(user_id: str, mode: str | None = None) -> None:
    """Drop cached tools for a user. With no mode, drops every mode's entry —
    connecting a connector changes both."""
    modes = [mode] if mode else ["copilot", "autopilot", None]
    try:
        await asyncio.wait_for(
            events.get_client().delete(*(key_for(user_id, m) for m in modes)),
            timeout=OP_TIMEOUT_SECONDS,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("MCP tool cache invalidate failed: %s", exc)
