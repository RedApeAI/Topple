"""Per-user RAG retrieval over Qdrant.

**Multitenancy is payload-based, not collection-based.** One collection holds
every user's knowledge, partitioned by a `user_id` payload index declared with
`is_tenant=True` — which is Qdrant's own recommendation and makes it co-locate
each user's vectors on disk, so a filtered search stays as fast as an
unfiltered one. A collection per user would give physical separation but costs
segments and index overhead per collection, which stops being affordable
somewhere in the low hundreds.

Isolation therefore rests on a filter, so the filter is **not optional**:
`retrieve` requires a `KnowledgeScope` and fails closed without a complete one.
See `knowledge.py`.

Embeddings come from fastembed (bundled with qdrant-client) using its default
model BAAI/bge-small-en-v1.5. Imports are lazy so unit tests (which mock
`retrieve`) don't need fastembed installed.
"""
from __future__ import annotations

import logging
import time

from ..config import settings
from .knowledge import TENANT_KEY, USER_KEY, KnowledgeScope

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


# --------------------------------------------------------------------------- #
# Schema
# --------------------------------------------------------------------------- #
async def ensure_collection(collection: str) -> None:
    """Create the payload indexes multitenancy depends on. Idempotent.

    `is_tenant=True` on `user_id` is the load-bearing part: it tells Qdrant to
    store each user's points together, so a filtered query reads one contiguous
    region instead of scanning and discarding. Without it, filtered search
    degrades as the collection grows and every user pays for every other user's
    documents.
    """
    from qdrant_client import models

    client = get_client()
    if not await client.collection_exists(collection):
        logger.info("knowledge collection %r does not exist yet", collection)
        return

    await client.create_payload_index(
        collection_name=collection,
        field_name=USER_KEY,
        field_schema=models.KeywordIndexParams(type="keyword", is_tenant=True),
    )
    await client.create_payload_index(
        collection_name=collection,
        field_name=TENANT_KEY,
        field_schema=models.KeywordIndexParams(type="keyword"),
    )
    logger.info("payload indexes ensured on %r", collection)


# --------------------------------------------------------------------------- #
# Reads
# --------------------------------------------------------------------------- #
async def retrieve(
    collection: str,
    query_text: str,
    top_k: int,
    min_score: float,
    *,
    scope: KnowledgeScope,
) -> tuple[list[dict], str | None]:
    """Query one collection, restricted to `scope`.

    Returns (hits, flag). Hits carry the seeded payload plus `score` and
    `used` — `used: true` only for hits at/above `min_score` (those are the
    ones injected into the FACTS block; the rest stay in the trace as
    `used: false`).

    Three soft failures, each with its own flag so the operational response is
    obvious: `knowledge_scope_missing` (nothing to filter on — a bug or an old
    envelope), `knowledge_source_missing` (the collection was never seeded),
    `retrieval_failed` (Qdrant is unwell). None of them crashes the turn.
    """
    if not scope.is_complete:
        # Fail closed. Returning unfiltered results here would hand one user
        # another's documents, which is worse than answering without facts.
        logger.warning(
            "retrieval refused: incomplete knowledge scope (tenant=%r user=%r)",
            scope.tenant_id, scope.user_id,
        )
        return [], "knowledge_scope_missing"

    client = get_client()
    started = time.monotonic()
    try:
        if not await client.collection_exists(collection):
            logger.warning("knowledge source collection %r not found", collection)
            return [], "knowledge_source_missing"
        responses = await client.query(
            collection_name=collection,
            query_text=query_text,
            query_filter=scope.as_filter(),
            limit=top_k,
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
        "retrieved %d hits from %r for user=%s in %dms",
        len(hits), collection, scope.user_id, int((time.monotonic() - started) * 1000),
    )
    return hits, None


# --------------------------------------------------------------------------- #
# Writes
# --------------------------------------------------------------------------- #
async def ingest(
    collection: str,
    scope: KnowledgeScope,
    documents: list[dict],
) -> int:
    """Add documents to one user's knowledge. Returns how many were written.

    Each document is `{text, doc_id, chunk_id?, source_uri?, version?,
    effective_date?}`. The scope is stamped onto every point here rather than
    being the caller's responsibility — an un-stamped point is invisible to
    every query (it cannot match the filter), so forgetting would silently
    produce a knowledge base that retrieves nothing.
    """
    if not scope.is_complete:
        raise ValueError("ingestion requires a complete scope (tenant_id and user_id)")
    if not documents:
        return 0

    client = get_client()
    if not await client.collection_exists(collection):
        # `add` creates the collection, but then the payload indexes would be
        # missing and every query would fall back to a full scan.
        await client.add(collection_name=collection, documents=["__bootstrap__"],
                         metadata=[{**scope.as_payload(), "doc_id": "__bootstrap__"}])
        await client.delete(
            collection_name=collection,
            points_selector=_by_doc_id(collection, "__bootstrap__"),
        )
    await ensure_collection(collection)

    payloads = []
    texts = []
    for document in documents:
        text = str(document.get("text") or "").strip()
        if not text:
            continue
        texts.append(text)
        payloads.append(
            {
                **scope.as_payload(),
                "doc_id": str(document.get("doc_id") or "untitled"),
                "chunk_id": str(document.get("chunk_id") or document.get("doc_id") or "0"),
                "source_uri": document.get("source_uri"),
                "version": document.get("version"),
                "effective_date": document.get("effective_date"),
            }
        )

    if not texts:
        return 0

    # Replace, don't accumulate. Uploading a corrected price sheet must retire
    # the old one — see `forget_document`.
    for doc_id in {payload["doc_id"] for payload in payloads}:
        await forget_document(collection, scope, doc_id)

    await client.add(collection_name=collection, documents=texts, metadata=payloads)
    logger.info(
        "ingested %d chunks into %r for tenant=%s user=%s",
        len(texts), collection, scope.tenant_id, scope.user_id,
    )
    return len(texts)


def _by_doc_id(collection: str, doc_id: str, scope: KnowledgeScope | None = None):
    from qdrant_client import models

    conditions = [
        models.FieldCondition(key="doc_id", match=models.MatchValue(value=doc_id))
    ]
    if scope is not None:
        conditions = list(scope.as_filter().must) + conditions
    return models.FilterSelector(filter=models.Filter(must=conditions))


async def forget_document(collection: str, scope: KnowledgeScope, doc_id: str) -> None:
    """Delete one document's chunks for one user.

    Re-uploading a corrected file must *replace* the old one. Qdrant's `add`
    mints a fresh UUID per point, so without this a second upload leaves both
    versions retrievable — and the numeric-grounding guardrail would then treat
    a superseded price as a legitimate fact, which is precisely the failure it
    exists to prevent.
    """
    if not scope.is_complete:
        raise ValueError("forget_document requires a complete scope")
    client = get_client()
    if not await client.collection_exists(collection):
        return
    await client.delete(
        collection_name=collection,
        points_selector=_by_doc_id(collection, doc_id, scope),
    )


async def forget_user(collection: str, scope: KnowledgeScope) -> None:
    """Delete everything one user owns. The deletion half of isolation."""
    if not scope.is_complete:
        raise ValueError("forget_user requires a complete scope")
    from qdrant_client import models

    client = get_client()
    if not await client.collection_exists(collection):
        return
    await client.delete(
        collection_name=collection,
        points_selector=models.FilterSelector(filter=scope.as_filter()),
    )
    logger.info("forgot knowledge for tenant=%s user=%s", scope.tenant_id, scope.user_id)


async def forget_tenant(collection: str, tenant_id: str) -> None:
    """Offboard a whole organisation."""
    from qdrant_client import models

    client = get_client()
    if not await client.collection_exists(collection):
        return
    scope = KnowledgeScope(tenant_id=tenant_id)
    await client.delete(
        collection_name=collection,
        points_selector=models.FilterSelector(filter=scope.tenant_filter()),
    )
    logger.info("forgot all knowledge for tenant=%s", tenant_id)


async def count_unscoped(collection: str) -> int:
    """Points with no `user_id` — invisible to every query.

    Anything seeded before this design existed has no scope payload and can
    never match a filter, so it is dead weight that retrieves nothing. Worth
    knowing about explicitly rather than wondering why a migrated knowledge
    base is silent.
    """
    from qdrant_client import models

    client = get_client()
    if not await client.collection_exists(collection):
        return 0
    result = await client.count(
        collection_name=collection,
        count_filter=models.Filter(
            must_not=[models.IsNullCondition(is_null=models.PayloadField(key=USER_KEY))]
        ),
        exact=True,
    )
    total = (await client.count(collection_name=collection, exact=True)).count
    return total - result.count


async def ping() -> bool:
    try:
        await get_client().get_collections()
        return True
    except Exception:  # noqa: BLE001
        return False
