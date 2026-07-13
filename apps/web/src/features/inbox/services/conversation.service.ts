import conversationsFixture from "@mock/fixtures/conversations.json";
import channelsFixture from "@mock/fixtures/channels.json";
import type { Conversation, InboxScope } from "../types/conversation.types";
import type { ChannelNavItem } from "@/types/channel.types";

const MOCK_LATENCY_MS = 250;

function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** TODO: replace with a real API call once the inbox backend is available. */
export async function fetchConversations(
  scope: InboxScope = "all",
): Promise<Conversation[]> {
  const all = conversationsFixture as Conversation[];
  if (scope === "all") return delay(all);
  return delay(all.filter((c) => c.channel === scope));
}

/** TODO: replace with a real API call once the sidebar backend is available. */
export async function fetchChannelNav(): Promise<ChannelNavItem[]> {
  return delay(channelsFixture as ChannelNavItem[]);
}
