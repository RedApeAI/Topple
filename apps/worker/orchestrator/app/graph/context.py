"""Per-run dependencies handed to nodes, outside of graph state.

The Motor database handle is not serialisable and is not part of what a turn
*is*, so it travels as LangGraph runtime context rather than as a state field:

    graph.astream(state, context=GraphContext(db=db), ...)

and a node that needs it declares a second parameter:

    async def node(state: TurnState, runtime: Runtime[GraphContext]) -> dict:
        db = runtime.context.db

Keeping it here also preserves how the tests already work — they inject a
mongomock client through `mongo.set_client` and the wrapper passes whatever
`mongo.get_db()` returns.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class GraphContext:
    """Dependencies for one graph run."""

    db: Any = None
    #: Post-response work collected during the turn. Nodes that perform
    #: outward-facing I/O hand it here rather than awaiting it, so "this is
    #: off the response path" is declared at the node that knows, not
    #: rediscovered by whoever reads the handler.
    background: Any = None

    # ---- document ingest -------------------------------------------------
    #: The uploaded bytes. Carried on the context rather than on state so they
    #: are never a serialisable field — `forget_upload` drops the reference,
    #: and nothing that dumps state can take them along.
    upload: bytes = b""
    #: The tenant runtime, for model resolution during ingest.
    runtime: Any = None
    #: Also keep the author's own words as semantic memory. Off by default:
    #: episodic summaries are the requested behaviour, and verbatim storage is
    #: what makes a document quotable, which is a separate decision.
    store_verbatim: bool = False

    def forget_upload(self) -> None:
        """Drop the raw bytes. Called by the purge node."""
        self.upload = b""
