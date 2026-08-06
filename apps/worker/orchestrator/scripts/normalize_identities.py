"""One-off backfill: canonicalise stored contact identities.

Identities written before `app/engine/identity.py` existed are raw — mixed case
emails, phone numbers with spaces and brackets. `uniq_tenant_identity` is a
byte-exact index, so those variants are separate contacts that lookup cannot
reconcile.

Run it from the orchestrator directory, with its venv:

    cd apps/worker/orchestrator
    .venv/bin/python -m scripts.normalize_identities            # dry run
    .venv/bin/python -m scripts.normalize_identities --apply

`-m` is required: running the file by path would put `scripts/` on `sys.path`
and `import app` would fail.

Canonicalising can reveal that two contact documents are the same person. Those
are reported and deliberately NOT written: merging picks a winner for `profile`
and `lead`, which is a judgement call that belongs to `POST /v1/contacts/merge`.
It is also what makes `--apply` safe — writing both halves of a collision would
violate the unique index halfway through the run.
"""
from __future__ import annotations

import argparse
import asyncio
import sys

try:
    from app.engine.contacts import display_name
    from app.engine.identity import normalize_identity
    from app.stores import mongo
except ModuleNotFoundError as exc:  # pragma: no cover — an operator-facing hint
    sys.exit(
        f"{exc}\n\n"
        "Run this from the orchestrator directory, using its venv:\n"
        "    cd apps/worker/orchestrator\n"
        "    .venv/bin/python -m scripts.normalize_identities"
    )

from pymongo.errors import DuplicateKeyError  # noqa: E402  (after the import guard)

# (tenant_id, channel, canonical external_id)
IdentityKey = tuple[str, str, str]


def plan_changes(
    contacts: list[dict],
) -> tuple[list[dict], dict[IdentityKey, list[str]]]:
    """Work out what to write, without writing anything.

    Returns `(updates, collisions)`:

    * `updates` — one `{_id, identities, profile}` per contact whose stored form
      differs from its canonical form.
    * `collisions` — canonical identities owned by more than one contact. Those
      contacts are excluded from `updates`, because writing them would collide
      on `uniq_tenant_identity`, and because a human has to choose which
      document survives.

    Pure and dict-in/dict-out so it can be tested without a database — the
    earlier version of this script entangled the same logic with a live cursor
    and shipped three bugs unnoticed.
    """
    owners: dict[IdentityKey, list[str]] = {}
    proposed: dict[str, dict] = {}
    contact_keys: dict[str, list[IdentityKey]] = {}

    for contact in contacts:
        contact_id = str(contact["_id"])
        tenant_id = contact.get("tenant_id", "")

        canonical: list[dict] = []
        keys: list[IdentityKey] = []
        dirty = False

        for identity in contact.get("identities", []):
            clean = normalize_identity(identity)
            if clean != identity:
                dirty = True
            # An identity that normalises to nothing is dropped, and never
            # recorded as an owner — otherwise every contact with a blank id
            # would look like the same person.
            if not clean["external_id"]:
                continue
            canonical.append(clean)
            key: IdentityKey = (tenant_id, clean["channel"], clean["external_id"])
            keys.append(key)
            owners.setdefault(key, [])
            if contact_id not in owners[key]:
                owners[key].append(contact_id)

        profile = dict(contact.get("profile") or {})
        wanted = display_name(profile.get("name"))
        if profile.get("name_lower") != wanted:
            profile["name_lower"] = wanted
            dirty = True

        contact_keys[contact_id] = keys
        if dirty:
            proposed[contact_id] = {
                "_id": contact["_id"],
                "identities": canonical,
                "profile": profile,
            }

    collisions = {key: ids for key, ids in owners.items() if len(ids) > 1}
    collided = {contact_id for ids in collisions.values() for contact_id in ids}

    updates = [
        update
        for contact_id, update in proposed.items()
        if contact_id not in collided
    ]
    return updates, collisions


async def main(apply: bool) -> int:
    db = mongo.get_db()
    try:
        contacts = await db.contacts.find({}).to_list(length=None)
        updates, collisions = plan_changes(contacts)

        written = 0
        conflicted: list[str] = []
        if apply:
            for update in updates:
                try:
                    await db.contacts.update_one(
                        {"_id": update["_id"]},
                        {
                            "$set": {
                                "identities": update["identities"],
                                "profile": update["profile"],
                            }
                        },
                    )
                    written += 1
                except DuplicateKeyError:
                    # A concurrent writer claimed this identity between the
                    # plan and the write. Skip it and keep going — a partial
                    # backfill that reports itself beats one that aborts.
                    conflicted.append(str(update["_id"]))

        print(f"scanned  {len(contacts)} contacts")
        if apply:
            print(f"updated  {written} contacts")
        else:
            print(f"would update {len(updates)} contacts")

        if conflicted:
            print(
                f"\nskipped {len(conflicted)} contacts that collided during the "
                "write (concurrent change):"
            )
            for contact_id in conflicted:
                print(f"  {contact_id}")

        if collisions:
            print(
                f"\n{len(collisions)} identity collisions revealed by normalisation."
            )
            print("These are the same person on two contact documents. They were")
            print("left untouched — merge them, then re-run:")
            print("  POST /v1/contacts/merge {primary_contact_id, duplicate_contact_id}\n")
            for (tenant, channel, external_id), ids in sorted(collisions.items()):
                print(f"  {tenant} {channel}:{external_id} -> {', '.join(sorted(ids))}")
        else:
            print("no identity collisions")

        if not apply:
            print("\nDry run. Re-run with --apply to write.")
        return 0
    finally:
        mongo.get_client().close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Canonicalise contact identities.")
    parser.add_argument("--apply", action="store_true", help="write changes")
    sys.exit(asyncio.run(main(parser.parse_args().apply)))
