"""FastAPI surface of the blackbox orchestrator.

Everything upstream (the auth/onboarding service) calls `POST /v1/turns` with
a pre-verified OrchestratorInput envelope; the rest of the surface is
observability (turns, conversations, contacts, metrics), the copilot drafts
loop, and the manual contact-bifurcation merge."""
from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Literal

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict

from .config import settings
from .engine import contacts as contacts_engine
from .engine.background import Background
from .engine.pipeline import (
    ScopeDenied,
    TurnInProgress,
    recover_incomplete_turns,
    run_turn,
)
from .llm import gateway
from .llm.gateway import LLMUnavailable
from .operator import agent as operator_agent
from .outbound import dispatcher
from .schemas.envelope import OrchestratorInput, OrchestratorResult, RuntimeConfig
from .stores import directory, events, mongo, qdrant
from .stores.knowledge import KnowledgeScope

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        await mongo.init_indexes()
    except Exception as exc:  # noqa: BLE001 — /health will report the outage
        logger.error("index bootstrap failed (is Mongo up?): %s", exc)
    try:
        # Turns whose post-response work never ran because the process died
        # between the response and the drain. Their result is already
        # persisted, so this finishes the paperwork and sends anything owed.
        await recover_incomplete_turns(mongo.get_db())
    except Exception as exc:  # noqa: BLE001 — never block startup on recovery
        logger.error("turn recovery sweep failed: %s", exc)
    yield


app = FastAPI(title="plucia-orchestrator", version="2.0.0", lifespan=lifespan)

# The dashboard talks REST through its own proxy, but SSE (/v1/events)
# connects straight to this origin — that cross-origin hop needs CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(LLMUnavailable)
async def _llm_unavailable(_req, exc: LLMUnavailable):
    return JSONResponse(status_code=503, content={"error": "llm_unavailable", "detail": str(exc)})


@app.exception_handler(ScopeDenied)
async def _scope_denied(_req, exc: ScopeDenied):
    return JSONResponse(status_code=403, content={"error": "scope_denied", "detail": str(exc)})


@app.exception_handler(TurnInProgress)
async def _turn_in_progress(_req, exc: TurnInProgress):
    return JSONResponse(
        status_code=409,
        content={"error": "turn_in_progress", "detail": f"request_id {exc} is already being processed"},
    )


def _jsonable(value: Any) -> Any:
    """Mongo doc → JSON-safe (ObjectId/datetime to strings)."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        # Mongo returns naive UTC datetimes — mark them UTC so clients
        # don't misparse them as local time
        return value.isoformat() + ("Z" if value.tzinfo is None else "")
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    return value


def _oid(value: str, what: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=404, detail=f"{what} not found") from None


# --------------------------------------------------------------------------- #
# The main endpoint
# --------------------------------------------------------------------------- #
@app.post("/v1/turns", response_model=OrchestratorResult)
async def post_turn(envelope: OrchestratorInput, background_tasks: BackgroundTasks):
    if envelope.message.type != "text":
        raise HTTPException(
            status_code=422,
            detail=f"message.type {envelope.message.type!r} is not implemented yet — only 'text' is supported",
        )

    # The outbound dispatch, the turn document write and the completion event
    # all happen after the response is on the wire. None of them is something
    # the caller waits on for a correct answer, and the dispatch alone is a
    # BFF-to-Gmail round trip.
    deferred = Background()
    result = await run_turn(envelope, background=deferred)

    # one consolidated event per turn — covers the reply, stage change, and
    # threads list on every success path (including dedupe replays)
    deferred.defer(
        "turn.completed",
        lambda: events.publish(
            envelope.tenant_id,
            "turn.completed",
            {
                "conversation_id": result.conversation_id,
                "contact_id": result.contact_id,
                "channel": envelope.channel.value,
                "reply_status": result.reply.status,
                "stage_out": result.stage_out,
            },
        ),
    )
    background_tasks.add_task(deferred.drain)
    return result


# --------------------------------------------------------------------------- #
# Observability reads
# --------------------------------------------------------------------------- #
@app.get("/v1/turns/{request_id}")
async def get_turn(request_id: str):
    doc = await mongo.get_db().turns.find_one({"request_id": request_id})
    if doc is None:
        raise HTTPException(status_code=404, detail="turn not found")
    return _jsonable(doc)


@app.get("/v1/turns")
async def list_turns(
    tenant_id: str = Query(...),
    user_id: str | None = Query(None),
    session_id: str | None = Query(None),
    limit: int = Query(30, le=200),
):
    """Recent turns for a tenant, newest first — a summary per invocation.

    `user_id` and `session_id` narrow the list to one person or one evaluated
    session; both are optional so an unfiltered call behaves as before."""
    query: dict = {"tenant_id": tenant_id}
    if user_id:
        query["user_id"] = user_id
    if session_id:
        query["session_id"] = session_id
    docs = await (
        mongo.get_db()
        .turns.find(query)
        .sort([("ts_start", -1), ("_id", -1)])
        .to_list(length=limit)
    )
    return _jsonable(
        [
            {
                "request_id": d.get("request_id"),
                "user_id": d.get("user_id"),
                "session_id": d.get("session_id"),
                "ts_start": d.get("ts_start"),
                "status": d.get("status"),
                "conversation_id": d.get("conversation_id"),
                "channel": d.get("channel"),
                "mode": d.get("mode"),
                "intent": (d.get("extraction") or {}).get("intent"),
                "stage_in": (d.get("state") or {}).get("stage_in"),
                "stage_out": (d.get("state") or {}).get("stage_out"),
                "reply_status": (d.get("guardrails") or {}).get("final_action"),
                "messages": (d.get("generation") or {}).get("output_messages") or [],
                "handoff": (d.get("handoff") or {}).get("triggered", False),
                "latency_ms": (d.get("totals") or {}).get("latency_ms"),
                "error": d.get("error"),
            }
            for d in docs
        ]
    )


@app.get("/v1/conversations")
async def list_conversations(
    tenant_id: str = Query(...),
    channel: str | None = Query(None),
    user_id: str | None = Query(None),
    limit: int = Query(50, le=200),
):
    """Conversations for a tenant enriched with contact + last message —
    the inbox view."""
    db = mongo.get_db()
    query: dict = {"tenant_id": tenant_id}
    if channel:
        query["channel"] = channel
    if user_id:
        query["user_id"] = user_id
    convos = await (
        db.conversations.find(query)
        .sort([("last_message_at", -1), ("_id", -1)])
        .to_list(length=limit)
    )
    out = []
    for convo in convos:
        contact = await db.contacts.find_one({"_id": convo["contact_id"]})
        last = await (
            db.messages.find({"conversation_id": convo["_id"]})
            .sort([("created_at", -1), ("_id", -1)])
            .limit(1)
            .to_list(length=1)
        )
        out.append({**convo, "contact": contact, "last_message": last[0] if last else None})
    return _jsonable(out)


@app.get("/v1/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    db = mongo.get_db()
    convo = await db.conversations.find_one({"_id": _oid(conversation_id, "conversation")})
    if convo is None:
        raise HTTPException(status_code=404, detail="conversation not found")
    messages = await (
        db.messages.find({"conversation_id": convo["_id"]})
        .sort([("created_at", 1), ("_id", 1)])
        .to_list(length=1000)
    )
    return _jsonable({**convo, "messages": messages})


@app.get("/v1/contacts")
async def list_contacts(tenant_id: str = Query(...), limit: int = Query(200, le=500)):
    """All contacts for a tenant, newest first — the CRM lead list."""
    docs = await (
        mongo.get_db()
        .contacts.find({"tenant_id": tenant_id})
        .sort([("created_at", -1), ("_id", -1)])
        .to_list(length=limit)
    )
    return _jsonable(docs)


@app.get("/v1/contacts/{contact_id}")
async def get_contact(contact_id: str):
    doc = await mongo.get_db().contacts.find_one({"_id": _oid(contact_id, "contact")})
    if doc is None:
        raise HTTPException(status_code=404, detail="contact not found")
    return _jsonable(doc)


# --------------------------------------------------------------------------- #
# Bulk lead import (CSV/Excel upload from the CRM)
# --------------------------------------------------------------------------- #
# Row field → identity channel. "linkedin" is stored on the contact like any
# other identity even though the turn pipeline doesn't serve it yet — the
# schema only restricts *turn* channels (see `schemas.envelope.Channel`).
IMPORT_FIELD_CHANNEL = {
    "whatsapp": "whatsapp",
    "email": "email",
    "phone": "voice",
    "instagram": "instagram",
    "linkedin": "linkedin",
}


class LeadImportRow(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str | None = None
    whatsapp: str | None = None
    email: str | None = None
    phone: str | None = None
    instagram: str | None = None
    linkedin: str | None = None


class LeadImportRequest(BaseModel):
    tenant_id: str
    user_id: str | None = None
    rows: list[LeadImportRow]


class LeadImportRowResult(BaseModel):
    row: int
    status: Literal["created", "updated", "skipped"]
    contact_id: str | None = None
    reason: str | None = None


class LeadImportResponse(BaseModel):
    created: int
    updated: int
    skipped: int
    results: list[LeadImportRowResult]


@app.post("/v1/contacts/import", response_model=LeadImportResponse)
async def import_contacts(body: LeadImportRequest):
    db = mongo.get_db()
    results: list[LeadImportRowResult] = []
    created = updated = skipped = 0

    for idx, row in enumerate(body.rows):
        identities = [
            {"channel": channel, "external_id": value.strip()}
            for field, channel in IMPORT_FIELD_CHANNEL.items()
            if (value := getattr(row, field)) and value.strip()
        ]
        name = (row.name or "").strip() or None
        contact, status, reason = await contacts_engine.import_lead(
            db, body.tenant_id, name, identities, body.user_id
        )
        if status == "created":
            created += 1
        elif status == "updated":
            updated += 1
        else:
            skipped += 1
        contact_id = str(contact["_id"]) if contact else None
        log = logger.warning if status == "skipped" else logger.info
        log(
            "lead import row=%d tenant=%s status=%s contact_id=%s reason=%s",
            idx, body.tenant_id, status, contact_id, reason,
        )
        results.append(
            LeadImportRowResult(row=idx, status=status, contact_id=contact_id, reason=reason)
        )

    logger.info(
        "lead import complete: tenant=%s rows=%d created=%d updated=%d skipped=%d",
        body.tenant_id, len(body.rows), created, updated, skipped,
    )
    if created or updated:
        await events.publish(
            body.tenant_id,
            "contacts.updated",
            {"created": created, "updated": updated},
        )
    return LeadImportResponse(created=created, updated=updated, skipped=skipped, results=results)


class MergeRequest(BaseModel):
    primary_contact_id: str
    duplicate_contact_id: str


@app.post("/v1/contacts/merge")
async def merge_contacts(body: MergeRequest):
    try:
        merged = await contacts_engine.merge_identities(
            mongo.get_db(), body.primary_contact_id, body.duplicate_contact_id
        )
    except contacts_engine.ContactNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ValueError, InvalidId) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _jsonable(merged)


# --------------------------------------------------------------------------- #
# Correspondent directory
# --------------------------------------------------------------------------- #
class DirectorySyncRequest(BaseModel):
    tenant_id: str
    user_id: str
    limit: int | None = None


@app.post("/v1/directory/sync")
async def sync_directory(body: DirectorySyncRequest):
    """Harvest the user's mailbox into the recipient directory.

    Called by the dashboard after a Google sign-in. A cold harvest is hundreds
    of Gmail round trips, so callers should not block a person on it — the
    agent also warms the cache lazily on its first miss.
    """
    count = await directory.sync(body.tenant_id, body.user_id, body.limit)
    return {"tenant_id": body.tenant_id, "user_id": body.user_id, "correspondents": count}


# --------------------------------------------------------------------------- #
# Operator agent — the salesperson's command chat
# --------------------------------------------------------------------------- #
class OperatorCommandRequest(BaseModel):
    tenant_id: str
    # Relational key for everything this command writes; see OrchestratorInput.
    user_id: str | None = None
    # Eval grouping key, carried onto the thread and reply.
    session_id: str | None = None
    text: str
    mode: Literal["copilot", "autopilot"] = "copilot"
    thread_id: str | None = None
    preferred_channel: str | None = None
    # IANA zone from the dashboard, so "tonight" resolves to the salesperson's
    # evening rather than UTC's.
    time_zone: str | None = None
    # Correlates live `operator.step` events back to the issuing dashboard.
    client_ref: str | None = None
    # Same upstream-resolved runtime as /v1/turns; used to pick the agent's
    # base model (vllm) and the playbook stage for brand-new conversations.
    runtime: RuntimeConfig | None = None


@app.post("/v1/operator/messages")
async def post_operator_command(body: OperatorCommandRequest):
    if not body.text.strip():
        raise HTTPException(status_code=422, detail="text must not be empty")
    try:
        result = await operator_agent.run_command(
            mongo.get_db(),
            tenant_id=body.tenant_id,
            text=body.text.strip(),
            mode=body.mode,
            thread_id=body.thread_id,
            preferred_channel=body.preferred_channel,
            runtime=body.runtime,
            client_ref=body.client_ref,
            user_id=body.user_id,
            session_id=body.session_id,
            time_zone=body.time_zone,
        )
    except operator_agent.ThreadNotFound:
        raise HTTPException(status_code=404, detail="operator thread not found") from None
    except (InvalidId, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _jsonable(result)


@app.get("/v1/operator/threads")
async def list_operator_threads(
    tenant_id: str = Query(...),
    user_id: str | None = Query(None),
    limit: int = Query(30, le=100),
):
    """Operator chat threads, newest first.

    A tenant is an organisation, so `user_id` matters here: the dashboard
    reopens the most recent thread on load, and without it one colleague would
    resume another's conversation.
    """
    query: dict = {"tenant_id": tenant_id}
    if user_id:
        query["user_id"] = user_id
    docs = await (
        mongo.get_db()
        .operator_threads.find(query)
        .sort([("last_message_at", -1), ("_id", -1)])
        .to_list(length=limit)
    )
    return _jsonable(docs)


@app.get("/v1/operator/threads/{thread_id}/messages")
async def list_operator_messages(
    thread_id: str,
    tenant_id: str | None = Query(None),
    user_id: str | None = Query(None),
):
    """One thread's messages.

    Scoped by `tenant_id`/`user_id` when the caller supplies them: a thread id
    on its own must not be enough to read someone else's conversation. The BFF
    always sends both, taken from the verified session.
    """
    query: dict = {"thread_id": _oid(thread_id, "thread")}
    if tenant_id:
        query["tenant_id"] = tenant_id
    if user_id:
        query["user_id"] = user_id
    docs = await (
        mongo.get_db()
        .operator_messages.find(query)
        .sort([("created_at", 1), ("_id", 1)])
        .to_list(length=500)
    )
    return _jsonable(docs)


# --------------------------------------------------------------------------- #
# Copilot drafts loop
# --------------------------------------------------------------------------- #
@app.get("/v1/drafts")
async def list_drafts(tenant_id: str = Query(...)):
    drafts = await (
        mongo.get_db()
        .messages.find({"tenant_id": tenant_id, "direction": "outbound", "status": "draft"})
        .sort("created_at", 1)
        .to_list(length=500)
    )
    return _jsonable(drafts)


class DraftApprove(BaseModel):
    edited_text: str | None = None


async def _get_draft(message_id: str) -> dict:
    msg = await mongo.get_db().messages.find_one({"_id": _oid(message_id, "message")})
    if msg is None:
        raise HTTPException(status_code=404, detail="message not found")
    if msg["status"] != "draft":
        raise HTTPException(status_code=409, detail=f"message is {msg['status']!r}, not a draft")
    return msg


async def _reflect_operator_decision(db, message_id: str, status: str) -> None:
    """Mirror a draft's approve/discard back onto the operator reply that
    created it. A copilot draft raised by the Operator agent embeds its result
    on the reply (``action.status == "draft"``); without this, reopening the
    thread would replay a stale draft — live Approve/Discard buttons over an
    already-decided message (a re-click 409s). Persisting the decision also lets
    evals filter agent suggestions the salesperson approved vs. discarded."""
    await db.operator_messages.update_one(
        {"action.message_id": message_id, "action.status": "draft"},
        {"$set": {"action.status": status, "action.decided_at": datetime.now(timezone.utc)}},
    )


@app.post("/v1/drafts/{message_id}/approve")
async def approve_draft(message_id: str, body: DraftApprove | None = None):
    db = mongo.get_db()
    msg = await _get_draft(message_id)
    text = body.edited_text if (body and body.edited_text) else msg["text"]
    await db.messages.update_one(
        {"_id": msg["_id"]}, {"$set": {"text": text, "status": "approved"}}
    )
    # approval dispatches through the same outbound stub
    convo = await db.conversations.find_one({"_id": msg["conversation_id"]})
    to = ""
    if convo:
        contact = await db.contacts.find_one({"_id": convo["contact_id"]})
        for ident in (contact or {}).get("identities", []):
            if ident["channel"] == convo["channel"]:
                to = ident["external_id"]
                break
    await dispatcher.dispatch(
        tenant_id=msg["tenant_id"],
        # The draft carries the user it was raised for; approving it must send
        # under that same grant, not under whoever clicked approve.
        user_id=msg.get("user_id") or (convo or {}).get("user_id"),
        channel=convo["channel"] if convo else "unknown",
        to=to,
        conversation_id=str(msg["conversation_id"]),
        messages=[text],
    )
    msg.update(text=text, status="approved")
    await _reflect_operator_decision(db, message_id, "sent")
    await events.publish(
        msg["tenant_id"],
        "draft.updated",
        {
            "message_id": message_id,
            "conversation_id": str(msg["conversation_id"]),
            "status": "approved",
        },
    )
    return _jsonable(msg)


@app.post("/v1/drafts/{message_id}/discard")
async def discard_draft(message_id: str):
    db = mongo.get_db()
    msg = await _get_draft(message_id)
    await db.messages.update_one(
        {"_id": msg["_id"]}, {"$set": {"status": "discarded"}}
    )
    msg["status"] = "discarded"
    await _reflect_operator_decision(db, message_id, "discarded")
    await events.publish(
        msg["tenant_id"],
        "draft.updated",
        {
            "message_id": message_id,
            "conversation_id": str(msg["conversation_id"]),
            "status": "discarded",
        },
    )
    return _jsonable(msg)


# --------------------------------------------------------------------------- #
# Metrics — the "eye on prod"
# --------------------------------------------------------------------------- #
def _percentile(sorted_values: list, pct: float) -> int:
    if not sorted_values:
        return 0
    idx = min(len(sorted_values) - 1, max(0, round(pct * (len(sorted_values) - 1))))
    return int(sorted_values[idx])


@app.get("/v1/metrics/summary")
async def metrics_summary(
    tenant_id: str = Query(...),
    user_id: str | None = Query(None),
    session_id: str | None = Query(None),
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = Query(None),
):
    """Per-adapter and per-session rollup.

    `session_id` is the eval grouping key stamped by the dashboard: filter to
    one session to score a single run, or omit it and read `by_session` to
    compare runs against each other."""
    match: dict = {"tenant_id": tenant_id, "status": {"$ne": "in_progress"}}
    if user_id:
        match["user_id"] = user_id
    if session_id:
        match["session_id"] = session_id
    if from_ or to:
        ts: dict = {}
        if from_:
            ts["$gte"] = from_
        if to:
            ts["$lte"] = to
        match["ts_start"] = ts

    def _group_stage(key: str) -> dict:
        return {
            "$group": {
                "_id": key,
                "turns": {"$sum": 1},
                "errors": {"$sum": {"$cond": [{"$ne": ["$error", None]}, 1, 0]}},
                "latencies": {"$push": "$totals.latency_ms"},
                "prompt_tokens": {"$sum": "$totals.prompt_tokens"},
                "completion_tokens": {"$sum": "$totals.completion_tokens"},
                "handoffs": {"$sum": {"$cond": [{"$eq": ["$handoff.triggered", True]}, 1, 0]}},
                "guardrail_violations": {
                    "$sum": {
                        "$cond": [
                            {
                                "$gt": [
                                    {
                                        "$size": {
                                            "$filter": {
                                                "input": {"$ifNull": ["$guardrails.checks", []]},
                                                "as": "c",
                                                "cond": {"$eq": ["$$c.passed", False]},
                                            }
                                        }
                                    },
                                    0,
                                ]
                            },
                            1,
                            0,
                        ]
                    }
                },
            }
        }

    def _rollup(g: dict, key_name: str) -> dict:
        latencies = sorted(v for v in g["latencies"] if v is not None)
        turns = g["turns"]
        return {
            key_name: g["_id"],
            "turns": turns,
            "errors": g["errors"],
            "latency_ms_p50": _percentile(latencies, 0.50),
            "latency_ms_p95": _percentile(latencies, 0.95),
            "prompt_tokens": g["prompt_tokens"],
            "completion_tokens": g["completion_tokens"],
            "guardrail_violation_rate": round(g["guardrail_violations"] / turns, 4) if turns else 0,
            "handoff_rate": round(g["handoffs"] / turns, 4) if turns else 0,
        }

    db = mongo.get_db()
    adapter_groups = await db.turns.aggregate(
        [{"$match": match}, _group_stage("$adapter_id")]
    ).to_list(length=100)
    session_groups = await db.turns.aggregate(
        [{"$match": {**match, "session_id": {"$ne": None}}}, _group_stage("$session_id")]
    ).to_list(length=200)

    by_adapter = [_rollup(g, "adapter_id") for g in adapter_groups]
    by_session = [_rollup(g, "session_id") for g in session_groups]

    return {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "session_id": session_id,
        "from": from_.isoformat() if from_ else None,
        "to": to.isoformat() if to else None,
        "by_adapter": sorted(by_adapter, key=lambda x: (x["adapter_id"] or "")),
        "by_session": sorted(by_session, key=lambda x: (x["session_id"] or "")),
    }


# --------------------------------------------------------------------------- #
# Events (SSE) — the dashboard's live feed off the Dragonfly bus
# --------------------------------------------------------------------------- #
# --------------------------------------------------------------------------- #
# Knowledge base (RAG)
# --------------------------------------------------------------------------- #
class KnowledgeDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    doc_id: str
    chunk_id: str | None = None
    source_uri: str | None = None
    version: int | None = None
    effective_date: str | None = None


class KnowledgeIngestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tenant_id: str
    #: Required, not optional. Knowledge is isolated per user, and an
    #: un-owned document would be invisible to every query — so there is no
    #: sensible default and asking for one would only hide the mistake.
    user_id: str
    knowledge_source_id: str
    documents: list[KnowledgeDocument]


@app.post("/v1/knowledge/documents")
async def ingest_knowledge(body: KnowledgeIngestRequest):
    """Add documents to one user's knowledge base.

    Replaces hand-seeding YAML into a shared collection. Every chunk is stamped
    with (tenant_id, user_id) on the way in, which is what makes it retrievable
    at all — the query filter is mandatory, so an unstamped chunk matches
    nothing forever.
    """
    scope = KnowledgeScope(tenant_id=body.tenant_id, user_id=body.user_id)
    try:
        written = await qdrant.ingest(
            body.knowledge_source_id,
            scope,
            [doc.model_dump() for doc in body.documents],
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "tenant_id": body.tenant_id,
        "user_id": body.user_id,
        "knowledge_source_id": body.knowledge_source_id,
        "chunks_written": written,
    }


@app.delete("/v1/knowledge/documents")
async def forget_knowledge(
    tenant_id: str = Query(...),
    knowledge_source_id: str = Query(...),
    user_id: str | None = Query(None),
):
    """Delete a user's knowledge, or a whole tenant's when `user_id` is absent.

    The deletion half of isolation: a boundary you cannot delete along is not
    really a boundary, and this is what an offboarding or erasure request runs.
    """
    if user_id:
        await qdrant.forget_user(
            knowledge_source_id, KnowledgeScope(tenant_id=tenant_id, user_id=user_id)
        )
    else:
        await qdrant.forget_tenant(knowledge_source_id, tenant_id)
    return {"forgotten": {"tenant_id": tenant_id, "user_id": user_id}}


@app.get("/v1/knowledge/status")
async def knowledge_status(knowledge_source_id: str = Query(...)):
    """Health of one collection, including how much of it is unreachable.

    `unscoped_points` counts chunks with no `user_id` — anything seeded before
    per-user isolation existed. They match no filter, so they retrieve nothing
    and are pure storage cost. A non-zero number here is the answer to "why is
    my migrated knowledge base silent?".
    """
    return {
        "knowledge_source_id": knowledge_source_id,
        "unscoped_points": await qdrant.count_unscoped(knowledge_source_id),
    }


@app.get("/v1/events")
async def stream_events(tenant_id: str = Query(...)):
    async def event_stream():
        # an immediate hello lets the client mark the bus as connected
        yield f"event: connected\ndata: {json.dumps({'tenant_id': tenant_id})}\n\n"
        async for event in events.subscribe(tenant_id):
            if event is None:
                yield ": keep-alive\n\n"  # heartbeat comment (ignored by EventSource)
                continue
            yield f"event: {event['type']}\ndata: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# --------------------------------------------------------------------------- #
# Health
# --------------------------------------------------------------------------- #
@app.get("/health")
async def health():
    mongo_ok = await mongo.ping()
    qdrant_ok = await qdrant.ping()
    llm_ok = await gateway.ping()
    events_ok = await events.ping()
    # the event bus is optional infra — the UI falls back to polling without
    # it — so it is reported but does not flip the overall status
    ok = mongo_ok and qdrant_ok and llm_ok
    return {
        "status": "ok" if ok else "degraded",
        "mongo": mongo_ok,
        "qdrant": qdrant_ok,
        "llm": llm_ok,
        "dragonfly": events_ok,
    }
