import { useQuery } from "@tanstack/react-query";
import { fetchChannelNav } from "@/features/inbox/services/conversation.service";

export function useChannelNav() {
  return useQuery({
    queryKey: ["channel-nav"],
    queryFn: fetchChannelNav,
    // Unread counts are derived from live conversations — keep them fresh.
    refetchInterval: 15_000,
  });
}
