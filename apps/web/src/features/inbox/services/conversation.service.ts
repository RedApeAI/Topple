import conversationsFixture from "@mock/fixtures/conversations.json";
import channelsFixture from "@mock/fixtures/channels.json";
import { isBackendUnreachable } from "@/lib/api/client";
import { apiClient } from "@/lib/api/client";
import { toApiChannel, toUiChannel } from "@/lib/api/channel-map";
import { listConversations } from "@/lib/mock/orchestrator";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { ApiConversation } from "@/lib/mock/orchestrator.types";
import type { Conversation, InboxScope } from "../types/conversation.types";
import type { ChannelKey, ChannelNavItem } from "@/types/channel.types";

function contactName(convo: ApiConversation): string {
  const contact = convo.contact;
  if (!contact) return "Unknown";
  if (contact.profile?.name) return contact.profile.name;
  const identity =
    contact.identities.find((i) => i.channel === convo.channel) ??
    contact.identities[0];
  return identity?.external_id ?? "Unknown";
}

function toConversation(convo: ApiConversation): Conversation {
  return {
    id: convo._id,
    name: contactName(convo),
    channel: toUiChannel(convo.channel),
    source: "mock",
    preview: convo.last_message?.text ?? "",
    timestamp: formatRelativeTime(
      convo.last_message?.created_at ?? convo.last_message_at,
    ),
    // An inbound message no one has replied to yet reads as "unread".
    unread: convo.last_message?.direction === "inbound",
  };
}

interface ZernioConversation {
  id: string;
  platform: string;
  accountId: string;
  participantId: string;
  participantName?: string;
  participantPicture?: string | null;
  lastMessage?: string;
  updatedTime?: string;
  unreadCount?: number | null;
}

async function fetchWhatsAppConversations(): Promise<Conversation[]> {
  const { data } = await apiClient.get<{
    data: {
      data: ZernioConversation[];
      pagination: { hasMore: boolean; nextCursor: string | null };
    };
  }>("/api/v1/zernio/conversations", { params: { limit: 100 } });

  return data.data.data.map((conversation) => ({
    id: conversation.id,
    name: conversation.participantName || conversation.participantId,
    channel: "whatsapp",
    source: "zernio",
    accountId: conversation.accountId,
    externalContactId: conversation.participantId,
    preview: conversation.lastMessage ?? "",
    timestamp: conversation.updatedTime
      ? formatRelativeTime(conversation.updatedTime)
      : "",
    avatarUrl: conversation.participantPicture ?? undefined,
    unread: (conversation.unreadCount ?? 0) > 0,
  }));
}

export async function fetchConversations(
  scope: InboxScope = "all",
): Promise<Conversation[]> {
  if (scope === "whatsapp") return fetchWhatsAppConversations();

  const channel = scope === "all" ? undefined : toApiChannel(scope);
  // UI-only channels (e.g. linkedin) have no orchestrator data yet.
  if (scope !== "all" && channel === null) return [];

  try {
    const conversations = await listConversations({
      channel: channel ?? undefined,
    });
    return conversations.map(toConversation);
  } catch (error) {
    if (isBackendUnreachable(error)) {
      console.warn(
        "[inbox] orchestrator unreachable — showing fixture data",
        error,
      );
      const all = conversationsFixture as Conversation[];
      return scope === "all" ? all : all.filter((c) => c.channel === scope);
    }
    throw error;
  }
}

/** Which live channel each sidebar nav key counts unreads from. */
const NAV_KEY_CHANNEL: Record<string, ChannelKey> = {
  whatsapp: "whatsapp",
  linkedin: "linkedin",
  mail: "mail",
  "ai-cold-calling": "call",
  instagram: "instagram",
};

/**
 * Sidebar chrome (labels/icons) is UI config; the unread counts are live —
 * one per conversation whose last message is inbound. Only when the
 * orchestrator is unreachable do the fixture counts show (they belong to the
 * fixture conversations shown in that mode).
 */
export async function fetchChannelNav(): Promise<ChannelNavItem[]> {
  const nav = channelsFixture as ChannelNavItem[];
  try {
    const conversations = await listConversations();
    const unread = new Map<ChannelKey, number>();
    for (const convo of conversations) {
      if (convo.last_message?.direction === "inbound") {
        const key = toUiChannel(convo.channel);
        unread.set(key, (unread.get(key) ?? 0) + 1);
      }
    }
    const total = [...unread.values()].reduce((sum, n) => sum + n, 0);
    return nav.map((item) => ({
      ...item,
      unread:
        item.key === "one-inbox"
          ? total
          : (unread.get(NAV_KEY_CHANNEL[item.key]) ?? 0),
    }));
  } catch (error) {
    if (isBackendUnreachable(error)) {
      console.warn(
        "[nav] orchestrator unreachable — showing fixture counts",
        error,
      );
      return nav;
    }
    throw error;
  }
}
