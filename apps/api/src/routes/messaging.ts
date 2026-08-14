import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

import { env } from "../lib/env.js";
import {
  jsonValidator,
  paramValidator,
  queryValidator,
} from "../lib/validation.js";
import { requireAuth } from "../middleware/require-auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import type { AppEnv } from "../types.js";
import {
  assertAssignableUser,
  assertOrganizationManager,
  canUseAccount,
  isOrganizationManager,
  requireAccountAccess,
  requireThreadAccess,
  resolveMessagingContext,
} from "../messaging/authorization.js";
import {
  createOutboxEvent,
  findMessagingAccount,
  getThreadWithRelated,
  listOutboxEventsSince,
  listThreads,
  markOutboxPublished,
  removeThreadLabel,
  addThreadLabel,
  assignThread,
  updateMessagingAccount,
} from "../messaging/repository.js";
import {
  messagingConnectChannels,
  type MessagingConnectChannel,
} from "../messaging/contracts.js";
import {
  archiveMessagingThread,
  completeMessagingConnection,
  completeMessagingAttachment,
  createMessagingConnectionLink,
  disconnectMessagingAccount,
  getMessagingAttachment,
  listMessagingThreadMessages,
  markMessagingThreadRead,
  presignMessagingAttachment,
  sendMessagingReply,
  retryMessagingMessage,
  startMessagingConversation,
  syncMessagingAccount,
  uploadMessagingAttachment,
} from "../messaging/service.js";
import { enqueueMessagingJob } from "../messaging/jobs.js";
import {
  dismissMessagingAiArtifact,
  listMessagingAiArtifacts,
  requestAiArtifact,
} from "../messaging/ai.js";
import { processMessagingJobs } from "../messaging/job-runner.js";

export const messagingRoutes = new Hono<AppEnv>();
messagingRoutes.use("*", requireAuth);
export const inboxRoutes = new Hono<AppEnv>();
inboxRoutes.use("*", requireAuth);

const idParam = z.object({ id: z.string().uuid() });
const threadParam = z.object({ threadId: z.string().uuid() });
const messageParam = z.object({ messageId: z.string().uuid() });
const labelParam = z.object({
  threadId: z.string().uuid(),
  labelId: z.string().uuid(),
});
const cursorSchema = z.string().max(512).optional();

function background(
  context: Parameters<typeof resolveMessagingContext>[0],
  promise: Promise<unknown>,
): void {
  const executionContext = context.executionCtx;
  if (executionContext && typeof executionContext.waitUntil === "function") {
    executionContext.waitUntil(
      promise.catch((error) =>
        console.error(
          JSON.stringify({
            level: "error",
            event: "messaging.background_failed",
            errorName: error instanceof Error ? error.name : "unknown",
          }),
        ),
      ),
    );
  } else {
    void promise.catch(() => undefined);
  }
}

function encodeCursor(value: { activityAt: Date; id: string }): string {
  const json = JSON.stringify({
    activityAt: value.activityAt.toISOString(),
    id: value.id,
  });
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeCursor(
  value: string | undefined,
): { activityAt: Date; id: string } | undefined {
  if (!value) return undefined;
  try {
    const padded = value
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded)) as {
      activityAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.activityAt !== "string" || typeof parsed.id !== "string")
      return undefined;
    const activityAt = new Date(parsed.activityAt);
    if (Number.isNaN(activityAt.getTime())) return undefined;
    return { activityAt, id: parsed.id };
  } catch {
    return undefined;
  }
}

function encodeMessageCursor(value: { sentAt: Date; id: string }): string {
  return encodeCursor({ activityAt: value.sentAt, id: value.id });
}

function decodeMessageCursor(
  value: string | undefined,
): { sentAt: Date; id: string } | undefined {
  const decoded = decodeCursor(value);
  return decoded ? { sentAt: decoded.activityAt, id: decoded.id } : undefined;
}

function accountDto(
  account: typeof import("@repo/db-sql").messagingConnectedAccounts.$inferSelect,
) {
  return {
    id: account.id,
    provider: account.provider,
    providerAccountType: account.providerAccountType,
    displayName: account.displayName,
    username: account.username,
    emailAddress: account.emailAddress,
    phoneNumber: account.phoneNumber,
    status: account.status,
    enabled: account.enabled,
    shared: account.shared,
    lastSuccessfulSyncAt: account.lastSuccessfulSyncAt,
    lastWebhookAt: account.lastWebhookAt,
    lastErrorCode: account.lastErrorCode,
    lastErrorMessage: account.lastErrorMessage,
    backfillProgress: account.backfillProgress,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function threadDto(row: Awaited<ReturnType<typeof listThreads>>[number]) {
  return {
    ...row.thread,
    account: row.account,
  };
}

messagingRoutes.get("/accounts", async (context) => {
  const auth = await resolveMessagingContext(context);
  const accounts = await import("../messaging/repository.js").then(
    (repository) => repository.listMessagingAccounts(auth),
  );
  return context.json({ data: accounts.map(accountDto) });
});

messagingRoutes.get(
  "/accounts/:id",
  paramValidator(idParam),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { id } = context.req.valid("param");
    const account = await requireAccountAccess(auth, id);
    return context.json({ data: accountDto(account) });
  },
);

messagingRoutes.post(
  "/accounts/:id/share",
  paramValidator(idParam),
  jsonValidator(z.object({ shared: z.boolean() })),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { id } = context.req.valid("param");
    assertOrganizationManager(auth);
    await requireAccountAccess(auth, id);
    const updated = await updateMessagingAccount(auth.organizationId, id, {
      shared: context.req.valid("json").shared,
    });
    if (!updated)
      return context.json(
        {
          error: {
            code: "MESSAGING_ACCOUNT_NOT_FOUND",
            message: "Messaging account not found",
          },
        },
        404,
      );
    await createOutboxEvent({
      organizationId: auth.organizationId,
      eventType: "connected_account.updated",
      aggregateType: "connected_account",
      aggregateId: id,
      payload: { accountId: id, shared: updated.shared },
    });
    return context.json({ data: accountDto(updated) });
  },
);

messagingRoutes.post(
  "/accounts/connect",
  rateLimit({ windowMs: 60_000, max: 10, keyPrefix: "messaging-connect" }),
  jsonValidator(
    z.object({
      channel: z.enum(messagingConnectChannels),
      returnPath: z.string().max(512).default("/dashboard/inbox"),
    }),
  ),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const body = context.req.valid("json");
    const requestOrigin = new URL(context.req.url).origin;
    const link = await createMessagingConnectionLink({
      auth,
      bindings: context.env,
      channel: body.channel,
      requestOrigin,
      returnPath: body.returnPath,
    });
    return context.json({ data: { url: link } });
  },
);

messagingRoutes.get("/accounts/connect/callback", async (context) => {
  const auth = await resolveMessagingContext(context);
  const query = z
    .object({
      state: z.string().min(1).max(4096),
      account_id: z.string().min(1).max(256).optional(),
      accountId: z.string().min(1).max(256).optional(),
      error: z.string().max(200).optional(),
      error_description: z.string().max(500).optional(),
    })
    .safeParse(context.req.query());
  if (!query.success)
    return context.json(
      {
        error: {
          code: "INVALID_CALLBACK",
          message: "Invalid messaging callback",
        },
      },
      400,
    );
  const accountId = query.data.account_id ?? query.data.accountId;
  if (query.data.error || !accountId) {
    return context.json(
      {
        error: {
          code: "MESSAGING_CONNECTION_FAILED",
          message:
            query.data.error_description ??
            query.data.error ??
            "The messaging account was not connected",
        },
      },
      400,
    );
  }
  const completed = await completeMessagingConnection({
    auth,
    bindings: context.env,
    state: query.data.state,
    accountId,
  });
  background(
    context,
    syncMessagingAccount({
      organizationId: auth.organizationId,
      accountId: completed.account.id,
      bindings: context.env,
    }),
  );
  const configuredOrigins = context.env.FRONTEND_ORIGINS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const origin =
    configuredOrigins?.[0] ??
    env.FRONTEND_ORIGINS[0] ??
    new URL(context.req.url).origin;
  return context.redirect(
    `${origin}${completed.returnPath}?messaging=connected`,
  );
});

messagingRoutes.post(
  "/accounts/:id/disconnect",
  rateLimit({ windowMs: 60_000, max: 10, keyPrefix: "messaging-disconnect" }),
  paramValidator(idParam),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { id } = context.req.valid("param");
    return context.json({
      data: accountDto(
        await disconnectMessagingAccount({
          auth,
          bindings: context.env,
          accountId: id,
        }),
      ),
    });
  },
);

messagingRoutes.post(
  "/accounts/:id/reconnect",
  rateLimit({ windowMs: 60_000, max: 10, keyPrefix: "messaging-reconnect" }),
  paramValidator(idParam),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { id } = context.req.valid("param");
    const account = await requireAccountAccess(auth, id);
    if (!isOrganizationManager(auth) && account.createdByUserId !== auth.userId)
      return context.json(
        {
          error: {
            code: "MESSAGING_ACCOUNT_OWNER_REQUIRED",
            message:
              "Only the account owner or an organization manager can reconnect this account",
          },
        },
        403,
      );
    if (
      !account.enabled ||
      ["disconnected", "expired", "revoked", "failed"].includes(account.status)
    ) {
      const accountType = account.providerAccountType?.toLowerCase() ?? "";
      const reconnectChannel: MessagingConnectChannel =
        account.provider === "linkedin" && accountType.includes("sales")
          ? "linkedin_sales_navigator"
          : account.provider === "linkedin" && accountType.includes("recruiter")
            ? "linkedin_recruiter"
            : account.provider;
      const state = await import("../messaging/crypto.js").then(
        (cryptoModule) =>
          cryptoModule.createHostedState(
            {
              organizationId: auth.organizationId,
              userId: auth.userId,
              channel: reconnectChannel,
              returnPath: "/dashboard/inbox",
            },
            `${env.BETTER_AUTH_SECRET}:messaging-hosted-auth`,
          ),
      );
      await import("../messaging/repository.js").then((repository) =>
        repository.createConnectionState({
          nonceHash: state.nonceHash,
          organizationId: auth.organizationId,
          userId: auth.userId,
          requestedChannel: account.provider,
          returnPath: "/dashboard/inbox",
          expiresAt: new Date(state.payload.expiresAt),
        }),
      );
      const link = await import("../messaging/unipile-client.js").then(
        (clientModule) =>
          clientModule
            .createUnipileClient(context.env)
            .createReconnectAuthLink({
              accountId: account.unipileAccountId,
              redirectUri:
                context.env.MESSAGING_CALLBACK_URL ??
                env.MESSAGING_CALLBACK_URL ??
                `${new URL(context.req.url).origin}/api/v1/messaging/accounts/connect/callback`,
              expiresOn: new Date(state.payload.expiresAt).toISOString(),
              state: state.state,
            }),
      );
      return context.json({ data: { url: link } });
    }
    await import("../messaging/repository.js").then((repository) =>
      repository.updateMessagingAccount(auth.organizationId, account.id, {
        status: "syncing",
        enabled: true,
      }),
    );
    background(
      context,
      syncMessagingAccount({
        organizationId: auth.organizationId,
        accountId: account.id,
        bindings: context.env,
      }),
    );
    return context.json({ data: { status: "syncing" } });
  },
);

messagingRoutes.post(
  "/accounts/:id/sync",
  paramValidator(idParam),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { id } = context.req.valid("param");
    const account = await requireAccountAccess(auth, id);
    if (!isOrganizationManager(auth) && account.createdByUserId !== auth.userId)
      return context.json(
        {
          error: {
            code: "MESSAGING_ACCOUNT_OWNER_REQUIRED",
            message:
              "Only the account owner or an organization manager can synchronize this account",
          },
        },
        403,
      );
    await import("../messaging/repository.js").then((repository) =>
      repository.updateMessagingAccount(auth.organizationId, account.id, {
        status: "syncing",
      }),
    );
    await enqueueMessagingJob({
      jobKey: `messaging:manual-sync:${account.id}:${Date.now()}`,
      organizationId: auth.organizationId,
      kind: "account_resync",
      payload: { accountId: account.id },
    });
    background(
      context,
      syncMessagingAccount({
        organizationId: auth.organizationId,
        accountId: account.id,
        bindings: context.env,
      }),
    );
    return context.json(
      { data: { accountId: account.id, status: "syncing" } },
      202,
    );
  },
);

messagingRoutes.post(
  "/attachments/presign",
  rateLimit({
    windowMs: 60_000,
    max: 30,
    keyPrefix: "messaging-attachment-presign",
  }),
  jsonValidator(
    z.object({
      filename: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(120),
      sizeBytes: z
        .number()
        .int()
        .min(1)
        .max(env.MESSAGING_MAX_ATTACHMENT_BYTES),
      threadId: z.string().uuid().nullable().optional(),
    }),
  ),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const body = context.req.valid("json");
    if (body.threadId) await requireThreadAccess(auth, body.threadId);
    const result = await presignMessagingAttachment({
      auth,
      threadId: body.threadId,
      filename: body.filename,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });
    return context.json(
      {
        data: {
          attachment: result.attachment,
          uploadToken: result.uploadToken,
          uploadUrl: result.uploadUrl,
          expiresAt: result.expiresAt,
        },
      },
      201,
    );
  },
);

messagingRoutes.put(
  "/attachments/:id/upload",
  rateLimit({
    windowMs: 60_000,
    max: 60,
    keyPrefix: "messaging-attachment-upload",
  }),
  paramValidator(idParam),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { id } = context.req.valid("param");
    const length = Number(context.req.header("content-length"));
    if (Number.isFinite(length) && length > env.MESSAGING_MAX_ATTACHMENT_BYTES)
      return context.json(
        {
          error: {
            code: "ATTACHMENT_TOO_LARGE",
            message: "Attachment exceeds the configured size limit",
          },
        },
        413,
      );
    const uploadToken = context.req.header("X-Upload-Token");
    if (!uploadToken)
      return context.json(
        {
          error: {
            code: "ATTACHMENT_UPLOAD_TOKEN_INVALID",
            message: "Attachment upload token is required",
          },
        },
        403,
      );
    const body = await context.req.raw.arrayBuffer();
    if (body.byteLength > env.MESSAGING_MAX_ATTACHMENT_BYTES)
      return context.json(
        {
          error: {
            code: "ATTACHMENT_TOO_LARGE",
            message: "Attachment exceeds the configured size limit",
          },
        },
        413,
      );
    return context.json({
      data: await uploadMessagingAttachment({
        auth,
        bindings: context.env,
        attachmentId: id,
        uploadToken,
        body,
        contentType: context.req.header("content-type"),
      }),
    });
  },
);

messagingRoutes.post(
  "/attachments/complete",
  rateLimit({
    windowMs: 60_000,
    max: 60,
    keyPrefix: "messaging-attachment-complete",
  }),
  jsonValidator(
    z.object({
      attachmentId: z.string().uuid(),
      messageId: z.string().uuid().nullable().optional(),
      threadId: z.string().uuid().nullable().optional(),
    }),
  ),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const body = context.req.valid("json");
    if (body.threadId) await requireThreadAccess(auth, body.threadId);
    return context.json({
      data: await completeMessagingAttachment({
        auth,
        attachmentId: body.attachmentId,
        messageId: body.messageId,
        threadId: body.threadId,
      }),
    });
  },
);

messagingRoutes.get(
  "/attachments/:id",
  paramValidator(idParam),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { id } = context.req.valid("param");
    const result = await getMessagingAttachment({
      auth,
      bindings: context.env,
      attachmentId: id,
    });
    return result.response;
  },
);

inboxRoutes.get(
  "/threads",
  queryValidator(
    z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      cursor: cursorSchema,
      accountId: z.string().uuid().optional(),
      provider: z
        .enum([
          "linkedin",
          "whatsapp",
          "instagram",
          "telegram",
          "google",
          "outlook",
          "imap",
        ])
        .optional(),
      state: z
        .enum(["all", "inbox", "archive", "spam", "trash"])
        .default("inbox"),
      unread: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),
      assignedUserId: z.string().uuid().optional(),
      labelId: z.string().uuid().optional(),
      contactId: z.string().max(256).optional(),
      leadId: z.string().max(256).optional(),
      search: z.string().max(120).optional(),
    }),
  ),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const query = context.req.valid("query");
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && !cursor)
      return context.json(
        { error: { code: "INVALID_CURSOR", message: "Cursor is invalid" } },
        400,
      );
    const rows = await listThreads(auth, {
      ...query,
      cursor,
      limit: query.limit,
    });
    const hasMore = rows.length > query.limit;
    const visible = rows.slice(0, query.limit);
    const next =
      hasMore && visible.at(-1)
        ? encodeCursor({
            activityAt:
              visible.at(-1)!.thread.latestActivityAt ??
              visible.at(-1)!.thread.createdAt,
            id: visible.at(-1)!.thread.id,
          })
        : null;
    return context.json({
      data: visible.map(threadDto),
      page: { hasMore, nextCursor: next },
    });
  },
);

inboxRoutes.get(
  "/threads/:threadId",
  paramValidator(threadParam),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { threadId } = context.req.valid("param");
    const detail = await getThreadWithRelated(auth, threadId);
    if (!detail)
      return context.json(
        {
          error: {
            code: "MESSAGING_THREAD_NOT_FOUND",
            message: "Messaging thread not found",
          },
        },
        404,
      );
    return context.json({ data: detail });
  },
);

inboxRoutes.get(
  "/threads/:threadId/messages",
  paramValidator(threadParam),
  queryValidator(
    z.object({
      limit: z.coerce.number().int().min(1).max(200).default(100),
      cursor: cursorSchema,
    }),
  ),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { threadId } = context.req.valid("param");
    const query = context.req.valid("query");
    const cursor = decodeMessageCursor(query.cursor);
    if (query.cursor && !cursor)
      return context.json(
        { error: { code: "INVALID_CURSOR", message: "Cursor is invalid" } },
        400,
      );
    const result = await listMessagingThreadMessages({
      auth,
      threadId,
      cursor,
      limit: query.limit,
    });
    if (!result)
      return context.json(
        {
          error: {
            code: "MESSAGING_THREAD_NOT_FOUND",
            message: "Messaging thread not found",
          },
        },
        404,
      );
    const hasMore = result.messages.length > query.limit;
    const visible = result.messages.slice(0, query.limit);
    const next =
      hasMore && visible.at(-1)
        ? encodeMessageCursor({
            sentAt: visible.at(-1)!.sentAt,
            id: visible.at(-1)!.id,
          })
        : null;
    return context.json({
      data: visible.reverse(),
      page: { hasMore, nextCursor: next },
    });
  },
);

inboxRoutes.post(
  "/threads/:threadId/read",
  paramValidator(threadParam),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { threadId } = context.req.valid("param");
    await markMessagingThreadRead({
      auth,
      bindings: context.env,
      threadId,
      isRead: true,
    });
    return context.json({ data: { threadId, isRead: true } });
  },
);

inboxRoutes.post(
  "/threads/:threadId/unread",
  paramValidator(threadParam),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { threadId } = context.req.valid("param");
    await markMessagingThreadRead({
      auth,
      bindings: context.env,
      threadId,
      isRead: false,
    });
    return context.json({ data: { threadId, isRead: false } });
  },
);

inboxRoutes.post(
  "/threads/:threadId/archive",
  paramValidator(threadParam),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { threadId } = context.req.valid("param");
    return context.json({
      data: await archiveMessagingThread({
        auth,
        bindings: context.env,
        threadId,
        archived: true,
      }),
    });
  },
);

inboxRoutes.post(
  "/threads/:threadId/unarchive",
  paramValidator(threadParam),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { threadId } = context.req.valid("param");
    return context.json({
      data: await archiveMessagingThread({
        auth,
        bindings: context.env,
        threadId,
        archived: false,
      }),
    });
  },
);

inboxRoutes.post(
  "/threads/:threadId/assign",
  paramValidator(threadParam),
  jsonValidator(
    z.object({
      assignedUserId: z.string().uuid().nullable().optional(),
      assignedTeamId: z.string().max(256).nullable().optional(),
    }),
  ),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { threadId } = context.req.valid("param");
    const body = context.req.valid("json");
    assertOrganizationManager(auth);
    await assertAssignableUser(auth, body.assignedUserId);
    const updated = await assignThread({
      organizationId: auth.organizationId,
      threadId,
      assignedUserId: body.assignedUserId ?? null,
      assignedTeamId: body.assignedTeamId ?? null,
      assignedByUserId: auth.userId,
    });
    if (!updated)
      return context.json(
        {
          error: {
            code: "MESSAGING_THREAD_NOT_FOUND",
            message: "Messaging thread not found",
          },
        },
        404,
      );
    await createOutboxEvent({
      organizationId: auth.organizationId,
      eventType: "thread.updated",
      aggregateType: "thread",
      aggregateId: threadId,
      payload: {
        threadId,
        assignedUserId: updated.assignedUserId,
        assignedTeamId: updated.assignedTeamId,
      },
    });
    return context.json({ data: updated });
  },
);

inboxRoutes.post(
  "/threads/:threadId/labels",
  paramValidator(threadParam),
  jsonValidator(
    z.object({
      labelId: z.string().uuid().optional(),
      name: z.string().max(80).optional(),
      color: z.string().max(32).nullable().optional(),
    }),
  ),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { threadId } = context.req.valid("param");
    const body = context.req.valid("json");
    const thread = await requireThreadAccess(auth, threadId);
    if (
      !isOrganizationManager(auth) &&
      thread.thread.assignedUserId &&
      thread.thread.assignedUserId !== auth.userId
    )
      return context.json(
        {
          error: {
            code: "MESSAGING_THREAD_FORBIDDEN",
            message: "You cannot change this assigned thread",
          },
        },
        403,
      );
    const label = await addThreadLabel({
      organizationId: auth.organizationId,
      threadId,
      labelId: body.labelId,
      name: body.name,
      color: body.color,
      userId: auth.userId,
    });
    await createOutboxEvent({
      organizationId: auth.organizationId,
      eventType: "thread.updated",
      aggregateType: "thread",
      aggregateId: threadId,
      payload: { threadId, labelId: label.id },
    });
    return context.json({ data: label });
  },
);

inboxRoutes.delete(
  "/threads/:threadId/labels/:labelId",
  paramValidator(labelParam),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { threadId, labelId } = context.req.valid("param");
    await requireThreadAccess(auth, threadId);
    await removeThreadLabel(auth.organizationId, threadId, labelId);
    await createOutboxEvent({
      organizationId: auth.organizationId,
      eventType: "thread.updated",
      aggregateType: "thread",
      aggregateId: threadId,
      payload: { threadId, labelId, removed: true },
    });
    return context.json({ data: { threadId, labelId, removed: true } });
  },
);

const messageBody = z.object({
  text: z.string().max(200_000).nullable().optional(),
  html: z.string().max(200_000).nullable().optional(),
  attachmentIds: z.array(z.string().uuid()).max(20).optional(),
  idempotencyKey: z.string().min(8).max(200).optional(),
});
inboxRoutes.post(
  "/threads/:threadId/reply",
  rateLimit({ windowMs: 60_000, max: 60, keyPrefix: "messaging-reply" }),
  paramValidator(threadParam),
  jsonValidator(messageBody),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { threadId } = context.req.valid("param");
    const body = context.req.valid("json");
    const idempotencyKey =
      context.req.header("Idempotency-Key") ??
      body.idempotencyKey ??
      crypto.randomUUID();
    const result = await sendMessagingReply({
      auth,
      bindings: context.env,
      threadId,
      text: body.text,
      html: body.html,
      attachmentIds: body.attachmentIds,
      idempotencyKey,
    });
    if (result.error)
      return context.json(
        {
          error: {
            code: result.error.code,
            message: result.error.message,
            data: { message: result.message },
          },
        },
        result.error.status,
      );
    return context.json(
      { data: result.message, idempotent: result.idempotent },
      result.idempotent ? 200 : 201,
    );
  },
);

inboxRoutes.post(
  "/messages/:messageId/retry",
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: "messaging-retry" }),
  paramValidator(messageParam),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { messageId } = context.req.valid("param");
    const result = await retryMessagingMessage({
      auth,
      bindings: context.env,
      messageId,
    });
    if ("error" in result && result.error)
      return context.json(
        {
          error: {
            code: result.error.code,
            message: result.error.message,
            data: { message: result.message },
          },
        },
        result.error.status,
      );
    return context.json(
      {
        data: result.message,
        reconciled: result.reconciled,
        idempotent: result.idempotent,
      },
      result.idempotent ? 200 : 201,
    );
  },
);

inboxRoutes.get(
  "/threads/:threadId/ai",
  paramValidator(threadParam),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { threadId } = context.req.valid("param");
    return context.json({
      data: await listMessagingAiArtifacts(auth, threadId),
    });
  },
);

inboxRoutes.post(
  "/threads/:threadId/ai",
  paramValidator(threadParam),
  jsonValidator(
    z.object({
      artifactType: z.enum([
        "summary",
        "classification",
        "entities",
        "reply_draft",
        "next_action",
      ]),
    }),
  ),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { threadId } = context.req.valid("param");
    const body = context.req.valid("json");
    const artifact = await requestAiArtifact({
      auth,
      bindings: context.env,
      threadId,
      artifactType: body.artifactType,
    });
    background(context, processMessagingJobs(context.env, 1));
    return context.json({ data: artifact }, 202);
  },
);

inboxRoutes.post(
  "/ai/:id/dismiss",
  paramValidator(idParam),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const { id } = context.req.valid("param");
    return context.json({ data: await dismissMessagingAiArtifact(auth, id) });
  },
);

inboxRoutes.post(
  "/conversations",
  rateLimit({
    windowMs: 60_000,
    max: 30,
    keyPrefix: "messaging-start-conversation",
  }),
  jsonValidator(
    z.object({
      accountId: z.string().uuid(),
      participantIds: z.array(z.string().min(1).max(512)).min(1).max(50),
      title: z.string().max(200).nullable().optional(),
      text: z.string().max(200_000).nullable().optional(),
      html: z.string().max(200_000).nullable().optional(),
      linkedinProduct: z
        .enum(["classic", "sales_navigator", "recruiter"])
        .optional(),
      inmail: z.boolean().optional(),
      inmailSubject: z.string().max(998).nullable().optional(),
      inmailSignature: z.string().max(998).nullable().optional(),
      attachmentIds: z.array(z.string().uuid()).max(20).optional(),
      idempotencyKey: z.string().min(8).max(200).optional(),
    }),
  ),
  async (context) => {
    const auth = await resolveMessagingContext(context);
    const body = context.req.valid("json");
    const idempotencyKey =
      context.req.header("Idempotency-Key") ??
      body.idempotencyKey ??
      crypto.randomUUID();
    const result = await startMessagingConversation({
      auth,
      bindings: context.env,
      accountId: body.accountId,
      participantIds: body.participantIds,
      title: body.title,
      text: body.text,
      html: body.html,
      linkedinProduct: body.linkedinProduct,
      inmail: body.inmail,
      inmailSubject: body.inmailSubject,
      inmailSignature: body.inmailSignature,
      attachmentIds: body.attachmentIds,
      idempotencyKey,
    });
    if (result.error)
      return context.json(
        {
          error: {
            code: result.error.code,
            message: result.error.message,
            data: result,
          },
        },
        result.error.status,
      );
    return context.json(
      { data: result, idempotent: result.idempotent },
      result.idempotent ? 200 : 201,
    );
  },
);

inboxRoutes.get("/events", async (context) => {
  const auth = await resolveMessagingContext(context);
  const lastEventId =
    context.req.header("Last-Event-ID") ??
    context.req.query("lastEventId") ??
    null;
  return streamSSE(context, async (stream) => {
    const startedAt = Date.now();
    let cursor = lastEventId;
    while (Date.now() - startedAt < env.MESSAGING_SSE_MAX_SECONDS * 1000) {
      const events = await listOutboxEventsSince(auth, cursor, 100);
      for (const event of events) {
        const threadId =
          typeof event.payload.threadId === "string"
            ? event.payload.threadId
            : event.aggregateType === "thread"
              ? event.aggregateId
              : null;
        const accountId =
          typeof event.payload.accountId === "string"
            ? event.payload.accountId
            : event.aggregateType === "connected_account"
              ? event.aggregateId
              : null;
        if (threadId) {
          const thread = await getThreadWithRelated(auth, threadId);
          if (!thread) {
            cursor = event.id;
            continue;
          }
        }
        if (accountId && event.aggregateType === "connected_account") {
          const account = await findMessagingAccount(
            auth.organizationId,
            accountId,
          );
          if (!account || !canUseAccount(account, auth)) {
            cursor = event.id;
            continue;
          }
        }
        await stream.writeSSE({
          id: event.id,
          event: event.eventType,
          data: JSON.stringify({
            id: event.id,
            type: event.eventType,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            payload: event.payload,
            createdAt: event.createdAt,
          }),
        });
        background(context, markOutboxPublished(event.id));
        cursor = event.id;
      }
      await stream.writeSSE({
        event: "heartbeat",
        data: JSON.stringify({ at: new Date().toISOString() }),
      });
      await new Promise<void>((resolve) =>
        setTimeout(resolve, env.MESSAGING_SSE_POLL_MS),
      );
    }
  });
});
