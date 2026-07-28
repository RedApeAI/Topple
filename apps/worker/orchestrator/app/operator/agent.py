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

from bson import ObjectId
from bson.errors import InvalidId

from ..llm import gateway
from ..llm.gateway import _parse_json_block
from ..outbound import dispatcher
from ..playbooks.loader import PlaybookNotFound, load_playbook
from ..schemas.envelope import RuntimeConfig

logger = logging.getLogger(__name__)

MAX_STEPS = 5
HISTORY_WINDOW = 12
ACTION_CHANNELS = ("whatsapp", "email", "voice", "instagram")


class ThreadNotFound(Exception):
    pass

SYSTEM_PROMPT = """\
You are Plucia Operator, an AI sales operator working FOR a salesperson — you \
are never talking to their customer directly. Read the salesperson's command, \
work out the intent, gather what you need with tools, then act.

Respond with ONLY one JSON object per turn, in exactly one of these shapes:
1. Tool call:
   {{"thought": "<your reasoning>", "tool": "<tool name>", "args": {{...}}}}
2. Clarifying question (a required detail is missing or ambiguous):
   {{"thought": "<why you must ask>", "operator_output": "<ONE short question to the salesperson>", "action": null}}
3. Final answer:
   {{"thought": "<what you decided>", "operator_output": "<brief report to the salesperson>", "action": <action object or null>}}

The only action available:
   {{"type": "send_message", "contact_id": "<id from find_contact>", "channel": "whatsapp|email|voice|instagram", "text": "<the message the customer will receive>"}}

Tools:
- find_contact — args {{"query": "<name, phone, or handle>"}} → CRM contacts matching, with their channels
- get_conversation — args {{"contact_id": "...", "channel": "<optional>"}} → that contact's conversation: stage, recent messages, lead profile

Rules:
- Never invent a contact_id — always find_contact first.
- If several contacts match, or the contact is on several channels and neither \
the command nor the default names one, ask ONE clarifying question instead of \
guessing. The salesperson's channel picker is currently "{preferred_channel}" — \
treat it as the default when the contact has that channel.
- Before messaging a contact who has an existing conversation, call \
get_conversation so your message fits what was already said.
- The customer-facing "text" must read like a warm, brief human sales rep on \
that channel: first person, no meta commentary, no placeholders, at most a \
couple of sentences.
- "operator_output" speaks to the salesperson: short and factual — what you \
did or found, or the one question you need answered.
- Mode is "{mode}": copilot means send_message creates a DRAFT the salesperson \
must approve (phrase your report accordingly); autopilot sends immediately.
"""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _resolve_agent_model(runtime: RuntimeConfig | None) -> str:
    """The agent runs on the BASE instruct model — the sales LoRA adapter is
    the buyer-facing voice, not an instruction-follower."""
    from ..config import settings

    if settings.llm_backend == "vllm":
        if runtime is None:
            raise ValueError("runtime (model_id) is required on the vllm backend")
        return runtime.model_id
    return settings.ollama_model


# --------------------------------------------------------------------------- #
# Tools
# --------------------------------------------------------------------------- #
async def _tool_find_contact(db, tenant_id: str, args: dict) -> dict:
    query = str(args.get("query", "")).strip()
    if not query:
        return {"error": "args.query is required"}
    regex = {"$regex": re.escape(query), "$options": "i"}
    docs = await (
        db.contacts.find(
            {
                "tenant_id": tenant_id,
                "$or": [{"profile.name": regex}, {"identities.external_id": regex}],
            }
        ).to_list(length=5)
    )
    return {
        "matches": [
            {
                "contact_id": str(d["_id"]),
                "name": (d.get("profile") or {}).get("name"),
                "channels": [
                    {"channel": i["channel"], "id": i["external_id"]}
                    for i in d.get("identities", [])
                ],
                "qualification_score": (d.get("lead") or {}).get("qualification_score", 0),
            }
            for d in docs
        ]
    }


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
    "find_contact": _tool_find_contact,
    "get_conversation": _tool_get_conversation,
}


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


async def _execute_send_message(
    db, tenant_id: str, mode: str, runtime: RuntimeConfig | None, action: dict
) -> dict:
    channel = action.get("channel")
    text = (action.get("text") or "").strip()
    if channel not in ACTION_CHANNELS:
        return {"type": "send_message", "status": "failed", "reason": f"unknown channel {channel!r}"}
    if not text:
        return {"type": "send_message", "status": "failed", "reason": "empty message text"}
    try:
        contact_id = ObjectId(str(action.get("contact_id", "")))
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
    if status == "sent":
        await dispatcher.dispatch(
            tenant_id=tenant_id,
            channel=channel,
            to=identity["external_id"],
            conversation_id=str(convo["_id"]),
            messages=[text],
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
) -> dict:
    """One salesperson command through the full loop. Returns the persisted
    operator reply (with steps + action result) and the thread id."""
    model = _resolve_agent_model(runtime)

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
                "title": text[:60],
                "created_at": _now(),
                "last_message_at": _now(),
            }
        )
        tid = res.inserted_id

    history = await _thread_history(db, tid)
    await db.operator_messages.insert_one(
        {
            "tenant_id": tenant_id,
            "thread_id": tid,
            "role": "user",
            "text": text,
            "created_at": _now(),
        }
    )

    # -- the loop -------------------------------------------------------------
    system = SYSTEM_PROMPT.format(
        mode=mode, preferred_channel=preferred_channel or "whatsapp"
    )
    convo: list[dict] = [{"role": "system", "content": system}, *history,
                         {"role": "user", "content": text}]
    steps: list[dict] = []
    operator_output = ""
    action: dict | None = None
    parse_failures = 0

    for _ in range(MAX_STEPS):
        raw, _stats = await gateway.chat_text(model=model, messages=convo)
        try:
            data = _parse_json_block(raw)
        except (ValueError, json.JSONDecodeError):
            parse_failures += 1
            if parse_failures >= 2:
                # twice unparseable — surface the raw text rather than a 500
                operator_output = raw.strip() or "I couldn't process that — try rephrasing?"
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
            steps.append({"type": "thought", "text": thought})

        tool_name = data.get("tool")
        if tool_name:
            tool = TOOLS.get(str(tool_name))
            args = data.get("args") or {}
            if tool is None:
                observation: dict = {"error": f"unknown tool {tool_name!r}"}
            else:
                observation = await tool(db, tenant_id, args)
            steps.append(
                {"type": "tool", "tool": str(tool_name), "args": args, "observation": observation}
            )
            convo.append({"role": "assistant", "content": json.dumps(data)})
            convo.append(
                {"role": "user", "content": f"Tool result:\n{json.dumps(observation, default=str)}"}
            )
            continue

        operator_output = str(data.get("operator_output") or "").strip()
        action = data.get("action") if isinstance(data.get("action"), dict) else None
        break
    else:
        operator_output = (
            "I ran out of steps before finishing — try a more specific command."
        )

    # -- act ------------------------------------------------------------------
    action_result: dict | None = None
    if action is not None:
        if action.get("type") == "send_message":
            action_result = await _execute_send_message(db, tenant_id, mode, runtime, action)
        else:
            action_result = {
                "type": str(action.get("type")),
                "status": "failed",
                "reason": "unsupported action type",
            }
        log = logger.warning if action_result["status"] == "failed" else logger.info
        log("operator action tenant=%s %s", tenant_id, action_result)

    if not operator_output:
        operator_output = "Done." if action_result else "Nothing to do."

    # -- persist reply --------------------------------------------------------
    reply = {
        "tenant_id": tenant_id,
        "thread_id": tid,
        "role": "operator",
        "text": operator_output,
        "steps": steps,
        "action": action_result,
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
    return {"thread_id": str(tid), "message": reply}
