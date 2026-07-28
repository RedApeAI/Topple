import type { ChannelKey } from "@/types/channel.types";
import type { ApiMessage } from "@/lib/api/orchestrator.types";

export interface ChatMessage {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  status: ApiMessage["status"];
  time: string;
}

/** Everything the chat pane needs about one conversation. */
export interface ChatDetail {
  id: string;
  channel: ChannelKey;
  stage: string;
  status: "active" | "handed_off" | "closed";
  mode: "autopilot" | "copilot";
  contactName: string;
  /** Phone / email / handle on this conversation's channel. */
  externalContactId: string;
  messages: ChatMessage[];
}
