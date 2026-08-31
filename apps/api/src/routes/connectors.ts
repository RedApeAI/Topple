import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { Hono } from "hono";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import { env } from "../lib/env.js";
import { AppError } from "../lib/errors.js";
import { getDb, users } from "@repo/db-sql";
import { eq } from "drizzle-orm";
import { buildMcpServer } from "../mcp/server.js";
import { requireAuth } from "../middleware/require-auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import {
  connectUrl,
  connectorById,
  connectorStatuses,
} from "../services/connectors.service.js";
import type { AppEnv } from "../types.js";

/**
 * Connector management for the dashboard: what's connected, and the consent
 * flow to connect it. Session-authenticated like the rest of the UI surface.
 */
export const connectorRoutes = new Hono<AppEnv>();

connectorRoutes.use("*", requireAuth);

connectorRoutes.get("/", async (context) => {
  const statuses = await connectorStatuses(context.get("user").id);
  // Never leak the raw scope strings' meaning to the UI as a checklist — the
  // card only needs to know connected or not, plus what it would gain.
  return context.json({
    data: statuses.map(({ id, label, description, tools, connected }) => ({
      id,
      label,
      description,
      tools,
      connected,
    })),
  });
});

connectorRoutes.post(
  "/:id/connect",
  rateLimit({ windowMs: 60_000, max: 10, keyPrefix: "connector-connect" }),
  async (context) => {
    const connector = connectorById(context.req.param("id"));
    if (!connector) {
      return context.json(
        { error: { code: "UNKNOWN_CONNECTOR", message: "Unknown connector" } },
        404,
      );
    }

    const body = await context.req.json().catch(() => ({}));
    const returnTo = z
      .string()
      .max(2048)
      .optional()
      .parse((body as { returnTo?: string })?.returnTo);

    // Only ever redirect back to our own front end; an attacker-supplied
    // absolute URL here would turn consent into an open redirect.
    const origin = env.FRONTEND_ORIGINS[0]!;
    const callbackURL = new URL(
      returnTo && returnTo.startsWith("/") ? returnTo : "/dashboard/connectors",
      origin,
    ).toString();

    const { url, cookies } = await connectUrl(
      connector,
      callbackURL,
      context.req.raw.headers,
    );
    // Forward the OAuth state cookie, or Google's callback has nothing to
    // verify the `state` parameter against.
    for (const cookie of cookies) {
      context.header("set-cookie", cookie, { append: true });
    }
    return context.json({ data: { url } });
  },
);

// --------------------------------------------------------------------------
// MCP
// --------------------------------------------------------------------------
/**
 * The MCP endpoint the orchestrator connects to.
 *
 * Separate router because it is machine-to-machine: the orchestrator holds no
 * session cookie, proves itself with the shared secret, and names the user it
 * is acting for. That header is trusted *only* because the secret is — the
 * browser can never reach this route.
 */
export const mcpRoutes = new Hono<AppEnv>();

function secretMatches(presented: string | undefined): boolean {
  if (!env.OUTBOUND_WEBHOOK_SECRET || !presented) return false;
  const expected = Buffer.from(env.OUTBOUND_WEBHOOK_SECRET);
  const actual = Buffer.from(presented);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

mcpRoutes.post("/", async (context) => {
  if (!secretMatches(context.req.header("X-Outbound-Secret"))) {
    return context.json(
      { error: { code: "UNAUTHENTICATED", message: "Invalid secret" } },
      401,
    );
  }

  const userId = context.req.header("X-RedApeAI-User-Id");
  if (!userId) {
    return context.json(
      { error: { code: "NO_USER", message: "X-RedApeAI-User-Id is required" } },
      400,
    );
  }

  const [user] = await getDb()
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) {
    return context.json(
      { error: { code: "NO_USER", message: "Unknown user" } },
      404,
    );
  }

  // Mode governs whether tools may notify anyone. Header, not tool argument —
  // see the note in mcp/server.ts.
  const mode =
    context.req.header("X-RedApeAI-Mode") === "autopilot"
      ? "autopilot"
      : "copilot";

  const body = await context.req.json().catch(() => null);

  // Stateless transport: one server per request, torn down with it. The
  // alternative — long-lived sessions — would mean holding per-user state in
  // a process that is meant to be horizontally scalable.
  const server = await buildMcpServer(user as never, mode);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const { incoming, outgoing } = context.env as unknown as {
    incoming: IncomingMessage;
    outgoing: ServerResponse;
  };
  if (!incoming || !outgoing) {
    throw new AppError(
      500,
      "MCP_TRANSPORT_UNAVAILABLE",
      "MCP requires the Node server adapter.",
    );
  }

  outgoing.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(incoming, outgoing, body);
  return RESPONSE_ALREADY_SENT;
});
