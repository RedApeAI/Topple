/**
 * Wire types for the orchestrator (`apps/worker/orchestrator`).
 *
 * These mirror what its FastAPI surface actually returns: Pydantic models for
 * `/v1/turns` and `/v1/contacts/import`, and raw Mongo documents (passed
 * through `_jsonable`) for everything else. That is why ids arrive as `_id`
 * strings and timestamps as ISO strings — they are BSON values stringified on
 * the way out, not a hand-designed JSON API.
 */

/** Channels the turn pipeline serves — `schemas.envelope.Channel`. */
export type OrchestratorChannel = "whatsapp" | "email" | "voice" | "instagram";

export type OrchestratorMode = "autopilot" | "copilot";

/** Message lifecycle. Copilot replies land as "draft" pending approval. */
export type ApiMessageStatus =
  | "received"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "draft"
  | "approved"
  | "discarded"
  | "suppressed";

export interface ApiIdentity {
  /** Includes "linkedin", which is stored but has no turn pipeline. */
  channel: string;
  external_id: string;
}

export interface ApiContact {
  _id: string;
  tenant_id: string;
  identities: ApiIdentity[];
  profile?: { name?: string | null; language?: string | null } | null;
  /** Playbook-derived lead fields; `qualification_score` is always present. */
  lead?: { qualification_score?: number | string } & Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export interface ApiMessage {
  _id: string;
  tenant_id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  text: string;
  status: ApiMessageStatus;
  created_at: string;
}

export interface ApiConversation {
  _id: string;
  tenant_id: string;
  contact_id: string;
  channel: OrchestratorChannel;
  stage: string;
  previous_stage?: string | null;
  return_stage?: string | null;
  mode?: OrchestratorMode | null;
  status: "active" | "handed_off" | "closed";
  low_confidence_strikes?: number;
  last_message_at?: string | null;
  created_at: string;
  /** Only on the list endpoint, which enriches each row. */
  contact?: ApiContact | null;
  last_message?: ApiMessage | null;
}

/** `GET /v1/conversations/{id}` — the conversation plus its full transcript. */
export interface ApiConversationDetail extends ApiConversation {
  messages: ApiMessage[];
}

// --------------------------------------------------------------------------
// Turns
// --------------------------------------------------------------------------
export interface ApiRetrievalHit {
  doc_id: string;
  chunk_id: string;
  score: number;
  used: boolean;
}

/** `OrchestratorResult` — the response to `POST /v1/turns`. */
export interface ApiTurnResult {
  turn_id: string;
  request_id: string;
  deduped: boolean;
  conversation_id: string;
  contact_id: string;
  stage_in: string;
  stage_out: string;
  lead_profile: Record<string, unknown>;
  extraction: Record<string, unknown>;
  retrieval_hits: ApiRetrievalHit[];
  reply: { status: "sent" | "draft" | "suppressed"; messages: string[] };
  guardrail_flags: string[];
  handoff: { triggered: boolean; reason?: string | null };
  totals: {
    latency_ms: number;
    prompt_tokens: number;
    completion_tokens: number;
  };
}

/** `GET /v1/turns` — a flattened summary per invocation, newest first. */
export interface ApiTurnSummary {
  request_id: string;
  ts_start: string;
  status: "in_progress" | "completed" | "error" | string;
  conversation_id: string | null;
  channel: OrchestratorChannel;
  mode: OrchestratorMode | null;
  intent: string | null;
  stage_in: string | null;
  stage_out: string | null;
  /** The guardrails' final action — "sent" | "draft" | "suppressed". */
  reply_status: string | null;
  messages: string[];
  handoff: boolean;
  latency_ms: number | null;
  error: string | null;
}

// --------------------------------------------------------------------------
// Lead import
// --------------------------------------------------------------------------
/** One CSV/Excel row. Every field is optional; at least one channel is needed. */
export interface ApiLeadImportRow {
  name?: string;
  whatsapp?: string;
  email?: string;
  phone?: string;
  instagram?: string;
  linkedin?: string;
}

export interface ApiLeadImportRowResult {
  /** Zero-based index of the submitted row. */
  row: number;
  status: "created" | "updated" | "skipped";
  contact_id: string | null;
  reason: string | null;
}

export interface ApiLeadImportResponse {
  created: number;
  updated: number;
  skipped: number;
  results: ApiLeadImportRowResult[];
}

// --------------------------------------------------------------------------
// Operator agent
// --------------------------------------------------------------------------
/** One iteration of the agent loop: a thought, or a tool call and its result. */
export type ApiOperatorStep =
  | { type: "thought"; text: string }
  | {
      type: "tool";
      tool: string;
      args: Record<string, unknown>;
      observation: unknown;
    };

/**
 * The outcome of the agent's `send_message` tool. In copilot mode it lands as
 * "draft"; approving or discarding that draft rewrites this same record to
 * "sent" or "discarded" (`_reflect_operator_decision`).
 */
export interface ApiOperatorActionResult {
  type: "send_message";
  status: "draft" | "sent" | "discarded" | "failed";
  message_id?: string;
  conversation_id?: string;
  contact_id?: string;
  contact_name?: string;
  channel?: OrchestratorChannel | string;
  text?: string;
  /** Present when `status` is "failed". */
  reason?: string;
  decided_at?: string;
}

export interface ApiOperatorMessage {
  _id: string;
  tenant_id: string;
  thread_id: string;
  role: "user" | "operator";
  text: string;
  /** Only on operator replies — a user message has no trace. */
  steps?: ApiOperatorStep[];
  action?: ApiOperatorActionResult | null;
  created_at: string;
}

export interface ApiOperatorThread {
  _id: string;
  tenant_id: string;
  title: string;
  created_at: string;
  last_message_at: string | null;
}

/** `POST /v1/operator/messages` — the persisted reply plus its thread. */
export interface ApiOperatorCommandResult {
  thread_id: string;
  message: ApiOperatorMessage;
}
