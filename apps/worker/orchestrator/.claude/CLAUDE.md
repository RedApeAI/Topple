## Project

You are working in `apps/worker/orchestrator`, a FastAPI service that is the
agent runtime for Plucia, an AI sales platform. It has two planes:

- **Turn pipeline** (`app/engine/pipeline.py::run_turn`) — reacts to an inbound
  buyer message, speaks AS the salesperson TO the buyer. Currently a fixed
  13-step imperative sequence.
- **Operator agent** (`app/operator/agent.py`) — reacts to a typed command from
  the salesperson, speaks TO the salesperson. Currently a ReAct loop with
  `MAX_STEPS = 8`.

We are migrating both to LangGraph. `HLD.md` in the repo root describes the
intended design. **The code is the source of truth, not the HLD** — the HLD has
known drift. Where they disagree, report the discrepancy rather than silently
picking one.

## Architectural decisions already made — do not relitigate

1. **Two top-level graphs, not one.** The turn graph is NOT a subgraph of the
   operator graph. Nothing invokes the turn graph except an inbound channel
   webhook. Build it so it _can_ be invoked as a subgraph later (fan-out
   campaigns), but do not nest it now.
2. **Control flow ownership is the dividing line.** In the turn graph the
   playbook YAML owns control flow and the LLM only produces data — so the graph
   is replayable as a pure function given recorded LLM outputs. In the operator
   graph the model owns control flow. Preserve this property; if a change would
   let an LLM decide the turn graph's next node, stop and flag it.
3. **The turn document IS the state schema.** See HLD §4.9. Do not build a state
   object and then assemble a separate turn document from it. The terminal node
   serializes state.
4. **The idempotency protocol IS the checkpointer.** See HLD §4.2. The `turns`
   collection already has a unique index on `request_id` and an
   insert-as-lock / replay / take-over / 409 protocol. Formalise that same
   collection as the turn graph's checkpoint namespace rather than adding a
   second locking mechanism beside it.
5. **Node failure policy is declarative.** Every node is tagged `critical` or
   `best_effort`. `best_effort` nodes catch, append to `state.errors[]`, and
   continue. This implements the existing invariant "best-effort infra never
   fails a turn" (HLD §4.1 principle 4) — event bus publish, Qdrant collection
   miss, and outbound dispatch are all `best_effort`. Do not scatter try/except.

## Invariants that must not regress

- `OrchestratorInput` stays `extra="forbid"`.
- Exactly one turn document is written per invocation, including on every error
  path, with `error` populated.
- `mode` remains the only thing deciding sent-vs-draft, except that a post-check
  violation surviving regeneration forces draft regardless of mode.
- Handoff-triggered transition rules are sorted ahead of `always` rules.
- `return_to_previous` detour restoration happens BEFORE rules are evaluated on
  the following turn.
- Identity normalisation runs on both sides of every comparison (emails
  lowercased, phones reduced to `+` and digits).
- `sanitize_customer_text` / `sanitize_operator_output` still strip ids, JSON and
  tool names from anything user-facing.
- Tenant + user scoping on every read. A thread id alone is not a capability.

## Library API caution

LangGraph's API surface changes between minor versions. Before writing graph
code, read the installed version's API from `site-packages` or its docs — do not
write from memory. Report the version you found and the exact symbols you are
using (`StateGraph`, reducer annotation style, checkpointer base class,
interrupt mechanism, streaming mode names). If an API you expect is absent,
say so instead of substituting something that looks similar.

## Testing constraint — important

The existing suite uses `mongomock-motor`, which does **not** enforce unique
constraints over array paths. Every `DuplicateKeyError` branch is therefore
currently unexercised, and it is the exact branch this migration builds
checkpointing on top of. Any test covering idempotency, take-over, or
checkpoint resume MUST run against a real MongoDB (testcontainers or a
docker-compose service), not mongomock. Say so explicitly if you cannot.

## Scope fences

Do NOT, unless a phase prompt says otherwise:

- Modify `apps/api` or `apps/web`.
- Change any prompt text, system prompt, or playbook YAML _content_ or schema.
  Parity checking depends on these being fixed.
- Fix the items in HLD §8 "Known gaps" — with one exception, gap 3
  (`merge_identities` unbatched writes), which is in scope where a phase says so.
- Add new dependencies beyond LangGraph and its checkpointer without asking.
- Refactor for tidiness. Every change should be traceable to a phase objective.

## Working style

- Read before writing. Start each phase by reading the files it touches and
  stating what you found that contradicts your expectation.
- Ask before making a design decision this document does not cover.
- Small commits, one concern each.
- When you finish a phase, output a short report: what changed, what you could
  not verify, and what you think is now riskiest.
