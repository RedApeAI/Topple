export type MessagingAuthorizationIdentity = {
  organizationId: string;
  userId: string;
  role: string;
};

export function isOrganizationManager(
  auth: Pick<MessagingAuthorizationIdentity, "role">,
): boolean {
  return auth.role === "owner" || auth.role === "admin";
}

export function canUseAccount(
  account: { organizationId: string; createdByUserId: string; shared: boolean },
  auth: MessagingAuthorizationIdentity,
): boolean {
  if (account.organizationId !== auth.organizationId) return false;
  return (
    isOrganizationManager(auth) ||
    account.createdByUserId === auth.userId ||
    account.shared
  );
}

export function canReadAssignedThread(
  thread: { assignedUserId: string | null; assignedTeamId: string | null },
  auth: MessagingAuthorizationIdentity,
): boolean {
  if (isOrganizationManager(auth)) return true;
  if (!thread.assignedUserId && !thread.assignedTeamId) return true;
  return thread.assignedUserId === auth.userId;
}
