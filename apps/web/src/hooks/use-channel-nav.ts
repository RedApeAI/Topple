import { useQuery } from "@tanstack/react-query";
import { fetchChannelNav } from "@/features/inbox/services/conversation.service";
import { useEventsStore } from "@/store/events.store";

export function useChannelNav() {
  // Live updates come off the event bus; polling is only the fallback.
  const live = useEventsStore((s) => s.eventsConnected);
  return useQuery({
    queryKey: ["channel-nav"],
    queryFn: fetchChannelNav,
    refetchInterval: live ? false : 15_000,
  });
}
