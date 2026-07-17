"""`run_turn(envelope)` — the core AI turn pipeline.

Steps (each failure path still writes the turn document, with `error` set):

 1. defense-in-depth scope assertion (403)
 2. idempotency: reserve request_id in `turns` (dedupe replays stored result)
 3. contact resolution (create if new)
 4. conversation resolution + persist inbound message
 5. playbook load + LLM extraction
 6. merge entities into lead, recompute qualification score
 7. guardrail pre-checks (handoff intents / sentiment / confidence strikes)
 8. state transition via the generic rules engine
 9. retrieval when the stage has reached the playbook's enabled_from_stage
10. generation from the assembled prompt
11. guardrail post-checks; regenerate once, then force draft
12. persist outbound message(s); dispatch when sent
13. finalize the turn trace
"""
from __future__ import annotations

import hashlib
import logging
import time
from datetime import datetime, timezone

from pymongo.errors import DuplicateKeyError

from ..llm import gateway, prompts
from ..outbound import dispatcher
from ..playbooks.loader import Playbook, load_playbook
from ..schemas.envelope import (
    Handoff,
    Mode,
    OrchestratorInput,
    OrchestratorResult,
    Reply,
    RetrievalHit,
    Totals,
)
from ..stores import mongo, qdrant
from . import contacts, guardrails, state_machine
from .trace import TurnTrace

logger = logging.getLogger(__name__)


class ScopeDenied(Exception):
    """Envelope channel not covered by granted_scopes → 403."""


class TurnInProgress(Exception):
    """Same request_id is being processed right now → 409."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _resolve_conversation(db, envelope: OrchestratorInput, contact_id, initial_stage: str) -> dict:
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


async def _recent_messages(db, conversation_id, exclude_id=None, limit: int = prompts.HISTORY_WINDOW) -> list[dict]:
    query: dict = {"conversation_id": conversation_id}
    if exclude_id is not None:
        query["_id"] = {"$ne": exclude_id}
    cursor = db.messages.find(query).sort([("created_at", -1), ("_id", -1)]).limit(limit)
    docs = await cursor.to_list(length=limit)
    return list(reversed(docs))


def _result_from_stored(stored: dict) -> OrchestratorResult:
    data = dict(stored["result"])
    data["deduped"] = True
    return OrchestratorResult.model_validate(data)


async def run_turn(envelope: OrchestratorInput) -> OrchestratorResult:
    db = mongo.get_db()

    # 1. defense-in-depth — everything else about the request is pre-verified
    required_scope = f"channel:{envelope.channel.value}"
    if required_scope not in envelope.granted_scopes:
        raise ScopeDenied(
            f"channel {envelope.channel.value!r} not in granted_scopes {envelope.granted_scopes}"
        )

    # 2. idempotency: reserve request_id
    stub = {
        "request_id": envelope.request_id,
        "tenant_id": envelope.tenant_id,
        "channel": envelope.channel.value,
        "status": "in_progress",
        "ts_start": _now(),
        "result": None,
        "error": None,
    }
    try:
        insert = await db.turns.insert_one(stub)
        turn_id = insert.inserted_id
    except DuplicateKeyError:
        existing = await db.turns.find_one({"request_id": envelope.request_id})
        if existing and existing.get("result"):
            logger.info("dedupe hit for request_id=%s", envelope.request_id)
            return _result_from_stored(existing)
        if existing and existing.get("error"):
            # previous attempt failed (e.g. transient LLM outage) — take over
            stub.pop("_id", None)  # insert_one set it on the rejected dict
            stub["ts_start"] = _now()
            replaced = await db.turns.find_one_and_replace(
                {"request_id": envelope.request_id, "error": {"$ne": None}}, stub
            )
            if replaced is None:
                raise TurnInProgress(envelope.request_id)
            turn_id = replaced["_id"]
        else:
            raise TurnInProgress(envelope.request_id)

    trace = TurnTrace(envelope, turn_id)
    flags: list[str] = []
    step = "load_playbook"
    try:
        playbook = load_playbook(envelope.runtime.playbook_id, envelope.runtime.playbook_version)
        if playbook.version != envelope.runtime.playbook_version:
            flags.append("playbook_version_mismatch")
        resolved_model = gateway.resolve_model(envelope.runtime)
        trace.set_resolved_model(resolved_model)

        # 3. contact
        step = "contact"
        contact = await contacts.resolve_or_create(
            db, envelope.tenant_id, envelope.channel.value, envelope.message.external_contact_id
        )
        lead = dict(contact.get("lead", {}))

        # 4. conversation + inbound message
        step = "conversation"
        convo = await _resolve_conversation(db, envelope, contact["_id"], playbook.initial_stage)
        trace.set_ids(convo["_id"], contact["_id"])
        inbound = {
            "tenant_id": envelope.tenant_id,
            "conversation_id": convo["_id"],
            "direction": "inbound",
            "text": envelope.message.text,
            "status": "received",
            "created_at": _now(),
        }
        ins = await db.messages.insert_one(inbound)
        inbound["_id"] = ins.inserted_id
        stage_in = convo["stage"]

        # a handed-off conversation stays silent — humans own it now
        if convo.get("status") == "handed_off":
            flags.append("conversation_handed_off")
            trace.set_state(stage_in, stage_in, "conversation_handed_off", lead.get("qualification_score", 0))
            trace.set_handoff(True, "already_handed_off")
            trace.set_guardrails([], regenerated=False, final_action="suppressed")
            await db.conversations.update_one(
                {"_id": convo["_id"]}, {"$set": {"last_message_at": _now()}}
            )
            result = _build_result(
                trace, envelope, convo["_id"], contact["_id"], stage_in, stage_in,
                lead, {}, [], Reply(status="suppressed"), flags,
                Handoff(triggered=True, reason="already_handed_off"),
            )
            await trace.write(db, result.model_dump(mode="json"))
            return result

        history = await _recent_messages(db, convo["_id"], exclude_id=inbound["_id"])

        # 5. extraction
        step = "extract"
        ex = await gateway.extract(
            model=resolved_model,
            messages=prompts.build_extraction_messages(playbook, lead, history, envelope.message.text),
        )
        trace.set_extraction(ex.result, ex.stats)

        # 6. merge entities → lead, recompute score
        step = "merge_lead"
        lead, score = contacts.merge_entities(lead, ex.result.entities, playbook)
        await contacts.update_lead(db, contact["_id"], lead)

        # 7. guardrail pre-checks
        step = "guardrails_pre"
        pre_checks, handoff, strikes = guardrails.pre_check(
            playbook, ex.result, convo.get("low_confidence_strikes", 0)
        )
        trace.set_handoff(handoff.triggered, handoff.reason)

        # 8. state transition
        step = "state"
        state = state_machine.next_stage(
            playbook, stage_in, ex.result.intent, lead, handoff.triggered, convo.get("return_stage")
        )
        stage_out = state.stage_out
        trace.set_state(stage_in, stage_out, state.transition_reason, score)

        # 9. retrieval
        step = "retrieval"
        hits: list[dict] = []
        if not handoff.triggered and playbook.stage_index(stage_out) >= playbook.stage_index(
            playbook.retrieval.enabled_from_stage
        ):
            lead_summary = " ".join(
                f"{k}={v}" for k, v in lead.items()
                if k != "qualification_score" and v not in contacts.NULLISH
            )
            query_text = f"{envelope.message.text}\n{lead_summary}".strip()
            r_started = time.monotonic()
            hits, r_flag = await qdrant.retrieve(
                envelope.runtime.knowledge_source_id,
                query_text,
                playbook.retrieval.top_k,
                playbook.retrieval.min_score,
            )
            trace.set_retrieval(
                envelope.runtime.knowledge_source_id, query_text,
                int((time.monotonic() - r_started) * 1000), hits,
            )
            if r_flag:
                flags.append(r_flag)

        facts_text = prompts.format_facts(hits)
        history_text = "\n".join(
            [m["text"] for m in history] + [envelope.message.text]
        )

        # 10-11. generation + post-checks (skipped entirely on handoff)
        checks = list(pre_checks)
        regenerated = False
        if handoff.triggered:
            if playbook.prompts.handoff_message:
                reply = Reply(status="draft", messages=[playbook.prompts.handoff_message])
            else:
                reply = Reply(status="suppressed")
        else:
            step = "generate"
            gen_messages = prompts.build_generation_messages(
                playbook, stage_out, lead, hits, history, envelope.message.text
            )
            system_hash = hashlib.sha256(gen_messages[0]["content"].encode()).hexdigest()[:16]
            gen = await gateway.generate(model=resolved_model, messages=gen_messages)
            trace.set_generation(system_hash, gen.output.messages, gen.stats, retries=gen.stats.retries)

            step = "guardrails_post"
            post_checks, feedback = guardrails.post_check(
                playbook, gen.output.messages, facts_text, history_text
            )
            forced_draft = False
            if feedback:
                # one regeneration with violation feedback
                regenerated = True
                step = "regenerate"
                regen_messages = prompts.build_generation_messages(
                    playbook, stage_out, lead, hits, history, envelope.message.text,
                    violation_feedback="\n".join(feedback),
                )
                gen = await gateway.generate(model=resolved_model, messages=regen_messages)
                trace.add_generation_stats(gen.stats)
                trace.doc["generation"]["output_messages"] = gen.output.messages
                step = "guardrails_post"
                post_checks_2, feedback_2 = guardrails.post_check(
                    playbook, gen.output.messages, facts_text, history_text
                )
                flags.extend(f"guardrail:{c.name}" for c in post_checks if not c.passed)
                post_checks = post_checks_2
                if feedback_2:
                    forced_draft = True  # still dirty → never autosend
            checks += post_checks
            flags.extend(f"guardrail:{c.name}" for c in post_checks if not c.passed)

            status = "draft" if (envelope.mode == Mode.copilot or forced_draft) else "sent"
            reply = Reply(status=status, messages=gen.output.messages)

        trace.set_guardrails(checks, regenerated, reply.status)
        flags.extend(f"guardrail:{c.name}" for c in pre_checks if not c.passed)

        # 12. persist outbound + dispatch
        step = "persist_outbound"
        for text in reply.messages:
            await db.messages.insert_one(
                {
                    "tenant_id": envelope.tenant_id,
                    "conversation_id": convo["_id"],
                    "direction": "outbound",
                    "text": text,
                    "status": reply.status,
                    "created_at": _now(),
                }
            )
        if reply.status == "sent":
            await dispatcher.dispatch(
                tenant_id=envelope.tenant_id,
                channel=envelope.channel.value,
                to=envelope.message.external_contact_id,
                conversation_id=str(convo["_id"]),
                messages=reply.messages,
            )

        step = "update_conversation"
        await db.conversations.update_one(
            {"_id": convo["_id"]},
            {
                "$set": {
                    "stage": stage_out,
                    "previous_stage": stage_in if stage_out != stage_in else convo.get("previous_stage"),
                    "return_stage": state.return_stage,
                    "mode": envelope.mode.value,
                    "status": "handed_off" if handoff.triggered else "active",
                    "low_confidence_strikes": strikes,
                    "last_message_at": _now(),
                }
            },
        )

        # 13. finalize
        step = "finalize"
        extraction_out = {
            "intent": ex.result.intent,
            "entities": ex.result.entities,
            "sentiment": ex.result.sentiment,
            "confidence": ex.result.confidence,
        }
        result = _build_result(
            trace, envelope, convo["_id"], contact["_id"], stage_in, stage_out,
            lead, extraction_out, hits, reply, sorted(set(flags)), handoff,
        )
        await trace.write(db, result.model_dump(mode="json"))
        return result

    except Exception as exc:  # noqa: BLE001 — every failure still writes the turn
        trace.set_error(step, exc)
        try:
            await trace.write(db, None)
        except Exception:  # noqa: BLE001
            logger.exception("failed to write error turn for %s", envelope.request_id)
        raise


def _build_result(
    trace: TurnTrace,
    envelope: OrchestratorInput,
    conversation_id,
    contact_id,
    stage_in: str,
    stage_out: str,
    lead: dict,
    extraction: dict,
    hits: list[dict],
    reply: Reply,
    flags: list[str],
    handoff: Handoff,
) -> OrchestratorResult:
    totals = trace.doc["totals"]
    return OrchestratorResult(
        turn_id=str(trace.turn_id),
        request_id=envelope.request_id,
        deduped=False,
        conversation_id=str(conversation_id),
        contact_id=str(contact_id),
        stage_in=stage_in,
        stage_out=stage_out,
        lead_profile=lead,
        extraction=extraction,
        retrieval_hits=[
            RetrievalHit(doc_id=h["doc_id"], chunk_id=h["chunk_id"], score=h["score"], used=h["used"])
            for h in hits
        ],
        reply=reply,
        guardrail_flags=flags,
        handoff=handoff,
        totals=Totals(
            latency_ms=int((_now() - trace.doc["ts_start"]).total_seconds() * 1000),
            prompt_tokens=totals["prompt_tokens"],
            completion_tokens=totals["completion_tokens"],
        ),
    )
