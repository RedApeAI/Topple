"""The entry point for an uploaded document.

Thin, like `run_turn`: everything that must happen *around* the graph lives
here, and the graph itself is the work. What happens around it is mostly making
sure the bytes are released whatever the outcome.
"""
from __future__ import annotations

import logging
import re

from ..graph.context import GraphContext
from ..graph.document_graph import DOCUMENT_GRAPH
from ..graph.document_state import DocumentState
from ..schemas.envelope import RuntimeConfig

logger = logging.getLogger(__name__)


def doc_id_for(filename: str) -> str:
    """Stable and readable, so re-uploading the same file replaces it."""
    base = re.sub(r"\.[^.]+$", "", filename)
    slug = re.sub(r"[^\w\s-]", "", base.lower()).strip()
    slug = re.sub(r"[\s_]+", "-", slug)
    return re.sub(r"-{2,}", "-", slug)[:80] or "document"


async def ingest_document(
    *,
    tenant_id: str,
    user_id: str,
    filename: str,
    data: bytes,
    collection: str,
    question: str | None = None,
    session_id: str | None = None,
    runtime: RuntimeConfig | None = None,
    store_verbatim: bool = False,
) -> DocumentState:
    """Parse, answer, compress, purge. Returns the state *after* purging.

    The `finally` is the part that matters. A failure anywhere — a corrupt PDF,
    a model outage mid-compression — must still drop the bytes, because the
    alternative is an exception path on which the document stays resident for
    as long as the traceback is held.
    """
    state = DocumentState(
        tenant_id=tenant_id,
        user_id=user_id,
        filename=filename,
        doc_id=doc_id_for(filename),
        collection=collection,
        question=question,
        session_id=session_id,
    )
    context = GraphContext(
        upload=data, runtime=runtime, store_verbatim=store_verbatim
    )
    try:
        final = await DOCUMENT_GRAPH.ainvoke(state, context=context)
        return DocumentState.model_construct(**final)
    finally:
        context.forget_upload()
