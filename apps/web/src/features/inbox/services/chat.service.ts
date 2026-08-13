import type { ChatDetail } from "../types/chat.types";
import type { Conversation } from "../types/conversation.types";
import {
  fetchMessagingChatDetail,
  markMessagingThreadRead,
  sendMessagingReply,
} from "./messaging.service";

/** The inbox is backed by the normalized messaging API. */
export function fetchChatDetail(
  conversation: Conversation | string,
): Promise<ChatDetail> {
  const normalized: Conversation =
    typeof conversation === "string"
      ? {
          id: conversation,
          name: "Conversation",
          channel: "whatsapp",
          source: "messaging",
          preview: "",
          timestamp: "",
        }
      : conversation;
  return fetchMessagingChatDetail(normalized);
}

export function sendContactMessage(
  chat: ChatDetail,
  text: string,
  _clientMessageId?: string,
  attachmentIds?: string[],
): Promise<unknown> {
  return sendMessagingReply({
    threadId: chat.id,
    text,
    attachmentIds,
  });
}

export async function markChatRead(chat: ChatDetail): Promise<void> {
  await markMessagingThreadRead(chat.id);
}
