import {
  messagingAccountStatusEnum,
  messagingMessageDeliveryStatusEnum,
  messagingMessageDirectionEnum,
  messagingProviderEnum,
  messagingThreadStateEnum,
} from "@repo/db-sql";

export type MessagingProvider =
  (typeof messagingProviderEnum.enumValues)[number];
export type MessagingAccountStatus =
  (typeof messagingAccountStatusEnum.enumValues)[number];
export type MessagingThreadState =
  (typeof messagingThreadStateEnum.enumValues)[number];
export type MessagingMessageDirection =
  (typeof messagingMessageDirectionEnum.enumValues)[number];
export type MessagingDeliveryStatus =
  (typeof messagingMessageDeliveryStatusEnum.enumValues)[number];

/** Channels exposed by the hosted authentication flow. */
export type MessagingConnectChannel =
  | "linkedin"
  | "linkedin_sales_navigator"
  | "linkedin_recruiter"
  | "whatsapp"
  | "instagram"
  | "telegram"
  | "google"
  | "outlook"
  | "imap";

export const messagingConnectChannels = [
  "linkedin",
  "linkedin_sales_navigator",
  "linkedin_recruiter",
  "whatsapp",
  "instagram",
  "telegram",
  "google",
  "outlook",
  "imap",
] as const satisfies readonly MessagingConnectChannel[];

export function providerForConnectChannel(
  channel: MessagingConnectChannel,
): MessagingProvider {
  switch (channel) {
    case "linkedin":
    case "linkedin_sales_navigator":
    case "linkedin_recruiter":
      return "linkedin";
    case "whatsapp":
      return "whatsapp";
    case "instagram":
      return "instagram";
    case "telegram":
      return "telegram";
    case "google":
      return "google";
    case "outlook":
      return "outlook";
    case "imap":
      return "imap";
  }
}

export function providerFromUnipile(value: unknown): MessagingProvider | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "microsoft" || normalized === "microsoft365") {
    return "outlook";
  }
  if (normalized === "gmail") {
    return "google";
  }
  if (
    normalized === "linkedin_sales_navigator" ||
    normalized === "sales_navigator"
  ) {
    return "linkedin";
  }
  if (
    normalized === "linkedin_recruiter" ||
    normalized === "recruiter" ||
    normalized === "linkedin"
  ) {
    return "linkedin";
  }
  if (
    (messagingConnectChannels as readonly string[]).includes(normalized) &&
    normalized !== "linkedin_sales_navigator" &&
    normalized !== "linkedin_recruiter"
  ) {
    return normalized as MessagingProvider;
  }
  return null;
}

export function accountStatusFromUnipile(
  value: unknown,
): MessagingAccountStatus {
  switch (String(value ?? "").toLowerCase()) {
    case "running":
    case "connected":
    case "ready":
      return "connected";
    case "pending":
    case "connecting":
      return "connecting";
    case "paused":
      return "paused";
    case "expired":
      return "expired";
    case "revoked":
      return "revoked";
    case "disconnected":
      return "disconnected";
    case "errored":
    case "error":
    case "failed":
      return "failed";
    default:
      return "connected";
  }
}

export type MessagingCapability =
  | "reply"
  | "startConversation"
  | "attachments"
  | "htmlEmail"
  | "readReceipts"
  | "archive"
  | "labels"
  | "reactions"
  | "typingIndicators"
  | "editMessages"
  | "deleteMessages"
  | "scheduling"
  | "messageSearch";

export type NormalizedParticipant = {
  providerParticipantId: string;
  normalizedName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  emailAddress: string | null;
  phoneNumber: string | null;
  linkedinPublicIdentifier: string | null;
  instagramIdentifier: string | null;
  telegramIdentifier: string | null;
  role: string | null;
  isSelf: boolean;
  providerMetadata: Record<string, unknown>;
};

export type NormalizedAttachment = {
  providerAttachmentId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  providerUrl: string | null;
  thumbnailMetadata: Record<string, unknown>;
  safeDisplayMetadata: Record<string, unknown>;
};

export type NormalizedThread = {
  externalThreadId: string;
  externalThreadAltId: string | null;
  subject: string | null;
  title: string | null;
  preview: string | null;
  latestActivityAt: Date | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  state: MessagingThreadState;
  providerMetadata: Record<string, unknown>;
  participants: NormalizedParticipant[];
};

export type NormalizedMessage = {
  externalMessageId: string | null;
  externalMessageFingerprint: string;
  providerEventType: string | null;
  direction: MessagingMessageDirection;
  senderParticipantId: string | null;
  recipients: Record<string, unknown>;
  bodyText: string | null;
  bodyHtml: string | null;
  preview: string | null;
  sentAt: Date;
  deliveryStatus: MessagingDeliveryStatus;
  failureCode: string | null;
  failureMessage: string | null;
  replyToExternalId: string | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  providerMetadata: Record<string, unknown>;
  attachments: NormalizedAttachment[];
};

export type NormalizedAccount = {
  unipileAccountId: string;
  provider: MessagingProvider;
  providerAccountType: string | null;
  displayName: string | null;
  username: string | null;
  emailAddress: string | null;
  phoneNumber: string | null;
  status: MessagingAccountStatus;
  providerMetadata: Record<string, unknown>;
};

export type UnipileWebhookEnvelope = {
  type: string;
  providerEventId: string | null;
  accountId: string | null;
  payload: Record<string, unknown>;
};

export type MessagingListCursor = {
  activityAt: string;
  id: string;
};
