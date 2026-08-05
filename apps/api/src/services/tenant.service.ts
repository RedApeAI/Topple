import { getDb, members, organizations } from "@repo/db-sql";
import { and, eq } from "drizzle-orm";

import { auth, type AuthSession, type AuthUser } from "../lib/auth.js";
import { AppError } from "../lib/errors.js";

export interface Tenant {
  id: string;
  name: string;
}

/**
 * Resolve the Better Auth organization that backs a tenant, creating a
 * personal workspace when the user has none yet.
 *
 * Shared by the HTTP route layer (`resolveTenant`) and the WebSocket handshake
 * so both authenticate against the same organization id. Keeping this outside
 * `zernio.service` avoids a circular import with the event/webhook pipeline.
 */
export async function resolveTenant(
  user: AuthUser,
  session: AuthSession,
  headers: Headers,
): Promise<Tenant> {
  if (session.activeOrganizationId) {
    const [tenant] = await getDb()
      .select({ id: organizations.id, name: organizations.name })
      .from(members)
      .innerJoin(organizations, eq(members.organizationId, organizations.id))
      .where(
        and(
          eq(members.userId, user.id),
          eq(members.organizationId, session.activeOrganizationId),
        ),
      )
      .limit(1);
    if (!tenant) {
      throw new AppError(
        403,
        "ORGANIZATION_ACCESS_DENIED",
        "Organization access denied",
      );
    }
    return tenant;
  }

  const memberships = await getDb()
    .select({ id: organizations.id, name: organizations.name })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(eq(members.userId, user.id))
    .limit(2);

  if (memberships.length === 1 && memberships[0]) return memberships[0];
  if (memberships.length > 1) {
    throw new AppError(
      409,
      "ACTIVE_ORGANIZATION_REQUIRED",
      "Select an organization before connecting a channel",
    );
  }
  return createPersonalOrganization(user, headers);
}

async function createPersonalOrganization(
  user: AuthUser,
  headers: Headers,
): Promise<Tenant> {
  const slug = `workspace-${user.id.toLowerCase()}`;
  try {
    const created = await auth.api.createOrganization({
      headers,
      body: { name: `${user.name}'s Workspace`, slug },
    });
    return { id: created.id, name: created.name };
  } catch (error) {
    const [membership] = await getDb()
      .select({ id: organizations.id, name: organizations.name })
      .from(members)
      .innerJoin(organizations, eq(members.organizationId, organizations.id))
      .where(eq(members.userId, user.id))
      .limit(1);
    if (membership) return membership;
    throw error;
  }
}
