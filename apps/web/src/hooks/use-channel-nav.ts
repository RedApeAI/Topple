import { useQuery } from "@tanstack/react-query";
import { fetchChannelNav } from "@/features/inbox/services/conversation.service";

export function useChannelNav() {
  return useQuery({
    queryKey: ["channel-nav"],
    queryFn: fetchChannelNav,
  });
}
