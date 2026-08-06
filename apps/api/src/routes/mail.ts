import { timingSafeEqual } from "node:crypto";

import { Context, Hono } from "hono";
import { z } from "zod";

import { env } from "../lib/env.js";
import { jsonValidator } from "../lib/validation.js";
import { requireAuth } from "../middleware/require-auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import * as gmail from "../services/gmail.service.js";
import type { AppEnv } from "../types.js";

/**
 * The mail plane: a thin, authenticated pass-through to the signed-in user's
 * Gmail. Nothing is cached or mirrored — Gmail stays the source of truth, so
 * a change made in Gmail proper shows up here on the next read.
 */
export const mailRoutes = new Hono<AppEnv>();

mailRoutes.use("*", requireAuth);

const idsSchema = z.array(z.string().trim().min(1).max(128)).min(1).max(200);
const addressSchema = z.string().trim().email().max(320);
const boxSchema = z.enum([
  "inbox",
  "sent",
  "drafts",
  "archive",
  "trash",
  "spam",
  "starred",
  "all",
]);

const composeSchema = z.strictObject({
  to: z.array(addressSchema).min(1).max(50),
  cc: z.array(addressSchema).max(50).optional(),
  bcc: z.array(addressSchema).max(50).optional(),
  subject: z.string().max(998).default(""),
  body: z.string().max(500_000).default(""),
  threadId: z.string().trim().max(128).optional(),
  inReplyTo: z.string().trim().max(998).optional(),
});

/** Every handler needs a fresh token; resolve it once per request. */
function tokenFor(context: Context<AppEnv>) {
  return gmail.accessTokenFor(context.get("user").id, context.req.raw.headers);
}

// --------------------------------------------------------------------------
// Reads
// --------------------------------------------------------------------------
mailRoutes.get("/profile", async (context) => {
  const token = await tokenFor(context);
  return context.json({ data: await gmail.profile(token) });
});

mailRoutes.get("/messages", async (context) => {
  const query = z
    .object({
      box: boxSchema.default("inbox"),
      search: z.string().max(2048).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(30),
      pageToken: z.string().max(2048).optional(),
    })
    .safeParse(context.req.query());

  if (!query.success) {
    return context.json(
      { error: { code: "INVALID_QUERY", message: "Invalid mail query" } },
      400,
    );
  }

  const token = await tokenFor(context);
  return context.json({ data: await gmail.listMessages(token, query.data) });
});

mailRoutes.get("/messages/:id", async (context) => {
  const token = await tokenFor(context);
  return context.json({
    data: await gmail.getMessage(token, context.req.param("id")),
  });
});

// --------------------------------------------------------------------------
// Mutations
// --------------------------------------------------------------------------
mailRoutes.post(
  "/messages/read",
  jsonValidator(z.strictObject({ ids: idsSchema, read: z.boolean() })),
  async (context) => {
    const { ids, read } = context.req.valid("json");
    await gmail.setRead(await tokenFor(context), ids, read);
    return context.json({ data: { ok: true } });
  },
);

mailRoutes.post(
  "/messages/star",
  jsonValidator(z.strictObject({ ids: idsSchema, starred: z.boolean() })),
  async (context) => {
    const { ids, starred } = context.req.valid("json");
    await gmail.setStarred(await tokenFor(context), ids, starred);
    return context.json({ data: { ok: true } });
  },
);

mailRoutes.post(
  "/messages/archive",
  jsonValidator(
    z.strictObject({ ids: idsSchema, archived: z.boolean().default(true) }),
  ),
  async (context) => {
    const { ids, archived } = context.req.valid("json");
    const token = await tokenFor(context);
    await (archived ? gmail.archive(token, ids) : gmail.unarchive(token, ids));
    return context.json({ data: { ok: true } });
  },
);

mailRoutes.post(
  "/messages/trash",
  jsonValidator(
    z.strictObject({ ids: idsSchema, trashed: z.boolean().default(true) }),
  ),
  async (context) => {
    const { ids, trashed } = context.req.valid("json");
    const token = await tokenFor(context);
    await (trashed ? gmail.trash(token, ids) : gmail.untrash(token, ids));
    return context.json({ data: { ok: true } });
  },
);

mailRoutes.post(
  "/messages/spam",
  jsonValidator(z.strictObject({ ids: idsSchema, spam: z.boolean() })),
  async (context) => {
    const { ids, spam } = context.req.valid("json");
    await gmail.setSpam(await tokenFor(context), ids, spam);
    return context.json({ data: { ok: true } });
  },
);

mailRoutes.post(
  "/messages/label",
  jsonValidator(
    z.strictObject({
      ids: idsSchema,
      label: z.string().trim().min(1).max(225),
    }),
  ),
  async (context) => {
    const { ids, label } = context.req.valid("json");
    await gmail.applyLabel(await tokenFor(context), ids, label);
    return context.json({ data: { ok: true } });
  },
);

mailRoutes.post(
  "/labels",
  jsonValidator(z.strictObject({ label: z.string().trim().min(1).max(225) })),
  async (context) => {
    await gmail.createLabel(
      await tokenFor(context),
      context.req.valid("json").label,
    );
    return context.json({ data: { ok: true } });
  },
);

// --------------------------------------------------------------------------
// Sending
// --------------------------------------------------------------------------
mailRoutes.post(
  "/send",
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: "mail-send" }),
  jsonValidator(composeSchema),
  async (context) => {
    const token = await tokenFor(context);
    return context.json({
      data: await gmail.sendMail(token, context.req.valid("json")),
    });
  },
);

mailRoutes.post("/drafts", jsonValidator(composeSchema), async (context) => {
  const token = await tokenFor(context);
  return context.json({
    data: await gmail.saveDraft(token, context.req.valid("json")),
  });
});

// --------------------------------------------------------------------------
// Orchestrator outbound
// --------------------------------------------------------------------------
/**
 * Where the orchestrator's `email` dispatches land.
 *
 * Mounted separately from `mailRoutes` because it must not sit behind
 * `requireAuth` — the orchestrator is a service, not a browser, and holds no
 * session cookie. It proves itself with a shared secret instead, which is what
 * stops any caller who guesses a user_id from sending mail as that person.
 */
export const mailWebhookRoutes = new Hono<AppEnv>();

const outboundSchema = z.strictObject({
  tenant_id: z.string().min(1).max(128),
  user_id: z.string().min(1).max(128).nullable(),
  channel: z.string().min(1).max(32),
  to: z.string().max(320),
  conversation_id: z.string().max(128),
  messages: z.array(z.string().max(500_000)).max(20),
  subject: z.string().max(998).nullable().optional(),
});

function secretMatches(presented: string | undefined): boolean {
  if (!env.OUTBOUND_WEBHOOK_SECRET || !presented) return false;
  const expected = Buffer.from(env.OUTBOUND_WEBHOOK_SECRET);
  const actual = Buffer.from(presented);
  // timingSafeEqual throws on a length mismatch, which itself leaks length —
  // compare lengths first and return the same non-committal false.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * The correspondent directory, for the orchestrator to cache.
 *
 * Same secret-authenticated, no-session pattern as `/outbound` below: the
 * orchestrator names the user whose mailbox to harvest, and `accessTokenFor` is
 * called without headers because Better Auth rejects headers carrying no
 * session even when a userId is supplied.
 */
mailWebhookRoutes.post("/directory", async (context) => {
  if (!secretMatches(context.req.header("X-Outbound-Secret"))) {
    return context.json(
      {
        error: { code: "UNAUTHENTICATED", message: "Invalid outbound secret" },
      },
      401,
    );
  }

  const body = z
    .strictObject({
      user_id: z.string().min(1).max(128),
      limit: z.number().int().min(1).max(2000).optional(),
    })
    .safeParse(await context.req.json().catch(() => null));

  if (!body.success) {
    return context.json(
      {
        error: {
          code: "INVALID_PAYLOAD",
          message: "Invalid directory request",
        },
      },
      400,
    );
  }

  const token = await gmail.accessTokenFor(body.data.user_id);
  const correspondents = await gmail.listCorrespondents(token, {
    ...(body.data.limit ? { limit: body.data.limit } : {}),
  });

  return context.json({ data: { correspondents } });
});

mailWebhookRoutes.post("/outbound", async (context) => {
  if (!secretMatches(context.req.header("X-Outbound-Secret"))) {
    return context.json(
      {
        error: { code: "UNAUTHENTICATED", message: "Invalid outbound secret" },
      },
      401,
    );
  }

  const body = outboundSchema.safeParse(
    await context.req.json().catch(() => null),
  );
  if (!body.success) {
    return context.json(
      {
        error: { code: "INVALID_PAYLOAD", message: "Invalid outbound payload" },
      },
      400,
    );
  }

  const { channel, user_id: userId, to, messages, subject } = body.data;

  // Other channels belong to their own adapters. Acknowledge so a WhatsApp
  // dispatch isn't logged as a delivery failure by the orchestrator.
  if (channel !== "email") {
    return context.json({ data: { skipped: true, channel } });
  }

  if (!userId) {
    return context.json(
      {
        error: {
          code: "NO_SENDING_USER",
          message: "Email dispatch needs a user_id to send under",
        },
      },
      400,
    );
  }

  // No headers: this caller has no session, and Better Auth treats headers
  // without a session as UNAUTHORIZED even when a userId is supplied.
  const token = await gmail.accessTokenFor(userId);
  const sent: string[] = [];
  for (const message of messages) {
    const result = await gmail.sendMail(token, {
      to: [to],
      subject: subject ?? "(no subject)",
      body: message,
    });
    sent.push(result.id);
  }

  return context.json({ data: { sent } });
});
