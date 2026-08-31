"""Repair instead of regenerate (4c).

A post-check violation used to cost a second full generation on the big model.
Numeric grounding is deterministic and the FACTS corpus is known before
generation runs, so the fix is a surgical edit, not a reconsideration.

The invariant that must not move: a violation surviving remediation forces
draft regardless of mode.
"""
from __future__ import annotations

import pytest

from app.config import settings
from app.graph import flags

from .conftest import make_envelope

FACTS = "Marina Crest, Dubai Marina. 1 Bedroom from AED 1,350,000."
GROUNDED = "The 1 Bedroom starts at AED 1,350,000."
UNGROUNDED = "Only AED 777,000 for you!"


@pytest.fixture()
def repair_on(monkeypatch):
    monkeypatch.setattr(settings, "graph_repair_violations", "*")
    flags._allowlist.cache_clear()
    yield
    flags._allowlist.cache_clear()


async def _turn_reaching_recommending(db, llm, retrieval, request_id, generations, mode="autopilot"):
    from app.engine.pipeline import run_turn

    retrieval.hits = [
        {"doc_id": "re_marina_crest", "chunk_id": "re_marina_crest#1", "text": FACTS,
         "source_uri": "s", "version": 1, "effective_date": "2026-04-01",
         "score": 0.9, "used": True}
    ]
    await run_turn(make_envelope(request_id=request_id + "-warm"))
    llm.extractions = [{
        "intent": "ask_price",
        "entities": {"budget_min_aed": 1_500_000, "localities": ["dubai marina"]},
        "sentiment": "neutral", "confidence": 0.95,
    }]
    llm.generations = list(generations)
    return await run_turn(make_envelope(request_id=request_id, mode=mode))


# --------------------------------------------------------------------------- #
# Routing
# --------------------------------------------------------------------------- #
async def test_flag_off_still_regenerates(db, llm, retrieval):
    result = await _turn_reaching_recommending(
        db, llm, retrieval, "rp-off", [UNGROUNDED, GROUNDED]
    )
    turn = await db.turns.find_one({"request_id": "rp-off"})
    assert turn["guardrails"]["regenerated"] is True
    assert "repair" not in turn["generation"], "repair must be opt-in"
    assert result.reply.status == "sent"


async def test_repair_replaces_the_regeneration(db, llm, retrieval, repair_on):
    result = await _turn_reaching_recommending(
        db, llm, retrieval, "rp-on", [UNGROUNDED, GROUNDED]
    )
    turn = await db.turns.find_one({"request_id": "rp-on"})

    assert turn["generation"]["repair"]["structure_preserved"] is True
    assert turn["generation"]["output_messages"] == [GROUNDED]
    assert turn["guardrails"]["regenerated"] is True
    assert result.reply.status == "sent", "a successful repair sends as normal"


async def test_repair_uses_the_small_model(db, llm, retrieval, repair_on, monkeypatch):
    monkeypatch.setattr(settings, "extraction_model_id", "small-editor")
    result = await _turn_reaching_recommending(
        db, llm, retrieval, "rp-model", [UNGROUNDED, GROUNDED]
    )
    turn = await db.turns.find_one({"request_id": "rp-model"})
    assert turn["generation"]["repair"]["model"] == "small-editor"
    assert turn["resolved_model"] != "small-editor", "generation keeps the big model"


# --------------------------------------------------------------------------- #
# The invariant
# --------------------------------------------------------------------------- #
async def test_a_violation_surviving_repair_forces_draft(db, llm, retrieval, repair_on):
    """Unchanged from the regeneration path: autopilot is overridden."""
    result = await _turn_reaching_recommending(
        db, llm, retrieval, "rp-fail", [UNGROUNDED, UNGROUNDED], mode="autopilot"
    )
    assert result.reply.status == "draft"
    turn = await db.turns.find_one({"request_id": "rp-fail"})
    assert turn["guardrails"]["final_action"] == "draft"


async def test_repair_is_attempted_at_most_once(db, llm, retrieval, repair_on):
    """The cap is the graph's, not a counter inside a node: `guardrails_recheck`
    routes straight to `compose_reply` whichever remediation ran."""
    await _turn_reaching_recommending(
        db, llm, retrieval, "rp-once", [UNGROUNDED, UNGROUNDED, GROUNDED]
    )
    # Three generations were queued; only two may be consumed.
    assert llm.generate_calls == 3, "warmup + generation + one repair"


# --------------------------------------------------------------------------- #
# Degradation
# --------------------------------------------------------------------------- #
async def test_a_mangled_repair_is_discarded(db, llm, retrieval, repair_on):
    """A repair that changes the bubble count is not a repair. Keep the
    original text and let the recheck force a draft — a mangled reply is worse
    than a slow one."""
    mangled = "One bubble\n---\nTwo bubbles\n---\nThree bubbles"
    result = await _turn_reaching_recommending(
        db, llm, retrieval, "rp-mangle", [UNGROUNDED, mangled]
    )
    turn = await db.turns.find_one({"request_id": "rp-mangle"})

    assert turn["generation"]["repair"]["structure_preserved"] is False
    assert turn["generation"]["output_messages"] == [UNGROUNDED], "original kept"
    assert "repair_structure_lost" in turn["result"]["guardrail_flags"]
    assert result.reply.status == "draft"


def test_the_repair_prompt_carries_only_what_it_needs():
    from app.llm.prompts import build_repair_messages

    messages = build_repair_messages(
        [UNGROUNDED], ["- ungrounded: 777000"], FACTS, "My budget is 1.5M AED"
    )
    user = messages[1]["content"]
    assert "1350000" in user and "1500000" in user, "allowed numbers are spelled out"
    assert "777" in user, "the offending bubble is included"
    # The whole point is that this is small — no playbook system prompt, no
    # lead profile, no conversation history.
    assert len(user) < 1200
    assert "You are Sara" not in user
