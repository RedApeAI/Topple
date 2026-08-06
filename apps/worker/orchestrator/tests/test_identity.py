"""Identity canonicalisation.

The unique index is byte-exact, so these rules are what stop the same person
being stored twice.
"""
from __future__ import annotations

import pytest

from app.engine.identity import (
    channel_for_address,
    looks_like_email,
    looks_like_phone,
    normalize,
    normalize_identity,
)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Ada@Example.COM", "ada@example.com"),
        ("  ada@example.com  ", "ada@example.com"),
        ("ADA@EXAMPLE.COM", "ada@example.com"),
    ],
)
def test_email_case_and_space_converge(raw, expected):
    assert normalize("email", raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "+971501234567",
        "+971 50 123 4567",
        "+971 (50) 123-4567",
        "  +971-50-123-4567  ",
        "+971.50.123.4567",
    ],
)
def test_phone_formatting_converges(raw):
    assert normalize("whatsapp", raw) == "+971501234567"


def test_phone_keeps_only_a_leading_plus():
    assert normalize("voice", "+971+50+1234567") == "+971501234567"


def test_phone_without_country_code_is_left_alone():
    """Inventing a country code could merge two different people — worse than
    leaving a duplicate for the merge endpoint."""
    assert normalize("whatsapp", "0501234567") == "0501234567"


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("@Jane.Doe", "jane.doe"),
        ("Jane.Doe", "jane.doe"),
        ("https://instagram.com/Jane.Doe", "jane.doe"),
        ("https://www.linkedin.com/in/jane-doe/", "jane-doe"),
    ],
)
def test_handles_drop_at_sign_and_url_wrapper(raw, expected):
    assert normalize("instagram", raw) == expected


def test_unknown_channel_is_only_trimmed():
    assert normalize("carrier-pigeon", "  Coo  ") == "Coo"


def test_normalize_identity_preserves_other_keys():
    identity = normalize_identity(
        {"channel": "email", "external_id": "Ada@Example.com", "label": "work"}
    )
    assert identity == {
        "channel": "email",
        "external_id": "ada@example.com",
        "label": "work",
    }


def test_none_external_id_is_empty_not_a_crash():
    assert normalize_identity({"channel": "email", "external_id": None})["external_id"] == ""


@pytest.mark.parametrize(
    "value,expected",
    [
        ("ada@example.com", "email"),
        ("+971501234567", "whatsapp"),
        ("+971 50 123 4567", "whatsapp"),
        ("Ariyaman", None),
        ("", None),
        # A short number is a street number, not a destination.
        ("42", None),
    ],
)
def test_channel_for_address(value, expected):
    assert channel_for_address(value) == expected


def test_address_shape_helpers():
    assert looks_like_email("a@b.co")
    assert not looks_like_email("a@b")
    assert not looks_like_email("Ariyaman")
    assert looks_like_phone("+971 50 123 4567")
    assert not looks_like_phone("Ariyaman")
