"""Guardrails: operator reports / customer messages never leak internals."""
from __future__ import annotations

from app.operator.sanitize import (
    contains_forbidden,
    salvage_operator_output,
    sanitize_customer_text,
    sanitize_operator_output,
)

OID = "6a6784e05e94df729edd388d"

# The real leak: malformed JSON with no opening brace, so the object regex and
# tool-name checks all miss it and it sailed through to the salesperson.
DANGLING = (
    'Since there is no prior conversation I will draft a warm message. The mode '
    'is copilot, so will create a DRAFT awaiting approval.", "operator_output": '
    '"Drafting a WhatsApp message to introduce your new Dubai Marina property."}'
)


def test_detects_ids_json_and_tool_names():
    assert contains_forbidden(f"contact {OID}")
    assert contains_forbidden('result {"status":"draft"}')
    assert contains_forbidden("[1, 2, 3]")
    assert contains_forbidden("I called send_message")
    assert contains_forbidden("used find_contact then get_conversation")
    assert not contains_forbidden("Drafted a WhatsApp hello for your approval.")


def test_detects_dangling_json_debris():
    # the exact class of leak the user reported — no opening brace to anchor on
    assert contains_forbidden(DANGLING)
    assert contains_forbidden('report.", "operator_output": "done"}')
    assert contains_forbidden('trailing brace }')
    # "thought" as ordinary prose must NOT trip the guard
    assert not contains_forbidden("I thought you'd want to reach Priya first.")


def test_salvage_recovers_operator_output_from_debris():
    assert (
        salvage_operator_output(DANGLING)
        == "Drafting a WhatsApp message to introduce your new Dubai Marina property."
    )
    assert salvage_operator_output("just some prose, no fields") is None


def test_operator_output_scrubs_dangling_debris():
    # even without salvage, the debris string must not reach the salesperson
    out = sanitize_operator_output(DANGLING, "Drafted a message for you.")
    assert "operator_output" not in out
    assert "}" not in out


def test_operator_output_passthrough_when_clean():
    clean = "Drafted a message to Priya on WhatsApp for your approval."
    assert sanitize_operator_output(clean, "fallback") == clean


def test_operator_output_redacts_mild_leak():
    text = f"Drafted a hello to Priya (id {OID}) for your approval."
    out = sanitize_operator_output(text, "fallback")
    assert OID not in out
    assert "approval" in out
    assert out != "fallback"  # enough survived to keep the model's wording


def test_operator_output_falls_back_when_gutted():
    # mostly internals — redaction leaves too little, use the clean fallback
    text = f'{{"tool":"send_message","contact_id":"{OID}","channel":"whatsapp"}}'
    out = sanitize_operator_output(text, "Drafted a message to Priya on WhatsApp.")
    assert out == "Drafted a message to Priya on WhatsApp."
    assert not contains_forbidden(out)


def test_operator_output_strips_tool_names():
    text = "I used send_message to draft it."
    out = sanitize_operator_output(text, "Drafted it.")
    assert "send_message" not in out


def test_customer_text_passthrough_when_clean():
    assert sanitize_customer_text("Hi Priya! 👋") == "Hi Priya! 👋"


def test_customer_text_redacts_and_may_fail():
    assert OID not in (sanitize_customer_text(f"Hi {OID}") or "")
    # nothing but internals → None → the send is failed upstream
    assert sanitize_customer_text(OID) is None
    assert sanitize_customer_text("") is None
