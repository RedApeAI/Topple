import { Context, Hono } from "hono";
import { z } from "zod";

import { jsonValidator } from "../lib/validation.js";
import { requireAuth } from "../middleware/require-auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import * as orchestrator from "../services/orchestrator.service.js";
import { resolveTenant } from "../services/tenant.service.js";
import type { AppEnv } from "../types.js";

/**
 * The dashboard's only route to the agent.
 *
 * Nothing here takes a `tenant_id` or `user_id` from the request body or query
 * — they are resolved from the session on every call. That is what makes the
 * isolation real: a user editing devtools can change what they ask for, but
 * not who they are asking as.
 */
export const orchestratorRoutes = new Hono<AppEnv>();

orchestratorRoutes.use("*", requireAuth);

/** Verified identity for this request. */
async function scopeFor(context: Context<AppEnv>): Promise<orchestrator.Scope> {
  const tenant = await resolveTenant(
    context.get("user"),
    context.get("session"),
    context.req.raw.headers,
  );
  return { tenant, userId: context.get("user").id };
}

const idParam = z.string().trim().min(1).max(128);

// --------------------------------------------------------------------------
// Inbox / CRM reads
// --------------------------------------------------------------------------
orchestratorRoutes.get("/conversations", async (context) => {
  const query = z
    .object({
      channel: z.string().max(32).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    })
    .safeParse(context.req.query());
  if (!query.success) {
    return context.json(
      { error: { code: "INVALID_QUERY", message: "Invalid query" } },
      400,
    );
  }
  return context.json({
    data: await orchestrator.listConversations(
      await scopeFor(context),
      query.data,
    ),
  });
});

orchestratorRoutes.get("/conversations/:id", async (context) => {
  return context.json({
    data: await orchestrator.getConversation(
      await scopeFor(context),
      context.req.param("id"),
    ),
  });
});

orchestratorRoutes.get("/contacts", async (context) => {
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(200)
    .parse(context.req.query("limit") ?? 200);
  return context.json({
    data: await orchestrator.listContacts(await scopeFor(context), limit),
  });
});

orchestratorRoutes.get("/contacts/:id", async (context) => {
  return context.json({
    data: await orchestrator.getContact(
      await scopeFor(context),
      context.req.param("id"),
    ),
  });
});

orchestratorRoutes.get("/turns", async (context) => {
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .default(30)
    .parse(context.req.query("limit") ?? 30);
  return context.json({
    data: await orchestrator.listTurns(await scopeFor(context), limit),
  });
});

// --------------------------------------------------------------------------
// Operator chat
// --------------------------------------------------------------------------
orchestratorRoutes.get("/operator/threads", async (context) => {
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(30)
    .parse(context.req.query("limit") ?? 30);
  return context.json({
    data: await orchestrator.listOperatorThreads(
      await scopeFor(context),
      limit,
    ),
  });
});

orchestratorRoutes.get("/operator/threads/:id/messages", async (context) => {
  const threadId = idParam.safeParse(context.req.param("id"));
  if (!threadId.success) {
    return context.json(
      { error: { code: "INVALID_THREAD", message: "Invalid thread id" } },
      400,
    );
  }
  return context.json({
    data: await orchestrator.listOperatorMessages(
      await scopeFor(context),
      threadId.data,
    ),
  });
});

orchestratorRoutes.post(
  "/operator/messages",
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: "operator-command" }),
  jsonValidator(
    z.strictObject({
      text: z.string().trim().min(1).max(8000),
      mode: z.enum(["copilot", "autopilot"]).default("copilot"),
      thread_id: z.string().trim().max(128).nullable().optional(),
      preferred_channel: z.string().trim().max(32).nullable().optional(),
      session_id: z.string().trim().max(128).nullable().optional(),
      time_zone: z.string().trim().max(64).nullable().optional(),
    }),
  ),
  async (context) => {
    return context.json({
      data: await orchestrator.postOperatorCommand(
        await scopeFor(context),
        context.req.valid("json"),
      ),
    });
  },
);

// --------------------------------------------------------------------------
// Writes
// --------------------------------------------------------------------------
orchestratorRoutes.post(
  "/turns",
  rateLimit({ windowMs: 60_000, max: 60, keyPrefix: "orchestrator-turn" }),
  async (context) => {
    const body = await context.req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return context.json(
        { error: { code: "INVALID_PAYLOAD", message: "Invalid envelope" } },
        400,
      );
    }
    return context.json({
      data: await orchestrator.postTurn(
        await scopeFor(context),
        body as Record<string, unknown>,
      ),
    });
  },
);

orchestratorRoutes.post(
  "/contacts/import",
  jsonValidator(
    z.strictObject({
      rows: z.array(z.record(z.string(), z.unknown())).max(5000),
    }),
  ),
  async (context) => {
    return context.json({
      data: await orchestrator.importLeads(
        await scopeFor(context),
        context.req.valid("json").rows,
      ),
    });
  },
);

orchestratorRoutes.post("/drafts/:id/approve", async (context) => {
  const body = await context.req.json().catch(() => ({}));
  const editedText =
    body && typeof body === "object" && typeof body.edited_text === "string"
      ? body.edited_text
      : undefined;
  return context.json({
    data: await orchestrator.approveDraft(
      await scopeFor(context),
      context.req.param("id"),
      editedText,
    ),
  });
});

orchestratorRoutes.post("/drafts/:id/discard", async (context) => {
  return context.json({
    data: await orchestrator.discardDraft(
      await scopeFor(context),
      context.req.param("id"),
    ),
  });
});

orchestratorRoutes.post("/directory/sync", async (context) => {
  return context.json({
    data: await orchestrator.syncDirectory(await scopeFor(context)),
  });
});
