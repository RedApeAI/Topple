import { useEffect } from "react";
import { useInboxStore } from "@/store/inbox.store";

export function useChannelNav() {
  const data = useInboxStore((state) => state.channelNav);
  const load = useInboxStore((state) => state.loadChannelNav);

  useEffect(() => {
    void load();
  }, [load]);

  return { data };
}
