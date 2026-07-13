import { agentConfigs, getDb } from "@repo/db-sql";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { AppError } from "../lib/errors.js";
import { jsonValidator } from "../lib/validation.js";
import { requireOrganizationAdmin } from "../middleware/require-org-role.js";
import type { AppEnv } from "../types.js";

const configSchema = z.strictObject({
  loraAdapterReference: z
    .string()
    .trim()
    .min(1)
    .max(1024)
    .nullable()
    .optional(),
  knowledgeBaseReference: z
    .string()
    .trim()
    .min(1)
    .max(1024)
    .nullable()
    .optional(),
  settings: z.record(z.string(), z.unknown()).default({}),
});

const publicFields = {
  id: agentConfigs.id,
  organizationId: agentConfigs.organizationId,
  loraAdapterReference: agentConfigs.loraAdapterReference,
  knowledgeBaseReference: agentConfigs.knowledgeBaseReference,
  settings: agentConfigs.settings,
  createdAt: agentConfigs.createdAt,
  updatedAt: agentConfigs.updatedAt,
};

export const agentConfigRoutes = new Hono<AppEnv>();

agentConfigRoutes.get("/:organizationId/agent-config", async (context) => {
  const [config] = await getDb()
    .select(publicFields)
    .from(agentConfigs)
    .where(eq(agentConfigs.organizationId, context.get("organizationId")))
    .limit(1);

  if (!config) throw new AppError(404, "NOT_FOUND", "Agent config not found");
  return context.json({ data: config });
});

agentConfigRoutes.put(
  "/:organizationId/agent-config",
  requireOrganizationAdmin,
  jsonValidator(configSchema),
  async (context) => {
    const now = new Date();
    const [config] = await getDb()
      .insert(agentConfigs)
      .values({
        ...context.req.valid("json"),
        organizationId: context.get("organizationId"),
        updatedByUserId: context.get("user").id,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: agentConfigs.organizationId,
        set: {
          ...context.req.valid("json"),
          updatedByUserId: context.get("user").id,
          updatedAt: now,
        },
      })
      .returning(publicFields);

    return context.json({ data: config });
  },
);

agentConfigRoutes.delete(
  "/:organizationId/agent-config",
  requireOrganizationAdmin,
  async (context) => {
    const [deleted] = await getDb()
      .delete(agentConfigs)
      .where(eq(agentConfigs.organizationId, context.get("organizationId")))
      .returning({ id: agentConfigs.id });

    if (!deleted)
      throw new AppError(404, "NOT_FOUND", "Agent config not found");
    return context.body(null, 204);
  },
);
