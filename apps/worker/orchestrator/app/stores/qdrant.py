"""Per-tenant RAG retrieval over Qdrant.

One collection per `knowledge_source_id`. Embeddings come from fastembed
(bundled with qdrant-client) using its default model BAAI/bge-small-en-v1.5 —
the exact same embedder `seeds/seed_qdrant.py` uses, so no external embedding
API is needed. Imports are lazy so unit tests (which mock `retrieve`) don't
need fastembed installed.
"""
from __future__ import annotations

import logging
import time

from ..config import settings

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"

_client = None


def get_client():
    global _client
    if _client is None:
        from qdrant_client import AsyncQdrantClient

        _client = AsyncQdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)
        _client.set_model(EMBEDDING_MODEL)
    return _client


def set_client(client) -> None:
    """Inject a client (tests)."""
    global _client
    _client = client


async def retrieve(
    collection: str, query_text: str, top_k: int, min_score: float
) -> tuple[list[dict], str | None]:
    """Query one knowledge-source collection.

    Returns (hits, flag). Hits carry the seeded payload plus `score` and
    `used` — `used: true` only for hits at/above `min_score` (those are the
    ones injected into the FACTS block; the rest stay in the trace as
    `used: false`). A missing collection never crashes the turn: empty hits
    plus the guardrail-visible flag `knowledge_source_missing`.
    """
    client = get_client()
    started = time.monotonic()
    try:
        if not await client.collection_exists(collection):
            logger.warning("knowledge source collection %r not found", collection)
            return [], "knowledge_source_missing"
        responses = await client.query(
            collection_name=collection, query_text=query_text, limit=top_k
        )
    except Exception as exc:  # noqa: BLE001 — retrieval must never crash a turn
        logger.error("qdrant retrieval failed for %r: %s", collection, exc)
        return [], "retrieval_failed"

    hits: list[dict] = []
    for r in responses:
        meta = dict(r.metadata or {})
        hits.append(
            {
                "doc_id": str(meta.get("doc_id", r.id)),
                "chunk_id": str(meta.get("chunk_id", r.id)),
                "text": r.document or meta.get("text", ""),
                "source_uri": meta.get("source_uri"),
                "version": meta.get("version"),
                "effective_date": meta.get("effective_date"),
                "score": float(r.score),
                "used": float(r.score) >= min_score,
            }
        )
    # rerank-by-score (defensive; qdrant already returns sorted)
    hits.sort(key=lambda h: h["score"], reverse=True)
    logger.debug(
        "retrieved %d hits from %r in %dms",
        len(hits),
        collection,
        int((time.monotonic() - started) * 1000),
    )
    return hits, None


async def ping() -> bool:
    try:
        await get_client().get_collections()
        return True
    except Exception:  # noqa: BLE001
        return False
