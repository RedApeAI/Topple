import { getDb, members } from "@repo/db-sql";
import { and, eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";

import type { AppEnv, OrganizationRole } from "../types.js";

const organizationIdSchema = z.uuid();
const rolePriority: OrganizationRole[] = ["owner", "admin", "member"];

function normalizeRole(value: string): OrganizationRole | undefined {
  const assigned = new Set(value.split(",").map((role) => role.trim()));
  return rolePriority.find((role) => assigned.has(role));
}

export const requireOrganizationMember: MiddlewareHandler<AppEnv> = async (
  context,
  next,
) => {
  const parsedId = organizationIdSchema.safeParse(
    context.req.param("organizationId"),
  );
  if (!parsedId.success) {
    return context.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "organizationId must be a UUID",
        },
      },
      400,
    );
  }

  const [membership] = await getDb()
    .select({ role: members.role })
    .from(members)
    .where(
      and(
        eq(members.organizationId, parsedId.data),
        eq(members.userId, context.get("user").id),
      ),
    )
    .limit(1);

  const role = membership ? normalizeRole(membership.role) : undefined;
  if (!role) {
    return context.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "You do not have access to this organization",
        },
      },
      403,
    );
  }

  context.set("organizationId", parsedId.data);
  context.set("organizationRole", role);
  await next();
};

export const requireOrganizationAdmin: MiddlewareHandler<AppEnv> = async (
  context,
  next,
) => {
  if (
    !(["owner", "admin"] as OrganizationRole[]).includes(
      context.get("organizationRole"),
    )
  ) {
    return context.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Organization admin access is required",
        },
      },
      403,
    );
  }

  await next();
};
