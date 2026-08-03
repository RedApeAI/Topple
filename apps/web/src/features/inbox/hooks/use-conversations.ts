import { useEffect } from "react";
import { useInboxStore } from "@/store/inbox.store";
import type { InboxScope } from "../types/conversation.types";

export function useConversations(scope: InboxScope) {
  const data = useInboxStore((state) => state.conversations[scope]);
  const isLoading = useInboxStore(
    (state) => state.conversationLoading[scope] ?? false,
  );
  const error = useInboxStore((state) => state.conversationErrors[scope]);
  const load = useInboxStore((state) => state.loadConversations);

  useEffect(() => {
    void load(scope, scope === "whatsapp");

    if (scope !== "whatsapp") return;
    const refreshOnFocus = () => {
      void load(scope, true);
    };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [load, scope]);

  return {
    data,
    isLoading,
    isError: Boolean(error),
    error,
    retry: () => load(scope, true),
  };
}
