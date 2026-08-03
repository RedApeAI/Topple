import { toUiChannel } from "@/lib/api/channel-map";
import { apiClient } from "@/lib/api/client";
import {
  approveDraft,
  discardDraft,
  getContact,
  getConversation,
  sendInboundMessage,
} from "@/lib/mock/orchestrator";
import { formatMessageTime } from "@/lib/format-relative-time";
import type {
  ApiContact,
  ApiTurnResult,
  OrchestratorChannel,
} from "@/lib/mock/orchestrator.types";
import type { ChatDetail, ChatMessage } from "../types/chat.types";
import type { Conversation } from "../types/conversation.types";

function contactName(
  contact: ApiContact,
  channel: OrchestratorChannel,
): string {
  if (contact.profile?.name) return contact.profile.name;
  return externalId(contact, channel) || "Unknown";
}

function externalId(contact: ApiContact, channel: OrchestratorChannel): string {
  const identity =
    contact.identities.find((i) => i.channel === channel) ??
    contact.identities[0];
  return identity?.external_id ?? "";
}

export async function fetchChatDetail(
  conversation: Conversation | string,
): Promise<ChatDetail> {
  if (typeof conversation !== "string" && conversation.source === "zernio") {
    if (!conversation.accountId) {
      throw new Error("Connected account is missing from the conversation");
    }
    const { data } = await apiClient.get<{
      data: {
        conversation: {
          id: string;
          accountId: string;
          participantId: string;
          participantName?: string;
          status?: "active" | "archived";
        };
        messages: {
          messages: Array<{
            id: string;
            message: string;
            direction: "incoming" | "outgoing";
            createdAt: string;
            deliveryStatus?:
              | "sent"
              | "delivered"
              | "read"
              | "failed"
              | "deleted"
              | null;
          }>;
        };
      };
    }>(
      `/api/v1/zernio/conversations/${encodeURIComponent(conversation.id)}/messages`,
      { params: { accountId: conversation.accountId } },
    );
    const detail = data.data;
    return {
      id: detail.conversation.id,
      channel: "whatsapp",
      source: "zernio",
      accountId: detail.conversation.accountId,
      stage: "CONNECTED",
      status: detail.conversation.status === "archived" ? "closed" : "active",
      mode: "copilot",
      contactName:
        detail.conversation.participantName ||
        conversation.name ||
        detail.conversation.participantId,
      externalContactId: detail.conversation.participantId,
      messages: detail.messages.messages.map(
        (message): ChatMessage => ({
          id: message.id,
          direction: message.direction === "incoming" ? "inbound" : "outbound",
          text: message.message,
          status:
            message.deliveryStatus === "failed"
              ? "failed"
              : message.deliveryStatus === "delivered"
                ? "delivered"
                : message.deliveryStatus === "read"
                  ? "read"
                  : message.direction === "incoming"
                    ? "received"
                    : "sent",
          time: formatMessageTime(message.createdAt),
        }),
      ),
    };
  }

  const conversationId =
    typeof conversation === "string" ? conversation : conversation.id;
  const detail = await getConversation(conversationId);
  const contact = await getContact(detail.contact_id);
  return {
    id: detail._id,
    channel: toUiChannel(detail.channel),
    source: "mock",
    stage: detail.stage,
    status: detail.status,
    mode: detail.mode ?? "autopilot",
    contactName: contactName(contact, detail.channel),
    externalContactId: externalId(contact, detail.channel),
    messages: detail.messages.map(
      (msg): ChatMessage => ({
        id: msg._id,
        direction: msg.direction,
        text: msg.text,
        status: msg.status,
        time: formatMessageTime(msg.created_at),
      }),
    ),
  };
}

/**
 * Push a message into the conversation as the contact and let the
 * orchestrator respond. There is no upstream channel gateway wired to the
 * dashboard yet, so this is how a chat is exercised end-to-end: the composer
 * plays the lead, the orchestrator plays the agent.
 */
export function sendContactMessage(
  chat: ChatDetail,
  text: string,
): Promise<ApiTurnResult | unknown> {
  if (chat.source === "zernio") {
    if (!chat.accountId) {
      return Promise.reject(new Error("Connected account is missing"));
    }
    return apiClient.post(
      `/api/v1/zernio/conversations/${encodeURIComponent(chat.id)}/messages`,
      { accountId: chat.accountId, message: text },
    );
  }
  return sendInboundMessage({
    channel: chat.channel,
    externalContactId: chat.externalContactId,
    text,
    mode: chat.mode,
  });
}

export async function markChatRead(chat: ChatDetail): Promise<void> {
  if (chat.source !== "zernio" || !chat.accountId) return;
  await apiClient.post(
    `/api/v1/zernio/conversations/${encodeURIComponent(chat.id)}/read`,
    undefined,
    { params: { accountId: chat.accountId } },
  );
}

export { approveDraft, discardDraft };
