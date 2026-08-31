"""State for the document ingest graph.

The raw document is **transient**. It exists in `raw_text` for exactly three
nodes — parse, answer, compress — and the terminal node clears it. Nothing here
is checkpointed and nothing here is written to Mongo, so a document that has
been purged is genuinely gone from the process.

`raw_text` is `exclude=True` for the same reason the turn graph excludes its
working fields: anything that serialises this state must not carry the document
with it. That is the difference between "we deleted it" and "we deleted the
copy we happened to be looking at".
"""
from __future__ import annotations

import operator
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field

from .policy import NodeError


class DocumentState(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    # ---- who and what --------------------------------------------------
    tenant_id: str
    user_id: str
    filename: str
    doc_id: str
    collection: str
    session_id: str | None = None
    #: What the salesperson asked when they attached the file, if anything.
    question: str | None = None

    # ---- transient: the document itself --------------------------------
    #: Cleared by `purge`. Excluded from any dump so it cannot ride along in a
    #: serialised state, a checkpoint, or a log line.
    raw_text: str = Field(default="", exclude=True)
    raw_bytes: int = 0
    #: Set once `purge` has run. Asserted in tests — a pipeline that reports
    #: success without purging is the failure mode this whole design exists to
    #: prevent.
    purged: bool = False

    # ---- outputs -------------------------------------------------------
    #: The immediate answer, generated while the document is still in memory.
    answer: str = ""
    #: One 100-word extraction per chunk. These are what reach Qdrant.
    summaries: list[str] = Field(default_factory=list)
    chunks_seen: int = 0
    chunks_stored: int = 0
    #: Verbatim chunks stored as semantic memory, when the caller asked for
    #: them. Zero when the upload is episodic-only.
    verbatim_stored: int = 0

    errors: Annotated[list[NodeError], operator.add] = Field(default_factory=list)

    def redacted(self) -> dict[str, Any]:
        """A log-safe view. Never includes `raw_text`."""
        return {
            "tenant_id": self.tenant_id,
            "user_id": self.user_id,
            "doc_id": self.doc_id,
            "filename": self.filename,
            "raw_bytes": self.raw_bytes,
            "chunks_seen": self.chunks_seen,
            "chunks_stored": self.chunks_stored,
            "verbatim_stored": self.verbatim_stored,
            "purged": self.purged,
        }
