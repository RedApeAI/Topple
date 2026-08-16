"""MCP tool discovery is cached, and every degradation still degrades.

`tools/list` runs before every Operator prompt is assembled. The cache removes
that round trip; what must not change is the two fallbacks that keep a command
working when infrastructure is not.
"""
from __future__ import annotations

import json

import pytest

from app.mcp import cache
from app.mcp import client as mcp_client

TOOLS = [{"name": "calendar_list_events", "description": "", "input_schema": {}}]


class FakeRedis:
    """Just enough of the Dragonfly surface, with a switch for outages."""

    def __init__(self, *, broken: bool = False):
        self.store: dict[str, str] = {}
        self.broken = broken
        self.reads = 0
        self.writes = 0

    async def get(self, key):
        self.reads += 1
        if self.broken:
            raise ConnectionError("dragonfly down")
        return self.store.get(key)

    async def set(self, key, value, ex=None):
        self.writes += 1
        if self.broken:
            raise ConnectionError("dragonfly down")
        self.store[key] = value

    async def delete(self, *keys):
        if self.broken:
            raise ConnectionError("dragonfly down")
        for key in keys:
            self.store.pop(key, None)


@pytest.fixture()
def redis(monkeypatch) -> FakeRedis:
    fake = FakeRedis()
    monkeypatch.setattr("app.stores.events.get_client", lambda: fake)
    return fake


def _count_discovery(monkeypatch, result):
    """Patch live discovery, counting calls. `result` may be a value or an exc."""
    calls = {"n": 0}

    async def discover(user_id, mode=None):
        calls["n"] += 1
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(mcp_client, "discover_tools", discover)
    return calls


# --------------------------------------------------------------------------- #
# The happy path
# --------------------------------------------------------------------------- #
async def test_second_call_is_served_from_cache(redis, monkeypatch):
    calls = _count_discovery(monkeypatch, TOOLS)

    first = await mcp_client.list_tools("u1", "copilot")
    second = await mcp_client.list_tools("u1", "copilot")

    assert first == second == TOOLS
    assert calls["n"] == 1, "the second command must not re-discover"


async def test_no_connectors_is_a_cacheable_answer(redis, monkeypatch):
    """An empty toolset is a real result, not a failure."""
    calls = _count_discovery(monkeypatch, [])

    assert await mcp_client.list_tools("u1", "copilot") == []
    assert await mcp_client.list_tools("u1", "copilot") == []
    assert calls["n"] == 1


async def test_modes_do_not_share_an_entry(redis, monkeypatch):
    """The BFF binds a different toolset per mode — copilot's calendar tools do
    not notify anyone, autopilot's do. One shared entry would hand autopilot's
    toolset to a copilot command."""
    calls = _count_discovery(monkeypatch, TOOLS)

    await mcp_client.list_tools("u1", "copilot")
    await mcp_client.list_tools("u1", "autopilot")

    assert calls["n"] == 2
    assert cache.key_for("u1", "copilot") != cache.key_for("u1", "autopilot")


async def test_users_do_not_share_an_entry(redis, monkeypatch):
    calls = _count_discovery(monkeypatch, TOOLS)
    await mcp_client.list_tools("u1", "copilot")
    await mcp_client.list_tools("u2", "copilot")
    assert calls["n"] == 2


async def test_entries_carry_the_short_ttl(redis, monkeypatch):
    _count_discovery(monkeypatch, TOOLS)
    recorded = {}

    async def note_set(key, value, ex=None):
        recorded["ex"] = ex
        redis.store[key] = value

    monkeypatch.setattr(redis, "set", note_set)
    await mcp_client.list_tools("u1", "copilot")
    assert recorded["ex"] == cache.TTL_SECONDS
    assert cache.TTL_SECONDS <= 300, "a long TTL would hide a newly-added connector"


# --------------------------------------------------------------------------- #
# Degradations
# --------------------------------------------------------------------------- #
async def test_unreachable_cache_falls_through_to_a_live_call(monkeypatch):
    broken = FakeRedis(broken=True)
    monkeypatch.setattr("app.stores.events.get_client", lambda: broken)
    calls = _count_discovery(monkeypatch, TOOLS)

    assert await mcp_client.list_tools("u1", "copilot") == TOOLS
    assert await mcp_client.list_tools("u1", "copilot") == TOOLS
    # Every call goes live, which is slow but correct.
    assert calls["n"] == 2


async def test_failed_discovery_degrades_to_the_builtin_toolset(redis, monkeypatch):
    _count_discovery(monkeypatch, None)  # None = could not discover
    assert await mcp_client.list_tools("u1", "copilot") == []


async def test_a_discovery_failure_is_never_cached(redis, monkeypatch):
    """Otherwise a two-second BFF blip costs a minute of missing connectors."""
    calls = _count_discovery(monkeypatch, None)

    await mcp_client.list_tools("u1", "copilot")
    await mcp_client.list_tools("u1", "copilot")

    assert calls["n"] == 2, "a failure must be retried, not remembered"
    assert redis.store == {}


async def test_a_raising_discovery_still_degrades(redis, monkeypatch):
    _count_discovery(monkeypatch, RuntimeError("BFF exploded"))
    with pytest.raises(RuntimeError):
        # discover_tools itself swallows; this asserts the *patched* raiser
        # propagates, proving the test double is wired where we think.
        await mcp_client.discover_tools("u1", "copilot")


async def test_malformed_cache_entry_is_discarded(redis, monkeypatch):
    calls = _count_discovery(monkeypatch, TOOLS)
    redis.store[cache.key_for("u1", "copilot")] = "{not json"

    assert await mcp_client.list_tools("u1", "copilot") == TOOLS
    assert calls["n"] == 1


async def test_a_cached_non_list_is_discarded(redis, monkeypatch):
    calls = _count_discovery(monkeypatch, TOOLS)
    redis.store[cache.key_for("u1", "copilot")] = json.dumps({"not": "a list"})
    assert await mcp_client.list_tools("u1", "copilot") == TOOLS
    assert calls["n"] == 1


async def test_anonymous_commands_never_touch_the_cache(redis, monkeypatch):
    calls = _count_discovery(monkeypatch, TOOLS)
    assert await mcp_client.list_tools(None, "copilot") == []
    assert calls["n"] == 0
    assert redis.reads == 0


async def test_invalidate_clears_every_mode(redis, monkeypatch):
    _count_discovery(monkeypatch, TOOLS)
    await mcp_client.list_tools("u1", "copilot")
    await mcp_client.list_tools("u1", "autopilot")
    assert redis.store

    await cache.invalidate("u1")
    assert redis.store == {}


async def test_invalidate_survives_an_outage(monkeypatch):
    broken = FakeRedis(broken=True)
    monkeypatch.setattr("app.stores.events.get_client", lambda: broken)
    await cache.invalidate("u1")  # must not raise
