import {
  getDb,
  members,
  messagingConnectedAccounts,
  messagingThreads,
} from "@repo/db-sql";
import { and, eq, or } from "drizzle-orm";
import type { Context } from "hono";

import { AppError } from "../lib/errors.js";
import { resolveTenant } from "../services/tenant.service.js";
import type { AppEnv } from "../types.js";
import {
  canReadAssignedThread,
  canUseAccount,
  isOrganizationManager,
} from "./authorization-policy.js";

export {
  canReadAssignedThread,
  canUseAccount,
  isOrganizationManager,
} from "./authorization-policy.js";

export type MessagingAuthContext = {
  organizationId: string;
  organizationName: string;
  userId: string;
  role: string;
};

export async function resolveMessagingContext(
  context: Context<AppEnv>,
): Promise<MessagingAuthContext> {
  const user = context.get("user");
  const session = context.get("session");
  const tenant = await resolveTenant(user, session, context.req.raw.headers);
  const [membership] = await getDb()
    .select({ role: members.role })
    .from(members)
    .where(
      and(eq(members.organizationId, tenant.id), eq(members.userId, user.id)),
    )
    .limit(1);
  if (!membership) {
    throw new AppError(
      403,
      "ORGANIZATION_ACCESS_DENIED",
      "Organization access denied",
    );
  }
  return {
    organizationId: tenant.id,
    organizationName: tenant.name,
    userId: user.id,
    role: membership.role,
  };
}

export function assertOrganizationManager(auth: MessagingAuthContext): void {
  if (!isOrganizationManager(auth)) {
    throw new AppError(
      403,
      "MESSAGING_MANAGER_REQUIRED",
      "Manager permission is required for this messaging action",
    );
  }
}

export function assertActiveMessagingAccount(account: {
  enabled: boolean;
  status: string;
}): void {
  if (
    !account.enabled ||
    ["disconnected", "expired", "revoked", "failed"].includes(account.status)
  ) {
    throw new AppError(
      409,
      "MESSAGING_ACCOUNT_DISCONNECTED",
      "The connected account must be reconnected before it can be used",
    );
  }
}

export async function requireAccountAccess(
  auth: MessagingAuthContext,
  accountId: string,
) {
  const [account] = await getDb()
    .select()
    .from(messagingConnectedAccounts)
    .where(
      and(
        eq(messagingConnectedAccounts.id, accountId),
        eq(messagingConnectedAccounts.organizationId, auth.organizationId),
      ),
    )
    .limit(1);
  if (!account || !canUseAccount(account, auth)) {
    throw new AppError(
      404,
      "MESSAGING_ACCOUNT_NOT_FOUND",
      "Messaging account not found",
    );
  }
  return account;
}

export async function requireThreadAccess(
  auth: MessagingAuthContext,
  threadId: string,
) {
  const rows = await getDb()
    .select({ thread: messagingThreads, account: messagingConnectedAccounts })
    .from(messagingThreads)
    .innerJoin(
      messagingConnectedAccounts,
      eq(messagingConnectedAccounts.id, messagingThreads.connectedAccountId),
    )
    .where(
      and(
        eq(messagingThreads.id, threadId),
        eq(messagingThreads.organizationId, auth.organizationId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row || !canUseAccount(row.account, auth)) {
    throw new AppError(
      404,
      "MESSAGING_THREAD_NOT_FOUND",
      "Messaging thread not found",
    );
  }
  if (!canReadAssignedThread(row.thread, auth)) {
    throw new AppError(
      404,
      "MESSAGING_THREAD_NOT_FOUND",
      "Messaging thread not found",
    );
  }
  return row;
}

export async function assertAssignableUser(
  auth: MessagingAuthContext,
  assignedUserId: string | null | undefined,
): Promise<void> {
  if (!assignedUserId) return;
  const [member] = await getDb()
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.organizationId, auth.organizationId),
        eq(members.userId, assignedUserId),
      ),
    )
    .limit(1);
  if (!member)
    throw new AppError(
      422,
      "ASSIGNEE_NOT_IN_ORGANIZATION",
      "The assignee is not a member of this organization",
    );
}

export function accountVisibilityPredicate(auth: MessagingAuthContext) {
  if (isOrganizationManager(auth))
    return eq(messagingConnectedAccounts.organizationId, auth.organizationId);
  return and(
    eq(messagingConnectedAccounts.organizationId, auth.organizationId),
    or(
      eq(messagingConnectedAccounts.createdByUserId, auth.userId),
      eq(messagingConnectedAccounts.shared, true),
    ),
  );
}
