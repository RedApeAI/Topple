# Parity harness

Does the LangGraph pipeline behave like the one it replaced?

```bash
cd apps/worker/orchestrator
.venv/bin/python -m tests.parity run --impl legacy --impl graph
.venv/bin/python -m tests.parity run --impl legacy --impl graph --backend containers
.venv/bin/python -m tests.parity run --impl legacy --impl graph --case handoff_sentiment -v
.venv/bin/python -m tests.parity cases
.venv/bin/python -m tests.parity seed     # regenerate fixtures
```

It also runs as part of the normal suite — see `tests/test_parity.py`, which
asserts both that the implementations agree _and_ that the harness detects
disagreement when one is deliberately broken.

## Pieces

| Module           | Job                                                                   |
| ---------------- | --------------------------------------------------------------------- |
| `recorder.py`    | Wraps `gateway._chat` and `qdrant.retrieve`; writes fixtures          |
| `redact.py`      | Deterministic pseudonyms for tenant-identifying content               |
| `replayer.py`    | Runs one fixture through one implementation                           |
| `backends.py`    | `memory` (mongomock + recorded hits) or `containers` (testcontainers) |
| `observation.py` | Reduces a run to the compared fields                                  |
| `differ.py`      | Compares two observations; renders the report                         |
| `legacy/`        | The pre-migration pipeline, vendored verbatim                         |
| `seed.py`        | Authors the 33 checked-in fixtures                                    |

## Why `gateway._chat` is the seam

Stubbing `gateway.extract` / `gateway.generate` would have been easier and
wrong: the replayed run would skip JSON fence stripping, the extraction parse
retry, `<think>` removal and bubble splitting. `_chat` is the single function
through which both call shapes reach the model, so patching there replays the
model's _bytes_ and leaves every layer above it executing for real.

## What is compared

Exactly the fields in `observation.COMPARED_FIELDS`: stage in/out, transition
reason, qualification score, extraction intent/entities/sentiment, generation
system-prompt hash and output messages, guardrail checks/regenerated/final
action, handoff triggered/reason, retrieval `doc_id` and `used`, the persisted
message statuses, and whether dispatch was invoked.

Timestamps, latencies and token counts are excluded — two runs of the same
input will never agree on them, and including them would bury every real
difference in noise. `observation.EXCLUDED_FIELDS` records the omissions so
they stay decisions rather than oversights.

One field goes beyond that list: **`outcome`** (`"ok"` or `"raised:<Type>"`).
Without it, a run that raises and a run that succeeds can compare equal when
the turn document is sparse either way, and an implementation that started
throwing would pass. That is the most serious divergence there is, so it is not
left unobserved.

## Known intentional difference

The graph implementation keeps `user_id` and `session_id` on the turn document;
the legacy one deleted them (see `docs/graph-migration/00-recon.md` §4.2).
Neither field is compared, so the harness stays green. This is deliberate — the
harness guards _behaviour_, and that change was a bug fix with its own test in
`tests/test_turn_document.py`.

## Backends

`memory` is the default and is what CI runs: mongomock plus the recorded
retrieval, about two seconds for all 33 fixtures.

The retrieval stub is not a passive tape. If the implementation asks Qdrant a
different question than the recording did, it returns a
`__PARITY_QUERY_MISMATCH__` hit rather than the recorded ones — otherwise a
pipeline that built a different query would still be handed the right hits and
`retrieval.hits[].doc_id` would compare equal while behaviour had changed.

`containers` runs real MongoDB and real Qdrant, seeding collections from the
fixtures' recorded chunks so embedding and scoring are genuine. **It has never
been executed** — no Docker daemon was available where this was written. Treat
its first run as a debugging session.

## Fixtures

33 files, three per case:

```
happy_path  handoff_intent  handoff_sentiment  low_confidence_strikes
postcheck_regen_ok  postcheck_forces_draft  retrieval_gated_off
qdrant_missing  copilot  autopilot  duplicate_request_id
```

They are **scripted**, not captured from production — there is no production
traffic to capture. Only the model's response bytes are authored; the
playbooks, gateway parsing, guardrails, state machine and legacy pipeline that
produced everything else are real, and the recorder is the same one that would
sit in front of a live backend.

`seed.py` asserts, per turn, that the scripted responses were fully consumed
and that retrieval ran exactly when the scenario claims. A scenario that stops
exercising what its name says fails at seed time rather than silently becoming
a duplicate of another.

## Deleting this

`legacy/` is a fixture with a shelf life. Once the migration is signed off, it
and this harness should go — a frozen copy of deleted code will drift from
anything anyone cares about, and keeping it implies a rollback path that will
not actually work after the next few changes.
