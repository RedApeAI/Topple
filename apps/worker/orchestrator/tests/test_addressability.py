"""Robot addresses are never offered as people, and never messaged.

The failure this exists for: asked to schedule with "Ariyaman", the agent
offered two candidates — the real `ariyaman@redape.com`, and "Ariyaman Debnath"
at `drive-shares-dm-noreply@google.com`. The second is Google Drive's
share-notification sender; Drive puts the *sharer's* display name in the From
header, so the mailbox harvest learned a real person's name against an address
that discards everything sent to it.

Worse than noise: a no-reply address accepts the message, so the salesperson
would be told their mail was sent when nobody will ever read it.
"""
from __future__ import annotations

import json

import pytest

from app.engine.addressability import is_unreachable, reachable
from app.engine import recipients
from app.llm import gateway
from app.llm.gateway import LLMCallStats
from app.operator import agent
from app.outbound import dispatcher
from app.stores import directory

DRIVE_NOREPLY = "drive-shares-dm-noreply@google.com"


# --------------------------------------------------------------------------- #
# The rule
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "address",
    [
        DRIVE_NOREPLY,
        "noreply@github.com",
        "no-reply@slack.com",
        "no_reply@example.com",
        "no.reply@example.com",
        "noreply+build123@ci.example.com",
        "DoNotReply@microsoft.com",
        "mailer-daemon@googlemail.com",
        "postmaster@example.com",
        "bounces@sendgrid.net",
        "notifications@github.com",
        "unsubscribe@newsletter.example",
    ],
)
def test_automated_senders_are_unreachable(address):
    assert is_unreachable(address)


@pytest.mark.parametrize(
    "address",
    [
        "ariyaman@redape.com",
        # Shared mailboxes real people answer — filtering these would break
        # ordinary sales correspondence, which is why the rule is narrow.
        "support@acme.com",
        "sales@acme.com",
        "hello@startup.io",
        "billing@vendor.com",
        "info@agency.co",
        # Innocents a substring match would have taken with it.
        "bouncer@club.com",
        "daemonic.jones@example.com",
        "notifyme@personal.com",
    ],
)
def test_real_mailboxes_are_left_alone(address):
    assert not is_unreachable(address)


def test_malformed_input_is_not_unreachable():
    """A non-address is somebody else's problem to reject, not this rule's."""
    assert not is_unreachable("")
    assert not is_unreachable(None)
    assert not is_unreachable("not-an-address")


def test_reachable_filters_a_directory():
    entries = [{"email": "a@redape.com"}, {"email": DRIVE_NOREPLY}]
    assert [e["email"] for e in reachable(entries)] == ["a@redape.com"]


# --------------------------------------------------------------------------- #
# It never reaches the pick-list
# --------------------------------------------------------------------------- #
async def test_the_drive_robot_is_not_offered_as_a_candidate(db, monkeypatch):
    """The exact transcript that prompted this."""
    async def harvested(tenant_id, user_id):
        return [
            {"email": DRIVE_NOREPLY, "name": "Ariyaman Debnath",
             "sent": 0, "received": 4, "lastSeen": "2026-08-15T10:00:00+00:00"},
            {"email": "ariyaman@redape.com", "name": "Ariyaman",
             "sent": 2, "received": 1, "lastSeen": "2026-08-10T10:00:00+00:00"},
        ]

    monkeypatch.setattr(directory, "entries_for", harvested)
    found = await recipients.find_recipients(db, "redape", "u1", "Ariyaman")

    addresses = [c["id"] for m in found for c in m["channels"]]
    assert DRIVE_NOREPLY not in addresses
    assert addresses == ["ariyaman@redape.com"], "one real Ariyaman, no ambiguity"


async def test_a_genuine_ambiguity_is_still_offered(db, monkeypatch):
    """The filter must not collapse real choices into a false certainty."""
    async def harvested(tenant_id, user_id):
        return [
            {"email": "ariyaman.a@redape.com", "name": "Ariyaman A",
             "sent": 1, "received": 0, "lastSeen": "2026-08-15T10:00:00+00:00"},
            {"email": "ariyaman.b@acme.com", "name": "Ariyaman B",
             "sent": 1, "received": 0, "lastSeen": "2026-08-14T10:00:00+00:00"},
        ]

    monkeypatch.setattr(directory, "entries_for", harvested)
    found = await recipients.find_recipients(db, "redape", "u1", "Ariyaman")
    assert len(found) == 2


# --------------------------------------------------------------------------- #
# And it can never be messaged
# --------------------------------------------------------------------------- #
async def test_sending_to_a_noreply_address_fails_rather_than_silently_vanishing(
    db, monkeypatch
):
    """Last line of defence: the model can read an address out of a command or
    an email body, not just the directory."""
    sent: list[dict] = []

    async def capture(**kwargs):
        sent.append(kwargs)

    async def no_mailbox(tenant_id, user_id):
        return []

    outputs = [
        json.dumps({"thought": "send", "tool": "send_message",
                    "args": {"to": DRIVE_NOREPLY, "channel": "email", "text": "hi"}}),
        json.dumps({"thought": "done", "operator_output": "Handled."}),
    ]

    async def chat(*, model, messages, temperature=0.3):
        return outputs.pop(0), LLMCallStats()

    monkeypatch.setattr(dispatcher, "dispatch", capture)
    monkeypatch.setattr(directory, "entries_for", no_mailbox)
    monkeypatch.setattr(gateway, "chat_text", chat)

    result = await agent.run_command(
        db, tenant_id="redape", text=f"email {DRIVE_NOREPLY}", mode="autopilot"
    )

    action = result["message"]["action"]
    assert action["status"] == "failed"
    assert "no-reply" in action["reason"]
    assert sent == [], "nothing may be dispatched to an address that discards it"
