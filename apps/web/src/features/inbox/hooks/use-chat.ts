import { useEffect, useRef } from "react";
import { useInboxStore } from "@/store/inbox.store";
import { markChatRead } from "../services/chat.service";
import type { ChatDetail } from "../types/chat.types";
import type { Conversation } from "../types/conversation.types";

export function useChatDetail(conversation: Conversation | undefined) {
  const markedReadThread = useRef<string | undefined>(undefined);
  const dataRef = useRef<ChatDetail | undefined>(undefined);
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

  const messagingThreadId = data?.source === "messaging" ? data.id : undefined;
  dataRef.current = data;

  useEffect(() => {
    const chat = dataRef.current;
    if (!chat || !messagingThreadId) return;
    if (markedReadThread.current === messagingThreadId) return;
    markedReadThread.current = messagingThreadId;
    void markChatRead(chat).catch(() => {
      if (markedReadThread.current === messagingThreadId)
        markedReadThread.current = undefined;
    });
  }, [messagingThreadId]);

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
      if (!chat) return Promise.resolve();
      return sendMessage(chat, text, attachmentIds);
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
