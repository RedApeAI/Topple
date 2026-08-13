import { apiClient } from "@/lib/api/client";
import {
  formatMessageTime,
  formatRelativeTime,
} from "@/lib/format-relative-time";
import type { ChannelKey } from "@/types/channel.types";
import type { ChatDetail, ChatMessage } from "../types/chat.types";
import type { Conversation, InboxScope } from "../types/conversation.types";

export type MessagingProvider =
  | "linkedin"
  | "whatsapp"
  | "instagram"
  | "telegram"
  | "google"
  | "outlook"
  | "imap";

export interface MessagingAccount {
  id: string;
  provider: MessagingProvider;
  providerAccountType: string | null;
  displayName: string | null;
  username: string | null;
  emailAddress: string | null;
  phoneNumber: string | null;
  status: string;
  enabled: boolean;
  shared: boolean;
  lastSuccessfulSyncAt: string | null;
  lastWebhookAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  backfillProgress: number | null;
  createdAt: string;
  updatedAt: string;
}

interface MessagingThreadRow {
  id: string;
  provider: MessagingProvider;
  externalThreadId: string;
  subject: string | null;
  title: string | null;
  preview: string | null;
  latestActivityAt: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  state: "open" | "archived" | "spam" | "trash";
  assignedUserId: string | null;
  assignedTeamId: string | null;
  contactId: string | null;
  leadId: string | null;
  account: {
    id: string;
    provider: MessagingProvider;
    displayName: string | null;
    providerAccountType: string | null;
    status: string;
  };
}

interface MessagingParticipant {
  id: string;
  providerParticipantId: string;
  normalizedName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  emailAddress: string | null;
  phoneNumber: string | null;
  isSelf: boolean;
}

interface MessagingMessage {
  id: string;
  externalMessageId: string | null;
  direction: "inbound" | "outbound";
  bodyText: string | null;
  bodyHtml: string | null;
  preview: string | null;
  sentAt: string;
  deliveryStatus:
    | "pending"
    | "sent"
    | "delivered"
    | "failed"
    | "read"
    | "deleted";
  failureMessage: string | null;
  deletedAt: string | null;
  attachments?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    downloadStatus: string;
  }>;
}

interface MessagingThreadDetail {
  thread: MessagingThreadRow & { connectedAccountId: string };
  account: MessagingAccount & { unipileAccountId?: never };
  participants: MessagingParticipant[];
  labels: Array<{ id: string; name: string; color: string | null }>;
}

function providerToChannel(provider: MessagingProvider): ChannelKey {
  switch (provider) {
    case "instagram":
      return "instagram";
    case "telegram":
      return "telegram";
    case "linkedin":
      return "linkedin";
    case "whatsapp":
      return "whatsapp";
    case "google":
    case "outlook":
    case "imap":
      return "mail";
  }
}

function providerForScope(scope: InboxScope): MessagingProvider | undefined {
  switch (scope) {
    case "whatsapp":
      return "whatsapp";
    case "linkedin":
      return "linkedin";
    case "instagram":
      return "instagram";
    case "telegram":
      return "telegram";
    // Mail already has its own Gmail integration in Plucia. Messaging does
    // not send email through the Unipile chat adapter.
    case "mail":
    case "call":
      return undefined;
    case "all":
      return undefined;
  }
}

export interface MessagingThreadFilters {
  search?: string;
  unread?: boolean;
  accountId?: string;
  assignedUserId?: string;
  labelId?: string;
  contactId?: string;
  leadId?: string;
}

function toConversation(row: MessagingThreadRow): Conversation {
  return {
    id: row.id,
    name:
      row.title || row.subject || row.account.displayName || "Unknown contact",
    channel: providerToChannel(row.provider),
    source: "messaging",
    accountId: row.account.id,
    externalThreadId: row.externalThreadId,
    preview: row.preview ?? "",
    timestamp: formatRelativeTime(
      row.latestActivityAt ?? row.lastMessageAt ?? new Date().toISOString(),
    ),
    unread: row.unreadCount > 0,
    unreadCount: row.unreadCount,
    accountLabel:
      row.account.displayName ?? row.account.providerAccountType ?? undefined,
    assignedUserId: row.assignedUserId,
    assignedTeamId: row.assignedTeamId,
    contactId: row.contactId,
    leadId: row.leadId,
  };
}

export async function fetchMessagingConversations(
  scope: InboxScope = "all",
  filters: MessagingThreadFilters = {},
): Promise<Conversation[]> {
  const provider = providerForScope(scope);
  if (scope === "mail" || scope === "call") return [];
  const { data } = await apiClient.get<{
    data: MessagingThreadRow[];
    page: { hasMore: boolean; nextCursor: string | null };
  }>("/api/v1/inbox/threads", {
    params: {
      limit: 100,
      state: "inbox",
      ...(provider ? { provider } : {}),
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.unread === undefined
        ? {}
        : { unread: String(filters.unread) }),
      ...(filters.accountId ? { accountId: filters.accountId } : {}),
      ...(filters.assignedUserId
        ? { assignedUserId: filters.assignedUserId }
        : {}),
      ...(filters.labelId ? { labelId: filters.labelId } : {}),
      ...(filters.contactId ? { contactId: filters.contactId } : {}),
      ...(filters.leadId ? { leadId: filters.leadId } : {}),
    },
  });
  return data.data.map(toConversation);
}

function participantName(
  participants: MessagingParticipant[],
  fallback: string,
): string {
  return (
    participants.find((participant) => !participant.isSelf)?.normalizedName ??
    participants[0]?.normalizedName ??
    fallback
  );
}

function toChatMessage(message: MessagingMessage): ChatMessage {
  return {
    id: message.id,
    direction: message.direction,
    text:
      message.bodyText ??
      message.preview ??
      message.bodyHtml?.replace(/<[^>]+>/g, " ").trim() ??
      "",
    status:
      message.deliveryStatus === "deleted"
        ? "suppressed"
        : message.deliveryStatus,
    time: formatMessageTime(message.sentAt),
    failureMessage: message.failureMessage,
    attachments: message.attachments,
  };
}

export async function fetchMessagingChatDetail(
  conversation: Conversation,
): Promise<ChatDetail> {
  const detailResponse = await apiClient.get<{ data: MessagingThreadDetail }>(
    `/api/v1/inbox/threads/${encodeURIComponent(conversation.id)}`,
  );
  const messagesResponse = await apiClient.get<{
    data: MessagingMessage[];
    page: { hasMore: boolean; nextCursor: string | null };
  }>(`/api/v1/inbox/threads/${encodeURIComponent(conversation.id)}/messages`, {
    params: { limit: 200 },
  });
  const detail = detailResponse.data.data;
  const thread = detail.thread;
  return {
    id: thread.id,
    channel: providerToChannel(thread.provider),
    source: "messaging",
    accountId: detail.account.id,
    externalThreadId: thread.externalThreadId,
    stage: thread.state,
    status:
      thread.state === "archived" || thread.state === "trash"
        ? "closed"
        : "active",
    mode: "copilot",
    contactName: participantName(detail.participants, conversation.name),
    externalContactId:
      detail.participants.find((participant) => !participant.isSelf)
        ?.providerParticipantId ?? "",
    messages: messagesResponse.data.data.map(toChatMessage),
    labels: detail.labels,
    capabilities: {
      reply: true,
      attachments: ["linkedin", "whatsapp", "telegram"].includes(
        thread.provider,
      ),
      archive: !["instagram", "whatsapp"].includes(thread.provider),
    },
  };
}

export async function sendMessagingReply(input: {
  threadId: string;
  text: string;
  attachmentIds?: string[];
}): Promise<unknown> {
  const idempotencyKey = crypto.randomUUID();
  const response = await apiClient.post(
    `/api/v1/inbox/threads/${encodeURIComponent(input.threadId)}/reply`,
    { text: input.text, attachmentIds: input.attachmentIds, idempotencyKey },
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return response.data;
}

export async function startMessagingConversation(input: {
  accountId: string;
  participantIds: string[];
  text: string;
  linkedinProduct?: "classic" | "sales_navigator" | "recruiter";
  inmail?: boolean;
  inmailSubject?: string;
  inmailSignature?: string;
}): Promise<unknown> {
  const idempotencyKey = crypto.randomUUID();
  const response = await apiClient.post(
    "/api/v1/inbox/conversations",
    {
      accountId: input.accountId,
      participantIds: input.participantIds,
      text: input.text,
      linkedinProduct: input.linkedinProduct,
      inmail: input.inmail,
      inmailSubject: input.inmailSubject,
      inmailSignature: input.inmailSignature,
      idempotencyKey,
    },
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return response.data;
}

export async function retryMessagingMessage(messageId: string): Promise<void> {
  await apiClient.post(
    `/api/v1/inbox/messages/${encodeURIComponent(messageId)}/retry`,
  );
}

export async function uploadMessagingAttachment(input: {
  threadId: string;
  file: File;
}): Promise<string> {
  const { data: presign } = await apiClient.post<{
    data: {
      attachment: { id: string };
      uploadToken: string;
      uploadUrl: string;
    };
  }>("/api/v1/messaging/attachments/presign", {
    threadId: input.threadId,
    filename: input.file.name,
    mimeType: input.file.type || "application/octet-stream",
    sizeBytes: input.file.size,
  });
  await apiClient.put(presign.data.uploadUrl, input.file, {
    headers: {
      "Content-Type": input.file.type || "application/octet-stream",
      "X-Upload-Token": presign.data.uploadToken,
    },
    transformRequest: [(body) => body],
    maxContentLength: 16 * 1024 * 1024,
    maxBodyLength: 16 * 1024 * 1024,
  });
  await apiClient.post("/api/v1/messaging/attachments/complete", {
    attachmentId: presign.data.attachment.id,
    threadId: input.threadId,
  });
  return presign.data.attachment.id;
}

export async function markMessagingThreadRead(threadId: string): Promise<void> {
  await apiClient.post(
    `/api/v1/inbox/threads/${encodeURIComponent(threadId)}/read`,
  );
}

export async function markMessagingThreadUnread(
  threadId: string,
): Promise<void> {
  await apiClient.post(
    `/api/v1/inbox/threads/${encodeURIComponent(threadId)}/unread`,
  );
}

export async function assignMessagingThread(
  threadId: string,
  assignedUserId: string | null,
): Promise<void> {
  await apiClient.post(
    `/api/v1/inbox/threads/${encodeURIComponent(threadId)}/assign`,
    { assignedUserId },
  );
}

export async function addMessagingThreadLabel(
  threadId: string,
  name: string,
): Promise<void> {
  await apiClient.post(
    `/api/v1/inbox/threads/${encodeURIComponent(threadId)}/labels`,
    { name },
  );
}

export async function removeMessagingThreadLabel(
  threadId: string,
  labelId: string,
): Promise<void> {
  await apiClient.delete(
    `/api/v1/inbox/threads/${encodeURIComponent(threadId)}/labels/${encodeURIComponent(labelId)}`,
  );
}

export async function archiveMessagingThread(
  threadId: string,
  archived: boolean,
): Promise<void> {
  await apiClient.post(
    `/api/v1/inbox/threads/${encodeURIComponent(threadId)}/${archived ? "archive" : "unarchive"}`,
  );
}

export async function fetchMessagingAccounts(): Promise<MessagingAccount[]> {
  const { data } = await apiClient.get<{ data: MessagingAccount[] }>(
    "/api/v1/messaging/accounts",
  );
  return data.data;
}

export async function connectMessagingAccount(
  channel: string,
  returnPath = "/dashboard/inbox",
): Promise<string> {
  const { data } = await apiClient.post<{ data: { url: string } }>(
    "/api/v1/messaging/accounts/connect",
    { channel, returnPath },
  );
  return data.data.url;
}

export async function reconnectMessagingAccount(
  accountId: string,
): Promise<{ url?: string; status?: string }> {
  const { data } = await apiClient.post<{
    data: { url?: string; status?: string };
  }>(`/api/v1/messaging/accounts/${encodeURIComponent(accountId)}/reconnect`);
  return data.data;
}

export async function shareMessagingAccount(
  accountId: string,
  shared: boolean,
): Promise<MessagingAccount> {
  const { data } = await apiClient.post<{ data: MessagingAccount }>(
    `/api/v1/messaging/accounts/${encodeURIComponent(accountId)}/share`,
    { shared },
  );
  return data.data;
}

export async function disconnectMessagingAccount(
  accountId: string,
): Promise<void> {
  await apiClient.post(
    `/api/v1/messaging/accounts/${encodeURIComponent(accountId)}/disconnect`,
  );
}

export async function syncMessagingAccount(accountId: string): Promise<void> {
  await apiClient.post(
    `/api/v1/messaging/accounts/${encodeURIComponent(accountId)}/sync`,
  );
}

export type MessagingAiArtifact = {
  id: string;
  artifactType:
    | "summary"
    | "classification"
    | "entities"
    | "reply_draft"
    | "next_action";
  status: "pending" | "running" | "ready" | "failed" | "dismissed";
  content: Record<string, unknown>;
  errorMessage: string | null;
};

export type MessagingAiArtifactType = MessagingAiArtifact["artifactType"];

export async function requestMessagingAiDraft(
  threadId: string,
): Promise<MessagingAiArtifact> {
  return requestMessagingAiArtifact(threadId, "reply_draft");
}

export async function requestMessagingAiArtifact(
  threadId: string,
  artifactType: MessagingAiArtifactType,
): Promise<MessagingAiArtifact> {
  const { data } = await apiClient.post<{ data: MessagingAiArtifact }>(
    `/api/v1/inbox/threads/${encodeURIComponent(threadId)}/ai`,
    { artifactType },
  );
  return data.data;
}

export async function fetchMessagingAiArtifacts(
  threadId: string,
): Promise<MessagingAiArtifact[]> {
  const { data } = await apiClient.get<{ data: MessagingAiArtifact[] }>(
    `/api/v1/inbox/threads/${encodeURIComponent(threadId)}/ai`,
  );
  return data.data;
}

export async function dismissMessagingAiArtifact(
  artifactId: string,
): Promise<void> {
  await apiClient.post(
    `/api/v1/inbox/ai/${encodeURIComponent(artifactId)}/dismiss`,
  );
}
