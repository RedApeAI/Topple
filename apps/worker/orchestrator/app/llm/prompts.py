"""Prompt assembly from playbook templates.

The playbook supplies the persona/system template with {placeholders}
(lead_profile, stage, facts) and per-stage instructions; this module fills
them and shapes the chat message lists for the gateway.
"""
from __future__ import annotations

import json

from ..playbooks.loader import Playbook

HISTORY_WINDOW = 8  # last N messages shown to both extraction and generation


def format_lead_profile(lead: dict) -> str:
    known = {k: v for k, v in lead.items() if v not in (None, "", [])}
    return json.dumps(known, ensure_ascii=False) if known else "(nothing known yet)"


def format_facts(hits: list[dict]) -> str:
    """FACTS block from retrieved chunks — doc ids visible, numbers verbatim."""
    used = [h for h in hits if h.get("used")]
    if not used:
        return "(no facts available for this turn)"
    blocks = []
    for h in used:
        header = f"[doc:{h['doc_id']} chunk:{h['chunk_id']}]"
        if h.get("effective_date"):
            header += f" (effective {h['effective_date']})"
        blocks.append(f"{header}\n{h['text'].strip()}")
    return "\n\n".join(blocks)


def format_history(history: list[dict]) -> str:
    lines = []
    for m in history:
        speaker = "Customer" if m["direction"] == "inbound" else "Assistant"
        lines.append(f"{speaker}: {m['text']}")
    return "\n".join(lines) if lines else "(no prior messages)"


# --------------------------------------------------------------------------- #
# Extraction
# --------------------------------------------------------------------------- #
def build_extraction_messages(
    playbook: Playbook, lead: dict, history: list[dict], text: str
) -> list[dict]:
    field_lines = []
    for name, spec in playbook.qualification_schema.items():
        if spec.type == "enum" and spec.values:
            field_lines.append(f'- "{name}" ({spec.type}, one of: {", ".join(spec.values)})')
        else:
            field_lines.append(f'- "{name}" ({spec.type})')

    system = (
        "You are an information-extraction engine. Read the conversation and the "
        "latest customer message, then output ONLY a JSON object — no prose, no "
        "markdown fences — with exactly these keys:\n"
        f'- "intent": one of {json.dumps(playbook.intents)}\n'
        '- "entities": object with any of the fields below that the LATEST message '
        "newly states or updates (omit fields not mentioned; never guess):\n"
        + "\n".join("  " + line for line in field_lines)
        + "\n"
        '- "sentiment": one of ["positive", "neutral", "negative", "angry"]\n'
        '- "confidence": number 0-1, your confidence in the intent label\n'
        "Amounts must be plain integers in AED (e.g. \"1.2 million\" -> 1200000, "
        "\"950k\" -> 950000). Lists are JSON arrays of strings."
    )
    user = (
        f"Known profile: {format_lead_profile(lead)}\n\n"
        f"Conversation so far:\n{format_history(history)}\n\n"
        f"Latest customer message:\n{text}\n\n"
        "JSON:"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


# --------------------------------------------------------------------------- #
# Generation
# --------------------------------------------------------------------------- #
def build_generation_messages(
    playbook: Playbook,
    stage: str,
    lead: dict,
    hits: list[dict],
    history: list[dict],
    text: str,
    violation_feedback: str | None = None,
) -> list[dict]:
    system = playbook.prompts.system.format(
        lead_profile=format_lead_profile(lead),
        stage=stage,
        facts=format_facts(hits),
        history=format_history(history),
    )
    instruction = playbook.prompts.stage_instructions.get(stage)
    if instruction:
        system += f"\n\nInstructions for this reply: {instruction}"
    if violation_feedback:
        system += (
            "\n\nIMPORTANT — your previous draft was rejected by compliance checks:\n"
            f"{violation_feedback}\n"
            "Rewrite the reply fixing these problems. Use ONLY numbers from FACTS "
            "or the customer's own messages, and avoid all forbidden phrasing."
        )

    messages: list[dict] = [{"role": "system", "content": system}]
    for m in history[-HISTORY_WINDOW:]:
        role = "user" if m["direction"] == "inbound" else "assistant"
        messages.append({"role": role, "content": m["text"]})
    if not history or history[-1]["direction"] != "inbound" or history[-1]["text"] != text:
        messages.append({"role": "user", "content": text})
    return messages
