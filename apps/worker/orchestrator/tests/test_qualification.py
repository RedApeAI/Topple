"""Qualification score from playbook weights; null never overwrites known."""
from __future__ import annotations

from app.engine.contacts import merge_entities, qualification_score
from app.playbooks.loader import load_playbook


def test_score_from_playbook_weights():
    playbook = load_playbook("real-estate-v1")
    lead, score = merge_entities({}, {"budget_min_aed": 9_000_000}, playbook)
    assert score == 30
    lead, score = merge_entities(lead, {"localities": ["dubai marina"]}, playbook)
    assert score == 50
    lead, score = merge_entities(
        lead, {"config": "2br", "timeline": "3_months", "purpose": "end_use"}, playbook
    )
    assert score == 100


def test_insurance_weights_differ():
    playbook = load_playbook("insurance-v1")
    lead, score = merge_entities({}, {"coverage_type": "health", "age": 35}, playbook)
    assert score == 45  # 25 + 20


def test_null_never_overwrites_known():
    playbook = load_playbook("real-estate-v1")
    lead, _ = merge_entities({}, {"budget_min_aed": 9_000_000, "config": "2br"}, playbook)
    lead2, score2 = merge_entities(
        lead, {"budget_min_aed": None, "config": "", "localities": []}, playbook
    )
    assert lead2["budget_min_aed"] == 9_000_000
    assert lead2["config"] == "2br"
    assert score2 == 50


def test_new_value_does_replace_old():
    playbook = load_playbook("real-estate-v1")
    lead, _ = merge_entities({}, {"budget_min_aed": 9_000_000}, playbook)
    lead2, _ = merge_entities(lead, {"budget_min_aed": 12_000_000}, playbook)
    assert lead2["budget_min_aed"] == 12_000_000


def test_type_coercion_and_enum_validation():
    playbook = load_playbook("real-estate-v1")
    lead, _ = merge_entities(
        {},
        {
            "budget_min_aed": "90,00,000",       # string with commas → int
            "localities": "jvc",              # scalar → list
            "timeline": "3 months",              # normalised to enum value
            "purpose": "world domination",       # invalid enum → dropped
        },
        playbook,
    )
    assert lead["budget_min_aed"] == 9_000_000
    assert lead["localities"] == ["jvc"]
    assert lead["timeline"] == "3_months"
    assert "purpose" not in lead


def test_score_helper_ignores_unknown_fields():
    playbook = load_playbook("real-estate-v1")
    assert qualification_score({"nonsense": 1}, playbook) == 0
