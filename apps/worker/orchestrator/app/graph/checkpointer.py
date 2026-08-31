"""A LangGraph checkpointer on the Motor client we already hold.

Written rather than installed. `langgraph-checkpoint-mongodb` 0.4.0 takes a
sync `MongoClient`, wraps every `a*` method in `run_in_executor` around blocking
pymongo, creates its own collections with their own unique compound index, and
pulls in SQLAlchemy and the LangChain stack to do it. See
`docs/graph-migration/02-checkpointer.md`.

**Scope.** This is for the *Operator* plane and the copilot interrupt. The turn
graph does not use it: `turns.request_id` uniqueness is already its lock,
replay-on-result is already its resume, and adding a second identity scheme
beside that is exactly what CLAUDE.md decision 4 rules out. Hence its own
collections, keyed by `thread_id`, deliberately not `turns`.

Serialisation is LangGraph's own `JsonPlusSerializer` (`self.serde`), which
returns `(type_tag, bytes)`; the bytes go into Mongo as `Binary`.
"""
from __future__ import annotations

import logging
from typing import Any, AsyncIterator, Sequence

from bson.binary import Binary
from langgraph.checkpoint.base import (
    WRITES_IDX_MAP,
    BaseCheckpointSaver,
    ChannelVersions,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
    get_checkpoint_id,
)
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

logger = logging.getLogger(__name__)

CHECKPOINTS = "graph_checkpoints"
WRITES = "graph_checkpoint_writes"

#: Marks an ObjectId inside a serialised checkpoint.
_OID_TAG = "__oid__"


def _encode(value: Any) -> Any:
    """Replace ObjectIds with a tagged marker, recursively.

    LangGraph's serialiser is msgpack-based and has no idea what an ObjectId
    is, and this state is full of them — every Mongo document that reaches a
    node carries one. Tagging rather than stringifying keeps the round trip
    lossless: an id that goes in as an ObjectId comes back as one, so a node
    resuming from a checkpoint can still query with it.
    """
    from bson import ObjectId

    if isinstance(value, ObjectId):
        return {_OID_TAG: str(value)}
    if isinstance(value, dict):
        return {key: _encode(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_encode(item) for item in value]
    return value


def _decode(value: Any) -> Any:
    from bson import ObjectId

    if isinstance(value, dict):
        if len(value) == 1 and _OID_TAG in value:
            return ObjectId(value[_OID_TAG])
        return {key: _decode(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_decode(item) for item in value]
    return value


class _BsonAwareSerializer(JsonPlusSerializer):
    """`JsonPlusSerializer` that survives BSON types."""

    def dumps_typed(self, obj: Any) -> tuple[str, bytes]:
        return super().dumps_typed(_encode(obj))

    def loads_typed(self, data: tuple[str, bytes]) -> Any:
        return _decode(super().loads_typed(data))


def _thread(config: dict) -> str:
    return str(config["configurable"]["thread_id"])


def _namespace(config: dict) -> str:
    return str(config["configurable"].get("checkpoint_ns", ""))


class MongoCheckpointer(BaseCheckpointSaver):
    """Async checkpointer over two Mongo collections.

    `thread_id` is the graph's identity; `checkpoint_ns` separates subgraphs
    within it; `checkpoint_id` orders the states. The unique index is on all
    three together, so a resumed run cannot silently fork.
    """

    def __init__(self, db=None, serde=None) -> None:
        super().__init__(serde=serde or _BsonAwareSerializer())
        self._db = db
        self._indexed = False

    @property
    def db(self):
        """Resolved per call rather than captured.

        LangGraph takes the checkpointer at `compile()` time, but the Motor
        handle changes — tests swap in mongomock, and `mongo.set_client` is the
        supported way to do that. Reading it the same way the rest of the app
        does keeps one source of truth.
        """
        if self._db is not None:
            return self._db
        from ..stores import mongo

        return mongo.get_db()

    async def ensure_indexes(self) -> None:
        """Create the indexes once per db, lazily. Cheap to call on every run."""
        if self._indexed:
            return
        try:
            await self.setup()
        except Exception as exc:  # noqa: BLE001 — mongomock rejects some index specs
            logger.debug("checkpoint index bootstrap skipped: %s", exc)
        self._indexed = True

    # ------------------------------------------------------------------ #
    async def setup(self) -> None:
        """Idempotent; safe on every startup."""
        await self.db[CHECKPOINTS].create_index(
            [("thread_id", 1), ("checkpoint_ns", 1), ("checkpoint_id", -1)],
            unique=True,
            name="uniq_checkpoint",
        )
        await self.db[WRITES].create_index(
            [("thread_id", 1), ("checkpoint_ns", 1), ("checkpoint_id", 1),
             ("task_id", 1), ("idx", 1)],
            unique=True,
            name="uniq_checkpoint_write",
        )

    def _dump(self, value: Any) -> dict:
        type_tag, payload = self.serde.dumps_typed(value)
        return {"type": type_tag, "payload": Binary(payload)}

    def _load(self, stored: dict) -> Any:
        return self.serde.loads_typed((stored["type"], bytes(stored["payload"])))

    # ------------------------------------------------------------------ #
    # Reads
    # ------------------------------------------------------------------ #
    async def aget_tuple(self, config: dict) -> CheckpointTuple | None:
        query: dict = {
            "thread_id": _thread(config),
            "checkpoint_ns": _namespace(config),
        }
        checkpoint_id = get_checkpoint_id(config)
        if checkpoint_id:
            query["checkpoint_id"] = checkpoint_id
            doc = await self.db[CHECKPOINTS].find_one(query)
        else:
            # No id means "the latest", which is what a fresh resume asks for.
            found = await (
                self.db[CHECKPOINTS]
                .find(query)
                .sort([("checkpoint_id", -1)])
                .to_list(length=1)
            )
            doc = found[0] if found else None

        if doc is None:
            return None
        return await self._to_tuple(doc)

    async def _to_tuple(self, doc: dict) -> CheckpointTuple:
        writes = await (
            self.db[WRITES]
            .find(
                {
                    "thread_id": doc["thread_id"],
                    "checkpoint_ns": doc["checkpoint_ns"],
                    "checkpoint_id": doc["checkpoint_id"],
                }
            )
            .sort([("task_id", 1), ("idx", 1)])
            .to_list(length=None)
        )
        config = {
            "configurable": {
                "thread_id": doc["thread_id"],
                "checkpoint_ns": doc["checkpoint_ns"],
                "checkpoint_id": doc["checkpoint_id"],
            }
        }
        parent_config = None
        if doc.get("parent_checkpoint_id"):
            parent_config = {
                "configurable": {
                    "thread_id": doc["thread_id"],
                    "checkpoint_ns": doc["checkpoint_ns"],
                    "checkpoint_id": doc["parent_checkpoint_id"],
                }
            }
        return CheckpointTuple(
            config=config,
            checkpoint=self._load(doc["checkpoint"]),
            metadata=self._load(doc["metadata"]),
            parent_config=parent_config,
            pending_writes=[
                (w["task_id"], w["channel"], self._load(w["value"])) for w in writes
            ],
        )

    async def alist(
        self,
        config: dict | None,
        *,
        filter: dict | None = None,
        before: dict | None = None,
        limit: int | None = None,
    ) -> AsyncIterator[CheckpointTuple]:
        query: dict = {}
        if config:
            query["thread_id"] = _thread(config)
            query["checkpoint_ns"] = _namespace(config)
        if before:
            query["checkpoint_id"] = {"$lt": get_checkpoint_id(before)}
        if filter:
            for key, value in filter.items():
                query[f"metadata_index.{key}"] = value

        cursor = self.db[CHECKPOINTS].find(query).sort([("checkpoint_id", -1)])
        docs = await cursor.to_list(length=limit)
        for doc in docs:
            yield await self._to_tuple(doc)

    # ------------------------------------------------------------------ #
    # Writes
    # ------------------------------------------------------------------ #
    async def aput(
        self,
        config: dict,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: ChannelVersions,
    ) -> dict:
        thread_id = _thread(config)
        namespace = _namespace(config)
        checkpoint_id = checkpoint["id"]

        await self.db[CHECKPOINTS].update_one(
            {
                "thread_id": thread_id,
                "checkpoint_ns": namespace,
                "checkpoint_id": checkpoint_id,
            },
            {
                "$set": {
                    "parent_checkpoint_id": get_checkpoint_id(config),
                    "checkpoint": self._dump(checkpoint),
                    "metadata": self._dump(metadata),
                    # A shallow copy of the metadata, queryable by `alist`'s
                    # filter — the serialised blob above is opaque to Mongo.
                    "metadata_index": {
                        key: value
                        for key, value in dict(metadata).items()
                        if isinstance(value, (str, int, float, bool, type(None)))
                    },
                }
            },
            upsert=True,
        )
        return {
            "configurable": {
                "thread_id": thread_id,
                "checkpoint_ns": namespace,
                "checkpoint_id": checkpoint_id,
            }
        }

    async def aput_writes(
        self,
        config: dict,
        writes: Sequence[tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        thread_id = _thread(config)
        namespace = _namespace(config)
        checkpoint_id = get_checkpoint_id(config)

        for index, (channel, value) in enumerate(writes):
            # Special channels (`__error__`, `__interrupt__`, …) carry a fixed
            # negative index so a retry overwrites rather than appends.
            idx = WRITES_IDX_MAP.get(channel, index)
            await self.db[WRITES].update_one(
                {
                    "thread_id": thread_id,
                    "checkpoint_ns": namespace,
                    "checkpoint_id": checkpoint_id,
                    "task_id": task_id,
                    "idx": idx,
                },
                {
                    "$set": {
                        "channel": channel,
                        "task_path": task_path,
                        "value": self._dump(value),
                    }
                },
                upsert=True,
            )

    async def adelete_thread(self, thread_id: str) -> None:
        await self.db[CHECKPOINTS].delete_many({"thread_id": str(thread_id)})
        await self.db[WRITES].delete_many({"thread_id": str(thread_id)})


# --------------------------------------------------------------------------- #
_checkpointer: MongoCheckpointer | None = None


def get_checkpointer() -> MongoCheckpointer:
    """One instance per process. The db is resolved per call, so this survives
    a `mongo.set_client` swap without being rebuilt."""
    global _checkpointer
    if _checkpointer is None:
        _checkpointer = MongoCheckpointer()
    return _checkpointer


def reset_checkpointer() -> None:
    global _checkpointer
    _checkpointer = None
