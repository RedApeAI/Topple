"""TurnTrace: builds the turn document incrementally through the pipeline and
writes it ONCE at the end — including on every error path, with `error` set.

The turn document is the observability unit: one doc per invocation, unique
on `request_id` (which is also the idempotency mechanism — the pipeline
inserts a stub to reserve the id, and this writer replaces it)."""
from __future__ import annotations

from datetime import datetime, timezone

from app.schemas.envelope import OrchestratorInput


def _now() -> datetime:
    return datetime.now(timezone.utc)


class TurnTrace:
    def __init__(self, envelope: OrchestratorInput, turn_id, resolved_model: str | None = None):
        self.turn_id = turn_id
        self.doc: dict = {
            "request_id": envelope.request_id,
            "tenant_id": envelope.tenant_id,
            "conversation_id": None,
            "contact_id": None,
            "channel": envelope.channel.value,
            "ts_start": _now(),
            "ts_end": None,
            "model_id": envelope.runtime.model_id,
            "adapter_id": envelope.runtime.adapter_id,
            "resolved_model": resolved_model,  # what was actually sent to the LLM
            "playbook_id": envelope.runtime.playbook_id,
            "playbook_version": envelope.runtime.playbook_version,
            "prompt_version": envelope.runtime.prompt_version,
            "mode": envelope.mode.value,
            "extraction": None,
            "retrieval": None,
            "state": None,
            "generation": None,
            "guardrails": None,
            "handoff": {"triggered": False, "reason": None},
            "totals": {"latency_ms": 0, "prompt_tokens": 0, "completion_tokens": 0},
            "error": None,
            "eval": {"human_rating": None, "auto_score": None, "labels": []},
            "status": "in_progress",
            "result": None,  # OrchestratorResult snapshot, replayed on dedupe
        }

    # ------------------------------------------------------------------ #
    def set_resolved_model(self, model: str) -> None:
        self.doc["resolved_model"] = model

    def set_ids(self, conversation_id, contact_id) -> None:
        self.doc["conversation_id"] = conversation_id
        self.doc["contact_id"] = contact_id

    def set_extraction(self, result, stats) -> None:
        self.doc["extraction"] = {
            "intent": result.intent,
            "entities": result.entities,
            "sentiment": result.sentiment,
            "confidence": result.confidence,
            "latency_ms": stats.latency_ms,
            "prompt_tokens": stats.prompt_tokens,
            "completion_tokens": stats.completion_tokens,
            "retries": stats.retries,
        }
        self._bump_tokens(stats)

    def set_retrieval(self, collection: str, query: str, latency_ms: int, hits: list[dict]) -> None:
        self.doc["retrieval"] = {
            "collection": collection,
            "query": query,
            "latency_ms": latency_ms,
            "hits": [
                {
                    "doc_id": h["doc_id"],
                    "chunk_id": h["chunk_id"],
                    "score": h["score"],
                    "used": h["used"],
                }
                for h in hits
            ],
        }

    def set_state(self, stage_in: str, stage_out: str, reason: str, score: int) -> None:
        self.doc["state"] = {
            "stage_in": stage_in,
            "stage_out": stage_out,
            "transition_reason": reason,
            "qualification_score": score,
        }

    def set_generation(self, system_prompt_hash: str, output_messages: list[str], stats, retries: int) -> None:
        self.doc["generation"] = {
            "system_prompt_hash": system_prompt_hash,
            "output_messages": output_messages,
            "latency_ms": stats.latency_ms,
            "prompt_tokens": stats.prompt_tokens,
            "completion_tokens": stats.completion_tokens,
            "retries": retries,
        }
        self._bump_tokens(stats)

    def add_generation_stats(self, stats) -> None:
        """Fold a regeneration attempt into the generation section."""
        gen = self.doc["generation"]
        gen["latency_ms"] += stats.latency_ms
        gen["prompt_tokens"] += stats.prompt_tokens
        gen["completion_tokens"] += stats.completion_tokens
        self._bump_tokens(stats)

    def set_guardrails(self, checks: list, regenerated: bool, final_action: str) -> None:
        self.doc["guardrails"] = {
            "checks": [c.as_doc() for c in checks],
            "regenerated": regenerated,
            "final_action": final_action,
        }

    def set_handoff(self, triggered: bool, reason: str | None) -> None:
        self.doc["handoff"] = {"triggered": triggered, "reason": reason}

    def set_error(self, step: str, exc: Exception) -> None:
        self.doc["error"] = {
            "step": step,
            "type": type(exc).__name__,
            "message": str(exc),
        }
        self.doc["status"] = "error"

    def _bump_tokens(self, stats) -> None:
        t = self.doc["totals"]
        t["prompt_tokens"] += stats.prompt_tokens
        t["completion_tokens"] += stats.completion_tokens

    # ------------------------------------------------------------------ #
    async def write(self, db, result: dict | None = None) -> None:
        """Replace the idempotency stub with the finished document."""
        self.doc["ts_end"] = _now()
        self.doc["totals"]["latency_ms"] = int(
            (self.doc["ts_end"] - self.doc["ts_start"]).total_seconds() * 1000
        )
        if result is not None:
            self.doc["result"] = result
            self.doc["status"] = "completed"
        self.doc["_id"] = self.turn_id
        await db.turns.replace_one({"_id": self.turn_id}, self.doc)
