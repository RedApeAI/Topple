"""Where a replayed turn's Mongo and Qdrant live.

Two backends, with different fidelity/cost trade-offs:

- `containers` — real MongoDB and real Qdrant via testcontainers. Qdrant is
  seeded from the fixture's recorded chunks and then genuinely queried, so
  embedding and scoring are real. Needs a Docker daemon.
- `memory` — mongomock plus replayed retrieval. Needs nothing, runs in
  milliseconds, and is what CI can rely on.

The memory backend's retrieval stub is not a passive tape. It asserts that the
implementation asked for what the recording asked for, and returns a sentinel
hit when it did not. Without that, a pipeline that built a *different* Qdrant
query would still be handed the recorded hits, and `retrieval.hits[].doc_id`
would compare equal while the actual behaviour had changed.
"""
from __future__ import annotations

import uuid
from typing import Any, Protocol

from app.stores import mongo, qdrant

#: Returned instead of the recorded hits when the query text does not match
#: what was recorded — makes query drift visible through a compared field.
QUERY_MISMATCH = "__PARITY_QUERY_MISMATCH__"


class Backend(Protocol):
    async def start(self) -> None: ...
    async def stop(self) -> None: ...
    async def fresh_db(self) -> Any: ...
    async def install_retrieval(self, turns: list[dict], strict: bool = True) -> None: ...


def _mismatch_hit(expected: str, actual: str) -> list[dict]:
    return [
        {
            "doc_id": QUERY_MISMATCH,
            "chunk_id": f"expected={expected[:60]!r} actual={actual[:60]!r}",
            "text": "",
            "source_uri": None,
            "version": None,
            "effective_date": None,
            "score": 0.0,
            "used": False,
        }
    ]


# --------------------------------------------------------------------------- #
class MemoryBackend:
    """mongomock + recorded retrieval. No daemon, no network."""

    name = "memory"

    def __init__(self) -> None:
        self._original_retrieve = qdrant.retrieve

    async def start(self) -> None:
        return None

    async def stop(self) -> None:
        qdrant.retrieve = self._original_retrieve

    async def fresh_db(self):
        from mongomock_motor import AsyncMongoMockClient

        client = AsyncMongoMockClient()
        name = f"parity_{uuid.uuid4().hex[:8]}"
        mongo.set_client(client, db_name=name)
        db = client[name]
        await mongo.init_indexes(db)
        return db

    async def install_retrieval(self, turns: list[dict], strict: bool = True) -> None:
        """Replay recorded retrieval.

        `strict` replays the tape in order and flags a query that differs from
        what was recorded — the right semantics for a topology that makes the
        same calls in the same sequence.

        Speculative retrieval (4b) breaks that assumption on purpose: it
        retrieves on turns where the stage gate turns out closed, so the call
        count and ordering legitimately differ from the recording. For those
        impls the tape is served *by collection* instead, and query drift is
        counted rather than poisoned — see `query_drifts`.
        """
        records: list[dict] = []
        for turn in turns:
            records.extend(turn.get("retrieval") or [])
        remaining = list(records)
        by_collection = {r["collection"]: r for r in records}
        self.query_drifts = 0
        self.speculative_calls = 0

        async def lenient(collection, query_text, top_k, min_score, *, scope=None):
            self.speculative_calls += 1
            record = by_collection.get(collection)
            if record is None:
                return [], None
            if record["query"] != query_text:
                self.query_drifts += 1
            return [dict(hit) for hit in record["hits"]], record["flag"]

        async def retrieve(collection, query_text, top_k, min_score, *, scope=None):
            if not remaining:
                # The recording never reached retrieval here. Returning empty
                # is right: a run that retrieves when the recording did not is
                # itself a divergence, and shows up as an unexpected FACTS
                # block in `system_prompt_hash`.
                return [], None
            record = remaining.pop(0)
            if record["query"] != query_text:
                return _mismatch_hit(record["query"], query_text), "parity_query_mismatch"
            return [dict(hit) for hit in record["hits"]], record["flag"]

        qdrant.retrieve = retrieve if strict else lenient


# --------------------------------------------------------------------------- #
class ContainerBackend:
    """Real MongoDB and Qdrant.

    NOTE: unverified. No Docker daemon was available in the environment where
    this was written, so this path has never executed. Treat the first run as a
    debugging session, not a result.
    """

    name = "containers"

    def __init__(self, mongo_image: str = "mongo:7", qdrant_image: str = "qdrant/qdrant:v1.16.2") -> None:
        self._mongo_image = mongo_image
        self._qdrant_image = qdrant_image
        self._mongo_container = None
        self._qdrant_container = None
        self._client = None
        self._seeded: set[str] = set()

    async def start(self) -> None:
        from testcontainers.community.mongodb import MongoDbContainer
        from testcontainers.community.qdrant import QdrantContainer

        try:
            self._mongo_container = MongoDbContainer(self._mongo_image).start()
            self._qdrant_container = QdrantContainer(self._qdrant_image).start()
        except Exception as exc:  # noqa: BLE001 — the cause is nearly always the same
            raise RuntimeError(
                "the 'containers' backend needs a running Docker daemon "
                f"({type(exc).__name__}: {exc}). Start Docker, or use "
                "--backend memory, which needs nothing and is what CI runs."
            ) from exc

        from motor.motor_asyncio import AsyncIOMotorClient

        self._client = AsyncIOMotorClient(self._mongo_container.get_connection_url())

        # Point the retrieval module at the container and drop any cached
        # client built from the ambient settings.
        from qdrant_client import AsyncQdrantClient

        host = self._qdrant_container.get_container_host_ip()
        port = self._qdrant_container.get_exposed_port(6333)
        client = AsyncQdrantClient(url=f"http://{host}:{port}")
        client.set_model(qdrant.EMBEDDING_MODEL)
        qdrant.set_client(client)

    async def stop(self) -> None:
        qdrant.set_client(None)
        if self._client is not None:
            self._client.close()
        for container in (self._qdrant_container, self._mongo_container):
            if container is not None:
                container.stop()

    async def fresh_db(self):
        name = f"parity_{uuid.uuid4().hex[:8]}"
        mongo.set_client(self._client, db_name=name)
        db = self._client[name]
        await mongo.init_indexes(db)
        return db

    async def install_retrieval(self, turns: list[dict], strict: bool = True) -> None:
        """Seed the collections this scenario expects, then let Qdrant answer.

        A collection with no recorded hits is deliberately *not* created — that
        is how the `qdrant_missing` fixtures reach the real
        `knowledge_source_missing` path rather than a simulated one.
        """
        client = qdrant.get_client()
        for turn in turns:
            for record in turn.get("retrieval") or []:
                collection = record["collection"]
                if collection in self._seeded or not record["hits"]:
                    continue
                await client.add(
                    collection_name=collection,
                    documents=[hit["text"] for hit in record["hits"]],
                    metadata=[
                        {
                            "doc_id": hit["doc_id"],
                            "chunk_id": hit["chunk_id"],
                            "source_uri": hit.get("source_uri"),
                            "version": hit.get("version"),
                            "effective_date": hit.get("effective_date"),
                        }
                        for hit in record["hits"]
                    ],
                )
                self._seeded.add(collection)


def make_backend(name: str) -> Backend:
    if name == "memory":
        return MemoryBackend()
    if name in ("containers", "testcontainers"):
        return ContainerBackend()
    raise ValueError(f"unknown backend {name!r} — use 'memory' or 'containers'")
