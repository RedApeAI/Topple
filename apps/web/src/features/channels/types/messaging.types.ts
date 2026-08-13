import type { MessagingAccount } from "@/features/inbox/services/messaging.service";

/** Channels supported by the API hosted-auth flow. */
export type ConnectableChannel =
  | "linkedin"
  | "linkedin_sales_navigator"
  | "linkedin_recruiter"
  | "whatsapp"
  | "instagram"
  | "telegram";

export interface ChannelStatus {
  accounts: MessagingAccount[];
}

export function accountIsConnected(account: MessagingAccount): boolean {
  return account.enabled && account.status === "connected";
}

const providerErrorsThatDoNotRequireReauthentication = new Set([
  "PROVIDER_ACCOUNT_INTERRUPTED",
  "PROVIDER_ACCOUNT_LOCKED",
  "PROVIDER_ACCOUNT_NOT_READY",
  "PROVIDER_INITIAL_SYNC_FAILED",
  "PROVIDER_TEMPORARY_FAILURE",
]);

/** Keep transient provider interruptions distinct from lost authentication. */
export function accountNeedsReconnect(account: MessagingAccount): boolean {
  if (!account.enabled) return true;
  if (["disconnected", "expired", "revoked"].includes(account.status)) {
    return true;
  }
  return (
    account.status === "failed" &&
    !providerErrorsThatDoNotRequireReauthentication.has(
      account.lastErrorCode ?? "",
    )
  );
}

export function accountMatchesChannel(
  account: MessagingAccount,
  channel: ConnectableChannel,
): boolean {
  if (channel.startsWith("linkedin")) return account.provider === "linkedin";
  return account.provider === channel;
}
