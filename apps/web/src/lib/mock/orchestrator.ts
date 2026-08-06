import { apiClient } from "@/lib/api/client";
import { toApiChannel } from "@/lib/api/channel-map";
import type { ChannelKey } from "@/types/channel.types";
import type {
  ApiContact,
  ApiConversation,
  ApiConversationDetail,
  ApiLeadImportResponse,
  ApiLeadImportRow,
  ApiMessage,
  ApiTurnResult,
  ApiTurnSummary,
  OrchestratorChannel,
  OrchestratorMode,
} from "./orchestrator.types";

/**
 * The agent, reached through the BFF at `/api/v1/agent`.
 *
 * These calls used to go straight to the orchestrator carrying a `tenant_id`
 * and `user_id` this file worked out itself. The orchestrator has no
 * authentication of its own, so identity was whatever the browser claimed —
 * anyone could edit it in devtools and read another user's conversations.
 * Both ids are now resolved server-side from the session and cannot be set
 * from here at all.
 */

/** Unwraps the BFF's `{ data }` envelope. */
async function get<T>(
  path: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const { data } = await apiClient.get<{ data: T }>(`/api/v1/agent${path}`, {
    ...(params ? { params } : {}),
  });
  return data.data;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const { data } = await apiClient.post<{ data: T }>(
    `/api/v1/agent${path}`,
    body,
  );
  return data.data;
}

/**
 * Demo runtime, matching the seeded real-estate tenant in the orchestrator's
 * Postman collection. Upstream this is resolved per tenant from Postgres; the
 * dashboard has no such registry yet, so a turn started from the UI runs the
 * demo playbook. Replace when the BFF grows a runtime endpoint.
 */
const DEMO_RUNTIME = {
  playbook_id: "real-estate-v1",
  knowledge_source_id: "plucia_re",
  model_id: "qwen3.5-9b-base",
  adapter_id: "real-estate-v2",
  playbook_version: 8,
  prompt_version: "2026-06-01",
} as const;

const SESSION_STORAGE_KEY = "plucia:orchestrator-session-id";

/**
 * The eval grouping key.
 *
 * One id per browser tab session, minted on first use and held in
 * `sessionStorage` so a reload keeps the same id but a new tab starts a new
 * one. Unlike tenant and user this is a *measurement* label rather than an
 * identity claim, so the client remains the right place to mint it.
 */
export function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const minted = crypto.randomUUID();
    sessionStorage.setItem(SESSION_STORAGE_KEY, minted);
    return minted;
  } catch {
    // Private-mode or blocked storage: fall back to a per-page-load id rather
    // than failing the request that wanted to be measured.
    return crypto.randomUUID();
  }
}

// --------------------------------------------------------------------------
// Reads
// --------------------------------------------------------------------------
export function listConversations(
  options: { channel?: OrchestratorChannel; limit?: number } = {},
): Promise<ApiConversation[]> {
  return get<ApiConversation[]>("/conversations", {
    channel: options.channel,
    limit: options.limit ?? 50,
  });
}

export function getConversation(
  conversationId: string,
): Promise<ApiConversationDetail> {
  return get<ApiConversationDetail>(
    `/conversations/${encodeURIComponent(conversationId)}`,
  );
}

export function listContacts(limit = 200): Promise<ApiContact[]> {
  return get<ApiContact[]>("/contacts", { limit });
}

export function getContact(contactId: string): Promise<ApiContact> {
  return get<ApiContact>(`/contacts/${encodeURIComponent(contactId)}`);
}

export function listTurns(limit = 30): Promise<ApiTurnSummary[]> {
  return get<ApiTurnSummary[]>("/turns", { limit });
}

// --------------------------------------------------------------------------
// Turns
// --------------------------------------------------------------------------
export interface InboundMessageInput {
  channel: ChannelKey;
  externalContactId: string;
  text: string;
  mode?: OrchestratorMode;
}

/**
 * Run a turn by feeding a message in as if the contact sent it.
 *
 * There is no outbound-first endpoint: `POST /v1/turns` is the only way to
 * make the agent act, so both the inbox composer and the CRM's "message this
 * lead" go through here. `request_id` is the idempotency key — a fresh one per
 * call, since each of these is genuinely a new message.
 */
export function sendInboundMessage(
  input: InboundMessageInput,
): Promise<ApiTurnResult> {
  const channel = toApiChannel(input.channel);
  if (!channel) {
    throw new Error(
      `The agent can't run on ${input.channel} yet — no pipeline for that channel.`,
    );
  }
  const now = new Date().toISOString();

  return post<ApiTurnResult>("/turns", {
    request_id: crypto.randomUUID(),
    received_at: now,
    session_id: sessionId(),
    channel,
    granted_scopes: [`channel:${channel}`],
    runtime: DEMO_RUNTIME,
    message: {
      external_contact_id: input.externalContactId,
      type: "text",
      text: input.text,
      media: [],
      channel_timestamp: now,
      raw_ref: null,
    },
    mode: input.mode ?? "autopilot",
  });
}

// --------------------------------------------------------------------------
// Lead import
// --------------------------------------------------------------------------
/** Bulk create/merge contacts. Rows are matched on identity, not on name. */
export function importLeads(
  rows: ApiLeadImportRow[],
): Promise<ApiLeadImportResponse> {
  return post<ApiLeadImportResponse>("/contacts/import", { rows });
}

// --------------------------------------------------------------------------
// Copilot drafts
// --------------------------------------------------------------------------
/** Send a copilot draft, optionally with the salesperson's edits. */
export function approveDraft(
  messageId: string,
  editedText?: string,
): Promise<ApiMessage> {
  return post<ApiMessage>(`/drafts/${encodeURIComponent(messageId)}/approve`, {
    edited_text: editedText ?? null,
  });
}

export function discardDraft(messageId: string): Promise<ApiMessage> {
  return post<ApiMessage>(`/drafts/${encodeURIComponent(messageId)}/discard`);
}

/**
 * Harvest the signed-in user's mailbox into the agent's recipient directory,
 * so it can resolve "email Ariyaman" against people they have corresponded
 * with rather than only imported CRM leads.
 */
export function syncDirectory(): Promise<unknown> {
  return post("/directory/sync");
}
