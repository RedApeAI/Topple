"""Capture envelopes and raw LLM traffic into replayable fixtures.

The recording seam is `gateway._chat` — the single function through which both
extraction and generation reach the model. Recording there rather than at
`gateway.extract` / `gateway.generate` means the replayed run still executes
the real response handling: JSON fence stripping, the extraction parse retry,
`<think>` removal, and bubble splitting. Stubbing the outer functions would
skip all of it and quietly exclude a whole class of behaviour from the
comparison.

`retrieve` is recorded alongside, because a fixture that cannot reproduce its
retrieval hits cannot reproduce its FACTS block, and therefore cannot reproduce
the numeric-grounding guardrail.

Fixture shape (`fixtures/*.json`):

    {
      "id": "happy-path-01",
      "case": "happy_path",
      "description": "...",
      "turns": [
        {
          "envelope":  { ...OrchestratorInput, redacted... },
          "llm":       [ {kind, model, temperature, messages, response}, ... ],
          "retrieval": [ {collection, query, top_k, min_score, hits, flag} ],
          "expect_raises": null | "TurnInProgress"
        }
      ]
    }
"""
from __future__ import annotations

import contextlib
import contextvars
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.llm import gateway
from app.stores import qdrant

from .redact import Redactor

FIXTURE_DIR = Path(__file__).parent / "fixtures"

#: Which outer call the current `_chat` belongs to. Set by the wrappers around
#: `extract` / `generate`; temperature alone would be a fragile discriminator.
_call_kind: contextvars.ContextVar[str] = contextvars.ContextVar(
    "parity_call_kind", default="chat"
)


@dataclass
class Recorder:
    redactor: Redactor
    llm: list[dict] = field(default_factory=list)
    retrieval: list[dict] = field(default_factory=list)

    def reset(self) -> None:
        """Start a new turn. Fixtures group calls per turn, not per scenario."""
        self.llm = []
        self.retrieval = []

    def snapshot(self) -> dict:
        return {"llm": list(self.llm), "retrieval": list(self.retrieval)}


@contextlib.contextmanager
def recording(redactor: Redactor | None = None):
    """Patch the gateway and Qdrant to record everything passing through.

    Calls through to whatever `gateway._chat` and `qdrant.retrieve` currently
    are, so this works equally over the real backends and over a scripted stand
    in — which is how the checked-in fixtures were produced.
    """
    recorder = Recorder(redactor=redactor or Redactor())
    original_chat = gateway._chat
    original_extract = gateway.extract
    original_generate = gateway.generate
    original_retrieve = qdrant.retrieve

    async def chat(messages, *, model, temperature, disable_thinking):
        text, stats = await original_chat(
            messages, model=model, temperature=temperature,
            disable_thinking=disable_thinking,
        )
        recorder.llm.append(
            {
                "kind": _call_kind.get(),
                "model": model,
                "temperature": temperature,
                "messages": recorder.redactor.scrub_messages(messages),
                "response": recorder.redactor.scrub(text),
            }
        )
        return text, stats

    async def extract(*, model, messages):
        token = _call_kind.set("extract")
        try:
            return await original_extract(model=model, messages=messages)
        finally:
            _call_kind.reset(token)

    async def generate(*, model, messages):
        token = _call_kind.set("generate")
        try:
            return await original_generate(model=model, messages=messages)
        finally:
            _call_kind.reset(token)

    async def retrieve(collection, query_text, top_k, min_score, *, scope=None):
        hits, flag = await original_retrieve(
            collection, query_text, top_k, min_score, scope=scope
        )
        recorder.retrieval.append(
            {
                "collection": collection,
                "query": recorder.redactor.scrub(query_text),
                "top_k": top_k,
                "min_score": min_score,
                "hits": [
                    {**hit, "text": recorder.redactor.scrub(hit.get("text", ""))}
                    for hit in hits
                ],
                "flag": flag,
            }
        )
        return hits, flag

    gateway._chat = chat
    gateway.extract = extract
    gateway.generate = generate
    qdrant.retrieve = retrieve
    try:
        yield recorder
    finally:
        gateway._chat = original_chat
        gateway.extract = original_extract
        gateway.generate = original_generate
        qdrant.retrieve = original_retrieve


# --------------------------------------------------------------------------- #
# Fixture files
# --------------------------------------------------------------------------- #
def write_fixture(fixture: dict, directory: Path = FIXTURE_DIR) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{fixture['id']}.json"
    path.write_text(json.dumps(fixture, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    return path


def load_fixture(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_fixtures(
    directory: Path = FIXTURE_DIR, case: str | None = None
) -> list[dict]:
    """Every fixture on disk, sorted by id, optionally filtered by case."""
    fixtures = [load_fixture(p) for p in sorted(directory.glob("*.json"))]
    if case:
        fixtures = [f for f in fixtures if f.get("case") == case]
    return fixtures


def cases(directory: Path = FIXTURE_DIR) -> dict[str, int]:
    """Case name → fixture count, for the CLI's coverage report."""
    counts: dict[str, int] = {}
    for fixture in load_fixtures(directory):
        counts[fixture.get("case", "uncategorised")] = (
            counts.get(fixture.get("case", "uncategorised"), 0) + 1
        )
    return dict(sorted(counts.items()))


def envelope_of(turn: dict) -> dict[str, Any]:
    return turn["envelope"]
