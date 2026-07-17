"""Guardrails: numeric grounding, forbidden phrases, regenerate-then-draft."""
from __future__ import annotations

from app.engine.guardrails import grounding_violations, numeric_tokens, post_check
from app.engine.pipeline import run_turn
from app.playbooks.loader import load_playbook

from .conftest import make_envelope

FACTS = (
    "Marina Crest 2 Bedroom, 1,240 sq ft — starting at AED 2,150,000. "
    "1 Bedroom at AED 1,350,000. Handover December 2027. Booking amount AED 100,000. "
    "Estimated service charge: AED 18 per sq ft per year."
)


# --------------------------------------------------------------------------- #
# unit level
# --------------------------------------------------------------------------- #
def test_invented_price_is_caught():
    violations = grounding_violations("This one is just AED 999,999 for you!", FACTS)
    assert "999999" in violations


def test_grounded_numbers_pass():
    reply = "The 1 Bedroom starts at AED 1,350,000 and handover is December 2027."
    assert grounding_violations(reply, FACTS) == []


def test_million_k_expansion_grounds_equivalent_forms():
    # FACTS says "AED 2,150,000"; a reply using the short form is grounded
    assert grounding_violations("It costs AED 2.15M all-in.", FACTS) == []
    # and the buyer's own "1.2 million" grounds a formatted restatement
    assert grounding_violations("Noted, AED 1,200,000 budget!", "my budget is 1.2 million") == []
    # glued 950k in the buyer's message grounds the expanded form
    assert grounding_violations("Around AED 950,000 works.", "I can stretch to 950k") == []


def test_spaced_bare_m_is_metres_not_millions():
    # "25 m lap pool" must not read as 25,000,000
    assert grounding_violations("It has a 25 m lap pool.", "Amenities: 25 m lap pool") == []
    assert numeric_tokens("a 25 m lap pool") == set()


def test_ungrounded_percentage_is_caught():
    assert "12%" in grounding_violations("Expect 12% appreciation.", FACTS)


def test_small_counts_are_not_flagged():
    assert grounding_violations("It has 3 bedrooms and 2 bathrooms.", "") == []


def test_numeric_tokens_extraction():
    tokens = numeric_tokens("AED 1,350,000 or 2.15M, 12.5%, by 2027")
    assert {"1350000", "2150000", "12.5%", "2027"} <= tokens
    assert "2.15" not in tokens  # suffixed amounts count only as their expansion


def test_forbidden_phrase_caught():
    playbook = load_playbook("real-estate-v1")
    checks, feedback = post_check(
        playbook, ["This project has guaranteed returns of 3%!"], FACTS, ""
    )
    failed = {c.name for c in checks if not c.passed}
    assert "forbidden_phrases" in failed
    assert any("guaranteed returns" in f for f in feedback)


def test_clean_reply_passes_post_check():
    playbook = load_playbook("real-estate-v1")
    checks, feedback = post_check(
        playbook, ["The 1 Bedroom starts at AED 1,350,000."], FACTS, ""
    )
    assert all(c.passed for c in checks)
    assert feedback == []


# --------------------------------------------------------------------------- #
# pipeline level: regenerate once, then force draft
# --------------------------------------------------------------------------- #
async def _turn_with_generations(db, llm, retrieval, generations, request_id):
    retrieval.hits = [
        {
            "doc_id": "re_marina_crest",
            "chunk_id": "re_marina_crest#1",
            "text": FACTS,
            "source_uri": "seeds/sample_docs/re_marina_crest.md",
            "version": 1,
            "effective_date": "2026-04-01",
            "score": 0.9,
            "used": True,
        }
    ]
    # warmup turn moves GREETING→QUALIFYING using the default fake outputs
    await run_turn(make_envelope(request_id=request_id + "-warmup"))
    # entities complete the qualification → stage reaches RECOMMENDING → retrieval on
    llm.extractions = [
        {
            "intent": "ask_price",
            "entities": {"budget_min_aed": 15_000_000, "localities": ["dubai marina"]},
            "sentiment": "neutral",
            "confidence": 0.95,
        }
    ]
    llm.generations = list(generations)
    return await run_turn(make_envelope(request_id=request_id))


async def test_regeneration_fixes_violation(db, llm, retrieval):
    result = await _turn_with_generations(
        db, llm, retrieval,
        ["Only AED 777,000 for you!", "The 1 Bedroom starts at AED 1,350,000."],
        "req-regen-ok",
    )
    assert result.reply.status == "sent"
    assert result.reply.messages == ["The 1 Bedroom starts at AED 1,350,000."]
    assert "guardrail:numeric_grounding" in result.guardrail_flags
    turn = await db.turns.find_one({"request_id": "req-regen-ok"})
    assert turn["guardrails"]["regenerated"] is True
    assert turn["guardrails"]["final_action"] == "sent"


async def test_second_violation_forces_draft(db, llm, retrieval):
    result = await _turn_with_generations(
        db, llm, retrieval,
        ["Only AED 777,000 for you!", "Still AED 660,000, guaranteed returns!"],
        "req-regen-fail",
    )
    assert result.reply.status == "draft"
    assert llm.generate_calls == 3  # warmup + first + regeneration, never a third
    turn = await db.turns.find_one({"request_id": "req-regen-fail"})
    assert turn["guardrails"]["regenerated"] is True
    assert turn["guardrails"]["final_action"] == "draft"
    failed = {c["name"] for c in turn["guardrails"]["checks"] if not c["passed"]}
    assert {"numeric_grounding", "forbidden_phrases"} <= failed
