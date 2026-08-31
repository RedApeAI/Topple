"""What the Operator loop needs in order to talk to the model: the system
prompt, the thread state replayed into it, and the fallback wording used when
the model's own report is unusable.

Split out of `agent.py` alongside `tools.py` so the operator graph can import
it without a cycle.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from bson import ObjectId

from ..llm import gateway
from ..schemas.envelope import RuntimeConfig

logger = logging.getLogger(__name__)

# Resolve -> get_conversation -> send -> report already costs 4; a
# disambiguation round trip used to overrun the old budget of 6.
MAX_STEPS = 8
HISTORY_WINDOW = 12


class ThreadNotFound(Exception):
    pass


def now_for_prompt(time_zone: str | None) -> str:
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


def connector_tool_block(tools: list[dict]) -> str:
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
You are RedApeAI Operator, an AI sales operator working FOR a salesperson — you \
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
- A timestamp ending in "Z" in a tool result is UTC, NOT the salesperson's \
local time. Never compare it against their clock or read it back to them \
without converting. Where a tool gives you a local rendering or a "label", use \
that and do no arithmetic of your own.
- Read availability results literally. If a tool says a window is free, it is \
free — do not tell the salesperson they are busy because a timestamp looked \
unfamiliar. When the time they asked for is available, book it and report \
what you booked; do not offer alternatives to a time that was never blocked.
- Mode is "{mode}": in copilot your send_message becomes a DRAFT awaiting \
approval (report it that way); in autopilot it is sent immediately. The \
salesperson's channel picker is currently "{preferred_channel}" — treat it as \
the default when the recipient has that channel.
"""


def resolve_agent_model(runtime: RuntimeConfig | None) -> str:
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
# Thread state replayed into the prompt
# --------------------------------------------------------------------------- #
_CHANNEL_WORDS = {
    "whatsapp": "WhatsApp",
    "email": "email",
    "voice": "phone",
    "instagram": "Instagram",
}


def fallback_report(action_result: dict | None) -> str:
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


async def last_candidates(db, thread_id: ObjectId) -> list[dict]:
    """The candidate list this thread was last shown.

    Without this, offering a numbered pick-list is a dead end: `thread_history`
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


def candidates_block(candidates: list[dict]) -> str:
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


async def thread_history(db, thread_id: ObjectId) -> list[dict]:
    docs = await (
        db.operator_messages.find({"thread_id": thread_id})
        .sort([("created_at", -1), ("_id", -1)])
        .to_list(length=HISTORY_WINDOW)
    )
    return [
        {"role": "user" if d["role"] == "user" else "assistant", "content": d["text"]}
        for d in reversed(docs)
    ]
