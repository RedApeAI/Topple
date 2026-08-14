"""The Operator agent plane: salesperson commands → tools → mode-gated action.

The turn pipeline speaks AS the sales persona TO a buyer. This module is the
other side of the product: an agent working FOR the salesperson. It reads a
command ("say hi to Priya Patel"), reasons about intent, gathers what it
needs with tools (find the contact, read their conversation), asks ONE
clarifying question when a required parameter is missing, and finally acts —
in copilot mode any customer-facing message lands as a draft for approval;
in autopilot it dispatches immediately.

Protocol: prompt-engineered JSON (same convention as extraction) rather than
native tool-calling, so it works identically on ollama and vllm backends.
Every step (thought / tool call / observation) is persisted on the operator
message so the UI can show the full reasoning trace.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from bson import ObjectId
from bson.errors import InvalidId

from ..engine import contacts as contacts_engine
from ..engine import recipients as recipients_engine
from ..engine.identity import channel_for_address, normalize
from ..llm import gateway
from ..mcp import client as mcp_client
from ..llm.gateway import _parse_json_block
from ..outbound import dispatcher
from ..playbooks.loader import PlaybookNotFound, load_playbook
from ..schemas.envelope import RuntimeConfig
from ..stores import events
from .sanitize import (
    salvage_operator_output,
    sanitize_customer_text,
    sanitize_operator_output,
)

logger = logging.getLogger(__name__)

# Resolve -> get_conversation -> send -> report already costs 4; a
# disambiguation round trip used to overrun the old budget of 6.
MAX_STEPS = 8
HISTORY_WINDOW = 12
ACTION_CHANNELS = ("whatsapp", "email", "voice", "instagram")


class ThreadNotFound(Exception):
    pass

def _now_for_prompt(time_zone: str | None) -> str:
    """Current time in the salesperson's zone, for resolving "tonight".

    Without this the model has no clock and simply invents a date — one run
    scheduled a meeting for January 2024. The offset is spelled out because a
    naive timestamp is ambiguous to every calendar API.
    """
    zone = timezone.utc
    label = "UTC"
    if time_zone:
        try:
            zone = ZoneInfo(time_zone)
            label = time_zone
        except (ZoneInfoNotFoundError, ValueError):
            logger.info("unknown time zone %r from client; using UTC", time_zone)

    now = datetime.now(zone)
    return f"{now.strftime('%A %d %B %Y, %H:%M')} ({now.isoformat(timespec='seconds')}, {label})"


def _connector_tool_block(tools: list[dict]) -> str:
    """Render discovered MCP tools into the same bullet shape as the built-ins,
    so the model sees one uniform tool list rather than two conventions."""
    lines = []
    for tool in tools:
        params = (tool.get("input_schema") or {}).get("properties") or {}
        required = set((tool.get("input_schema") or {}).get("required") or [])
        arg_desc = ", ".join(
            f'"{name}"{"" if name in required else " (optional)"}'
            for name in params
        )
        lines.append(
            f"- {tool['name']} — args {{{arg_desc}}} → {tool.get('description', '')}"
        )
    return "\n".join(lines)


SYSTEM_PROMPT = """\
You are Plucia Operator, an AI sales operator working FOR a salesperson — you \
are never talking to their customer directly. Read the salesperson's command, \
work out the intent, gather what you need with tools, act with tools, then \
report back.

Respond with ONLY one JSON object per turn, in exactly one of these shapes:
1. Tool call:
   {{"thought": "<your reasoning>", "tool": "<tool name>", "args": {{...}}}}
2. Message to the salesperson — a clarifying question OR your final report:
   {{"thought": "<what you decided>", "operator_output": "<one short question, or a brief report of what you did>"}}

Tools:
- find_recipient — args {{"query": "<name, email, phone, or handle>"}} → ranked \
candidates from the CRM and from people the salesperson has emailed before, \
best match first, then most recently contacted. Each carries a "source" of \
"crm" or "gmail"; only "crm" ones have a contact_id.
- get_conversation — args {{"contact_id": "...", "channel": "<optional>"}} → that contact's conversation: stage, recent messages, lead profile
- send_message — args {{"contact_id": "<id from find_recipient>" OR "to": "<email address or phone number>", "channel": "whatsapp|email|voice|instagram", "text": "<the message the customer will receive>", "subject": "<optional, email only>"}} → in copilot mode creates a DRAFT for the salesperson to approve; in autopilot mode sends it immediately. Returns the result.
{connector_tools}

How to act:
- To contact someone you MUST call the send_message tool — a draft (copilot) or \
a real send (autopilot) only happens THROUGH send_message. Writing the message \
in your thought is NOT drafting it; never claim you drafted or sent anything \
unless send_message has already returned. Do NOT ask permission to send — \
sending IS your job. Only after it returns do you give your final report.
- An email address or phone number IS a valid recipient. If the command \
contains one, pass it straight to send_message as "to" — do not look it up \
first and do not refuse because it is not in the CRM. Someone you message this \
way is added to the CRM automatically.
- Otherwise call find_recipient first. Never invent a contact_id.
- If find_recipient returns exactly one candidate, use it. If it returns \
several, do NOT guess and do NOT ask an open question — list them for the \
salesperson in the order given (most recently contacted first) as a short \
numbered list with each person's name and address, and ask which one. The \
candidates you were shown stay available on the next turn, so "the first one" \
is enough for you to act on.
- If find_recipient returns nothing and the command has no address in it, ask \
the salesperson for the address — once, briefly.
- Before messaging a contact who has an existing conversation, call \
get_conversation so your message fits what was already said.
- The customer-facing "text" must read like a warm, brief human sales rep on \
that channel: first person, no meta commentary, no placeholders, at most a \
couple of sentences.
- "operator_output" speaks to the salesperson: short and factual — what you \
did or found, or the one question you need answered.
- NEVER tell the salesperson that anyone was invited, emailed, notified or \
contacted unless the tool result you just received says so. Tool results carry \
this explicitly — e.g. "notified_attendees": false means NO invitation was \
sent, and you must say so plainly rather than implying it went out. Reporting \
an outward-facing action that did not happen is the worst mistake you can make.
- Right now it is {now}. Resolve every relative time ("tonight", "tomorrow \
at 3", "next Tuesday") against that, and pass timestamps as RFC3339 WITH the \
offset shown there. Never invent a date — if you cannot work one out from the \
command plus the current time, ask.
- Mode is "{mode}": in copilot your send_message becomes a DRAFT awaiting \
approval (report it that way); in autopilot it is sent immediately. The \
salesperson's channel picker is currently "{preferred_channel}" — treat it as \
the default when the recipient has that channel.
"""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _resolve_agent_model(runtime: RuntimeConfig | None) -> str:
    """The agent runs on the BASE instruct model — the sales LoRA adapter is
    the buyer-facing voice, not an instruction-follower.

    Only vLLM has adapters to avoid; every other backend serves one model, and
    `gateway.base_model()` is the single place that knows which.
    """
    from ..config import settings

    if settings.llm_backend == "vllm":
        if runtime is None:
            raise ValueError("runtime (model_id) is required on the vllm backend")
        return runtime.model_id
    return gateway.base_model()


# --------------------------------------------------------------------------- #
# Tools
# --------------------------------------------------------------------------- #
async def _tool_find_recipient(db, tenant_id: str, args: dict, user_id=None) -> dict:
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


async def _tool_get_conversation(db, tenant_id: str, args: dict) -> dict:
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
    "get_conversation": _tool_get_conversation,
}


async def _run_tool(
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
        return await _tool_find_recipient(db, tenant_id, args, user_id)

    if name == "send_message":
        key = (
            str(args.get("contact_id", "") or args.get("to", "")).strip().lower(),
            str(args.get("channel", "")),
            (args.get("text") or "").strip(),
        )
        if key in sent_keys:
            return {"type": "send_message", "status": "duplicate",
                    "note": "already sent this in the current command"}
        result = await _execute_send_message(
            db, tenant_id, mode, runtime, args, user_id
        )
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
def _initial_stage(runtime: RuntimeConfig | None) -> str:
    if runtime is not None:
        try:
            return load_playbook(runtime.playbook_id, runtime.playbook_version).initial_stage
        except (PlaybookNotFound, ValueError):
            logger.warning("playbook %r not loadable — defaulting stage", runtime.playbook_id)
    return "GREETING"


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


async def _execute_send_message(
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
    # guardrail: the customer never sees an id / json / tool name
    text = sanitize_customer_text(action.get("text") or "")
    if not text:
        return {"type": "send_message", "status": "failed", "reason": "empty message text"}
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

    status = "draft" if mode == "copilot" else "sent"
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


# --------------------------------------------------------------------------- #
# The agent loop
# --------------------------------------------------------------------------- #
_CHANNEL_WORDS = {"whatsapp": "WhatsApp", "email": "email", "voice": "phone", "instagram": "Instagram"}


def _fallback_report(action_result: dict | None) -> str:
    """A clean, deterministic report when the model's own wording is unusable
    (leaked internals) or empty."""
    if not action_result:
        return "Done."
    who = action_result.get("contact_name") or "the contact"
    where = _CHANNEL_WORDS.get(action_result.get("channel"), action_result.get("channel") or "")
    status = action_result.get("status")
    if status == "sent":
        return f"Sent your message to {who} on {where}."
    if status == "draft":
        return f"Drafted a message to {who} on {where} for your approval."
    if status == "failed":
        return f"Couldn't send — {action_result.get('reason', 'please try again')}."
    return "Done."


async def _last_candidates(db, thread_id: ObjectId) -> list[dict]:
    """The candidate list this thread was last shown.

    Without this, offering a numbered pick-list is a dead end: `_thread_history`
    carries only `text`, and `sanitize_operator_output` strips every 24-hex
    ObjectId out of that text — so a candidate's id can never survive a round
    trip through the visible conversation. Answering "the first one" would force
    a fresh search that may rank differently.
    """
    doc = await db.operator_messages.find_one(
        {"thread_id": thread_id, "role": "operator", "candidates": {"$ne": None}},
        sort=[("created_at", -1), ("_id", -1)],
    )
    return (doc or {}).get("candidates") or []


def _candidates_block(candidates: list[dict]) -> str:
    """Compact rendering of the last pick-list, injected as a system message."""
    lines = []
    for index, candidate in enumerate(candidates, start=1):
        addresses = ", ".join(
            f"{c['channel']}:{c['id']}" for c in candidate.get("channels", [])
        )
        contact_id = candidate.get("contact_id")
        lines.append(
            f"{index}. {candidate.get('name') or 'unknown'} — {addresses}"
            + (f" (contact_id {contact_id})" if contact_id else "")
        )
    return (
        "Candidates you offered the salesperson last turn, in the order shown. "
        "If they answer with a position (\"the first one\", \"#2\") or a name from "
        "this list, act on it directly — do not search again.\n" + "\n".join(lines)
    )


async def _thread_history(db, thread_id: ObjectId) -> list[dict]:
    docs = await (
        db.operator_messages.find({"thread_id": thread_id})
        .sort([("created_at", -1), ("_id", -1)])
        .to_list(length=HISTORY_WINDOW)
    )
    return [
        {"role": "user" if d["role"] == "user" else "assistant", "content": d["text"]}
        for d in reversed(docs)
    ]


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
    the reasoning happening in real time."""
    model = _resolve_agent_model(runtime)

    # Whatever the user has connected becomes callable this run. Discovery is
    # per command so a connector granted a moment ago is usable immediately,
    # and a connector outage silently degrades to the built-in tools.
    connectors = await mcp_client.list_tools(user_id, mode)
    connector_names = frozenset(tool["name"] for tool in connectors)

    # -- thread + user message ------------------------------------------------
    if thread_id:
        tid = ObjectId(thread_id)
        thread = await db.operator_threads.find_one({"_id": tid, "tenant_id": tenant_id})
        if thread is None:
            raise ThreadNotFound(thread_id)
    else:
        res = await db.operator_threads.insert_one(
            {
                "tenant_id": tenant_id,
                "user_id": user_id,
                "session_id": session_id,
                "title": text[:60],
                "created_at": _now(),
                "last_message_at": _now(),
            }
        )
        tid = res.inserted_id

    history = await _thread_history(db, tid)
    prior_candidates = await _last_candidates(db, tid)
    await db.operator_messages.insert_one(
        {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "session_id": session_id,
            "thread_id": tid,
            "role": "user",
            "text": text,
            "created_at": _now(),
        }
    )

    # -- the loop -------------------------------------------------------------
    system = SYSTEM_PROMPT.format(
        mode=mode,
        preferred_channel=preferred_channel or "whatsapp",
        connector_tools=_connector_tool_block(connectors),
        now=_now_for_prompt(time_zone),
    )
    convo: list[dict] = [{"role": "system", "content": system}]
    if prior_candidates:
        convo.append({"role": "system", "content": _candidates_block(prior_candidates)})
    convo += [*history, {"role": "user", "content": text}]
    steps: list[dict] = []
    # The most recent find_recipient result, carried onto the reply so the next
    # turn can resolve "the first one" without re-searching.
    offered_candidates: list[dict] | None = None
    operator_output = ""
    action_result: dict | None = None  # last send_message result — drives the UI
    sent_keys: set[tuple] = set()  # dedupe identical sends within one run
    parse_failures = 0

    async def emit_step(step: dict) -> None:
        """Record a step and stream it live to the issuing dashboard."""
        steps.append(step)
        await events.publish(
            tenant_id,
            "operator.step",
            {"thread_id": str(tid), "client_ref": client_ref, "step": step},
        )

    for _ in range(MAX_STEPS):
        raw, _stats = await gateway.chat_text(model=model, messages=convo)
        try:
            data = _parse_json_block(raw)
        except (ValueError, json.JSONDecodeError):
            parse_failures += 1
            if parse_failures >= 2:
                # twice unparseable — recover the intended report if the raw
                # carries one, else fall through to the plain text; the final
                # guardrail below scrubs any protocol debris either way, so raw
                # JSON never reaches the salesperson.
                operator_output = salvage_operator_output(raw) or raw.strip()
                break
            convo.append({"role": "assistant", "content": raw})
            convo.append(
                {
                    "role": "user",
                    "content": "That was not valid JSON. Reply with ONLY one JSON object per the protocol.",
                }
            )
            continue

        thought = str(data.get("thought") or "").strip()
        if thought:
            await emit_step({"type": "thought", "text": thought})

        tool_name = data.get("tool")
        if tool_name:
            args = data.get("args") or {}
            observation = await _run_tool(
                db, tenant_id, mode, runtime, str(tool_name), args, sent_keys,
                user_id, connector_names,
            )
            # send_message is the acting tool — its result drives the UI action
            if str(tool_name) == "find_recipient" and observation.get("matches"):
                offered_candidates = observation["matches"]

            if str(tool_name) == "send_message" and observation.get("type") == "send_message":
                action_result = observation
                log = logger.warning if observation["status"] == "failed" else logger.info
                log("operator send tenant=%s %s", tenant_id, observation)
                if observation["status"] in ("draft", "sent"):
                    await events.publish(
                        tenant_id,
                        "message.created",
                        {
                            "conversation_id": observation["conversation_id"],
                            "channel": observation["channel"],
                            "direction": "outbound",
                            "status": observation["status"],
                        },
                    )
            await emit_step(
                {"type": "tool", "tool": str(tool_name), "args": args, "observation": observation}
            )
            convo.append({"role": "assistant", "content": json.dumps(data)})
            convo.append(
                {"role": "user", "content": f"Tool result:\n{json.dumps(observation, default=str)}"}
            )
            continue

        operator_output = str(data.get("operator_output") or "").strip()
        break
    else:
        operator_output = (
            "I ran out of steps before finishing — try a more specific command."
        )

    # guardrail: the salesperson's report never leaks an id / json / tool name.
    # When nothing usable survives, prefer a summary of what actually happened;
    # with no action, a rephrase prompt beats a hollow "Done." for a failed run.
    fallback = (
        _fallback_report(action_result)
        if action_result
        else "I couldn't complete that cleanly — could you rephrase the command?"
    )
    operator_output = sanitize_operator_output(operator_output, fallback)

    # -- persist reply --------------------------------------------------------
    reply = {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "session_id": session_id,
        "thread_id": tid,
        "role": "operator",
        "text": operator_output,
        "steps": steps,
        "action": action_result,
        # Only meaningful when the agent stopped to ask; a completed send needs
        # no pick-list, and keeping a stale one would misdirect the next turn.
        "candidates": offered_candidates if action_result is None else None,
        "created_at": _now(),
    }
    ins = await db.operator_messages.insert_one(reply)
    reply["_id"] = ins.inserted_id
    await db.operator_threads.update_one(
        {"_id": tid}, {"$set": {"last_message_at": _now()}}
    )
    logger.info(
        "operator command tenant=%s thread=%s steps=%d action=%s",
        tenant_id, tid, len(steps),
        (action_result or {}).get("status", "none"),
    )
    await events.publish(tenant_id, "operator.updated", {"thread_id": str(tid)})
    return {"thread_id": str(tid), "message": reply}
