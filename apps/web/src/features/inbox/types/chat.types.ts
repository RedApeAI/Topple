import type { ChannelKey } from "@/types/channel.types";

export type ChatMessageStatus =
  | "pending"
  | "received"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "draft"
  | "approved"
  | "discarded"
  | "suppressed";

export interface ChatMessage {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  status: ChatMessageStatus;
  time: string;
  failureMessage?: string | null;
  attachments?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    downloadStatus: string;
  }>;
}

/** Everything the chat pane needs about one conversation. */
export interface ChatDetail {
  id: string;
  channel: ChannelKey;
  source: "messaging";
  accountId?: string;
  externalThreadId?: string;
  stage: string;
  status: "active" | "handed_off" | "closed";
  mode: "autopilot" | "copilot";
  contactName: string;
  /** Phone / email / handle on this conversation's channel. */
  externalContactId: string;
  messages: ChatMessage[];
  labels?: Array<{ id: string; name: string; color: string | null }>;
  capabilities?: {
    reply: boolean;
    attachments: boolean;
    archive: boolean;
  };
}
