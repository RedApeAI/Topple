"""The tools the Operator agent can call, and the dispatch that runs them.

Split out of `agent.py` so the operator graph can import them without a cycle
(`agent` imports the compiled graph; the graph imports these).

`send_message` is the only one that acts. Everything else reads.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId

from ..engine import contacts as contacts_engine
from ..engine import recipients as recipients_engine
from ..engine.addressability import is_unreachable
from ..engine.identity import channel_for_address
from ..mcp import client as mcp_client
from ..outbound import dispatcher
from ..playbooks.loader import PlaybookNotFound, load_playbook
from ..schemas.envelope import RuntimeConfig
from ..graph import egress

logger = logging.getLogger(__name__)

ACTION_CHANNELS = ("whatsapp", "email", "voice", "instagram")


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- #
# Read tools
# --------------------------------------------------------------------------- #
async def tool_find_recipient(db, tenant_id: str, args: dict, user_id=None) -> dict:
    """Ranked candidates from the CRM and the user's mailbox, best first.

    Never an error when nothing matches: an empty list plus a note telling the
    model it may address a raw destination directly is more useful than a
    failure, because the command itself often contains the address.
    """
    query = str(args.get("query", "")).strip()
    if not query:
        return {"error": "args.query is required"}

    found = await recipients_engine.find_recipients(db, tenant_id, user_id, query)
    matches = [recipients_engine.public_candidate(c) for c in found]
    if matches:
        return {"matches": matches}

    note = "no contact or past correspondent matches that."
    if channel_for_address(query):
        note += " That looks like an address — you can pass it to send_message as \"to\"."
    else:
        note += " If the command contains an email address or phone number, pass it to send_message as \"to\"; otherwise ask which address to use."
    return {"matches": [], "note": note}


async def tool_get_conversation(db, tenant_id: str, args: dict) -> dict:
    try:
        contact_id = ObjectId(str(args.get("contact_id", "")))
    except (InvalidId, TypeError):
        return {"error": "invalid contact_id — use an id returned by find_contact"}
    query: dict = {"tenant_id": tenant_id, "contact_id": contact_id}
    if args.get("channel"):
        query["channel"] = args["channel"]
    convos = await (
        db.conversations.find(query)
        .sort([("last_message_at", -1), ("_id", -1)])
        .to_list(length=1)
    )
    if not convos:
        return {"conversation": None, "note": "no conversation with this contact yet"}
    convo = convos[0]
    messages = await (
        db.messages.find({"conversation_id": convo["_id"], "status": {"$ne": "discarded"}})
        .sort([("created_at", -1), ("_id", -1)])
        .to_list(length=6)
    )
    contact = await db.contacts.find_one({"_id": contact_id})
    return {
        "conversation": {
            "conversation_id": str(convo["_id"]),
            "channel": convo["channel"],
            "stage": convo.get("stage"),
            "status": convo.get("status"),
            "lead_profile": (contact or {}).get("lead", {}),
            "recent_messages": [
                {"from": "customer" if m["direction"] == "inbound" else "us", "text": m["text"]}
                for m in reversed(messages)
            ],
        }
    }


TOOLS = {
    "get_conversation": tool_get_conversation,
}


async def run_tool(
    db,
    tenant_id: str,
    mode: str,
    runtime: RuntimeConfig | None,
    name: str,
    args: dict,
    sent_keys: set[tuple],
    user_id: str | None = None,
    connector_tools: frozenset[str] = frozenset(),
) -> dict:
    """Dispatch one tool call. `send_message` acts (mode-gated) and is deduped
    so a re-issued identical send returns the prior result instead of firing
    twice; the read tools go through the plain TOOLS map."""
    # "find_contact" is the pre-rename name. The protocol is prompt-engineered
    # rather than schema-enforced, so a model can still emit it from an older
    # thread's context — accept both rather than failing the whole command.
    if name in ("find_recipient", "find_contact"):
        return await tool_find_recipient(db, tenant_id, args, user_id)

    if name == "send_message":
        # A joined string rather than a tuple: these keys are checkpointed now,
        # and a tuple comes back from msgpack as a list, which would stop
        # comparing equal and quietly disable the dedupe.
        key = "\x1f".join(
            (
                str(args.get("contact_id", "") or args.get("to", "")).strip().lower(),
                str(args.get("channel", "")),
                (args.get("text") or "").strip(),
            )
        )
        if key in sent_keys:
            return {"type": "send_message", "status": "duplicate",
                    "note": "already sent this in the current command"}
        result = await execute_send_message(db, tenant_id, mode, runtime, args, user_id)
        if result.get("status") in ("draft", "sent"):
            sent_keys.add(key)
        return result

    tool = TOOLS.get(name)
    if tool is not None:
        return await tool(db, tenant_id, args)

    if name in connector_tools:
        return await mcp_client.call_tool(user_id, name, args, mode)

    return {"error": f"unknown tool {name!r}"}


# --------------------------------------------------------------------------- #
# Action execution
# --------------------------------------------------------------------------- #
def _playbook_for(runtime: RuntimeConfig | None):
    """The playbook whose guardrails apply, or None when there is no runtime.

    A command issued with no runtime gets sanitisation but no forbidden-phrase
    list, because there is no playbook to read one from. That is a real gap and
    logged as one rather than passed over silently.
    """
    if runtime is None:
        logger.info("operator send with no runtime — forbidden-phrase check unavailable")
        return None
    try:
        return load_playbook(runtime.playbook_id, runtime.playbook_version)
    except (PlaybookNotFound, ValueError):
        logger.warning("playbook %r not loadable — guardrails unavailable", runtime.playbook_id)
        return None


def _initial_stage(runtime: RuntimeConfig | None) -> str:
    playbook = _playbook_for(runtime)
    return playbook.initial_stage if playbook is not None else "GREETING"


def _subject_for(action: dict, contact: dict) -> str | None:
    """Subject for an email dispatch.

    The agent may supply one; otherwise fall back to the contact's name so the
    recipient sees something meaningful rather than "(no subject)".
    """
    supplied = str(action.get("subject", "") or "").strip()
    if supplied:
        return supplied
    name = (contact.get("profile") or {}).get("name")
    return f"Message from Plucia{f' for {name}' if name else ''}"


async def execute_send_message(
    db,
    tenant_id: str,
    mode: str,
    runtime: RuntimeConfig | None,
    action: dict,
    user_id: str | None = None,
) -> dict:
    channel = action.get("channel")
    if channel not in ACTION_CHANNELS:
        return {"type": "send_message", "status": "failed", "reason": f"unknown channel {channel!r}"}

    # Everything outward-facing goes through the shared egress checks. This
    # plane used to sanitise and nothing else, so a playbook's forbidden
    # phrases — the ones the turn pipeline blocks — reached the buyer intact
    # whenever the salesperson asked the agent to send instead.
    verdict = egress.check(
        action.get("text") or "",
        policy=egress.OPERATOR_EGRESS,
        playbook=_playbook_for(runtime),
    )
    if verdict.blocked:
        return {"type": "send_message", "status": "failed", "reason": "empty message text"}
    text = verdict.text
    # Two ways to name a recipient. `contact_id` addresses someone already in
    # the CRM; `to` addresses a destination directly — an email address is a
    # complete identity on its own, and requiring a CRM row first is what used
    # to make anyone outside the CRM unreachable.
    raw_contact_id = str(action.get("contact_id", "") or "").strip()
    raw_to = str(action.get("to", "") or "").strip()

    if raw_contact_id:
        try:
            contact_id = ObjectId(raw_contact_id)
        except (InvalidId, TypeError):
            return {"type": "send_message", "status": "failed", "reason": "invalid contact_id"}
        contact = await db.contacts.find_one({"_id": contact_id, "tenant_id": tenant_id})
        if contact is None:
            return {"type": "send_message", "status": "failed", "reason": "contact not found"}
        identity = next(
            (i for i in contact.get("identities", []) if i["channel"] == channel), None
        )
        if identity is None:
            return {
                "type": "send_message",
                "status": "failed",
                "reason": f"contact has no {channel} identity",
            }
    elif raw_to:
        external_id, resolved_name = await recipients_engine.resolve_destination(
            db, tenant_id, user_id, raw_to, channel
        )
        if not external_id:
            return {
                "type": "send_message",
                "status": "failed",
                "reason": f"couldn't work out a {channel} address for {raw_to!r}",
            }
        if is_unreachable(external_id):
            # Last line of defence. The directory no longer offers these, but
            # the model can also read one out of a command or an email body,
            # and a no-reply address accepts mail and discards it — so the
            # salesperson would be told it was sent when nobody will read it.
            return {
                "type": "send_message",
                "status": "failed",
                "reason": (
                    f"{external_id} is an automated no-reply address — nothing "
                    "sent there reaches a person. Ask for a real address."
                ),
            }
        # Creating the contact here is what puts them in the CRM: the
        # conversation needs a contact_id, and a person we just messaged
        # belongs in the CRM by definition.
        try:
            contact = await contacts_engine.resolve_or_create(
                db,
                tenant_id,
                channel,
                external_id,
                name=resolved_name,
                user_id=user_id,
                source="agent",
            )
        except contacts_engine.ContactRaceLost as exc:
            return {"type": "send_message", "status": "failed", "reason": str(exc)}
        contact_id = contact["_id"]
        identity = next(
            (i for i in contact.get("identities", []) if i["channel"] == channel),
            {"channel": channel, "external_id": external_id},
        )
    else:
        return {
            "type": "send_message",
            "status": "failed",
            "reason": "no recipient — pass contact_id or to",
        }

    convos = await (
        db.conversations.find(
            {
                "tenant_id": tenant_id,
                "contact_id": contact_id,
                "channel": channel,
                "status": {"$ne": "closed"},
            }
        )
        .sort([("last_message_at", -1), ("_id", -1)])
        .to_list(length=1)
    )
    if convos:
        convo = convos[0]
    else:
        convo = {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "contact_id": contact_id,
            "channel": channel,
            "stage": _initial_stage(runtime),
            "previous_stage": None,
            "return_stage": None,
            "mode": mode,
            "status": "active",
            "low_confidence_strikes": 0,
            "last_message_at": None,
            "created_at": _now(),
        }
        res = await db.conversations.insert_one(convo)
        convo["_id"] = res.inserted_id

    # Same invariant as the turn pipeline: a guardrail violation forces a draft
    # regardless of mode. Autopilot means "you may send without asking", not
    # "you may send anything".
    status = egress.decide_status(
        mode, policy=egress.OPERATOR_EGRESS, forced_draft=verdict.forced_draft
    )
    message = {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "conversation_id": convo["_id"],
        "direction": "outbound",
        "text": text,
        "status": status,
        "created_at": _now(),
    }
    ins = await db.messages.insert_one(message)
    await db.conversations.update_one(
        {"_id": convo["_id"]}, {"$set": {"last_message_at": _now()}}
    )
    await contacts_engine.touch_contacted(db, contact_id)
    if status == "sent":
        await dispatcher.dispatch(
            tenant_id=tenant_id,
            user_id=user_id,
            channel=channel,
            to=identity["external_id"],
            conversation_id=str(convo["_id"]),
            messages=[text],
            subject=_subject_for(action, contact),
        )
    return {
        "type": "send_message",
        "status": status,
        "message_id": str(ins.inserted_id),
        "conversation_id": str(convo["_id"]),
        "contact_id": str(contact_id),
        "contact_name": (contact.get("profile") or {}).get("name")
        or identity["external_id"],
        "channel": channel,
        "text": text,
    }
