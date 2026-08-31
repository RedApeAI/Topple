"""Operator outcomes are stable run to run, and the differ notices when not.

Same discipline as the turn-pipeline harness: a comparison nobody has tried to
break is not evidence. The mutations below each change one outcome and assert
the differ reports it, on the right field.
"""
from __future__ import annotations

import pytest

from .parity.operator import (
    OPERATOR_FIELDS,
    SCENARIOS,
    diff_operator,
    observe_operator,
)


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda s: s.id)
async def test_operator_outcomes_are_reproducible(db, scenario, monkeypatch):
    """The same scripted model, twice, must reach the same outcome."""
    first = await observe_operator(db, scenario, monkeypatch)
    second = await observe_operator(db, scenario, monkeypatch)
    assert diff_operator(first, second) == []


async def test_the_scenarios_actually_cover_distinct_outcomes(db, monkeypatch):
    """A fixture set where everything lands the same way tests nothing."""
    outcomes = set()
    for scenario in SCENARIOS:
        observed = await observe_operator(db, scenario, monkeypatch)
        outcomes.add((observed["action_status"], observed["dispatched"]))
    assert len(outcomes) >= 4, f"scenarios collapse to {outcomes}"


# --------------------------------------------------------------------------- #
# The differ detects breakage
# --------------------------------------------------------------------------- #
async def test_differ_catches_a_send_that_stopped_dispatching(db, monkeypatch):
    scenario = next(s for s in SCENARIOS if s.id == "op-send-autopilot")
    good = await observe_operator(db, scenario, monkeypatch)
    broken = {**good, "dispatched": False, "action_status": "draft"}
    assert set(diff_operator(good, broken)) == {"dispatched", "action_status"}


async def test_differ_catches_different_tool_arguments(db, monkeypatch):
    scenario = next(s for s in SCENARIOS if s.id == "op-send-autopilot")
    good = await observe_operator(db, scenario, monkeypatch)
    broken = {**good, "tool_calls": [("send_message", {"to": "someone-else@example.com"})]}
    assert diff_operator(good, broken) == ["tool_calls"]


async def test_trajectory_noise_is_not_compared():
    """Thoughts and step ordering vary legitimately in a model-driven loop."""
    for excluded in ("steps", "thought", "reasoning", "latency"):
        assert excluded not in OPERATOR_FIELDS


# --------------------------------------------------------------------------- #
# What the scenarios assert about the product
# --------------------------------------------------------------------------- #
async def test_autopilot_sends_and_copilot_drafts(db, monkeypatch):
    autopilot = await observe_operator(
        db, next(s for s in SCENARIOS if s.id == "op-send-autopilot"), monkeypatch
    )
    copilot = await observe_operator(
        db, next(s for s in SCENARIOS if s.id == "op-send-copilot"), monkeypatch
    )
    assert (autopilot["action_status"], autopilot["dispatched"]) == ("sent", True)
    assert (copilot["action_status"], copilot["dispatched"]) == ("draft", False)


async def test_a_forbidden_phrase_never_dispatches(db, monkeypatch):
    observed = await observe_operator(
        db, next(s for s in SCENARIOS if s.id == "op-forbidden-blocked"), monkeypatch
    )
    assert observed["dispatched"] is False
    assert observed["action_status"] == "draft"


async def test_an_identical_resend_fires_once(db, monkeypatch):
    observed = await observe_operator(
        db, next(s for s in SCENARIOS if s.id == "op-dedupe"), monkeypatch
    )
    assert observed["dispatched"] is True
    statuses = [name for name, _ in observed["tool_calls"]]
    assert statuses == ["send_message", "send_message"], "the model tried twice"
    # ...and only one message left the building.
    assert observed["action_status"] in ("sent", "duplicate")


async def test_without_a_runtime_the_forbidden_phrase_check_cannot_run(db, monkeypatch):
    """Documented, not accidental: no runtime means no playbook to read the
    forbidden-phrase list from. Recorded as a fixture so the day someone gives
    the Operator a tenant-independent guardrail list, this flips and is noticed.
    """
    observed = await observe_operator(
        db, next(s for s in SCENARIOS if s.id == "op-no-runtime"), monkeypatch
    )
    assert observed["dispatched"] is True, "the hole is real"
    assert "guaranteed returns" in observed["action_text"]


async def test_an_unsupported_channel_sends_nothing(db, monkeypatch):
    observed = await observe_operator(
        db, next(s for s in SCENARIOS if s.id == "op-bad-channel"), monkeypatch
    )
    assert observed["dispatched"] is False
    assert observed["action_status"] == "failed"
