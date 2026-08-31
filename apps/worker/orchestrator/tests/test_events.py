"""Event bus: envelope shape, failure tolerance, and the fan-in points."""
from __future__ import annotations

import json

import pytest

from app.stores import events


class FakePubSub:
    """Serves a scripted list of get_message() returns, then idles (None)."""

    def __init__(self, messages: list[dict | None]):
        self._messages = list(messages)
        self.subscribed: list[str] = []
        self.closed = False

    async def subscribe(self, channel: str):
        self.subscribed.append(channel)

    async def get_message(self, ignore_subscribe_messages=True, timeout=None):
        if self._messages:
            return self._messages.pop(0)
        return None  # idle — the store must treat this as a heartbeat, not EOF

    async def aclose(self):
        self.closed = True


class FakeRedis:
    """Captures publishes; optionally raises to simulate the bus being down."""

    def __init__(self, down: bool = False, pubsub_messages: list | None = None):
        self.down = down
        self.published: list[tuple[str, dict]] = []
        self._pubsub_messages = pubsub_messages or []
        self.pubsub_instance: FakePubSub | None = None

    async def publish(self, channel: str, payload: str):
        if self.down:
            raise ConnectionError("bus down")
        self.published.append((channel, json.loads(payload)))

    async def ping(self):
        if self.down:
            raise ConnectionError("bus down")
        return True

    def pubsub(self):
        self.pubsub_instance = FakePubSub(self._pubsub_messages)
        return self.pubsub_instance


@pytest.fixture()
def bus():
    fake = FakeRedis()
    events.set_client(fake)
    yield fake
    events.set_client(None)


@pytest.fixture()
def bus_down():
    fake = FakeRedis(down=True)
    events.set_client(fake)
    yield fake
    events.set_client(None)


async def test_publish_wraps_event_envelope(bus):
    ok = await events.publish("redape", "message.created", {"conversation_id": "abc"})
    assert ok is True
    channel, event = bus.published[0]
    assert channel == "redape:events:redape"
    assert event["type"] == "message.created"
    assert event["tenant_id"] == "redape"
    assert event["data"] == {"conversation_id": "abc"}
    assert "ts" in event


async def test_publish_never_raises_when_bus_is_down(bus_down):
    ok = await events.publish("redape", "message.created", {})
    assert ok is False  # logged + swallowed — a dead bus must not break turns


async def test_subscribe_yields_events_then_heartbeats_when_idle():
    # one real event, then the fake pubsub returns None forever (idle bus)
    event = {"type": "message.created", "tenant_id": "redape", "data": {}}
    fake = FakeRedis(pubsub_messages=[{"type": "message", "data": json.dumps(event)}])
    events.set_client(fake)
    try:
        seen = []
        async for item in events.subscribe("redape"):
            seen.append(item)
            if len(seen) >= 3:  # the event, then two idle heartbeats
                break
        assert seen[0]["type"] == "message.created"
        assert seen[1] is None  # idle no longer crashes — it heartbeats
        assert seen[2] is None
        assert fake.pubsub_instance.subscribed == ["redape:events:redape"]
    finally:
        events.set_client(None)


async def test_ping_reflects_bus_state(bus, bus_down):
    # NB: bus_down was set last, so the module client is the down one
    assert await events.ping() is False
    events.set_client(FakeRedis())
    assert await events.ping() is True
    events.set_client(None)


# --------------------------------------------------------------------------- #
# Fan-in: the pipeline and agent actually publish
# --------------------------------------------------------------------------- #
async def test_turn_pipeline_publishes_inbound_event(db, llm, retrieval, bus):
    from tests.conftest import make_envelope
    from app.engine.pipeline import run_turn

    await run_turn(make_envelope())
    types = [e["type"] for _, e in bus.published]
    assert "message.created" in types
    created = next(e for _, e in bus.published if e["type"] == "message.created")
    assert created["data"]["direction"] == "inbound"
    assert created["data"]["channel"] == "whatsapp"


async def test_operator_agent_publishes_action_and_thread_events(db, bus, monkeypatch):
    import json as _json
    from app.llm import gateway
    from app.llm.gateway import LLMCallStats
    from app.operator import agent
    from tests.test_operator_agent import seed_contact

    contact = await seed_contact(db)
    outputs = [
        _json.dumps(
            {
                "thought": "send",
                "tool": "send_message",
                "args": {
                    "contact_id": str(contact["_id"]),
                    "channel": "whatsapp",
                    "text": "Hi!",
                },
            }
        ),
        _json.dumps({"thought": "done", "operator_output": "Drafted."}),
    ]

    async def scripted(*, model, messages, temperature=0.3):
        return outputs.pop(0), LLMCallStats()

    monkeypatch.setattr(gateway, "chat_text", scripted)
    await agent.run_command(db, tenant_id="redape", text="say hi", mode="copilot")

    types = [e["type"] for _, e in bus.published]
    assert "message.created" in types
    assert "operator.updated" in types
    msg_event = next(e for _, e in bus.published if e["type"] == "message.created")
    assert msg_event["data"]["status"] == "draft"
