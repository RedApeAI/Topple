"""The document ingest graph: RAM in, summaries out, raw text gone.

```
parse ──> answer_now ──> compress ──> purge ──> END
```

- **parse** decodes the upload in memory. No temp file, no bucket.
- **answer_now** answers the salesperson's question against the whole document
  while it is still here, because after `purge` it is unanswerable.
- **compress** splits into 800–1000 token chunks, sends each through a small
  model with a strict extraction prompt, and stores only the ~100-word result.
  Each raw chunk is dropped as soon as its summary exists.
- **purge** clears `raw_text` and asserts it is gone. It runs on **every** path,
  including failures — a compression error must not leave the document
  resident.

The purge node is the point of the design. Without it the document lingers in
state, and any later serialisation, checkpoint or log carries it. With it, the
window in which the raw bytes exist is three nodes long and bounded by an
assertion.

**Summaries are not quotable.** They are stored as `episodic` memory and the
turn pipeline reads `semantic` only. A 100-word extraction has been through a
model, so a figure inside it may be rounded or invented — offering one to a
buyer as a price would defeat the numeric-grounding guardrail entirely. Callers
that need the document quotable ask for `store_verbatim`, which writes the
author's own words as semantic memory alongside.
"""
from __future__ import annotations

import logging

from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime

from ..config import settings
from ..documents import parse, splitter
from ..llm import gateway
from ..stores import knowledge, qdrant
from ..stores.knowledge import KnowledgeScope
from .context import GraphContext
from .document_state import DocumentState
from .policy import best_effort, critical, register

logger = logging.getLogger(__name__)

#: Ceiling on what goes into the immediate-answer prompt. A 300-page PDF does
#: not fit in any context window, and silently truncating without saying so
#: produces an answer that looks complete and is not.
ANSWER_CHAR_BUDGET = 24_000

EXTRACTION_PROMPT = (
    "Extract key decisions, facts, entities, and intent in under 100 words. "
    "Write plain prose, no preamble, no bullet markers, no commentary. "
    "If the passage contains figures, name what each figure refers to rather "
    "than restating it precisely — this summary is not a source of record."
)

ANSWER_SYSTEM = (
    "You are helping a salesperson understand a document they just uploaded. "
    "Answer using only what the document says. If it does not answer the "
    "question, say so plainly rather than guessing. Be brief."
)


# --------------------------------------------------------------------------- #
# Nodes
# --------------------------------------------------------------------------- #
@critical("parse", timeout=settings.node_timeout_store)
async def parse_node(state: DocumentState, runtime: Runtime[GraphContext]) -> dict:
    """Bytes → text, in memory. The bytes arrive on the context, not the state,
    so they are never a field that something could serialise."""
    data = runtime.context.upload
    text = parse.extract_text(state.filename, data)
    logger.info(
        "parsed %s (%d bytes -> %d chars) for user=%s",
        state.filename, len(data), len(text), state.user_id,
    )
    return {"raw_text": text, "raw_bytes": len(data)}


@best_effort("answer_now", timeout=settings.node_timeout_generate)
async def answer_now_node(state: DocumentState, runtime: Runtime[GraphContext]) -> dict:
    """The immediate answer, while the document is still resident.

    `best_effort`: a failed answer must not cost the ingestion. The document is
    still worth compressing even if this particular question could not be
    answered, and the alternative — aborting — would mean the upload silently
    did nothing.
    """
    if not state.question:
        return {}

    document = state.raw_text[:ANSWER_CHAR_BUDGET]
    truncated = len(state.raw_text) > ANSWER_CHAR_BUDGET
    call = await gateway.generate(
        model=gateway.resolve_model(runtime.context.runtime)
        if runtime.context.runtime
        else gateway.base_model(),
        messages=[
            {"role": "system", "content": ANSWER_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Document: {state.filename}\n"
                    + ("(first part only — the file is longer)\n" if truncated else "")
                    + f"\n{document}\n\nQuestion: {state.question}"
                ),
            },
        ],
    )
    answer = "\n\n".join(call.output.messages).strip()
    if truncated and answer:
        answer += "\n\n(Answered from the first part of the document only.)"
    return {"answer": answer}


@best_effort("compress", timeout=settings.node_timeout_generate)
async def compress_node(state: DocumentState, runtime: Runtime[GraphContext]) -> dict:
    """Split, extract, store. Raw chunks are dropped as they are consumed.

    Sequential rather than concurrent on purpose: the whole point is to hold as
    little of the document in memory at once as possible, and fanning out would
    keep every chunk and every in-flight response resident simultaneously.
    """
    chunks = splitter.split(state.raw_text)
    if not chunks:
        return {"chunks_seen": 0}

    model = gateway.extraction_model(
        runtime.context.runtime,
        gateway.base_model(),
    )
    scope = KnowledgeScope(
        tenant_id=state.tenant_id, user_id=state.user_id
    ).for_memory(knowledge.EPISODIC)

    summaries: list[str] = []
    stored = 0
    total = len(chunks)

    for index in range(total):
        # Pop rather than index: the raw chunk is released the moment its
        # summary exists, so peak memory is one chunk, not the document.
        chunk = chunks[index]
        chunks[index] = ""
        try:
            call = await gateway.generate(
                model=model,
                messages=[
                    {"role": "system", "content": EXTRACTION_PROMPT},
                    {"role": "user", "content": chunk},
                ],
            )
        except Exception as exc:  # noqa: BLE001 — one bad chunk must not lose the rest
            logger.warning("extraction failed for chunk %d/%d: %s", index + 1, total, exc)
            continue
        finally:
            del chunk

        summary = "\n".join(call.output.messages).strip()
        if not summary:
            continue
        summaries.append(summary)
        stored += await qdrant.ingest(
            state.collection,
            scope,
            [
                {
                    "text": summary,
                    "doc_id": state.doc_id,
                    "chunk_id": f"{state.doc_id}#episodic#{index + 1}",
                    "source_uri": state.filename,
                }
            ],
        )

    logger.info(
        "compressed %s: %d chunks -> %d summaries for user=%s",
        state.filename, total, stored, state.user_id,
    )
    return {"chunks_seen": total, "chunks_stored": stored, "summaries": summaries}


@best_effort("store_verbatim", timeout=settings.node_timeout_store)
async def store_verbatim_node(
    state: DocumentState, runtime: Runtime[GraphContext]
) -> dict:
    """Keep the author's own words as semantic memory, when asked.

    Separate from compression because it answers a different question. A
    summary is what the document *was about*; verbatim text is what it
    *actually said*, and only the latter can ground a price.
    """
    if not runtime.context.store_verbatim:
        return {}

    scope = KnowledgeScope(
        tenant_id=state.tenant_id, user_id=state.user_id
    ).for_memory(knowledge.SEMANTIC)
    chunks = splitter.split(state.raw_text)
    written = await qdrant.ingest(
        state.collection,
        scope,
        [
            {
                "text": chunk,
                "doc_id": state.doc_id,
                "chunk_id": f"{state.doc_id}#{index + 1}",
                "source_uri": state.filename,
            }
            for index, chunk in enumerate(chunks)
        ],
    )
    return {"verbatim_stored": written}


@critical("purge", timeout=settings.node_timeout_store)
async def purge_node(state: DocumentState, runtime: Runtime[GraphContext]) -> dict:
    """Clear the raw document from state, and prove it is gone.

    Runs on every path. The assertion is not defensive programming for its own
    sake: "we meant to delete it" and "it is deleted" are different claims, and
    only one of them is testable.
    """
    runtime.context.forget_upload()
    logger.info("purged raw document for %s", state.redacted())
    return {"raw_text": "", "purged": True}


# --------------------------------------------------------------------------- #
# Edges
# --------------------------------------------------------------------------- #
def build_document_graph() -> StateGraph:
    builder = StateGraph(DocumentState, context_schema=GraphContext)
    register(
        builder,
        parse_node,
        answer_now_node,
        compress_node,
        store_verbatim_node,
        purge_node,
    )
    builder.add_edge(START, "parse")
    builder.add_edge("parse", "answer_now")
    builder.add_edge("answer_now", "compress")
    builder.add_edge("compress", "store_verbatim")
    builder.add_edge("store_verbatim", "purge")
    builder.add_edge("purge", END)
    return builder


#: No checkpointer, deliberately. A checkpoint of this graph would persist the
#: raw document to Mongo — the exact thing the design exists to avoid.
DOCUMENT_GRAPH = build_document_graph().compile(name="document")
