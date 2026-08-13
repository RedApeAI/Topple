import { useEffect } from "react";
import { useInboxStore } from "@/store/inbox.store";
import { markChatRead } from "../services/chat.service";
import type { ChatDetail } from "../types/chat.types";
import type { Conversation } from "../types/conversation.types";

export function useChatDetail(conversation: Conversation | undefined) {
  const conversationId = conversation?.id;
  const data = useInboxStore((state) =>
    conversationId ? state.chats[conversationId] : undefined,
  );
  const isLoading = useInboxStore((state) =>
    conversationId ? (state.chatLoading[conversationId] ?? false) : false,
  );
  const error = useInboxStore((state) =>
    conversationId ? state.chatErrors[conversationId] : undefined,
  );
  const load = useInboxStore((state) => state.loadChat);

  useEffect(() => {
    if (conversation) void load(conversation);

    if (conversation?.source !== "messaging") return;
    const refreshOnFocus = () => {
      void load(conversation, true);
    };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [conversation, load]);

  useEffect(() => {
    if (data?.source === "messaging") {
      void markChatRead(data).catch(() => undefined);
    }
  }, [data]);

  return { data, isLoading, isError: Boolean(error), error };
}

export function useSendMessage(chat: ChatDetail | undefined) {
  const sendMessage = useInboxStore((state) => state.sendMessage);
  const isPending = useInboxStore((state) => state.sendPending);
  const error = useInboxStore((state) => state.sendError);
  return {
    isPending,
    isError: Boolean(error),
    error,
    mutate: (text: string, attachmentIds?: string[]) => {
      if (!chat) return;
      void sendMessage(chat, text, attachmentIds).catch(() => undefined);
    },
  };
}

export function useDraftActions(conversationId: string | undefined) {
  const approveDraft = useInboxStore((state) => state.approveDraft);
  const discardDraft = useInboxStore((state) => state.discardDraft);
  const isPending = useInboxStore((state) => state.draftPending);
  return {
    approve: {
      isPending,
      mutate: (messageId: string) => {
        if (conversationId) {
          void approveDraft(conversationId, messageId).catch(() => undefined);
        }
      },
    },
    discard: {
      isPending,
      mutate: (messageId: string) => {
        if (conversationId) {
          void discardDraft(conversationId, messageId).catch(() => undefined);
        }
      },
    },
  };
}
