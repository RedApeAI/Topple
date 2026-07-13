import type { ChannelKey } from "@/types/channel.types";

export interface Conversation {
  id: string;
  name: string;
  channel: ChannelKey;
  preview: string;
  timestamp: string;
  avatarUrl?: string;
  unread?: boolean;
}

export type InboxScope = "all" | ChannelKey;
