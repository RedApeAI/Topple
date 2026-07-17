"""Handoff triggers: explicit intent, low-confidence strikes, and the
handed-off conversation staying silent."""
from __future__ import annotations

from app.engine.pipeline import run_turn

from .conftest import insurance_overrides, make_envelope

LOW_CONF = {"intent": "other", "entities": {}, "sentiment": "neutral", "confidence": 0.1}


async def test_request_human_hands_off_with_draft_message(db, llm, retrieval):
    llm.extractions = [
        {"intent": "request_human", "entities": {}, "sentiment": "neutral", "confidence": 0.9}
    ]
    result = await run_turn(make_envelope(request_id="req-human-1"))

    assert result.handoff.triggered is True
    assert result.handoff.reason == "handoff_intent:request_human"
    assert result.stage_out == "HANDOFF"
    # real-estate playbook configures a handoff message → draft, never autosent
    assert result.reply.status == "draft"
    assert "advisor" in result.reply.messages[0]
    assert llm.generate_calls == 0

    convo = await db.conversations.find_one({})
    assert convo["status"] == "handed_off"


async def test_handoff_without_configured_message_is_suppressed(db, llm, retrieval):
    llm.extractions = [
        {"intent": "claim_guarantee_request", "entities": {}, "sentiment": "neutral", "confidence": 0.9}
    ]
    result = await run_turn(
        make_envelope(request_id="req-guarantee-1", **insurance_overrides())
    )
    # insurance playbook has no handoff_message → suppressed
    assert result.handoff.triggered is True
    assert result.reply.status == "suppressed"
    assert result.reply.messages == []
    assert result.stage_out == "HANDOFF"


async def test_low_confidence_two_strikes(db, llm, retrieval):
    llm.extractions = [dict(LOW_CONF)]
    first = await run_turn(make_envelope(request_id="req-strike-1"))
    assert first.handoff.triggered is False
    convo = await db.conversations.find_one({})
    assert convo["low_confidence_strikes"] == 1

    llm.extractions = [dict(LOW_CONF)]
    second = await run_turn(make_envelope(request_id="req-strike-2"))
    assert second.handoff.triggered is True
    assert second.handoff.reason == "low_confidence_strikes"
    assert second.stage_out == "HANDOFF"


async def test_confident_turn_resets_strikes(db, llm, retrieval):
    llm.extractions = [dict(LOW_CONF)]
    await run_turn(make_envelope(request_id="req-reset-1"))

    llm.extractions = [
        {"intent": "provide_info", "entities": {}, "sentiment": "neutral", "confidence": 0.9}
    ]
    await run_turn(make_envelope(request_id="req-reset-2"))
    convo = await db.conversations.find_one({})
    assert convo["low_confidence_strikes"] == 0

    llm.extractions = [dict(LOW_CONF)]
    third = await run_turn(make_envelope(request_id="req-reset-3"))
    assert third.handoff.triggered is False  # back to strike 1


async def test_handed_off_conversation_stays_silent(db, llm, retrieval):
    llm.extractions = [
        {"intent": "request_human", "entities": {}, "sentiment": "neutral", "confidence": 0.9}
    ]
    await run_turn(make_envelope(request_id="req-silent-1"))

    calls_before = llm.extract_calls
    result = await run_turn(make_envelope(request_id="req-silent-2"))
    assert result.reply.status == "suppressed"
    assert "conversation_handed_off" in result.guardrail_flags
    assert llm.extract_calls == calls_before  # no LLM work on a handed-off convo


async def test_angry_sentiment_hands_off(db, llm, retrieval):
    llm.extractions = [
        {"intent": "provide_info", "entities": {}, "sentiment": "angry", "confidence": 0.9}
    ]
    result = await run_turn(make_envelope(request_id="req-angry-1"))
    assert result.handoff.triggered is True
    assert result.handoff.reason == "sentiment:angry"
