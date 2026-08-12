import type { ChannelKey } from "@/types/channel.types";

export interface Conversation {
  id: string;
  name: string;
  channel: ChannelKey;
  source?: "messaging";
  accountId?: string;
  externalThreadId?: string;
  externalContactId?: string;
  preview: string;
  timestamp: string;
  avatarUrl?: string;
  unread?: boolean;
  unreadCount?: number;
  accountLabel?: string;
  assignedUserId?: string | null;
  assignedTeamId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
}

export type InboxScope = "all" | ChannelKey;
