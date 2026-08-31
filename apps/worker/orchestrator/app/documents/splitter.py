"""Semantic text splitting for episodic compression.

Targets 800–1000 tokens per chunk with ~100 tokens of overlap (~12%), split on
meaning rather than on offsets: paragraph and heading boundaries are where the
author already declared a topic change, and cutting there costs nothing.
Splitting on raw offsets starts chunks mid-sentence, and the extraction pass
downstream then summarises half a thought.

**On token counting.** There is no tokenizer for the models this deployment
serves — MiniMax M2 and GLM through Bedrock's OpenAI-compatible endpoint expose
none, and `tiktoken` would be an OpenAI tokenizer measuring a non-OpenAI model.
So tokens are estimated at ~4 characters each, which is close enough for a
chunk *budget* and is stated rather than hidden. A chunk aimed at 900 tokens
may really be 750 or 1,050. That does not matter here: the number is a ceiling
for the extraction call, not a contract with anything.
"""
from __future__ import annotations

import re

#: Empirical average across English prose and price tables. See the note above.
CHARS_PER_TOKEN = 4

TARGET_TOKENS = 900          # midpoint of the 800–1000 band
MAX_TOKENS = 1000
OVERLAP_TOKENS = 100         # ~12% of a 900-token chunk
MIN_TOKENS = 20              # below this a chunk is a page number or a heading

_PARAGRAPH = re.compile(r"\n\s*\n")
_SENTENCE = re.compile(r"(?<=[.!?])\s+")
_HEADING = re.compile(r"^(#{1,6}\s|\s*[A-Z][A-Z0-9 &/-]{4,}\s*$)")


def estimate_tokens(text: str) -> int:
    """Approximate token count. See the module note on why this is an estimate."""
    return max(1, len(text) // CHARS_PER_TOKEN)


def _tail_for_overlap(text: str, tokens: int = OVERLAP_TOKENS) -> str:
    """The last ~`tokens` of `text`, cut at a sentence boundary where possible.

    Overlap exists so a fact split across a boundary survives whole in one of
    the two chunks. Cutting it mid-sentence would defeat that — the fragment
    carries no meaning into the next chunk's summary.
    """
    budget = tokens * CHARS_PER_TOKEN
    if len(text) <= budget:
        return text
    tail = text[-budget:]
    sentences = _SENTENCE.split(tail)
    return " ".join(sentences[1:]).strip() if len(sentences) > 1 else tail.strip()


def _split_oversized(block: str) -> list[str]:
    """A single paragraph longer than the ceiling, cut on sentences."""
    if estimate_tokens(block) <= MAX_TOKENS:
        return [block]

    pieces: list[str] = []
    current = ""
    for sentence in _SENTENCE.split(block):
        if current and estimate_tokens(current + " " + sentence) > TARGET_TOKENS:
            pieces.append(current.strip())
            current = ""
        if estimate_tokens(sentence) > MAX_TOKENS:
            # One sentence over the ceiling — a table row, a run-on list. It has
            # to be cut somewhere, and there is no better place than by length.
            budget = TARGET_TOKENS * CHARS_PER_TOKEN
            for start in range(0, len(sentence), budget):
                pieces.append(sentence[start : start + budget].strip())
            continue
        current += (" " if current else "") + sentence
    if current.strip():
        pieces.append(current.strip())
    return [p for p in pieces if p]


def _blocks_with_headings(text: str) -> list[str]:
    """Paragraphs, with a heading glued to the section it introduces.

    A heading alone is under the minimum and would be dropped, taking the
    section's subject with it — "1 Bedroom from AED 1,350,000" means much less
    without "Marina Crest" above it.
    """
    blocks: list[str] = []
    for raw in _PARAGRAPH.split(text):
        block = raw.strip()
        if not block:
            continue
        if blocks and _HEADING.match(blocks[-1]) and estimate_tokens(blocks[-1]) < 30:
            blocks[-1] = f"{blocks[-1]}\n\n{block}"
        else:
            blocks.append(block)
    return blocks


def split(text: str) -> list[str]:
    """Split `text` into overlapping chunks of roughly `TARGET_TOKENS`."""
    normalised = re.sub(r"\n{3,}", "\n\n", text.replace("\r\n", "\n")).strip()
    if not normalised:
        return []

    chunks: list[str] = []
    current = ""

    def flush() -> None:
        nonlocal current
        body = current.strip()
        if not body:
            current = ""
            return
        if estimate_tokens(body) >= MIN_TOKENS or not chunks:
            chunks.append(body)
        else:
            # Too small to stand alone — fold it into the previous chunk rather
            # than emit a fragment that summarises to nothing.
            chunks[-1] = f"{chunks[-1]}\n\n{body}"
        current = ""

    for block in _blocks_with_headings(normalised):
        for piece in _split_oversized(block):
            if current and estimate_tokens(current + "\n\n" + piece) > TARGET_TOKENS:
                carry = _tail_for_overlap(current)
                flush()
                current = carry
            current += ("\n\n" if current else "") + piece
    flush()
    return chunks
