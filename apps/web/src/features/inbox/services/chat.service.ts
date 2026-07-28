import { toUiChannel } from "@/lib/api/channel-map";
import {
  approveDraft,
  discardDraft,
  getContact,
  getConversation,
} from "@/lib/api/orchestrator";
import { sendInboundMessage } from "@/lib/api/send-inbound-message";
import { formatMessageTime } from "@/lib/format-relative-time";
import type {
  ApiContact,
  ApiTurnResult,
  OrchestratorChannel,
} from "@/lib/api/orchestrator.types";
import type { ChatDetail, ChatMessage } from "../types/chat.types";

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
  conversationId: string,
): Promise<ChatDetail> {
  const detail = await getConversation(conversationId);
  const contact = await getContact(detail.contact_id);
  return {
    id: detail._id,
    channel: toUiChannel(detail.channel),
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
): Promise<ApiTurnResult> {
  return sendInboundMessage({
    channel: chat.channel,
    externalContactId: chat.externalContactId,
    text,
    mode: chat.mode,
  });
}

export { approveDraft, discardDraft };
