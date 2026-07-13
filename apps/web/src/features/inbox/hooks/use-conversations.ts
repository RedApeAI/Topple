import { useQuery } from "@tanstack/react-query";
import { fetchConversations } from "../services/conversation.service";
import type { InboxScope } from "../types/conversation.types";

export function useConversations(scope: InboxScope) {
  return useQuery({
    queryKey: ["conversations", scope],
    queryFn: () => fetchConversations(scope),
  });
}
