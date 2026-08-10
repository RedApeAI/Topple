import { Context, Hono } from "hono";
import { z } from "zod";

import { jsonValidator } from "../lib/validation.js";
import { requireAuth } from "../middleware/require-auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import {
  connectWhatsAppCredentials,
  configureZernioWebhook,
  createWhatsAppConversation,
  disconnectAccount,
  getChannelStatus,
  ingestZernioWebhook,
  listConversationMessages,
  listWhatsAppPhoneNumbers,
  listWhatsAppTemplates,
  listWhatsAppConversations,
  listZernioWebhookEvents,
  markWhatsAppConversationRead,
  selectWhatsAppPhoneNumber,
  sendConversationMessage,
  startConnection,
  verifyZernioWebhookSignature,
  type ZernioWebhookPayload,
} from "../services/zernio.service.js";
import { resolveTenant } from "../services/tenant.service.js";
import { env } from "../lib/env.js";
import type { AppEnv } from "../types.js";

const platformSchema = z.enum(["whatsapp", "linkedin"]);
const conversationIdSchema = z.string().trim().min(1).max(512);
const accountIdSchema = z.string().trim().min(1).max(128);
const sendMessageSchema = z.strictObject({
  accountId: accountIdSchema,
  message: z.string().trim().min(1).max(4096),
});
const createConversationSchema = z.strictObject({
  accountId: accountIdSchema,
  participantId: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{6,14}$/, "Use an international phone number"),
  templateName: z.string().trim().min(1).max(512),
  templateLanguage: z.string().trim().min(2).max(32),
  templateParams: z.array(z.string().max(1024)).max(20).default([]),
});
const whatsappCredentialsSchema = z.strictObject({
  accessToken: z.string().trim().min(20).max(16_384),
  wabaId: z
    .string()
    .trim()
    .regex(/^\d{5,32}$/, "Invalid WABA ID"),
  phoneNumberId: z
    .string()
    .trim()
    .regex(/^\d{5,32}$/, "Invalid phone number ID"),
  pin: z
    .string()
    .regex(/^\d{6}$/, "PIN must contain exactly 6 digits")
    .optional(),
});

export const zernioRoutes = new Hono<AppEnv>();
export const zernioWebhookRoutes = new Hono<AppEnv>();

// Zernio cannot send a Better Auth session cookie. This endpoint is protected
// by the raw-body HMAC signature instead of requireAuth.
zernioWebhookRoutes.post("/webhooks", async (context) => {
  if (!env.ZERNIO_WEBHOOK_SECRET) {
    return context.json(
      {
        error: {
          code: "ZERNIO_WEBHOOK_NOT_CONFIGURED",
          message: "Webhook secret is not configured",
        },
      },
      503,
    );
  }

  const rawBody = await context.req.raw.text();
  if (
    !verifyZernioWebhookSignature(
      rawBody,
      context.req.header("X-Zernio-Signature") ??
        context.req.header("X-Late-Signature") ??
        null,
    )
  ) {
    return context.json(
      {
        error: {
          code: "INVALID_WEBHOOK_SIGNATURE",
          message: "Invalid webhook signature",
        },
      },
      401,
    );
  }

  let payload: ZernioWebhookPayload;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("not an object");
    payload = parsed as ZernioWebhookPayload;
  } catch {
    return context.json(
      {
        error: {
          code: "INVALID_WEBHOOK_PAYLOAD",
          message: "Webhook payload must be JSON",
        },
      },
      400,
    );
  }

  const eventId =
    payload.id ??
    context.req.header("X-Zernio-Event-Id") ??
    context.req.header("X-Late-Event-Id");
  if (!eventId || eventId.length > 255) {
    return context.json(
      {
        error: {
          code: "MISSING_WEBHOOK_EVENT_ID",
          message: "Webhook event ID is required",
        },
      },
      400,
    );
  }

  const result = await ingestZernioWebhook(payload, eventId);
  return context.json({ ok: true, duplicate: result.duplicate });
});

zernioRoutes.use("*", requireAuth);

async function tenantFor(context: Context<AppEnv>) {
  return resolveTenant(
    context.get("user"),
    context.get("session"),
    context.req.raw.headers,
  );
}

zernioRoutes.get("/channels", async (context) => {
  const tenant = await tenantFor(context);
  return context.json({ data: await getChannelStatus(tenant) });
});

zernioRoutes.post(
  "/webhooks/configure",
  rateLimit({ windowMs: 60_000, max: 5, keyPrefix: "zernio-webhook-setup" }),
  async (context) => context.json({ data: await configureZernioWebhook() }),
);

zernioRoutes.post(
  "/channels/whatsapp/credentials",
  rateLimit({
    windowMs: 60_000,
    max: 5,
    keyPrefix: "whatsapp-credentials",
  }),
  jsonValidator(whatsappCredentialsSchema),
  async (context) => {
    context.header("Cache-Control", "no-store");
    const tenant = await tenantFor(context);
    return context.json({
      data: await connectWhatsAppCredentials(tenant, context.req.valid("json")),
    });
  },
);

zernioRoutes.post(
  "/channels/:platform/connect",
  rateLimit({ windowMs: 60_000, max: 10, keyPrefix: "zernio-connect" }),
  async (context) => {
    const platform = platformSchema.safeParse(context.req.param("platform"));
    if (!platform.success) {
      return context.json(
        {
          error: {
            code: "UNSUPPORTED_PLATFORM",
            message: "Unsupported platform",
          },
        },
        400,
      );
    }
    const tenant = await tenantFor(context);
    return context.json({ data: await startConnection(tenant, platform.data) });
  },
);

const whatsappTempTokenSchema = z.string().trim().min(1).max(4096);
const selectWhatsAppPhoneNumberSchema = z.strictObject({
  tempToken: whatsappTempTokenSchema,
  phoneNumberId: z.string().trim().min(1).max(128),
  wabaId: z.string().trim().min(1).max(128),
});

// List available numbers after a headless Embedded Signup redirect
// (`step=select_phone_number`). The tempToken is one-time and short-lived.
zernioRoutes.get("/channels/whatsapp/phone-numbers", async (context) => {
  const tempToken = whatsappTempTokenSchema.safeParse(
    context.req.query("tempToken"),
  );
  if (!tempToken.success) {
    return context.json(
      {
        error: {
          code: "INVALID_QUERY",
          message: "tempToken is required",
        },
      },
      400,
    );
  }
  context.header("Cache-Control", "no-store");
  const tenant = await tenantFor(context);
  return context.json({
    data: await listWhatsAppPhoneNumbers(tenant, tempToken.data),
  });
});

// Bind the phone number the user picked on Plucia, completing the connection.
zernioRoutes.post(
  "/channels/whatsapp/phone-numbers/select",
  rateLimit({
    windowMs: 60_000,
    max: 20,
    keyPrefix: "whatsapp-phone-select",
  }),
  jsonValidator(selectWhatsAppPhoneNumberSchema),
  async (context) => {
    context.header("Cache-Control", "no-store");
    const tenant = await tenantFor(context);
    return context.json({
      data: await selectWhatsAppPhoneNumber(tenant, context.req.valid("json")),
    });
  },
);

zernioRoutes.delete(
  "/channels/:platform/:accountId",
  rateLimit({ windowMs: 60_000, max: 10, keyPrefix: "zernio-disconnect" }),
  async (context) => {
    const platform = platformSchema.safeParse(context.req.param("platform"));
    const accountId = accountIdSchema.safeParse(context.req.param("accountId"));
    if (!platform.success || !accountId.success) {
      return context.json(
        {
          error: {
            code: "INVALID_CHANNEL_ACCOUNT",
            message: "Invalid channel account",
          },
        },
        400,
      );
    }
    const tenant = await tenantFor(context);
    return context.json({
      data: await disconnectAccount(tenant, platform.data, accountId.data),
    });
  },
);

zernioRoutes.get("/conversations", async (context) => {
  const query = z
    .object({
      cursor: z.string().min(1).max(2048).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    })
    .safeParse(context.req.query());
  if (!query.success) {
    return context.json(
      {
        error: { code: "INVALID_QUERY", message: "Invalid conversation query" },
      },
      400,
    );
  }
  const tenant = await tenantFor(context);
  return context.json({
    data: await listWhatsAppConversations(tenant, query.data),
  });
});

zernioRoutes.post(
  "/conversations",
  rateLimit({ windowMs: 60_000, max: 20, keyPrefix: "zernio-new-message" }),
  jsonValidator(createConversationSchema),
  async (context) => {
    const tenant = await tenantFor(context);
    return context.json(
      {
        data: await createWhatsAppConversation(
          tenant,
          context.req.valid("json"),
        ),
      },
      201,
    );
  },
);

zernioRoutes.get("/whatsapp/templates", async (context) => {
  const accountId = accountIdSchema.safeParse(context.req.query("accountId"));
  if (!accountId.success) {
    return context.json(
      { error: { code: "INVALID_ACCOUNT", message: "Account is required" } },
      400,
    );
  }
  const tenant = await tenantFor(context);
  return context.json({
    data: await listWhatsAppTemplates(tenant, accountId.data),
  });
});

zernioRoutes.get("/events", async (context) => {
  const query = z
    .object({ after: z.iso.datetime().optional() })
    .safeParse(context.req.query());
  if (!query.success) {
    return context.json(
      {
        error: {
          code: "INVALID_EVENT_CURSOR",
          message: "Invalid event cursor",
        },
      },
      400,
    );
  }
  const tenant = await tenantFor(context);
  return context.json({
    data: await listZernioWebhookEvents(
      tenant,
      query.data.after ? new Date(query.data.after) : undefined,
    ),
  });
});

zernioRoutes.get("/conversations/:conversationId/messages", async (context) => {
  const conversationId = conversationIdSchema.safeParse(
    context.req.param("conversationId"),
  );
  const accountId = accountIdSchema.safeParse(context.req.query("accountId"));
  if (!conversationId.success || !accountId.success) {
    return context.json(
      {
        error: {
          code: "INVALID_QUERY",
          message: "Conversation and account are required",
        },
      },
      400,
    );
  }
  const tenant = await tenantFor(context);
  return context.json({
    data: await listConversationMessages(
      tenant,
      conversationId.data,
      accountId.data,
    ),
  });
});

zernioRoutes.post("/conversations/:conversationId/read", async (context) => {
  const conversationId = conversationIdSchema.safeParse(
    context.req.param("conversationId"),
  );
  const accountId = accountIdSchema.safeParse(context.req.query("accountId"));
  if (!conversationId.success || !accountId.success) {
    return context.json(
      {
        error: {
          code: "INVALID_QUERY",
          message: "Conversation and account are required",
        },
      },
      400,
    );
  }
  const tenant = await tenantFor(context);
  return context.json({
    data: await markWhatsAppConversationRead(
      tenant,
      conversationId.data,
      accountId.data,
    ),
  });
});

zernioRoutes.post(
  "/conversations/:conversationId/messages",
  rateLimit({ windowMs: 60_000, max: 60, keyPrefix: "zernio-message" }),
  jsonValidator(sendMessageSchema),
  async (context) => {
    const conversationId = conversationIdSchema.safeParse(
      context.req.param("conversationId"),
    );
    if (!conversationId.success) {
      return context.json(
        {
          error: {
            code: "INVALID_CONVERSATION",
            message: "Invalid conversation",
          },
        },
        400,
      );
    }
    const tenant = await tenantFor(context);
    const input = context.req.valid("json");
    return context.json({
      data: await sendConversationMessage(
        tenant,
        conversationId.data,
        input.accountId,
        input.message,
      ),
    });
  },
);
