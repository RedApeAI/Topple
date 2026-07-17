"""Contact resolution and bifurcation merge."""
from __future__ import annotations

from app.engine import contacts
from app.playbooks.loader import load_playbook


async def test_create_then_lookup(db):
    created = await contacts.resolve_or_create(db, "plucia", "whatsapp", "+9199")
    assert created["identities"] == [{"channel": "whatsapp", "external_id": "+9199"}]
    assert created["lead"]["qualification_score"] == 0

    found = await contacts.resolve_or_create(db, "plucia", "whatsapp", "+9199")
    assert found["_id"] == created["_id"]
    assert await db.contacts.count_documents({}) == 1


async def test_same_identity_different_tenant_is_separate(db):
    a = await contacts.resolve_or_create(db, "plucia", "whatsapp", "+9199")
    b = await contacts.resolve_or_create(db, "acme", "whatsapp", "+9199")
    assert a["_id"] != b["_id"]


async def test_merge_combines_identities_and_lead_fields(db):
    playbook = load_playbook("real-estate-v1")
    primary = await contacts.resolve_or_create(db, "plucia", "whatsapp", "+9199")
    duplicate = await contacts.resolve_or_create(db, "plucia", "email", "b@x.com")

    lead_p, _ = contacts.merge_entities(
        primary["lead"], {"budget_min_aed": 9_000_000}, playbook
    )
    await contacts.update_lead(db, primary["_id"], lead_p)
    lead_d, _ = contacts.merge_entities(
        duplicate["lead"], {"localities": ["dubai marina"], "config": "2br"}, playbook
    )
    await contacts.update_lead(db, duplicate["_id"], lead_d)
    await db.conversations.insert_one(
        {"tenant_id": "plucia", "contact_id": duplicate["_id"], "channel": "email"}
    )

    merged = await contacts.merge_identities(db, str(primary["_id"]), str(duplicate["_id"]))

    identities = {(i["channel"], i["external_id"]) for i in merged["identities"]}
    assert identities == {("whatsapp", "+9199"), ("email", "b@x.com")}
    assert merged["lead"]["budget_min_aed"] == 9_000_000
    assert merged["lead"]["localities"] == ["dubai marina"]
    assert merged["lead"]["config"] == "2br"
    # duplicate is gone, its conversation repointed
    assert await db.contacts.count_documents({}) == 1
    convo = await db.conversations.find_one({"tenant_id": "plucia"})
    assert convo["contact_id"] == primary["_id"]


async def test_merge_primary_values_win(db):
    playbook = load_playbook("real-estate-v1")
    primary = await contacts.resolve_or_create(db, "plucia", "whatsapp", "+91A")
    duplicate = await contacts.resolve_or_create(db, "plucia", "email", "a@x.com")
    lead_p, _ = contacts.merge_entities(primary["lead"], {"budget_min_aed": 8_000_000}, playbook)
    await contacts.update_lead(db, primary["_id"], lead_p)
    lead_d, _ = contacts.merge_entities(duplicate["lead"], {"budget_min_aed": 5_000_000}, playbook)
    await contacts.update_lead(db, duplicate["_id"], lead_d)

    merged = await contacts.merge_identities(db, str(primary["_id"]), str(duplicate["_id"]))
    assert merged["lead"]["budget_min_aed"] == 8_000_000
