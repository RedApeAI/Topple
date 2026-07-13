import { channelConnections, getDb } from "@repo/db-sql";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { AppError } from "../lib/errors.js";
import { jsonValidator, paramValidator } from "../lib/validation.js";
import { requireOrganizationAdmin } from "../middleware/require-org-role.js";
import type { AppEnv } from "../types.js";

const channelType = z.enum([
  "whatsapp",
  "instagram",
  "linkedin",
  "email",
  "voice",
]);
const channelStatus = z.enum([
  "pending",
  "active",
  "error",
  "revoked",
  "disconnected",
]);

const createChannelSchema = z.strictObject({
  channelType,
  externalAccountId: z.string().trim().min(1).max(255).nullable().optional(),
  displayName: z.string().trim().min(1).max(255).nullable().optional(),
  status: channelStatus.default("pending"),
  secretReference: z.string().trim().min(1).max(2048).nullable().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
});

const updateChannelSchema = z
  .strictObject({
    externalAccountId: z.string().trim().min(1).max(255).nullable().optional(),
    displayName: z.string().trim().min(1).max(255).nullable().optional(),
    status: channelStatus.optional(),
    secretReference: z.string().trim().min(1).max(2048).nullable().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );

const itemParams = z.object({
  organizationId: z.uuid(),
  channelId: z.uuid(),
});

const publicFields = {
  id: channelConnections.id,
  organizationId: channelConnections.organizationId,
  channelType: channelConnections.channelType,
  externalAccountId: channelConnections.externalAccountId,
  displayName: channelConnections.displayName,
  status: channelConnections.status,
  config: channelConnections.config,
  lastSyncedAt: channelConnections.lastSyncedAt,
  createdAt: channelConnections.createdAt,
  updatedAt: channelConnections.updatedAt,
};

export const channelRoutes = new Hono<AppEnv>();

channelRoutes.get("/:organizationId/channels", async (context) => {
  const items = await getDb()
    .select(publicFields)
    .from(channelConnections)
    .where(eq(channelConnections.organizationId, context.get("organizationId")))
    .orderBy(desc(channelConnections.createdAt));

  return context.json({ data: items });
});

channelRoutes.post(
  "/:organizationId/channels",
  requireOrganizationAdmin,
  jsonValidator(createChannelSchema),
  async (context) => {
    const input = context.req.valid("json");
    const [created] = await getDb()
      .insert(channelConnections)
      .values({
        ...input,
        organizationId: context.get("organizationId"),
        createdByUserId: context.get("user").id,
      })
      .returning(publicFields);

    return context.json({ data: created }, 201);
  },
);

channelRoutes.get(
  "/:organizationId/channels/:channelId",
  paramValidator(itemParams),
  async (context) => {
    const [item] = await getDb()
      .select(publicFields)
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.id, context.req.valid("param").channelId),
          eq(channelConnections.organizationId, context.get("organizationId")),
        ),
      )
      .limit(1);

    if (!item)
      throw new AppError(404, "NOT_FOUND", "Channel connection not found");
    return context.json({ data: item });
  },
);

channelRoutes.patch(
  "/:organizationId/channels/:channelId",
  requireOrganizationAdmin,
  paramValidator(itemParams),
  jsonValidator(updateChannelSchema),
  async (context) => {
    const [updated] = await getDb()
      .update(channelConnections)
      .set({ ...context.req.valid("json"), updatedAt: new Date() })
      .where(
        and(
          eq(channelConnections.id, context.req.valid("param").channelId),
          eq(channelConnections.organizationId, context.get("organizationId")),
        ),
      )
      .returning(publicFields);

    if (!updated)
      throw new AppError(404, "NOT_FOUND", "Channel connection not found");
    return context.json({ data: updated });
  },
);

channelRoutes.delete(
  "/:organizationId/channels/:channelId",
  requireOrganizationAdmin,
  paramValidator(itemParams),
  async (context) => {
    const [deleted] = await getDb()
      .delete(channelConnections)
      .where(
        and(
          eq(channelConnections.id, context.req.valid("param").channelId),
          eq(channelConnections.organizationId, context.get("organizationId")),
        ),
      )
      .returning({ id: channelConnections.id });

    if (!deleted)
      throw new AppError(404, "NOT_FOUND", "Channel connection not found");
    return context.body(null, 204);
  },
);
