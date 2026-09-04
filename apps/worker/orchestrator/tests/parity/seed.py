"""Author the checked-in fixtures.

These are not captures of production traffic — there is no production traffic
to capture, and firing 33 scenarios at a billed model to obtain them would be a
poor trade. They are *scripted* model responses driven through the real
`recorder`, the real gateway parsing, the real playbooks and the real legacy
pipeline, then redacted by the real redactor. Everything downstream of the
model's bytes is genuine.

The recorder is the same one that would sit in front of a live backend, so
recording from real traffic is `python -m tests.parity seed` with
`SCRIPTED` swapped for the real `gateway._chat`.

`python -m tests.parity seed` regenerates every file.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.llm import gateway
from app.llm.gateway import LLMCallStats
from app.outbound import dispatcher
from app.schemas.envelope import OrchestratorInput
from app.stores import events, mongo, qdrant

from .recorder import recording, write_fixture
from .redact import Redactor
from .replayer import apply_setup

# --------------------------------------------------------------------------- #
# Envelope bases
# --------------------------------------------------------------------------- #
WHEN = "2026-08-15T09:00:00+00:00"

REAL_ESTATE = {
    "received_at": WHEN,
    "tenant_id": "plucia-realty-dubai",
    "user_id": "usr_7f3a91c4",
    "session_id": "sess_dash_20260815_01",
    "channel": "whatsapp",
    "granted_scopes": ["channel:whatsapp"],
    "runtime": {
        "playbook_id": "real-estate-v1",
        "knowledge_source_id": "plucia_re",
        "model_id": "qwen3.5-9b-base",
        "adapter_id": "real-estate-v2",
        "playbook_version": 8,
        "prompt_version": "2026-06-01",
    },
    "message": {
        "external_contact_id": "+971501234567",
        "type": "text",
        "text": "",
        "media": [],
        "channel_timestamp": WHEN,
        "raw_ref": None,
    },
    "mode": "autopilot",
}

INSURANCE = {
    **REAL_ESTATE,
    "tenant_id": "acme-insure-mumbai",
    "user_id": "usr_2b8e40df",
    "session_id": "sess_dash_20260815_02",
    "channel": "email",
    "granted_scopes": ["channel:email"],
    "runtime": {
        "playbook_id": "insurance-v1",
        "knowledge_source_id": "acme_insurance",
        "model_id": "qwen3.5-9b-base",
        "adapter_id": None,
        "playbook_version": 4,
        "prompt_version": "2026-06-01",
    },
    "message": {
        **REAL_ESTATE["message"],
        "external_contact_id": "Priya.Sharma@acme-insure.example",
    },
}


def envelope(base: dict, request_id: str, text: str, **overrides: Any) -> dict:
    message = {**base["message"], "text": text, **overrides.pop("message", {})}
    return {**base, "request_id": request_id, "message": message, **overrides}


# --------------------------------------------------------------------------- #
# Retrieval payloads
# --------------------------------------------------------------------------- #
def hit(doc_id: str, text: str, score: float, min_score: float = 0.35) -> dict:
    return {
        "doc_id": doc_id,
        "chunk_id": f"{doc_id}#1",
        "text": text,
        "source_uri": f"seeds/sample_docs/{doc_id}.md",
        "version": 1,
        "effective_date": "2026-04-01",
        "score": score,
        "used": score >= min_score,
    }


MARINA = hit(
    "re_marina_crest",
    "Marina Crest, Dubai Marina. 1 Bedroom from AED 1,350,000. "
    "2 Bedroom from AED 2,150,000. Handover Q4 2027.",
    0.91,
)
# Below min_score: recorded with used=false, so `retrieval.hits[].used` is
# actually exercised rather than being constantly true.
JVC = hit("re_jvc_gardens", "JVC Gardens. Studios from AED 640,000.", 0.21)

HEALTH_PLAN = hit(
    "ins_health_secure",
    "HealthSecure Plus. Annual premium from AED 4,200 for ages 30-39. "
    "Room rent limit AED 1,000 per day.",
    0.88,
)

# --------------------------------------------------------------------------- #
# Model responses
# --------------------------------------------------------------------------- #
def extraction(
    intent: str,
    entities: dict | None = None,
    sentiment: str = "neutral",
    confidence: float = 0.92,
) -> str:
    return json.dumps(
        {
            "intent": intent,
            "entities": entities or {},
            "sentiment": sentiment,
            "confidence": confidence,
        }
    )


GREET = "Hi! I'm Sara from the developer's team. 👋\n---\nWhat kind of home are you after?"
ASK_BUDGET = "Lovely — Dubai Marina is a great pick.\n---\nWhat budget range are you working with?"
GROUNDED = "Marina Crest in Dubai Marina fits well.\n---\nThe 1 Bedroom starts at AED 1,350,000. Shall I share the floor plans?"
UNGROUNDED = "Great news — I can do AED 777,000 for you!\n---\nShall we proceed?"
FORBIDDEN = "Marina Crest offers guaranteed returns on every unit.\n---\nInterested?"
BOTH_BAD = "Only AED 999,000 with guaranteed returns!\n---\nShall we proceed?"
INS_GREET = "Hello! Happy to help you find the right cover.\n---\nWhat are you looking to insure?"
INS_GROUNDED = "HealthSecure Plus suits you.\n---\nThe annual premium starts at AED 4,200. Want the full benefit list?"
INS_UNGROUNDED = "I can get you covered for just AED 1,111 a year.\n---\nShall I proceed?"


# --------------------------------------------------------------------------- #
# Scenario model
# --------------------------------------------------------------------------- #
@dataclass
class Turn:
    envelope: dict
    #: Raw model responses in call order: extraction first, then each
    #: generation (a second entry means a regeneration is expected).
    responses: list[str]
    hits: list[dict] = field(default_factory=list)
    flag: str | None = None
    #: `retrieval` is not reached at all (stage gate closed, or handoff).
    retrieval_expected: bool = True
    setup: list[dict] = field(default_factory=list)


@dataclass
class Scenario:
    id: str
    case: str
    description: str
    turns: list[Turn]


def _re_warmup(request_id: str) -> Turn:
    """GREETING → QUALIFYING. Every RECOMMENDING scenario needs one."""
    return Turn(
        envelope=envelope(REAL_ESTATE, request_id, "Hi, I'm looking for a flat"),
        responses=[extraction("greeting"), GREET],
        retrieval_expected=False,
    )


def _re_qualify(request_id: str, responses: list[str], hits: list[dict] | None = None,
                flag: str | None = None, mode: str = "autopilot") -> Turn:
    """QUALIFYING → RECOMMENDING, with retrieval open.

    The buyer states the budget out loud so "1.5M AED" lands in the history and
    the grounding corpus reflects a real conversation.
    """
    return Turn(
        envelope=envelope(
            REAL_ESTATE, request_id,
            "My budget is 1.5M AED and I'm looking at Dubai Marina",
            mode=mode,
        ),
        responses=responses,
        hits=hits if hits is not None else [MARINA, JVC],
        flag=flag,
    )


def _ins_warmup(request_id: str) -> Turn:
    return Turn(
        envelope=envelope(INSURANCE, request_id, "Hello, I need health cover"),
        responses=[extraction("greeting"), INS_GREET],
        retrieval_expected=False,
    )


def _ins_assess(request_id: str, responses: list[str], hits: list[dict] | None = None,
                flag: str | None = None, mode: str = "autopilot") -> Turn:
    return Turn(
        envelope=envelope(
            INSURANCE, request_id,
            "I'm 34, looking at health cover, budget around 5,000 a year",
            mode=mode,
        ),
        responses=responses,
        hits=hits if hits is not None else [HEALTH_PLAN],
        flag=flag,
    )


def build_scenarios() -> list[Scenario]:
    ins_entities = {"coverage_type": "health", "age": 34}
    re_entities = {"budget_min_aed": 1_500_000, "localities": ["dubai marina"]}
    provide = lambda **kw: extraction("provide_info", re_entities, **kw)  # noqa: E731
    ins_provide = extraction("provide_info", ins_entities)

    return [
        # ---------------- happy path ----------------
        Scenario(
            "happy-01-greeting", "happy_path",
            "First contact: GREETING to QUALIFYING, retrieval gated off, autopilot sends.",
            [_re_warmup("pty-happy-01")],
        ),
        Scenario(
            "happy-02-qualify-to-recommend", "happy_path",
            "Entities complete the qualification; stage reaches RECOMMENDING and retrieval opens.",
            [_re_warmup("pty-happy-02a"), _re_qualify("pty-happy-02b", [provide(), GROUNDED])],
        ),
        Scenario(
            "happy-03-contact-details-in-body", "happy_path",
            "Buyer pastes an email and a phone number into the message — exercises the redactor "
            "on free text, and proves a redacted body still reproduces its own retrieval query.",
            [
                Turn(
                    envelope=envelope(
                        REAL_ESTATE, "pty-happy-03",
                        "Hi, reach me at omar.khalid@gulfmail.example or +971 55 908 4412",
                    ),
                    responses=[extraction("greeting"), GREET],
                    retrieval_expected=False,
                )
            ],
        ),

        # ---------------- handoff by intent ----------------
        Scenario(
            "handoff-intent-01-request-human", "handoff_intent",
            "intent=request_human triggers handoff; the playbook has a handoff_message, so a draft.",
            [Turn(
                envelope=envelope(REAL_ESTATE, "pty-hi-01", "Can I speak to a human please?"),
                responses=[extraction("request_human")],
                retrieval_expected=False,
            )],
        ),
        Scenario(
            "handoff-intent-02-insurance-suppressed", "handoff_intent",
            "insurance-v1 has no handoff_message, so the same handoff suppresses the reply entirely.",
            [Turn(
                envelope=envelope(INSURANCE, "pty-hi-02", "Just guarantee my claim will be approved"),
                responses=[extraction("claim_guarantee_request")],
                retrieval_expected=False,
            )],
        ),
        Scenario(
            "handoff-intent-03-copilot", "handoff_intent",
            "Handoff in copilot: already a draft, so mode changes nothing.",
            [Turn(
                envelope=envelope(REAL_ESTATE, "pty-hi-03", "get me a real agent", mode="copilot"),
                responses=[extraction("request_human")],
                retrieval_expected=False,
            )],
        ),

        # ---------------- handoff by sentiment ----------------
        Scenario(
            "handoff-sentiment-01-angry", "handoff_sentiment",
            "sentiment=angry triggers handoff even on a benign intent.",
            [Turn(
                envelope=envelope(REAL_ESTATE, "pty-hs-01", "This is the third time I've asked!"),
                responses=[extraction("provide_info", sentiment="angry")],
                retrieval_expected=False,
            )],
        ),
        Scenario(
            "handoff-sentiment-02-angry-insurance", "handoff_sentiment",
            "Angry on insurance-v1: handoff with no message to send.",
            [Turn(
                envelope=envelope(INSURANCE, "pty-hs-02", "Your service has been appalling"),
                responses=[extraction("objection", sentiment="angry")],
                retrieval_expected=False,
            )],
        ),
        Scenario(
            "handoff-sentiment-03-angry-mid-funnel", "handoff_sentiment",
            "Anger after qualification: handoff pre-empts the fields_known transition.",
            [
                _re_warmup("pty-hs-03a"),
                Turn(
                    envelope=envelope(
                        REAL_ESTATE, "pty-hs-03b",
                        "My budget is 1.5M AED for Dubai Marina and I am losing patience",
                    ),
                    responses=[extraction("provide_info", re_entities, sentiment="angry")],
                    retrieval_expected=False,
                ),
            ],
        ),

        # ---------------- low-confidence strikes ----------------
        Scenario(
            "low-conf-01-two-strikes", "low_confidence_strikes",
            "Two consecutive low-confidence turns reach the threshold and hand off.",
            [
                Turn(
                    envelope=envelope(REAL_ESTATE, "pty-lc-01a", "hm ok"),
                    responses=[extraction("other", confidence=0.2), GREET],
                    retrieval_expected=False,
                ),
                Turn(
                    envelope=envelope(REAL_ESTATE, "pty-lc-01b", "idk maybe"),
                    responses=[extraction("other", confidence=0.15)],
                    retrieval_expected=False,
                ),
            ],
        ),
        Scenario(
            "low-conf-02-reset-by-confident-turn", "low_confidence_strikes",
            "A confident turn resets the counter, so the next low-confidence turn is strike 1 again.",
            [
                Turn(
                    envelope=envelope(REAL_ESTATE, "pty-lc-02a", "hm"),
                    responses=[extraction("other", confidence=0.2), GREET],
                    retrieval_expected=False,
                ),
                Turn(
                    envelope=envelope(REAL_ESTATE, "pty-lc-02b", "Yes, a 2 bedroom please"),
                    responses=[extraction("provide_info", {"config": "2BR"}), ASK_BUDGET],
                    retrieval_expected=False,
                ),
                Turn(
                    envelope=envelope(REAL_ESTATE, "pty-lc-02c", "dunno"),
                    responses=[extraction("other", confidence=0.1), GREET],
                    retrieval_expected=False,
                ),
            ],
        ),
        Scenario(
            "low-conf-03-single-strike", "low_confidence_strikes",
            "One low-confidence turn: strike 1 of 2, check passes, no handoff.",
            [Turn(
                envelope=envelope(REAL_ESTATE, "pty-lc-03", "???"),
                responses=[extraction("other", confidence=0.3), GREET],
                retrieval_expected=False,
            )],
        ),

        # ---------------- regeneration succeeds ----------------
        Scenario(
            "regen-ok-01-ungrounded-number", "postcheck_regen_ok",
            "An invented price fails numeric grounding; the regeneration uses the FACTS figure.",
            [_re_warmup("pty-ro-01a"), _re_qualify("pty-ro-01b", [provide(), UNGROUNDED, GROUNDED])],
        ),
        Scenario(
            "regen-ok-02-forbidden-phrase", "postcheck_regen_ok",
            "A forbidden phrase fails the post-check; the regeneration drops it.",
            [_re_warmup("pty-ro-02a"), _re_qualify("pty-ro-02b", [provide(), FORBIDDEN, GROUNDED])],
        ),
        Scenario(
            "regen-ok-03-both-violations", "postcheck_regen_ok",
            "Both post-checks fail at once; one regeneration clears both.",
            [_re_warmup("pty-ro-03a"), _re_qualify("pty-ro-03b", [provide(), BOTH_BAD, GROUNDED])],
        ),

        # ---------------- regeneration fails, draft forced ----------------
        Scenario(
            "force-draft-01-still-ungrounded", "postcheck_forces_draft",
            "Still ungrounded after the regeneration: autopilot is overridden to draft, nothing dispatched.",
            [_re_warmup("pty-fd-01a"), _re_qualify("pty-fd-01b", [provide(), UNGROUNDED, BOTH_BAD])],
        ),
        Scenario(
            "force-draft-02-forbidden-persists", "postcheck_forces_draft",
            "The forbidden phrase survives the regeneration.",
            [_re_warmup("pty-fd-02a"), _re_qualify("pty-fd-02b", [provide(), FORBIDDEN, FORBIDDEN])],
        ),
        Scenario(
            "force-draft-03-insurance", "postcheck_forces_draft",
            "Same override on insurance-v1, over the email channel.",
            [_ins_warmup("pty-fd-03a"),
             _ins_assess("pty-fd-03b", [ins_provide, INS_UNGROUNDED, INS_UNGROUNDED])],
        ),

        # ---------------- retrieval gated off ----------------
        Scenario(
            "gated-01-greeting", "retrieval_gated_off",
            "GREETING is below RECOMMENDING, so Qdrant is never called.",
            [Turn(
                envelope=envelope(REAL_ESTATE, "pty-gt-01", "hello there"),
                responses=[extraction("greeting"), GREET],
                retrieval_expected=False,
            )],
        ),
        Scenario(
            "gated-02-qualifying", "retrieval_gated_off",
            "QUALIFYING is still below the gate even with a partial lead profile.",
            [
                _re_warmup("pty-gt-02a"),
                Turn(
                    envelope=envelope(REAL_ESTATE, "pty-gt-02b", "Somewhere in Dubai Marina"),
                    responses=[extraction("provide_info", {"localities": ["dubai marina"]}), ASK_BUDGET],
                    retrieval_expected=False,
                ),
            ],
        ),
        Scenario(
            "gated-03-insurance-needs-assessment", "retrieval_gated_off",
            "insurance-v1 gates from PLAN_RECOMMENDATION; NEEDS_ASSESSMENT is below it.",
            [_ins_warmup("pty-gt-03")],
        ),

        # ---------------- missing Qdrant collection ----------------
        Scenario(
            "qdrant-missing-01", "qdrant_missing",
            "The knowledge source does not exist: empty hits, knowledge_source_missing flag, empty FACTS.",
            [_re_warmup("pty-qm-01a"),
             _re_qualify("pty-qm-01b", [provide(), ASK_BUDGET], hits=[], flag="knowledge_source_missing")],
        ),
        Scenario(
            "qdrant-missing-02-copilot", "qdrant_missing",
            "Missing collection in copilot: the reply is a draft for a different reason.",
            [_re_warmup("pty-qm-02a"),
             _re_qualify("pty-qm-02b", [provide(), ASK_BUDGET], hits=[],
                         flag="knowledge_source_missing", mode="copilot")],
        ),
        Scenario(
            "qdrant-missing-03-insurance", "qdrant_missing",
            "Same on insurance-v1.",
            [_ins_warmup("pty-qm-03a"),
             _ins_assess("pty-qm-03b", [ins_provide, INS_GREET], hits=[],
                         flag="knowledge_source_missing")],
        ),

        # ---------------- copilot ----------------
        Scenario(
            "copilot-01-greeting", "copilot",
            "Copilot drafts and dispatches nothing.",
            [Turn(
                envelope=envelope(REAL_ESTATE, "pty-cp-01", "Hi there", mode="copilot"),
                responses=[extraction("greeting"), GREET],
                retrieval_expected=False,
            )],
        ),
        Scenario(
            "copilot-02-recommending-with-facts", "copilot",
            "Copilot with a clean generation over real FACTS: still a draft.",
            [_re_warmup("pty-cp-02a"), _re_qualify("pty-cp-02b", [provide(), GROUNDED], mode="copilot")],
        ),
        Scenario(
            "copilot-03-insurance", "copilot",
            "Copilot on the email channel.",
            [_ins_warmup("pty-cp-03a"),
             _ins_assess("pty-cp-03b", [ins_provide, INS_GROUNDED], mode="copilot")],
        ),

        # ---------------- autopilot ----------------
        Scenario(
            "autopilot-01-greeting", "autopilot",
            "Autopilot sends and dispatches.",
            [Turn(
                envelope=envelope(REAL_ESTATE, "pty-ap-01", "Hi there"),
                responses=[extraction("greeting"), GREET],
                retrieval_expected=False,
            )],
        ),
        Scenario(
            "autopilot-02-recommending", "autopilot",
            "Autopilot with FACTS: sent, dispatch invoked.",
            [_re_warmup("pty-ap-02a"), _re_qualify("pty-ap-02b", [provide(), GROUNDED])],
        ),
        Scenario(
            "autopilot-03-insurance", "autopilot",
            "Autopilot over email.",
            [_ins_warmup("pty-ap-03a"), _ins_assess("pty-ap-03b", [ins_provide, INS_GROUNDED])],
        ),

        # ---------------- duplicate request_id ----------------
        Scenario(
            "dupe-01-replay", "duplicate_request_id",
            "The same request_id twice: the second returns the stored result and runs no LLM call.",
            [
                Turn(
                    envelope=envelope(REAL_ESTATE, "pty-dp-01", "Hi, I'm looking for a flat"),
                    responses=[extraction("greeting"), GREET],
                    retrieval_expected=False,
                ),
                Turn(
                    envelope=envelope(REAL_ESTATE, "pty-dp-01", "Hi, I'm looking for a flat"),
                    responses=[],
                    retrieval_expected=False,
                ),
            ],
        ),
        Scenario(
            "dupe-02-replay-after-recommend", "duplicate_request_id",
            "A replay of a turn that did retrieval and generation: still no second run.",
            [
                _re_warmup("pty-dp-02a"),
                _re_qualify("pty-dp-02b", [provide(), GROUNDED]),
                Turn(
                    envelope=envelope(
                        REAL_ESTATE, "pty-dp-02b",
                        "My budget is 1.5M AED and I'm looking at Dubai Marina",
                    ),
                    responses=[],
                    retrieval_expected=False,
                ),
            ],
        ),
        Scenario(
            "dupe-03-in-flight-409", "duplicate_request_id",
            "A stub with neither result nor error means another attempt holds the lock: 409, no turn document.",
            [Turn(
                envelope=envelope(REAL_ESTATE, "pty-dp-03", "Hi again"),
                responses=[],
                retrieval_expected=False,
                setup=[{"kind": "in_flight_stub", "request_id": "pty-dp-03"}],
            )],
        ),
    ]


# --------------------------------------------------------------------------- #
# Recording
# --------------------------------------------------------------------------- #
async def record_scenario(scenario: Scenario) -> dict:
    """Drive one scenario through the legacy pipeline and capture it."""
    from mongomock_motor import AsyncMongoMockClient

    from .legacy import run_turn as legacy_run_turn

    client = AsyncMongoMockClient()
    mongo.set_client(client, db_name="parity_seed")
    db = client["parity_seed"]
    await mongo.init_indexes(db)

    redactor = Redactor()
    queue: list[str] = []
    current: dict[str, Any] = {"hits": [], "flag": None}

    async def scripted_chat(messages, *, model, temperature, disable_thinking):
        if not queue:
            raise AssertionError(
                f"{scenario.id}: pipeline asked for more model calls than the scenario scripts"
            )
        return queue.pop(0), LLMCallStats(latency_ms=1, prompt_tokens=10, completion_tokens=5)

    async def scripted_retrieve(collection, query_text, top_k, min_score, *, scope=None):
        return [dict(h) for h in current["hits"]], current["flag"]

    async def noop_dispatch(**_kwargs: Any) -> None:
        return None

    async def noop_publish(*_a: Any, **_k: Any) -> bool:
        return True

    saved = (gateway._chat, qdrant.retrieve, dispatcher.dispatch, events.publish)
    gateway._chat = scripted_chat
    qdrant.retrieve = scripted_retrieve
    dispatcher.dispatch = noop_dispatch
    events.publish = noop_publish

    turns: list[dict] = []
    try:
        with recording(redactor) as recorder:
            for turn in scenario.turns:
                recorder.reset()
                queue[:] = list(turn.responses)
                current["hits"] = turn.hits
                current["flag"] = turn.flag

                await apply_setup(db, turn.setup, turn.envelope)

                raised: str | None = None
                try:
                    await legacy_run_turn(
                        OrchestratorInput.model_validate(turn.envelope)
                    )
                except Exception as exc:  # noqa: BLE001 — expected for some cases
                    raised = type(exc).__name__

                if queue:
                    raise AssertionError(
                        f"{scenario.id}: {len(queue)} scripted response(s) unused — "
                        "the scenario does not do what it claims"
                    )
                snapshot = recorder.snapshot()
                if turn.retrieval_expected and not snapshot["retrieval"]:
                    raise AssertionError(
                        f"{scenario.id}: expected retrieval but the stage gate stayed closed"
                    )
                if not turn.retrieval_expected and snapshot["retrieval"]:
                    raise AssertionError(
                        f"{scenario.id}: retrieval ran but the scenario says it should not"
                    )

                turns.append(
                    {
                        "envelope": redactor.envelope(turn.envelope),
                        "llm": snapshot["llm"],
                        "retrieval": snapshot["retrieval"],
                        "setup": turn.setup,
                        "expect_raises": raised,
                    }
                )
    finally:
        gateway._chat, qdrant.retrieve, dispatcher.dispatch, events.publish = saved

    return {
        "id": scenario.id,
        "case": scenario.case,
        "description": scenario.description,
        "turns": turns,
    }


async def seed_all(directory: Path) -> list[Path]:
    for stale in directory.glob("*.json"):
        stale.unlink()
    return [
        write_fixture(await record_scenario(scenario), directory)
        for scenario in build_scenarios()
    ]
