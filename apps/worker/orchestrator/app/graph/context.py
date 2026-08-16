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

    db: Any
    #: Post-response work collected during the turn. Nodes that perform
    #: outward-facing I/O hand it here rather than awaiting it, so "this is
    #: off the response path" is declared at the node that knows, not
    #: rediscovered by whoever reads the handler.
    background: Any = None
