import { conversations, getDb } from "@repo/db-sql";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { AppError } from "../lib/errors.js";
import {
  jsonValidator,
  paramValidator,
  queryValidator,
} from "../lib/validation.js";
import { requireOrganizationAdmin } from "../middleware/require-org-role.js";
import type { AppEnv } from "../types.js";

const channelType = z.enum([
  "whatsapp",
  "instagram",
  "linkedin",
  "email",
  "voice",
]);
const conversationStatus = z.enum(["open", "closed", "archived"]);

const listQuery = z.object({
  channel: channelType.optional(),
  status: conversationStatus.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const createSchema = z
  .strictObject({
    channel: channelType,
    externalThreadId: z.string().trim().min(1).max(512),
    mongoDocumentId: z.string().trim().min(1).max(512).nullable().optional(),
    s3Key: z.string().trim().min(1).max(1024).nullable().optional(),
    status: conversationStatus.default("open"),
  })
  .refine(
    (value) => Boolean(value.mongoDocumentId || value.s3Key),
    "At least one history pointer is required",
  );

const updateSchema = z
  .strictObject({
    mongoDocumentId: z.string().trim().min(1).max(512).nullable().optional(),
    s3Key: z.string().trim().min(1).max(1024).nullable().optional(),
    status: conversationStatus.optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );

const itemParams = z.object({
  organizationId: z.uuid(),
  conversationId: z.uuid(),
});

const publicFields = {
  id: conversations.id,
  organizationId: conversations.organizationId,
  channel: conversations.channel,
  externalThreadId: conversations.externalThreadId,
  mongoDocumentId: conversations.mongoDocumentId,
  s3Key: conversations.s3Key,
  status: conversations.status,
  createdAt: conversations.createdAt,
  updatedAt: conversations.updatedAt,
};

export const conversationRoutes = new Hono<AppEnv>();

conversationRoutes.get(
  "/:organizationId/conversations",
  queryValidator(listQuery),
  async (context) => {
    const query = context.req.valid("query");
    const filters: SQL[] = [
      eq(conversations.organizationId, context.get("organizationId")),
    ];
    if (query.channel) filters.push(eq(conversations.channel, query.channel));
    if (query.status) filters.push(eq(conversations.status, query.status));

    const items = await getDb()
      .select(publicFields)
      .from(conversations)
      .where(and(...filters))
      .orderBy(desc(conversations.updatedAt))
      .limit(query.limit)
      .offset(query.offset);

    return context.json({
      data: items,
      pagination: { limit: query.limit, offset: query.offset },
    });
  },
);

conversationRoutes.post(
  "/:organizationId/conversations",
  requireOrganizationAdmin,
  jsonValidator(createSchema),
  async (context) => {
    const [created] = await getDb()
      .insert(conversations)
      .values({
        ...context.req.valid("json"),
        organizationId: context.get("organizationId"),
        createdByUserId: context.get("user").id,
      })
      .returning(publicFields);

    return context.json({ data: created }, 201);
  },
);

conversationRoutes.get(
  "/:organizationId/conversations/:conversationId",
  paramValidator(itemParams),
  async (context) => {
    const [item] = await getDb()
      .select(publicFields)
      .from(conversations)
      .where(
        and(
          eq(conversations.id, context.req.valid("param").conversationId),
          eq(conversations.organizationId, context.get("organizationId")),
        ),
      )
      .limit(1);

    if (!item) throw new AppError(404, "NOT_FOUND", "Conversation not found");
    return context.json({ data: item });
  },
);

conversationRoutes.patch(
  "/:organizationId/conversations/:conversationId",
  requireOrganizationAdmin,
  paramValidator(itemParams),
  jsonValidator(updateSchema),
  async (context) => {
    const [updated] = await getDb()
      .update(conversations)
      .set({ ...context.req.valid("json"), updatedAt: new Date() })
      .where(
        and(
          eq(conversations.id, context.req.valid("param").conversationId),
          eq(conversations.organizationId, context.get("organizationId")),
        ),
      )
      .returning(publicFields);

    if (!updated)
      throw new AppError(404, "NOT_FOUND", "Conversation not found");
    return context.json({ data: updated });
  },
);

conversationRoutes.delete(
  "/:organizationId/conversations/:conversationId",
  requireOrganizationAdmin,
  paramValidator(itemParams),
  async (context) => {
    const [deleted] = await getDb()
      .delete(conversations)
      .where(
        and(
          eq(conversations.id, context.req.valid("param").conversationId),
          eq(conversations.organizationId, context.get("organizationId")),
        ),
      )
      .returning({ id: conversations.id });

    if (!deleted)
      throw new AppError(404, "NOT_FOUND", "Conversation not found");
    return context.body(null, 204);
  },
);
