import type { ProcessedEvent } from "../router.js";
import { broadcastToWorkspace } from "../../websocket/server.js";
import type {
  Attachment,
  ServerToClientEvents,
} from "../../websocket/types.js";

interface WebhookEnvelope {
  id?: string;
  timestamp?: string;
  message?: {
    id?: string;
    text?: string;
    message?: string;
    attachments?: Array<{
      id?: string;
      type?: string;
      url?: string;
      mimeType?: string;
      filename?: string;
      size?: number;
    }>;
  };
  conversation?: {
    id?: string;
    platform?: string;
    participantId?: string;
    participantName?: string;
  };
  account?: {
    platform?: string;
  };
  reaction?: {
    messageId?: string;
    platformMessageId?: string;
    emoji?: string;
    action?: string;
  };
}

export async function handleWebhookEvent(event: ProcessedEvent): Promise<void> {
  switch (event.type) {
    case "message.received":
      await handleMessageReceived(event);
      break;
    case "message.sent":
      await handleMessageSent(event);
      break;
    case "message.delivered":
    case "message.read":
    case "message.failed":
      await handleMessageStatus(event);
      break;
    case "message.edited":
      await handleMessageEdited(event);
      break;
    case "message.deleted":
      await handleMessageDeleted(event);
      break;
    case "reaction.received":
      await handleReaction(event);
      break;
    case "conversation.started":
      await handleConversationStarted(event);
      break;
    default:
      console.debug(`Unhandled event type: ${event.type}`);
  }
}

async function handleMessageReceived(event: ProcessedEvent): Promise<void> {
  const payload = event.payload as WebhookEnvelope;
  const message = payload.message ?? {};

  broadcastToWorkspace(event.tenant.id, "message:received", {
    // Use the Zernio message id as the primary id so clients dedupe the
    // pushed message against the same message fetched over REST; the event id
    // is only a fallback.
    id: message.id ?? payload.id ?? "",
    conversationId: payload.conversation?.id ?? "",
    externalId: message.id ?? "",
    content: message.text ?? message.message ?? "",
    direction: "inbound",
    timestamp: payload.timestamp ?? new Date().toISOString(),
    attachments: extractAttachments(message),
  });
}

async function handleMessageSent(event: ProcessedEvent): Promise<void> {
  const payload = event.payload as WebhookEnvelope;
  const message = payload.message ?? {};

  broadcastToWorkspace(event.tenant.id, "message:sent", {
    id: message.id ?? payload.id ?? "",
    conversationId: payload.conversation?.id ?? "",
    externalId: message.id ?? "",
    content: message.text ?? message.message ?? "",
    direction: "outbound",
    timestamp: payload.timestamp ?? new Date().toISOString(),
  });
}

async function handleMessageStatus(event: ProcessedEvent): Promise<void> {
  const payload = event.payload as WebhookEnvelope;
  const message = payload.message ?? {};

  const statusMap: Record<string, "sent" | "delivered" | "read" | "failed"> = {
    "message.delivered": "delivered",
    "message.read": "read",
    "message.failed": "failed",
  };

  const status = statusMap[event.type] ?? "sent";

  broadcastToWorkspace(
    event.tenant.id,
    `message:${status}` as keyof ServerToClientEvents,
    {
      messageId: message.id ?? "",
      conversationId: payload.conversation?.id ?? "",
      status,
      timestamp: payload.timestamp ?? new Date().toISOString(),
    },
  );
}

async function handleMessageEdited(event: ProcessedEvent): Promise<void> {
  const payload = event.payload as WebhookEnvelope;
  const message = payload.message ?? {};

  broadcastToWorkspace(event.tenant.id, "message:edited", {
    messageId: message.id ?? "",
    conversationId: payload.conversation?.id ?? "",
    content: message.text ?? message.message ?? "",
    editedAt: payload.timestamp ?? new Date().toISOString(),
  });
}

async function handleMessageDeleted(event: ProcessedEvent): Promise<void> {
  const payload = event.payload as WebhookEnvelope;
  const message = payload.message ?? {};

  broadcastToWorkspace(event.tenant.id, "message:deleted", {
    messageId: message.id ?? "",
    conversationId: payload.conversation?.id ?? "",
    deletedAt: payload.timestamp ?? new Date().toISOString(),
  });
}

async function handleReaction(event: ProcessedEvent): Promise<void> {
  const payload = event.payload as WebhookEnvelope;
  const reaction = payload.reaction ?? {};

  broadcastToWorkspace(event.tenant.id, "reaction:received", {
    messageId: reaction.messageId ?? reaction.platformMessageId ?? "",
    conversationId: payload.conversation?.id ?? "",
    emoji: reaction.emoji ?? "",
    action: reaction.action === "added" ? "add" : "remove",
  });
}

async function handleConversationStarted(event: ProcessedEvent): Promise<void> {
  const payload = event.payload as WebhookEnvelope;
  const conversation = payload.conversation ?? {};

  broadcastToWorkspace(event.tenant.id, "conversation:created", {
    id: conversation.id ?? "",
    externalId: conversation.id ?? "",
    platform: payload.account?.platform ?? "",
    participant: {
      id: conversation.participantId ?? "",
      name: conversation.participantName,
      phone: conversation.participantId,
    },
    unreadCount: 1,
  });
}

function extractAttachments(message: WebhookEnvelope["message"]): Attachment[] {
  if (!message?.attachments || !Array.isArray(message.attachments)) {
    return [];
  }

  return message.attachments.map((attachment) => ({
    id: attachment.id ?? "",
    type: mapAttachmentType(attachment.type),
    url: attachment.url ?? "",
    mimeType: attachment.mimeType || "application/octet-stream",
    filename: attachment.filename,
    size: attachment.size,
  }));
}

function mapAttachmentType(type: string | undefined): Attachment["type"] {
  const typeMap: Record<string, Attachment["type"]> = {
    image: "image",
    video: "video",
    audio: "audio",
    document: "document",
    sticker: "sticker",
    voice: "voice",
  };
  return (type && typeMap[type]) || "document";
}
