"""The generic engine must execute BOTH vertical playbooks correctly —
parametrized to prove it is vertical-agnostic."""
from __future__ import annotations

import pytest

from app.engine.state_machine import next_stage
from app.playbooks.loader import load_playbook

CASES = [
    # (playbook_id, stage_in, intent, lead, handoff, return_stage, expected_stage)
    # --- real estate ---
    ("real-estate-v1", "GREETING", "greeting", {}, False, None, "QUALIFYING"),
    ("real-estate-v1", "QUALIFYING", "provide_info", {"budget_min_aed": 9_000_000}, False, None, "QUALIFYING"),
    ("real-estate-v1", "QUALIFYING", "provide_info",
     {"budget_min_aed": 9_000_000, "localities": ["dubai marina"]}, False, None, "RECOMMENDING"),
    ("real-estate-v1", "QUALIFYING", "provide_info",
     {"budget_min_aed": 9_000_000, "config": "2br"}, False, None, "RECOMMENDING"),
    ("real-estate-v1", "RECOMMENDING", "objection", {}, False, None, "OBJECTION_HANDLING"),
    ("real-estate-v1", "RECOMMENDING", "request_visit", {}, False, None, "SITE_VISIT_BOOKING"),
    ("real-estate-v1", "QUALIFYING", "request_visit", {}, False, None, "QUALIFYING"),  # rule scoped to RECOMMENDING
    ("real-estate-v1", "RECOMMENDING", "ask_price", {}, True, None, "HANDOFF"),
    ("real-estate-v1", "GREETING", "greeting", {}, True, None, "HANDOFF"),
    # --- insurance ---
    ("insurance-v1", "GREETING", "greeting", {}, False, None, "NEEDS_ASSESSMENT"),
    ("insurance-v1", "NEEDS_ASSESSMENT", "provide_info", {"coverage_type": "health"}, False, None, "NEEDS_ASSESSMENT"),
    ("insurance-v1", "NEEDS_ASSESSMENT", "provide_info",
     {"coverage_type": "health", "age": 35}, False, None, "PLAN_RECOMMENDATION"),
    ("insurance-v1", "NEEDS_ASSESSMENT", "provide_info",
     {"coverage_type": "term_life", "budget_annual_aed": 15_000}, False, None, "PLAN_RECOMMENDATION"),
    ("insurance-v1", "PLAN_RECOMMENDATION", "request_quote", {}, False, None, "QUOTE_DISCUSSION"),
    ("insurance-v1", "PLAN_RECOMMENDATION", "objection", {}, False, None, "OBJECTION_HANDLING"),
    ("insurance-v1", "QUOTE_DISCUSSION", "provide_info", {}, True, None, "HANDOFF"),
]


@pytest.mark.parametrize("playbook_id,stage_in,intent,lead,handoff,return_stage,expected", CASES)
def test_transitions(playbook_id, stage_in, intent, lead, handoff, return_stage, expected):
    playbook = load_playbook(playbook_id)
    result = next_stage(playbook, stage_in, intent, lead, handoff, return_stage)
    assert result.stage_out == expected


@pytest.mark.parametrize("playbook_id,detour_from", [
    ("real-estate-v1", "RECOMMENDING"),
    ("insurance-v1", "PLAN_RECOMMENDATION"),
])
def test_objection_detour_records_return_stage(playbook_id, detour_from):
    playbook = load_playbook(playbook_id)
    result = next_stage(playbook, detour_from, "objection", {}, False, None)
    assert result.stage_out == "OBJECTION_HANDLING"
    assert result.return_stage == detour_from


def test_objection_detour_returns_to_previous():
    playbook = load_playbook("real-estate-v1")
    result = next_stage(
        playbook, "OBJECTION_HANDLING", "provide_info", {}, False, "RECOMMENDING"
    )
    assert result.stage_out == "RECOMMENDING"
    assert result.return_stage is None
    assert "return_to_previous" in result.transition_reason


def test_return_then_transition_same_turn():
    """Popping back from the detour still lets intent rules fire this turn."""
    playbook = load_playbook("real-estate-v1")
    result = next_stage(
        playbook, "OBJECTION_HANDLING", "request_visit", {}, False, "RECOMMENDING"
    )
    assert result.stage_out == "SITE_VISIT_BOOKING"


def test_repeated_objection_stays_in_detour():
    playbook = load_playbook("real-estate-v1")
    result = next_stage(
        playbook, "OBJECTION_HANDLING", "objection", {}, False, "RECOMMENDING"
    )
    assert result.stage_out == "OBJECTION_HANDLING"
    assert result.return_stage == "RECOMMENDING"
