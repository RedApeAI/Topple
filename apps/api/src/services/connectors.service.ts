import { accounts, getDb } from "@repo/db-sql";
import { and, eq } from "drizzle-orm";

import { auth, type AuthUser } from "../lib/auth.js";
import { AppError } from "../lib/errors.js";
import { accessTokenFor } from "./gmail.service.js";

/**
 * Connectors: the third-party capabilities a user can grant the agent.
 *
 * Each connector is a named bundle of OAuth scopes plus the toolset it unlocks.
 * Consent is *incremental* — signing in never asks for calendar access, and
 * clicking Connect asks for exactly that connector's scopes and nothing more.
 * Better Auth's `linkSocialAccount` performs the second consent against the
 * account the user already has.
 */

export type ConnectorId = "gmail" | "google-calendar";

export interface ConnectorDefinition {
  id: ConnectorId;
  label: string;
  description: string;
  provider: "google";
  scopes: string[];
  /** MCP tools this connector contributes once granted. */
  tools: string[];
}

export const CONNECTORS: ConnectorDefinition[] = [
  {
    id: "gmail",
    label: "Gmail",
    description:
      "Read and send mail from your mailbox, and resolve recipients from people you've emailed.",
    provider: "google",
    scopes: [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    tools: [],
  },
  {
    id: "google-calendar",
    label: "Google Calendar",
    description:
      "See your schedule, find free slots, and draft meeting invites for your approval.",
    provider: "google",
    // `calendar.events` covers reading and creating events; `calendar.readonly`
    // additionally allows free/busy without exposing event details. Both are
    // Google *sensitive* scopes — a lighter review bar than Gmail's restricted
    // scopes, but still subject to verification before general availability.
    scopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    tools: [
      "calendar_list_events",
      "calendar_find_free_slots",
      "calendar_propose_event",
      "calendar_send_invites",
    ],
  },
];

export function connectorById(id: string): ConnectorDefinition | undefined {
  return CONNECTORS.find((connector) => connector.id === id);
}

export interface ConnectorStatus extends ConnectorDefinition {
  connected: boolean;
  /** Scopes this connector needs that the user has not granted. */
  missingScopes: string[];
}

/** Scopes the user has actually granted on their Google account. */
async function grantedScopes(userId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ scope: accounts.scope })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "google")));

  const granted = new Set<string>();
  for (const row of rows) {
    for (const scope of (row.scope ?? "").split(/[,\s]+/)) {
      if (scope) granted.add(scope);
    }
  }
  return granted;
}

export async function connectorStatuses(
  userId: string,
): Promise<ConnectorStatus[]> {
  const granted = await grantedScopes(userId);
  return CONNECTORS.map((connector) => {
    const missingScopes = connector.scopes.filter(
      (scope) => !granted.has(scope),
    );
    return { ...connector, missingScopes, connected: missingScopes.length === 0 };
  });
}

export async function isConnected(
  userId: string,
  id: ConnectorId,
): Promise<boolean> {
  const connector = connectorById(id);
  if (!connector) return false;
  const granted = await grantedScopes(userId);
  return connector.scopes.every((scope) => granted.has(scope));
}

/**
 * Start the incremental consent for one connector.
 *
 * Returns Google's authorization URL *and the cookies that must go with it*.
 *
 * That second half is not optional. Better Auth signs an OAuth `state` cookie
 * alongside the verification row it writes, and the callback rejects the whole
 * flow with "State mismatch: State not persisted correctly" unless the browser
 * sends that cookie back. Calling `auth.api.*` server-side means those
 * Set-Cookie headers land here rather than on the browser, so the caller has to
 * forward them — the same reason every route in `routes/auth.ts` calls
 * `applyCookies`.
 *
 * `linkSocialAccount` re-consents the existing Google account with the extra
 * scopes rather than creating a second one, so the user keeps one identity.
 */
export async function connectUrl(
  connector: ConnectorDefinition,
  callbackURL: string,
  headers: Headers,
): Promise<{ url: string; cookies: string[] }> {
  const result = (await auth.api.linkSocialAccount({
    headers,
    body: {
      provider: connector.provider,
      scopes: connector.scopes,
      callbackURL,
    },
    returnHeaders: true,
  })) as unknown as {
    headers?: Headers;
    response?: { url?: string; redirect?: boolean };
    url?: string;
  };

  // `returnHeaders` wraps the payload in `response`; tolerate both shapes so a
  // Better Auth upgrade can't silently drop the URL.
  const url = result?.response?.url ?? result?.url;
  if (!url) {
    throw new AppError(
      502,
      "CONNECT_FAILED",
      "Google did not return an authorization URL.",
    );
  }
  return { url, cookies: result.headers?.getSetCookie?.() ?? [] };
}

/**
 * A token that is known to carry this connector's scopes.
 *
 * Checked before use rather than after a 403: "Calendar isn't connected" is a
 * far better message than Google's generic insufficient-scope error, and it
 * points at the Connect button that fixes it.
 */
export async function tokenForConnector(
  user: AuthUser,
  id: ConnectorId,
  headers?: Headers,
): Promise<string> {
  const connector = connectorById(id);
  if (!connector) {
    throw new AppError(404, "UNKNOWN_CONNECTOR", `No connector named ${id}`);
  }
  if (!(await isConnected(user.id, id))) {
    throw new AppError(
      403,
      "CONNECTOR_NOT_CONNECTED",
      `${connector.label} isn't connected. Connect it under Connectors to let the agent use it.`,
    );
  }
  return accessTokenFor(user.id, headers);
}
