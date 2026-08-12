import { isBackendUnreachable } from "@/lib/api/client";
import type { ChannelKey, ChannelNavItem } from "@/types/channel.types";
import type { Conversation, InboxScope } from "../types/conversation.types";
import { fetchMessagingConversations } from "./messaging.service";

export async function fetchConversations(
  scope: InboxScope = "all",
): Promise<Conversation[]> {
  return fetchMessagingConversations(scope);
}

const NAV_KEY_CHANNEL: Record<string, ChannelKey> = {
  whatsapp: "whatsapp",
  linkedin: "linkedin",
  mail: "mail",
  "ai-cold-calling": "call",
  instagram: "instagram",
  telegram: "telegram",
};

const LIVE_CHANNEL_NAV: ChannelNavItem[] = [
  { key: "one-inbox", label: "One Inbox", icon: "message-circle-more" },
  { key: "whatsapp", label: "WhatsApp", icon: "whatsapp" },
  { key: "linkedin", label: "Linkedin", icon: "linkedin" },
  { key: "mail", label: "Mail", icon: "mail" },
  { key: "ai-cold-calling", label: "AI Cold Calling", icon: "call-spark" },
  { key: "instagram", label: "Instagram", icon: "instagram" },
  { key: "telegram", label: "Telegram", icon: "telegram" },
  { key: "crm", label: "CRM", icon: "crm" },
];

/** Sidebar unread badges are derived from the same normalized inbox query. */
export async function fetchChannelNav(): Promise<ChannelNavItem[]> {
  const nav = LIVE_CHANNEL_NAV;
  try {
    const conversations = await fetchMessagingConversations("all");
    const unread = new Map<ChannelKey, number>();
    for (const conversation of conversations) {
      if (conversation.unread) {
        unread.set(
          conversation.channel,
          (unread.get(conversation.channel) ?? 0) + 1,
        );
      }
    }
    const total = [...unread.values()].reduce((sum, count) => sum + count, 0);
    return nav.map((item) => ({
      ...item,
      unread:
        item.key === "one-inbox"
          ? total
          : (unread.get(NAV_KEY_CHANNEL[item.key]) ?? 0),
    }));
  } catch (error) {
    if (isBackendUnreachable(error)) return nav;
    throw error;
  }
}
