"""The turn graph: an inbound buyer message becomes a reply.

The playbook YAML owns control flow here and the LLM only produces data. Every
edge below is decided by the envelope, the playbook, or a guardrail result —
never by model output — which is what keeps a turn replayable as a pure
function given recorded LLM calls.

Nodes are thin adapters. The behaviour still lives in `app/engine/*` and
`app/llm/*`; what this module adds is that the branches and the failure policy
are now declared rather than nested.
"""
from __future__ import annotations

import hashlib
import logging
import time
from datetime import datetime, timezone

from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime

from ..config import settings
from ..engine import contacts, guardrails, state_machine
from ..llm import gateway, prompts
from ..outbound import dispatcher
from ..playbooks.loader import load_playbook
from ..schemas.envelope import (
    Handoff,
    Mode,
    OrchestratorInput,
    OrchestratorResult,
    Reply,
    RetrievalHit,
    Totals,
)
from ..stores import events, qdrant
from ..stores.knowledge import KnowledgeScope
from .context import GraphContext
from . import flags
from .policy import best_effort, critical, register
from .turn_state import TurnState

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _resolve_conversation(
    db, envelope: OrchestratorInput, contact_id, initial_stage: str
) -> dict:
    query = {
        "tenant_id": envelope.tenant_id,
        "contact_id": contact_id,
        "channel": envelope.channel.value,
    }
    convo = await db.conversations.find_one({**query, "status": {"$ne": "closed"}})
    if convo:
        return convo
    doc = {
        **query,
        "user_id": envelope.user_id,
        "stage": initial_stage,
        "previous_stage": None,
        "return_stage": None,
        "mode": envelope.mode.value,
        "status": "active",
        "low_confidence_strikes": 0,
        "last_message_at": None,
        "created_at": _now(),
    }
    res = await db.conversations.insert_one(doc)
    doc["_id"] = res.inserted_id
    return doc


async def _recent_messages(
    db, conversation_id, exclude_id=None, limit: int = prompts.HISTORY_WINDOW
) -> list[dict]:
    query: dict = {"conversation_id": conversation_id}
    if exclude_id is not None:
        query["_id"] = {"$ne": exclude_id}
    cursor = db.messages.find(query).sort([("created_at", -1), ("_id", -1)]).limit(limit)
    docs = await cursor.to_list(length=limit)
    return list(reversed(docs))


# --------------------------------------------------------------------------- #
# Nodes
# --------------------------------------------------------------------------- #
@critical("load_playbook")
async def load_playbook_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    runtime_config = state.envelope.runtime
    playbook = load_playbook(runtime_config.playbook_id, runtime_config.playbook_version)
    resolved = gateway.resolve_model(runtime_config)
    update: dict = {
        "playbook": playbook,
        "resolved_model": resolved,
        "extraction_model": gateway.extraction_model(runtime_config, resolved),
    }
    if playbook.version != runtime_config.playbook_version:
        update["flags"] = ["playbook_version_mismatch"]
    return update


@critical("contact", timeout=settings.node_timeout_store)
async def contact_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    envelope = state.envelope
    contact = await contacts.resolve_or_create(
        runtime.context.db,
        envelope.tenant_id,
        envelope.channel.value,
        envelope.message.external_contact_id,
    )
    return {
        "contact": contact,
        "contact_id": contact["_id"],
        "lead": dict(contact.get("lead", {})),
    }


@critical("conversation", timeout=settings.node_timeout_store)
async def conversation_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    db = runtime.context.db
    envelope = state.envelope
    convo = await _resolve_conversation(
        db, envelope, state.contact["_id"], state.playbook.initial_stage
    )
    inbound = {
        "tenant_id": envelope.tenant_id,
        "user_id": envelope.user_id,
        "conversation_id": convo["_id"],
        "direction": "inbound",
        "text": envelope.message.text,
        "status": "received",
        "created_at": _now(),
    }
    ins = await db.messages.insert_one(inbound)
    await contacts.touch_contacted(db, state.contact["_id"])
    return {
        "convo": convo,
        "conversation_id": convo["_id"],
        "inbound_id": ins.inserted_id,
        "stage_in": convo["stage"],
        "already_handed_off": convo.get("status") == "handed_off",
    }


@best_effort("publish_inbound", timeout=settings.node_timeout_store)
async def publish_inbound_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    """Announce the inbound immediately — the reply takes an LLM round-trip."""
    await events.publish(
        state.tenant_id,
        "message.created",
        {
            "conversation_id": str(state.conversation_id),
            "channel": state.channel,
            "direction": "inbound",
        },
    )
    return {}


@critical("handed_off", timeout=settings.node_timeout_store)
async def handed_off_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    """A handed-off conversation stays silent — humans own it now."""
    await runtime.context.db.conversations.update_one(
        {"_id": state.convo["_id"]}, {"$set": {"last_message_at": _now()}}
    )
    return {
        "flags": ["conversation_handed_off"],
        "stage_out": state.stage_in,
        "handoff_triggered": True,
        "handoff": {"triggered": True, "reason": "already_handed_off"},
        "state": {
            "stage_in": state.stage_in,
            "stage_out": state.stage_in,
            "transition_reason": "conversation_handed_off",
            "qualification_score": state.lead.get("qualification_score", 0),
        },
        "guardrails": {"checks": [], "regenerated": False, "final_action": "suppressed"},
        "reply": Reply(status="suppressed"),
    }


@critical("load_context", timeout=settings.node_timeout_store)
async def load_context_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    """The conversation history extraction and generation both read.

    Its own node only so the parallel topology can start it alongside the
    speculative retrieval. In the sequential topology `extract` still loads it
    itself, which is why `extract` treats an already-populated history as
    authoritative.
    """
    return {
        "history": await _recent_messages(
            runtime.context.db, state.convo["_id"], exclude_id=state.inbound_id
        )
    }


@critical("extract", timeout=settings.node_timeout_extract)
async def extract_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    envelope = state.envelope
    history = state.history or await _recent_messages(
        runtime.context.db, state.convo["_id"], exclude_id=state.inbound_id
    )
    call = await gateway.extract(
        model=state.extraction_model or state.resolved_model,
        messages=prompts.build_extraction_messages(
            state.playbook, state.lead, history, envelope.message.text
        ),
    )
    return {
        "history": history,
        "extraction_result": call.result,
        "extraction": {
            "intent": call.result.intent,
            "entities": call.result.entities,
            "sentiment": call.result.sentiment,
            "confidence": call.result.confidence,
            "latency_ms": call.stats.latency_ms,
            "prompt_tokens": call.stats.prompt_tokens,
            "completion_tokens": call.stats.completion_tokens,
            "retries": call.stats.retries,
        },
        "token_stats": [call.stats],
    }


@critical("merge_lead", timeout=settings.node_timeout_store)
async def merge_lead_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    lead, score = contacts.merge_entities(
        state.lead, state.extraction_result.entities, state.playbook
    )
    await contacts.update_lead(runtime.context.db, state.contact["_id"], lead)
    return {"lead": lead, "score": score}


@critical("guardrails_pre")
async def guardrails_pre_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    checks, handoff, strikes = guardrails.pre_check(
        state.playbook, state.extraction_result, state.convo.get("low_confidence_strikes", 0)
    )
    return {
        "pre_checks": checks,
        "strikes": strikes,
        "handoff_triggered": handoff.triggered,
        "handoff": {"triggered": handoff.triggered, "reason": handoff.reason},
    }


@critical("state")
async def state_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    transition = state_machine.next_stage(
        state.playbook,
        state.stage_in,
        state.extraction_result.intent,
        state.lead,
        state.handoff_triggered,
        state.convo.get("return_stage"),
    )
    return {
        "stage_out": transition.stage_out,
        "return_stage": transition.return_stage,
        "transition_reason": transition.transition_reason,
        "state": {
            "stage_in": state.stage_in,
            "stage_out": transition.stage_out,
            "transition_reason": transition.transition_reason,
            "qualification_score": state.score,
        },
    }


def _retrieval_query(state: TurnState) -> str:
    """The buyer's message plus a flattened lead summary."""
    lead_summary = " ".join(
        f"{key}={value}"
        for key, value in state.lead.items()
        if key != "qualification_score" and value not in contacts.NULLISH
    )
    return f"{state.envelope.message.text}\n{lead_summary}".strip()


async def _retrieve(state: TurnState, query_text: str) -> dict:
    """One Qdrant round trip, shaped for the turn document.

    The scope is built from the envelope, not passed in: knowledge isolation
    must not be something a node can get wrong or forget.
    """
    collection = state.envelope.runtime.knowledge_source_id
    scope = KnowledgeScope(
        tenant_id=state.envelope.tenant_id, user_id=state.envelope.user_id
    )
    started = time.monotonic()
    hits, flag = await qdrant.retrieve(
        collection,
        query_text,
        state.playbook.retrieval.top_k,
        state.playbook.retrieval.min_score,
        scope=scope,
    )
    update: dict = {
        "hits": hits,
        "retrieval": {
            "collection": collection,
            "query": query_text,
            "latency_ms": int((time.monotonic() - started) * 1000),
            "hits": [
                {
                    "doc_id": hit["doc_id"],
                    "chunk_id": hit["chunk_id"],
                    "score": hit["score"],
                    "used": hit["used"],
                }
                for hit in hits
            ],
        },
    }
    if flag:
        update["flags"] = [flag]
    return update


@best_effort("retrieval", timeout=settings.node_timeout_retrieval)
async def retrieval_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    return await _retrieve(state, _retrieval_query(state))


@best_effort("speculate_retrieval", timeout=settings.node_timeout_retrieval)
async def speculate_retrieval_node(
    state: TurnState, runtime: Runtime[GraphContext]
) -> dict:
    """Retrieve *before* we know whether we need it (4b).

    Retrieval is gated on `stage_out`, which depends on the state transition,
    which depends on extraction — so a Qdrant round trip sits behind an LLM
    call for no reason other than ordering. The query is the buyer's message
    plus a lead summary, and the pre-merge lead summary is already available
    here, so the query can be built and fired now.

    Whether the result is used at all is `retrieval_gate`'s decision. Being
    `best_effort` matters more than usual: a speculative call that fails must
    cost nothing, because it may not even have been needed.
    """
    result = await _retrieve(state, _retrieval_query(state))
    result["speculative_hits"] = result.pop("hits")
    result["speculative_retrieval"] = result.pop("retrieval")
    return result


@best_effort("retrieval_gate", timeout=settings.node_timeout_retrieval)
async def retrieval_gate_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    """Keep, discard or re-query the speculative result.

    Three outcomes, recorded on the trace so the waste rate is measurable
    rather than assumed:

    - `unused`    — the stage gate is closed. The speculative call was waste.
    - `requeried` — the resolved stage points at a different collection, so the
                    speculative hits are for the wrong knowledge source.
    - `kept`      — used as-is.

    The query text does drift: the speculative one is built from the pre-merge
    lead, the post-merge one from the merged lead. That drift is accepted
    rather than triggering a re-query, because the buyer's message dominates
    the embedding and re-querying on it would make speculation pointless. The
    drift is recorded so the trade can be checked against real data.
    """
    playbook = state.playbook
    gate_open = playbook.stage_index(state.stage_out) >= playbook.stage_index(
        playbook.retrieval.enabled_from_stage
    )
    speculative = state.speculative_retrieval or {}

    if not gate_open:
        return {
            "retrieval": None,
            "hits": [],
            "speculation": {
                "outcome": "unused",
                "wasted_ms": speculative.get("latency_ms", 0),
            },
        }

    collection = state.envelope.runtime.knowledge_source_id
    if speculative.get("collection") != collection:
        result = await _retrieve(state, _retrieval_query(state))
        result["speculation"] = {
            "outcome": "requeried",
            "reason": "collection_changed",
            "wasted_ms": speculative.get("latency_ms", 0),
        }
        return result

    current_query = _retrieval_query(state)
    return {
        "hits": list(state.speculative_hits),
        "retrieval": speculative,
        "speculation": {
            "outcome": "kept",
            "query_drifted": speculative.get("query") != current_query,
            "saved_ms": speculative.get("latency_ms", 0),
        },
    }


def _may_stream(state: TurnState) -> bool:
    """Streaming is a property of the *mode*, not of the handler (4d).

    In copilot a human gates the draft before anyone sees it, so showing tokens
    as they arrive is free. In autopilot the reply goes straight to the buyer
    and there is no unsend — a partial generation that fails a guardrail must
    never have been visible. Expressed here, on the node that generates,
    because that is the only place that knows what is about to happen to the
    text.
    """
    return state.envelope.mode == Mode.copilot and flags.enabled(
        "stream_copilot", state.tenant_id
    )


async def _generate_with_policy(state: TurnState, messages: list[dict]):
    if not _may_stream(state):
        return await gateway.generate(model=state.resolved_model, messages=messages)

    async def emit(piece: str) -> None:
        await events.publish(
            state.tenant_id,
            "generation.token",
            {"conversation_id": str(state.conversation_id), "text": piece},
        )

    return await gateway.generate_streaming(
        model=state.resolved_model, messages=messages, on_token=emit
    )


@critical("generate", timeout=settings.node_timeout_generate)
async def generate_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    envelope = state.envelope
    messages = prompts.build_generation_messages(
        state.playbook, state.stage_out, state.lead, state.hits, state.history,
        envelope.message.text,
    )
    system_hash = hashlib.sha256(messages[0]["content"].encode()).hexdigest()[:16]
    call = await _generate_with_policy(state, messages)
    return {
        "generation": {
            "system_prompt_hash": system_hash,
            "output_messages": call.output.messages,
            "latency_ms": call.stats.latency_ms,
            "prompt_tokens": call.stats.prompt_tokens,
            "completion_tokens": call.stats.completion_tokens,
            "retries": call.stats.retries,
        },
        "token_stats": [call.stats],
        "facts_text": prompts.format_facts(state.hits),
        "history_text": "\n".join(
            [message["text"] for message in state.history] + [envelope.message.text]
        ),
    }


@critical("guardrails_post")
async def guardrails_post_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    checks, feedback = guardrails.post_check(
        state.playbook, state.generation["output_messages"],
        state.facts_text, state.history_text,
    )
    return {"post_checks": checks, "feedback": feedback}


@critical("regenerate", timeout=settings.node_timeout_generate)
async def regenerate_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    """One regeneration, with the violations fed back in."""
    envelope = state.envelope
    messages = prompts.build_generation_messages(
        state.playbook, state.stage_out, state.lead, state.hits, state.history,
        envelope.message.text,
        violation_feedback="\n".join(state.feedback),
    )
    call = await gateway.generate(model=state.resolved_model, messages=messages)

    generation = dict(state.generation)
    generation["latency_ms"] += call.stats.latency_ms
    generation["prompt_tokens"] += call.stats.prompt_tokens
    generation["completion_tokens"] += call.stats.completion_tokens
    generation["output_messages"] = call.output.messages

    return {
        "generation": generation,
        "token_stats": [call.stats],
        "regenerated": True,
        # The first attempt's violations are flagged here, before `post_checks`
        # is replaced by the recheck — the turn is flagged for both attempts.
        "flags": [f"guardrail:{c.name}" for c in state.post_checks if not c.passed],
    }


@critical("repair", timeout=settings.node_timeout_extract)
async def repair_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    """Fix the violating text instead of generating the whole reply again.

    Numeric grounding is a deterministic check against a corpus that is already
    known before generation runs, so a violation does not need the model to
    reconsider the whole reply — it needs the offending figures replaced. That
    is a small edit on a small model, against a second full generation on the
    big one.

    Falls back to full regeneration when the repair comes back unusable (empty,
    or a different number of bubbles), because a mangled reply is worse than a
    slow one.
    """
    messages = prompts.build_repair_messages(
        state.generation["output_messages"],
        state.feedback,
        state.facts_text,
        state.history_text,
    )
    model = gateway.extraction_model(state.envelope.runtime, state.resolved_model)
    call = await gateway.generate(model=model, messages=messages)

    repaired = call.output.messages
    intact = bool(repaired) and len(repaired) == len(state.generation["output_messages"])

    generation = dict(state.generation)
    generation["latency_ms"] += call.stats.latency_ms
    generation["prompt_tokens"] += call.stats.prompt_tokens
    generation["completion_tokens"] += call.stats.completion_tokens
    generation["repair"] = {
        "model": model,
        "bubbles_in": len(state.generation["output_messages"]),
        "bubbles_out": len(repaired),
        "structure_preserved": intact,
        "prompt_tokens": call.stats.prompt_tokens,
        "completion_tokens": call.stats.completion_tokens,
        "latency_ms": call.stats.latency_ms,
    }
    if intact:
        generation["output_messages"] = repaired

    return {
        "generation": generation,
        "token_stats": [call.stats],
        "regenerated": True,
        "repair_attempted": True,
        "repair_structure_ok": intact,
        # As with regeneration, the first attempt's violations are flagged
        # before `post_checks` is replaced by the recheck.
        "flags": [f"guardrail:{c.name}" for c in state.post_checks if not c.passed]
        + (["repair_structure_lost"] if not intact else []),
    }


@critical("guardrails_post", node="guardrails_recheck")
async def guardrails_recheck_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    checks, feedback = guardrails.post_check(
        state.playbook, state.generation["output_messages"],
        state.facts_text, state.history_text,
    )
    # Still dirty after a regeneration → never autosend, whatever the mode.
    return {"post_checks": checks, "feedback": feedback, "forced_draft": bool(feedback)}


@critical("compose_reply")
async def compose_reply_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    """Where the reply's status is decided — the one place `mode` is read."""
    if state.handoff_triggered:
        handoff_message = state.playbook.prompts.handoff_message
        reply = (
            Reply(status="draft", messages=[handoff_message])
            if handoff_message
            else Reply(status="suppressed")
        )
        checks = list(state.pre_checks)
        flags: list[str] = []
    else:
        checks = list(state.pre_checks) + list(state.post_checks)
        flags = [f"guardrail:{c.name}" for c in state.post_checks if not c.passed]
        sent = state.envelope.mode != Mode.copilot and not state.forced_draft
        reply = Reply(
            status="sent" if sent else "draft",
            messages=state.generation["output_messages"],
        )

    flags += [f"guardrail:{c.name}" for c in state.pre_checks if not c.passed]
    return {
        "reply": reply,
        "flags": flags,
        "guardrails": {
            "checks": [check.as_doc() for check in checks],
            "regenerated": state.regenerated,
            "final_action": reply.status,
        },
    }


@critical("persist_outbound", timeout=settings.node_timeout_store)
async def persist_outbound_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    envelope = state.envelope
    for text in state.reply.messages:
        await runtime.context.db.messages.insert_one(
            {
                "tenant_id": envelope.tenant_id,
                "user_id": envelope.user_id,
                "conversation_id": state.convo["_id"],
                "direction": "outbound",
                "text": text,
                "status": state.reply.status,
                "created_at": _now(),
            }
        )
    return {}


@best_effort("dispatch")
async def dispatch_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    """Only `sent` leaves the building.

    Deferred rather than awaited: this POSTs to the BFF, which calls Gmail, and
    the caller has been waiting on that round trip for no reason — the message
    document is already persisted and delivery was always best-effort. The
    intent is recorded on the turn before the response goes out, so a crash
    before the drain is recoverable (see `pipeline._mark_completing`).
    """
    if state.reply.status != "sent":
        return {}

    envelope = state.envelope
    outbox = {
        "tenant_id": envelope.tenant_id,
        "user_id": envelope.user_id,
        "channel": envelope.channel.value,
        "to": envelope.message.external_contact_id,
        "conversation_id": str(state.conversation_id),
        "messages": list(state.reply.messages),
    }
    runtime.context.background.defer(
        "dispatch", lambda: dispatcher.dispatch(**outbox)
    )
    return {"outbox": outbox}


@critical("update_conversation", timeout=settings.node_timeout_store)
async def update_conversation_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    convo = state.convo
    await runtime.context.db.conversations.update_one(
        {"_id": convo["_id"]},
        {
            "$set": {
                "stage": state.stage_out,
                "previous_stage": (
                    state.stage_in
                    if state.stage_out != state.stage_in
                    else convo.get("previous_stage")
                ),
                "return_stage": state.return_stage,
                "mode": state.envelope.mode.value,
                "status": "handed_off" if state.handoff_triggered else "active",
                "low_confidence_strikes": state.strikes,
                "last_message_at": _now(),
            }
        },
    )
    return {}


@critical("finalize")
async def finalize_node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
    """The terminal node: serialise state into the result snapshot."""
    ts_end = _now()
    totals = {
        **state.summed_totals(),
        "latency_ms": int((ts_end - state.ts_start).total_seconds() * 1000),
    }
    extraction = state.extraction or {}
    result = OrchestratorResult(
        turn_id=str(state.turn_id),
        request_id=state.request_id,
        deduped=False,
        conversation_id=str(state.conversation_id),
        contact_id=str(state.contact_id),
        stage_in=state.stage_in,
        stage_out=state.stage_out,
        lead_profile=state.lead,
        extraction={
            key: extraction[key]
            for key in ("intent", "entities", "sentiment", "confidence")
            if key in extraction
        },
        retrieval_hits=[
            RetrievalHit(
                doc_id=hit["doc_id"], chunk_id=hit["chunk_id"],
                score=hit["score"], used=hit["used"],
            )
            for hit in state.hits
        ],
        reply=state.reply,
        guardrail_flags=sorted(set(state.flags)),
        handoff=Handoff(**state.handoff),
        totals=Totals(**totals),
    )
    return {
        "ts_end": ts_end,
        "totals": totals,
        "status": "completed",
        "result": result.model_dump(mode="json"),
    }


# --------------------------------------------------------------------------- #
# Edges
# --------------------------------------------------------------------------- #
def _after_inbound(state: TurnState) -> str:
    return "handed_off" if state.already_handed_off else "extract"


def _after_inbound_parallel(state: TurnState) -> str:
    """Same decision, different destination — the parallel topology goes via
    `load_context`, which then fans out. Two routers rather than one that
    inspects a flag, because a conditional edge's path function is handed only
    the state and has no idea which graph it was compiled into."""
    return "handed_off" if state.already_handed_off else "load_context"


def _fanout(state: TurnState) -> list[str]:
    """Fan out (4a/4b): extraction and retrieval run in the same superstep.

    Returning a list is how LangGraph starts several branches at once. The two
    branches are deliberately the *same length* — one node each, converging on
    `merge_lead`. Pregel triggers a node whenever an incoming channel updates,
    so a shorter branch reaching the join first fires it early: with
    `speculate` one hop and `load_context → extract` two, `merge_lead` ran
    before extraction had produced anything and died on a None extraction.

    Retrieval is 10-50ms against extraction's 0.7-3s, so overlapping those two
    is where essentially all of the win is anyway.
    """
    return ["extract", "speculate_retrieval"]


def _after_state(state: TurnState) -> str:
    """Handoff skips generation entirely; otherwise retrieval is stage-gated."""
    if state.handoff_triggered:
        return "compose_reply"
    playbook = state.playbook
    reached = playbook.stage_index(state.stage_out) >= playbook.stage_index(
        playbook.retrieval.enabled_from_stage
    )
    return "retrieval" if reached else "generate"


def _after_state_parallel(state: TurnState) -> str:
    """Retrieval already ran speculatively, so the gate decides its fate
    rather than whether to start it."""
    return "compose_reply" if state.handoff_triggered else "retrieval_gate"


def _after_post_check(state: TurnState) -> str:
    """A violation costs one remediation attempt, never more.

    The cap is enforced here rather than by a counter inside a node: this edge
    is only reachable from `guardrails_post`, and the recheck after either
    remediation routes straight to `compose_reply`.
    """
    if not state.feedback:
        return "compose_reply"
    if flags.enabled("repair_violations", state.tenant_id):
        return "repair"
    return "regenerate"


def build_turn_graph(parallel: bool = False) -> StateGraph:
    """The turn graph.

    `parallel=False` is the sequential topology, unchanged and at parity with
    the pre-migration pipeline. `parallel=True` fans out after admit (4a) and
    retrieves speculatively (4b). Two topologies over one node set rather than
    conditional edges inside one, so the sequential path stays exactly as it
    was and can go on being the parity reference.
    """
    builder = StateGraph(TurnState, context_schema=GraphContext)
    register(
        builder,
        load_context_node,
        speculate_retrieval_node,
        retrieval_gate_node,
        load_playbook_node,
        contact_node,
        conversation_node,
        publish_inbound_node,
        handed_off_node,
        extract_node,
        merge_lead_node,
        guardrails_pre_node,
        state_node,
        retrieval_node,
        generate_node,
        guardrails_post_node,
        regenerate_node,
        repair_node,
        guardrails_recheck_node,
        compose_reply_node,
        persist_outbound_node,
        dispatch_node,
        update_conversation_node,
        finalize_node,
    )

    builder.add_edge(START, "load_playbook")
    builder.add_edge("load_playbook", "contact")
    builder.add_edge("contact", "conversation")
    builder.add_edge("conversation", "publish_inbound")

    if parallel:
        builder.add_conditional_edges(
            "publish_inbound", _after_inbound_parallel, ["handed_off", "load_context"]
        )
        builder.add_conditional_edges(
            "load_context", _fanout, ["extract", "speculate_retrieval"]
        )
        builder.add_edge("extract", "merge_lead")
        builder.add_edge("speculate_retrieval", "merge_lead")
    else:
        builder.add_conditional_edges(
            "publish_inbound", _after_inbound, ["handed_off", "extract"]
        )
        builder.add_edge("extract", "merge_lead")

    builder.add_edge("handed_off", "finalize")
    builder.add_edge("merge_lead", "guardrails_pre")
    builder.add_edge("guardrails_pre", "state")

    if parallel:
        builder.add_conditional_edges(
            "state", _after_state_parallel, ["compose_reply", "retrieval_gate"]
        )
        builder.add_edge("retrieval_gate", "generate")
    else:
        builder.add_conditional_edges(
            "state", _after_state, ["compose_reply", "retrieval", "generate"]
        )
        builder.add_edge("retrieval", "generate")
    builder.add_edge("generate", "guardrails_post")

    builder.add_conditional_edges(
        "guardrails_post", _after_post_check, ["repair", "regenerate", "compose_reply"]
    )
    builder.add_edge("regenerate", "guardrails_recheck")
    builder.add_edge("repair", "guardrails_recheck")
    builder.add_edge("guardrails_recheck", "compose_reply")

    builder.add_edge("compose_reply", "persist_outbound")
    builder.add_edge("persist_outbound", "dispatch")
    builder.add_edge("dispatch", "update_conversation")
    builder.add_edge("update_conversation", "finalize")
    builder.add_edge("finalize", END)
    return builder


#: Compiled once at import. No checkpointer: the `turns` collection's
#: insert-as-lock / replay / take-over protocol already owns turn identity, and
#: a second locking mechanism beside it would be one too many.
TURN_GRAPH = build_turn_graph().compile(name="turn")

#: The 4a/4b topology, selected per tenant by `graph_parallel_fanout` /
#: `graph_speculative_retrieval`. Compiled alongside rather than replacing, so
#: turning the flag off is instant and total.
TURN_GRAPH_PARALLEL = build_turn_graph(parallel=True).compile(name="turn-parallel")


def graph_for(tenant_id: str | None):
    """Which topology this tenant's turns run on."""
    if flags.enabled("parallel_fanout", tenant_id) or flags.enabled(
        "speculative_retrieval", tenant_id
    ):
        return TURN_GRAPH_PARALLEL
    return TURN_GRAPH
