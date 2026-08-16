import { AppError } from "../lib/errors.js";
import { env } from "../lib/env.js";
import type { Tenant } from "./tenant.service.js";

/**
 * Typed client for the orchestrator.
 *
 * The orchestrator has no authentication of its own — it accepts whatever
 * `tenant_id` and `user_id` an envelope names, by design, because it is meant
 * to sit behind a service that has already verified them. This module is that
 * service: `scope` comes from the Better Auth session, never from the browser.
 *
 * That is the whole point of routing traffic through here. When the dashboard
 * called the orchestrator directly, any user could edit `user_id` in devtools
 * and read another person's conversations.
 */

export interface Scope {
  tenant: Tenant;
  userId: string;
}

const TIMEOUT_MS = 120_000; // a turn runs an LLM loop

async function call<T>(
  path: string,
  init: RequestInit & {
    query?: Record<string, string | number | undefined>;
  } = {},
): Promise<T> {
  const url = new URL(`${env.ORCHESTRATOR_URL.replace(/\/$/, "")}${path}`);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value !== undefined && value !== "")
      url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET",
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      ...(init.body ? { body: init.body } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new AppError(
      503,
      "ORCHESTRATOR_UNREACHABLE",
      error instanceof Error && error.name === "TimeoutError"
        ? "The agent took too long to respond."
        : "Can't reach the agent service. Is the orchestrator running?",
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AppError(
      response.status === 404 ? 404 : 502,
      "ORCHESTRATOR_ERROR",
      `Agent request failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// --------------------------------------------------------------------------
// Reads — every one scoped to the caller
// --------------------------------------------------------------------------
export function listConversations(
  scope: Scope,
  options: { channel?: string; limit?: number } = {},
) {
  return call<unknown[]>("/v1/conversations", {
    query: {
      tenant_id: scope.tenant.id,
      user_id: scope.userId,
      channel: options.channel,
      limit: options.limit ?? 50,
    },
  });
}

export function getConversation(scope: Scope, conversationId: string) {
  return call<Record<string, unknown>>(
    `/v1/conversations/${encodeURIComponent(conversationId)}`,
    { query: { tenant_id: scope.tenant.id, user_id: scope.userId } },
  );
}

export function listContacts(scope: Scope, limit = 200) {
  return call<unknown[]>("/v1/contacts", {
    query: { tenant_id: scope.tenant.id, user_id: scope.userId, limit },
  });
}

export function getContact(scope: Scope, contactId: string) {
  return call<Record<string, unknown>>(
    `/v1/contacts/${encodeURIComponent(contactId)}`,
    { query: { tenant_id: scope.tenant.id } },
  );
}

export function listTurns(scope: Scope, limit = 30) {
  return call<unknown[]>("/v1/turns", {
    query: { tenant_id: scope.tenant.id, user_id: scope.userId, limit },
  });
}

// --------------------------------------------------------------------------
// Operator chat
// --------------------------------------------------------------------------
export function listOperatorThreads(scope: Scope, limit = 30) {
  return call<unknown[]>("/v1/operator/threads", {
    query: { tenant_id: scope.tenant.id, user_id: scope.userId, limit },
  });
}

/**
 * A thread's messages. The tenant and user go along as query parameters so the
 * orchestrator can reject a thread id belonging to someone else — an id alone
 * must not be enough to read a conversation.
 */
export function listOperatorMessages(scope: Scope, threadId: string) {
  return call<unknown[]>(
    `/v1/operator/threads/${encodeURIComponent(threadId)}/messages`,
    { query: { tenant_id: scope.tenant.id, user_id: scope.userId } },
  );
}

export function postOperatorCommand(
  scope: Scope,
  body: {
    text: string;
    mode: string;
    thread_id?: string | null;
    preferred_channel?: string | null;
    session_id?: string | null;
    time_zone?: string | null;
  },
) {
  return call<Record<string, unknown>>("/v1/operator/messages", {
    method: "POST",
    body: JSON.stringify({
      ...body,
      tenant_id: scope.tenant.id,
      user_id: scope.userId,
      client_ref: crypto.randomUUID(),
    }),
  });
}

// --------------------------------------------------------------------------
// Writes
// --------------------------------------------------------------------------
export function postTurn(scope: Scope, envelope: Record<string, unknown>) {
  return call<Record<string, unknown>>("/v1/turns", {
    method: "POST",
    body: JSON.stringify({
      ...envelope,
      tenant_id: scope.tenant.id,
      user_id: scope.userId,
    }),
  });
}

export function importLeads(scope: Scope, rows: unknown[]) {
  return call<Record<string, unknown>>("/v1/contacts/import", {
    method: "POST",
    body: JSON.stringify({
      tenant_id: scope.tenant.id,
      user_id: scope.userId,
      rows,
    }),
  });
}

export function approveDraft(
  scope: Scope,
  messageId: string,
  editedText?: string,
) {
  return call<Record<string, unknown>>(
    `/v1/drafts/${encodeURIComponent(messageId)}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ edited_text: editedText ?? null }),
      query: { tenant_id: scope.tenant.id, user_id: scope.userId },
    },
  );
}

export function discardDraft(scope: Scope, messageId: string) {
  return call<Record<string, unknown>>(
    `/v1/drafts/${encodeURIComponent(messageId)}/discard`,
    {
      method: "POST",
      query: { tenant_id: scope.tenant.id, user_id: scope.userId },
    },
  );
}

export function syncDirectory(scope: Scope) {
  return call<Record<string, unknown>>("/v1/directory/sync", {
    method: "POST",
    body: JSON.stringify({
      tenant_id: scope.tenant.id,
      user_id: scope.userId,
    }),
  });
}

// --------------------------------------------------------------------------
// Knowledge base
// --------------------------------------------------------------------------
/**
 * The collection a scope's knowledge lives in.
 *
 * One collection for the deployment; isolation inside it is the orchestrator's
 * `(tenant_id, user_id)` payload filter, not the name. Kept as a function so
 * the day a tenant runtime registry exists (HLD §8 gap 4) there is one place
 * to change — today the web client hardcodes this same string, which is the
 * gap itself.
 */
export function knowledgeSourceFor(_scope: Scope): string {
  return env.KNOWLEDGE_COLLECTION ?? "plucia_re";
}

export function ingestKnowledge(
  scope: Scope,
  documents: { text: string; doc_id: string; chunk_id: string }[],
) {
  return call<{ chunks_written: number }>("/v1/knowledge/documents", {
    method: "POST",
    body: JSON.stringify({
      tenant_id: scope.tenant.id,
      user_id: scope.userId,
      knowledge_source_id: knowledgeSourceFor(scope),
      documents,
    }),
  });
}

export function forgetKnowledgeDocument(scope: Scope) {
  return call<Record<string, unknown>>("/v1/knowledge/documents", {
    method: "DELETE",
    query: {
      tenant_id: scope.tenant.id,
      user_id: scope.userId,
      knowledge_source_id: knowledgeSourceFor(scope),
    },
  });
}
