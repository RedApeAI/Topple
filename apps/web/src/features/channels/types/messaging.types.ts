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

export function accountMatchesChannel(
  account: MessagingAccount,
  channel: ConnectableChannel,
): boolean {
  if (channel.startsWith("linkedin")) return account.provider === "linkedin";
  return account.provider === channel;
}
