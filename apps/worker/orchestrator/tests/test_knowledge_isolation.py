"""One user's documents must never reach another user's turn.

Isolation used to be "the caller passes the right collection name" — a naming
convention, not a boundary. These pin the boundary itself: the filter is
mandatory, it is applied on every read, and an incomplete scope returns nothing
rather than everything.
"""
from __future__ import annotations

import inspect

import pytest

from app.stores import qdrant
from app.stores.knowledge import TENANT_KEY, USER_KEY, KnowledgeScope

from .conftest import make_envelope

ALICE = KnowledgeScope(tenant_id="plucia", user_id="alice")
BOB = KnowledgeScope(tenant_id="plucia", user_id="bob")
OTHER_ORG = KnowledgeScope(tenant_id="acme", user_id="alice")


class FakeQdrant:
    """Enough of the client to prove the filter is honoured.

    Deliberately applies the filter itself rather than ignoring it — a double
    that returns everything regardless would make these tests pass while the
    product leaked.
    """

    def __init__(self, points: list[dict] | None = None):
        self.points = points or []
        self.queries: list[dict] = []
        self.deleted: list[object] = []
        self.indexes: list[dict] = []
        self.exists = True

    async def collection_exists(self, collection):
        return self.exists

    async def create_payload_index(self, collection_name, field_name, field_schema):
        self.indexes.append({"field": field_name, "schema": field_schema})

    async def query(self, collection_name, query_text, query_filter=None, limit=10):
        self.queries.append({"filter": query_filter, "limit": limit})
        wanted = {
            condition.key: condition.match.value
            for condition in (query_filter.must if query_filter else [])
        }
        matched = [
            point
            for point in self.points
            if all(point["payload"].get(k) == v for k, v in wanted.items())
        ]

        class Response:
            def __init__(self, point):
                self.id = point["payload"]["doc_id"]
                self.document = point["text"]
                self.metadata = point["payload"]
                self.score = point["score"]

        return [Response(p) for p in matched[:limit]]

    async def add(self, collection_name, documents, metadata=None, ids=None):
        for text, meta in zip(documents, metadata or []):
            self.points.append({"text": text, "payload": meta, "score": 0.9})
        return []

    async def delete(self, collection_name, points_selector):
        self.deleted.append(points_selector)
        wanted = {
            condition.key: condition.match.value
            for condition in points_selector.filter.must
        }
        self.points = [
            point
            for point in self.points
            if not all(point["payload"].get(k) == v for k, v in wanted.items())
        ]


def _point(scope: KnowledgeScope, doc_id: str, text: str) -> dict:
    return {
        "text": text,
        "score": 0.9,
        "payload": {**scope.as_payload(), "doc_id": doc_id, "chunk_id": f"{doc_id}#1"},
    }


@pytest.fixture()
def fake(monkeypatch) -> FakeQdrant:
    client = FakeQdrant(
        [
            _point(ALICE, "alice_prices", "Alice's price sheet: AED 1,000,000."),
            _point(BOB, "bob_prices", "Bob's price sheet: AED 2,000,000."),
            _point(OTHER_ORG, "acme_prices", "Acme's price sheet: AED 3,000,000."),
        ]
    )
    qdrant.set_client(client)
    yield client
    qdrant.set_client(None)


# --------------------------------------------------------------------------- #
# The boundary
# --------------------------------------------------------------------------- #
async def test_a_user_sees_only_their_own_documents(fake):
    hits, flag = await qdrant.retrieve("kb", "price sheet", 10, 0.3, scope=ALICE)
    assert flag is None
    assert [h["doc_id"] for h in hits] == ["alice_prices"]


async def test_the_other_user_sees_theirs(fake):
    hits, _ = await qdrant.retrieve("kb", "price sheet", 10, 0.3, scope=BOB)
    assert [h["doc_id"] for h in hits] == ["bob_prices"]


async def test_the_same_user_id_in_another_tenant_is_still_separate(fake):
    """`tenant_id` is defence in depth: a colliding user id across
    organisations must not cross the org boundary."""
    hits, _ = await qdrant.retrieve("kb", "price sheet", 10, 0.3, scope=OTHER_ORG)
    assert [h["doc_id"] for h in hits] == ["acme_prices"]


async def test_every_query_carries_both_conditions(fake):
    await qdrant.retrieve("kb", "anything", 5, 0.3, scope=ALICE)
    keys = {c.key for c in fake.queries[0]["filter"].must}
    assert keys == {TENANT_KEY, USER_KEY}


# --------------------------------------------------------------------------- #
# Fail closed
# --------------------------------------------------------------------------- #
async def test_a_missing_user_returns_nothing_not_everything(fake):
    """The whole point. Unfiltered results here would be a breach; no facts is
    merely a worse answer."""
    hits, flag = await qdrant.retrieve(
        "kb", "price sheet", 10, 0.3, scope=KnowledgeScope(tenant_id="plucia")
    )
    assert hits == []
    assert flag == "knowledge_scope_missing"
    assert fake.queries == [], "Qdrant must not even be asked"


async def test_a_missing_tenant_also_fails_closed(fake):
    hits, flag = await qdrant.retrieve(
        "kb", "x", 10, 0.3, scope=KnowledgeScope(tenant_id="", user_id="alice")
    )
    assert (hits, flag) == ([], "knowledge_scope_missing")


def test_scope_is_a_required_argument():
    """Isolation must not be something a call site can forget."""
    signature = inspect.signature(qdrant.retrieve)
    scope = signature.parameters["scope"]
    assert scope.kind is inspect.Parameter.KEYWORD_ONLY
    assert scope.default is inspect.Parameter.empty


# --------------------------------------------------------------------------- #
# Ingestion and deletion
# --------------------------------------------------------------------------- #
async def test_ingested_documents_are_stamped_and_only_visible_to_their_owner(fake):
    written = await qdrant.ingest(
        "kb", ALICE, [{"text": "New Alice doc about parking.", "doc_id": "alice_parking"}]
    )
    assert written == 1

    alice_hits, _ = await qdrant.retrieve("kb", "parking", 10, 0.3, scope=ALICE)
    bob_hits, _ = await qdrant.retrieve("kb", "parking", 10, 0.3, scope=BOB)
    assert "alice_parking" in [h["doc_id"] for h in alice_hits]
    assert "alice_parking" not in [h["doc_id"] for h in bob_hits]


async def test_ingestion_refuses_an_incomplete_scope(fake):
    """An unstamped point can never match a filter, so it would be invisible
    forever — better to refuse than to write dead data."""
    with pytest.raises(ValueError, match="complete scope"):
        await qdrant.ingest("kb", KnowledgeScope(tenant_id="plucia"), [{"text": "x"}])


async def test_forgetting_a_user_leaves_everyone_else_intact(fake):
    await qdrant.forget_user("kb", ALICE)

    alice_hits, _ = await qdrant.retrieve("kb", "price", 10, 0.3, scope=ALICE)
    bob_hits, _ = await qdrant.retrieve("kb", "price", 10, 0.3, scope=BOB)
    assert alice_hits == []
    assert [h["doc_id"] for h in bob_hits] == ["bob_prices"]


async def test_forgetting_a_tenant_takes_its_users_with_it(fake):
    await qdrant.forget_tenant("kb", "plucia")

    for scope in (ALICE, BOB):
        hits, _ = await qdrant.retrieve("kb", "price", 10, 0.3, scope=scope)
        assert hits == []
    others, _ = await qdrant.retrieve("kb", "price", 10, 0.3, scope=OTHER_ORG)
    assert [h["doc_id"] for h in others] == ["acme_prices"]


# --------------------------------------------------------------------------- #
# Schema
# --------------------------------------------------------------------------- #
async def test_the_user_index_is_declared_as_the_partition_key(fake):
    """`is_tenant=True` is what makes Qdrant co-locate a user's vectors. Without
    it, filtered search degrades as everyone else's documents accumulate."""
    await qdrant.ensure_collection("kb")

    by_field = {index["field"]: index["schema"] for index in fake.indexes}
    assert by_field[USER_KEY].is_tenant is True
    assert TENANT_KEY in by_field


# --------------------------------------------------------------------------- #
# End to end through a turn
# --------------------------------------------------------------------------- #
async def test_a_turn_retrieves_only_the_signed_in_user_s_knowledge(
    db, llm, retrieval, monkeypatch
):
    """The scope comes from the envelope, so a node cannot get it wrong."""
    from app.engine.pipeline import run_turn

    seen: list[KnowledgeScope] = []

    async def capture(collection, query_text, top_k, min_score, *, scope):
        seen.append(scope)
        return [], None

    monkeypatch.setattr(qdrant, "retrieve", capture)

    await run_turn(make_envelope(request_id="kb-1", user_id="alice"))
    llm.extractions = [{
        "intent": "ask_price",
        "entities": {"budget_min_aed": 1_500_000, "localities": ["dubai marina"]},
        "sentiment": "neutral", "confidence": 0.95,
    }]
    await run_turn(make_envelope(request_id="kb-2", user_id="alice"))

    assert seen, "retrieval must have been reached"
    assert all(s.user_id == "alice" and s.tenant_id == "plucia" for s in seen)


# --------------------------------------------------------------------------- #
# Re-upload replaces — regression cover
# --------------------------------------------------------------------------- #
# Qdrant's `add` mints a fresh UUID per point, so without an explicit delete a
# second upload of a corrected file leaves BOTH versions retrievable. The
# numeric-grounding guardrail would then treat a superseded price as a
# legitimate fact — exactly the hallucination it exists to prevent.
async def test_reuploading_a_document_retires_the_previous_version(fake):
    await qdrant.ingest("kb", ALICE, [
        {"text": "Marina Crest 1BR from AED 1,350,000.", "doc_id": "prices", "chunk_id": "prices#1"},
    ])
    await qdrant.ingest("kb", ALICE, [
        {"text": "Marina Crest 1BR from AED 1,500,000.", "doc_id": "prices", "chunk_id": "prices#1"},
    ])

    hits, _ = await qdrant.retrieve("kb", "Marina Crest", 10, 0.3, scope=ALICE)
    texts = [h["text"] for h in hits if h["doc_id"] == "prices"]
    assert len(texts) == 1, "the old price must not still be retrievable"
    assert "1,500,000" in texts[0]


async def test_replacing_one_document_leaves_the_others_alone(fake):
    await qdrant.ingest("kb", ALICE, [
        {"text": "Parking is AED 90,000.", "doc_id": "parking"},
        {"text": "Marina Crest 1BR from AED 1,350,000.", "doc_id": "prices"},
    ])
    await qdrant.ingest("kb", ALICE, [
        {"text": "Marina Crest 1BR from AED 1,500,000.", "doc_id": "prices"},
    ])

    hits, _ = await qdrant.retrieve("kb", "anything", 20, 0.3, scope=ALICE)
    doc_ids = [h["doc_id"] for h in hits]
    assert doc_ids.count("parking") == 1, "an unrelated document must survive"
    assert doc_ids.count("prices") == 1


async def test_one_user_reuploading_does_not_touch_another_s_copy(fake):
    """Both users may have a document called `prices`. Replacing one must be
    scoped, or an upload would delete a colleague's file."""
    await qdrant.ingest("kb", ALICE, [{"text": "Alice prices v1", "doc_id": "prices"}])
    await qdrant.ingest("kb", BOB, [{"text": "Bob prices v1", "doc_id": "prices"}])
    await qdrant.ingest("kb", ALICE, [{"text": "Alice prices v2", "doc_id": "prices"}])

    bob_hits, _ = await qdrant.retrieve("kb", "prices", 10, 0.3, scope=BOB)
    assert [h["text"] for h in bob_hits if h["doc_id"] == "prices"] == ["Bob prices v1"]
