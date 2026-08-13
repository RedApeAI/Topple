import { getDb, members, organizations, users } from "@repo/db-sql";
import { eq } from "drizzle-orm";

import { type AuthSession, type AuthUser } from "../lib/auth.js";
import { env } from "../lib/env.js";
import { AppError } from "../lib/errors.js";
import type { AppBindings } from "../types.js";

export type DevAuthIdentity = {
  user: AuthUser;
  session: AuthSession;
  organization: { id: string; name: string } | null;
};

export const DEV_AUTH_LOGGED_OUT_COOKIE = "plucia.dev_auth_logged_out";

/**
 * Resolve the configured local development identity.
 *
 * This intentionally does not create a Better Auth session or cookie. The
 * middleware uses the same synthetic identity for every request while the
 * bypass is enabled, so it remains useful in local API tests and through the
 * Vite proxy. The setting is ignored unless NODE_ENV is development.
 */
export async function getDevAuthIdentity(
  bindings?: AppBindings,
): Promise<DevAuthIdentity | null> {
  const nodeEnv = bindings?.NODE_ENV ?? env.NODE_ENV;
  const bypass = bindings?.DEV_AUTH_BYPASS ?? String(env.DEV_AUTH_BYPASS);
  if (nodeEnv !== "development" || bypass !== "true") return null;

  const userId = bindings?.DEV_AUTH_USER_ID ?? env.DEV_AUTH_USER_ID;
  if (!userId) {
    throw new AppError(
      503,
      "DEV_AUTH_NOT_CONFIGURED",
      "Development auth bypass is enabled but DEV_AUTH_USER_ID is missing",
    );
  }

  const [user] = await getDb()
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || user.status !== "active") {
    throw new AppError(
      503,
      "DEV_AUTH_USER_NOT_FOUND",
      "The configured development auth user does not exist or is not active",
    );
  }

  const [organization] = await getDb()
    .select({ id: organizations.id, name: organizations.name })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(eq(members.userId, user.id))
    .limit(1);

  const now = new Date();
  const session = {
    id: `dev-session-${user.id}`,
    token: `dev-token-${user.id}`,
    userId: user.id,
    expiresAt: new Date(now.getTime() + env.SESSION_EXPIRES_IN * 1000),
    createdAt: now,
    updatedAt: now,
    ipAddress: "127.0.0.1",
    userAgent: "Plucia development auth bypass",
    activeOrganizationId: organization?.id ?? null,
  } as AuthSession;

  return {
    user: user as AuthUser,
    session,
    organization: organization ?? null,
  };
}
