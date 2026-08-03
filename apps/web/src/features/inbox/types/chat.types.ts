import type { ChannelKey } from "@/types/channel.types";

export type ChatMessageStatus =
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
}

/** Everything the chat pane needs about one conversation. */
export interface ChatDetail {
  id: string;
  channel: ChannelKey;
  source: "mock" | "zernio";
  accountId?: string;
  stage: string;
  status: "active" | "handed_off" | "closed";
  mode: "autopilot" | "copilot";
  contactName: string;
  /** Phone / email / handle on this conversation's channel. */
  externalContactId: string;
  messages: ChatMessage[];
}
