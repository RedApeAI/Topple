"""The identity backfill's planning logic.

`plan_changes` is pure so this can assert on it directly. The behaviour that
matters is what it *refuses* to do: a contact whose canonical identity is shared
with another contact must be left alone, both because writing it would violate
`uniq_tenant_identity` and because choosing which document survives is a human
decision.
"""
from __future__ import annotations

from scripts.normalize_identities import plan_changes


def _contact(contact_id, identities, name=None, name_lower=..., tenant="redape"):
    profile = {"name": name}
    if name_lower is not ...:
        profile["name_lower"] = name_lower
    return {
        "_id": contact_id,
        "tenant_id": tenant,
        "identities": [
            {"channel": channel, "external_id": external_id}
            for channel, external_id in identities
        ],
        "profile": profile,
    }


def _ids(updates):
    return {str(update["_id"]) for update in updates}


# --------------------------------------------------------------------------- #
# What gets rewritten
# --------------------------------------------------------------------------- #
def test_messy_phone_is_canonicalised():
    updates, collisions = plan_changes(
        [_contact("a", [("whatsapp", "+971 (50) 123-4567")], name="Ada")]
    )
    assert collisions == {}
    assert updates[0]["identities"] == [
        {"channel": "whatsapp", "external_id": "+971501234567"}
    ]


def test_name_lower_is_backfilled():
    updates, _ = plan_changes(
        [_contact("a", [("email", "ada@example.com")], name="Ada Lovelace")]
    )
    assert updates[0]["profile"]["name_lower"] == "ada lovelace"


def test_already_canonical_contact_is_left_alone():
    """Idempotence: a second run must plan nothing."""
    contact = _contact(
        "a", [("email", "ada@example.com")], name="Ada", name_lower="ada"
    )
    updates, collisions = plan_changes([contact])
    assert updates == []
    assert collisions == {}


def test_second_pass_over_planned_output_is_a_fixed_point():
    contact = _contact("a", [("email", "Ada@Example.COM")], name="Ada")
    updates, _ = plan_changes([contact])

    rewritten = {**contact, **updates[0]}
    assert plan_changes([rewritten])[0] == [], "normalisation must converge"


# --------------------------------------------------------------------------- #
# Collisions
# --------------------------------------------------------------------------- #
def test_case_variant_emails_collide_and_neither_is_written():
    updates, collisions = plan_changes(
        [
            _contact("a", [("email", "Ada@Example.com")], name="Ada"),
            _contact("b", [("email", "ada@example.com")], name="Ada L"),
        ]
    )
    assert list(collisions) == [("redape", "email", "ada@example.com")]
    assert sorted(collisions[("redape", "email", "ada@example.com")]) == ["a", "b"]
    assert updates == [], "writing either half would violate the unique index"


def test_collision_only_excludes_the_contacts_involved():
    updates, collisions = plan_changes(
        [
            _contact("a", [("email", "Ada@Example.com")], name="Ada"),
            _contact("b", [("email", "ada@example.com")], name="Ada L"),
            _contact("c", [("whatsapp", "+971 50 123 4567")], name="Bob"),
        ]
    )
    assert len(collisions) == 1
    assert _ids(updates) == {"c"}, "an unrelated contact must still be fixed"


def test_same_tenant_required_for_a_collision():
    _, collisions = plan_changes(
        [
            _contact("a", [("email", "ada@example.com")], tenant="redape"),
            _contact("b", [("email", "ada@example.com")], tenant="acme"),
        ]
    )
    assert collisions == {}, "different tenants are different people"


def test_a_contact_listing_one_identity_twice_is_not_a_collision():
    """Two spellings of one address on the SAME contact converge — that is a
    duplicate within the document, not two people."""
    _, collisions = plan_changes(
        [_contact("a", [("email", "Ada@Example.com"), ("email", "ada@example.com")])]
    )
    assert collisions == {}


# --------------------------------------------------------------------------- #
# Degenerate identities
# --------------------------------------------------------------------------- #
def test_none_external_id_becomes_empty_and_is_dropped():
    """`str(None)` would write the literal address "none"."""
    updates, collisions = plan_changes(
        [
            {
                "_id": "a",
                "tenant_id": "redape",
                "identities": [{"channel": "email", "external_id": None}],
                "profile": {"name": "Ada"},
            }
        ]
    )
    assert collisions == {}
    assert updates[0]["identities"] == []
    serialised = repr(updates)
    assert "none" not in serialised.lower().replace("None", "")


def test_blank_identities_do_not_fabricate_a_collision():
    _, collisions = plan_changes(
        [
            _contact("a", [("email", "   ")]),
            _contact("b", [("email", "")]),
        ]
    )
    assert collisions == {}, "empty ids must never be recorded as owners"


def test_contact_with_no_identities_is_handled():
    updates, collisions = plan_changes([_contact("a", [], name="Ada")])
    assert collisions == {}
    assert updates[0]["profile"]["name_lower"] == "ada"
