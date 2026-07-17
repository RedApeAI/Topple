# plucia-orchestrator

The **black box orchestrator** of a multi-tenant, multi-channel AI sales
platform. Auth, onboarding and API-key handling live in separate services;
this service receives already-verified, already-resolved requests (an
`OrchestratorInput` envelope carrying the tenant's runtime config) and runs
the AI turn pipeline:

```
POST /v1/turns  (envelope: tenant, channel, runtime, message, mode)
      │
      ├─ scope assert (defense-in-depth)      channel ∈ granted_scopes, else 403
      ├─ idempotency reserve                  unique request_id in `turns`; dup → replay
      ├─ contact + conversation resolution    Mongo, per-tenant
      ├─ llm.extract()                        strict JSON: intent/entities/sentiment/confidence
      ├─ lead merge + qualification score     playbook-defined fields & weights
      ├─ guardrail pre-checks                 handoff intents / sentiment / confidence strikes
      ├─ state transition                     generic engine, playbook `transitions`
      ├─ qdrant retrieval                     per-tenant collection → FACTS block
      ├─ llm.generate()                       1-3 WhatsApp-style bubbles
      ├─ guardrail post-checks                numeric grounding + forbidden phrases
      │                                        → regenerate once → force draft
      └─ persist + dispatch + turn trace      one `turns` doc per invocation, always written
```

**The engine is generic.** All vertical behavior — stages, qualification
schema, transitions, prompts, guardrails — comes from a playbook YAML
(`app/playbooks/real-estate-v1.yaml`, `insurance-v1.yaml`). MongoDB is the
single source of truth; Qdrant holds one RAG collection per
`knowledge_source_id`. There is no Postgres here — tenant runtime config
arrives inside the envelope.

Project layout:

```
app/
  main.py               FastAPI app (all /v1 endpoints + /health)
  config.py             pydantic-settings (.env)
  schemas/              envelope.py (OrchestratorInput/Result), llm.py
  stores/               mongo.py (motor + index bootstrap), qdrant.py (retrieval)
  engine/               pipeline.py, contacts.py, state_machine.py, guardrails.py, trace.py
  llm/                  gateway.py (resolve_model/extract/generate), prompts.py
  playbooks/            loader.py + the two vertical YAMLs
  outbound/             dispatcher.py (stub → OUTBOUND_WEBHOOK_URL)
seeds/                  seed_qdrant.py + sample_docs/ (3 real-estate + 3 insurance sheets)
tests/                  pytest, LLM mocked; opt-in integration tests
postman_collection.json docker-compose.yml
```

---

## Setup

Requires Python 3.11+ and Docker (for Mongo + Qdrant).

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
docker compose up -d                 # Mongo on 27017, Qdrant on 6333
python seeds/seed_qdrant.py          # embeds sample docs into `plucia_re` + `acme_insurance`
uvicorn app.main:app --reload        # http://localhost:8000/docs
```

### Environment variables (`.env`)

| Variable                                  | Default                                  | Purpose                                           |
| ----------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| `LLM_BASE_URL`                            | `http://localhost:11434/v1`              | OpenAI-compatible endpoint                        |
| `LLM_API_KEY`                             | `ollama`                                 | Ignored by Ollama; required by the SDK            |
| `LLM_BACKEND`                             | `ollama`                                 | `vllm` (prod, multi-LoRA) or `ollama` (local dev) |
| `OLLAMA_MODEL`                            | `qwen3.5:9b`                             | The one local model used when backend is `ollama` |
| `LLM_TIMEOUT_SECONDS` / `LLM_MAX_RETRIES` | `30` / `1`                               | Per LLM call; total failure → HTTP 503            |
| `MONGO_URL` / `MONGO_DB`                  | `mongodb://localhost:27017` / `blackbox` | Source of truth                                   |
| `QDRANT_URL`                              | `http://localhost:6333`                  | Per-tenant RAG store                              |
| `OUTBOUND_WEBHOOK_URL`                    | _(unset)_                                | If set, `sent` replies are POSTed here            |

### Ollama locally vs vLLM in prod

The gateway resolves the request's `model` field per backend
(`app/llm/gateway.py::resolve_model`):

- **`LLM_BACKEND=vllm` (production)** — the LLM server runs with
  `--enable-lora` and per-tenant LoRA adapters. `model` is set to the
  envelope's `runtime.adapter_id` when present, else `runtime.model_id`, so
  one vLLM deployment serves every vertical.
- **`LLM_BACKEND=ollama` (local dev)** — Ollama has no per-request adapters;
  every call uses `OLLAMA_MODEL` and a warning logs that adapter selection is
  bypassed. Run it with:

```bash
ollama serve
ollama pull qwen3.5:9b
```

Extraction calls run at temperature 0.1 (JSON-only, fences stripped, one
retry, then a safe `intent=other/confidence=0` fallback). Generation runs at
0.7 with "thinking" disabled per backend: vLLM honours
`extra_body={"chat_template_kwargs": {"enable_thinking": false}}`, while
Ollama's OpenAI endpoint ignores that (and `think: false`) but honours
`reasoning_effort: "none"` — without it, qwen3.5 burns the 30s timeout on
reasoning tokens. If the runtime rejects the kwarg, the gateway falls back
without it.

---

## API surface

| Method & path                                  | What it does                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `POST /v1/turns`                               | The main endpoint: run one turn from an `OrchestratorInput` envelope                    |
| `GET /v1/turns/{request_id}`                   | The stored turn document (observability)                                                |
| `GET /v1/conversations/{id}`                   | Transcript + stage/mode/status                                                          |
| `GET /v1/contacts/{id}`                        | Profile + lead + identities                                                             |
| `POST /v1/contacts/merge`                      | `{primary_contact_id, duplicate_contact_id}` — manual bifurcation merge                 |
| `GET /v1/drafts?tenant_id=`                    | Pending copilot drafts                                                                  |
| `POST /v1/drafts/{id}/approve`                 | Approve (optional `{edited_text}`) → dispatch via outbound stub                         |
| `POST /v1/drafts/{id}/discard`                 | Discard a draft                                                                         |
| `GET /v1/metrics/summary?tenant_id=&from=&to=` | Turns, p50/p95 latency, tokens, guardrail-violation & handoff rates, grouped by adapter |
| `GET /health`                                  | Mongo, Qdrant, LLM reachability                                                         |

Reply statuses: `sent` (autopilot, clean guardrails — dispatched), `draft`
(copilot mode, or forced after a repeated guardrail violation), `suppressed`
(handoff with no reply configured, or a message arriving on an already
handed-off conversation).

---

## One Inbox test console (BFF + UI)

`bff/` is a small backend-for-frontend that stands in for the upstream
platform services: it owns the tenant runtime registry, builds full
`OrchestratorInput` envelopes for simulated buyer messages, and proxies the
observability + drafts endpoints. It serves a single-page "One Inbox" UI to
exercise the whole agentic flow visually.

```bash
uvicorn app.main:app --port 8000            # the orchestrator
uvicorn bff.main:app --port 8080 --reload   # the BFF + UI
open http://localhost:8080
```

- **Inbox (center)** — conversations across both demo tenants with channel
  filters, stage/mode chips, and a handed-off badge; click a row for the
  transcript (agent bubbles dark, copilot drafts dashed amber).
- **Operator (right)** — _Agent Turns_ (each invocation with stage
  transition, reply status, latency; click to open its conversation),
  _Drafts_ (approve with edits / discard — approval dispatches through the
  outbound stub), and _Metrics_ (per-adapter summary).
- **Composer (bottom right)** — simulate an inbound buyer message: pick
  tenant, channel, autopilot/copilot, contact; the BFF wraps it in an
  envelope and calls `POST /v1/turns`. Use a fresh contact number to start a
  new conversation.

`ORCHESTRATOR_URL` (default `http://localhost:8000`) points the BFF at the
orchestrator.

---

## Walking the Postman journeys

Import `postman_collection.json` (`base_url` defaults to
`http://localhost:8000`) and run the folders top to bottom:

1. **Health** — all three dependencies reachable.
2. **Real-estate journey** (tenant `plucia`, `adapter_id: "real-estate-v2"`) —
   greeting → qualification (budget + locality → `RECOMMENDING`) → price
   question with **retrieval hits** from the seeded Marina Crest sheet →
   objection detour → visit request → `SITE_VISIT_BOOKING`. Ends with
   transcript / contact / turn-document reads.
3. **Insurance journey** (tenant `acme`, `adapter_id: null`) — needs
   assessment → plan question (retrieval) → _"can you guarantee my claim gets
   approved"_, which the playbook classifies as `claim_guarantee_request`, a
   handoff intent: the turn ends in `HANDOFF` with nothing auto-sent.
4. **Copilot drafts loop** — a `mode: copilot` turn produces a `draft`; list,
   approve (optionally edited), which dispatches through the outbound stub.
5. **Idempotency & scope** — the same `request_id` twice (second response is
   `deduped: true`, pipeline not re-run) and a wrong-scope request (403).
6. **Metrics** — per-adapter summary for both tenants.

---

## How to read a turn document

`GET /v1/turns/{request_id}` returns the full audit of one invocation —
`turns` is the observability unit, written exactly once per turn (also on
errors):

```jsonc
{
  "request_id": "…",                      // idempotency key (unique index)
  "resolved_model": "real-estate-v2",     // what was ACTUALLY sent to the LLM
  "model_id": "…", "adapter_id": "…",     // what the envelope asked for
  "playbook_id": "real-estate-v1", "playbook_version": 7, "prompt_version": "…",
  "extraction":  { "intent", "entities", "sentiment", "confidence", …tokens/latency },
  "retrieval":   { "collection", "query", "hits": [{ "doc_id", "chunk_id", "score",
                   "used" }] },           // used:true = injected into FACTS
  "state":       { "stage_in", "stage_out", "transition_reason", "qualification_score" },
  "generation":  { "system_prompt_hash", "output_messages", …tokens/latency, "retries" },
  "guardrails":  { "checks": [{ "name", "passed", "detail" }], "regenerated",
                   "final_action" },      // sent | draft | suppressed
  "handoff":     { "triggered", "reason" },
  "totals":      { "latency_ms", "prompt_tokens", "completion_tokens" },
  "error":       null,                    // or { "step", "type", "message" }
  "eval":        { "human_rating", "auto_score", "labels" }   // future eval loop
}
```

Debugging recipe: check `error.step` first; then `guardrails.checks` for why
a reply became a draft; then `retrieval.hits[].used` for what the FACTS block
actually contained; `resolved_model` tells you which LoRA adapter served the
turn (`GET /v1/metrics/summary` aggregates by it).

---

## Behavior rules (the important ones)

- **Transitions are decided by code, never the LLM.** The generic engine
  interprets the playbook's ordered `transitions`; a triggered handoff
  pre-empts everything else. An objection detours to `OBJECTION_HANDLING` and
  pops back to the previous stage once the objection passes.
- **Numeric grounding:** every currency amount, percentage and year in a
  reply must exist in the FACTS block or the conversation history (k/M forms
  are expanded, so "AED 2.15M" grounds "2150000"). A violation — or
  a forbidden phrase like "guaranteed returns" — triggers exactly one
  regeneration with feedback; a second failure forces the reply into a draft.
- **Handoff triggers:** playbook `handoff_intents` (e.g. `request_human`,
  insurance's `claim_guarantee_request`), angry sentiment, or two consecutive
  low-confidence extractions (`< 0.4`). Handed-off conversations stay silent
  on later inbound messages (`suppressed`).
- **Idempotency:** the unique index on `turns.request_id` is the mechanism —
  a duplicate replays the stored result with `deduped: true`; a request whose
  previous attempt _errored_ is retried fresh.
- **Contact bifurcation:** the same person on two channels starts as two
  contacts; `POST /v1/contacts/merge` unions identities and lead fields
  (automatic matching is a TODO in `app/engine/contacts.py`).

---

## Tests

```bash
pytest                    # 67 unit tests, LLM gateway + retrieval mocked, in-memory Mongo
pytest -m integration     # opt-in: real Mongo/Qdrant via docker compose (+ seeded data)
```

Covered per the plan: strict envelope validation, scope 403, dedupe without
re-running the pipeline, contact create/lookup/merge, the generic state
machine executing **both** playbooks (parametrized), qualification scores +
null-never-overwrites, numeric grounding catching an invented price,
forbidden phrases, the regenerate-then-draft flow, low-confidence strike
handoff, the error-path turn write (`error.step` set), and all three
`resolve_model` behaviors.
