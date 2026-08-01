import { useQuery } from "@tanstack/react-query";
import { useEventsStore } from "@/store/events.store";
import { fetchConversations } from "../services/conversation.service";
import type { InboxScope } from "../types/conversation.types";

export function useConversations(scope: InboxScope) {
  // Live updates come off the event bus; polling is only the fallback.
  const live = useEventsStore((s) => s.eventsConnected);
  return useQuery({
    queryKey: ["conversations", scope],
    queryFn: () => fetchConversations(scope),
    refetchInterval: live ? false : 15_000,
  });
}
