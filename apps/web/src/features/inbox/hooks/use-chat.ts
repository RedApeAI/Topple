import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveDraft,
  discardDraft,
  fetchChatDetail,
  sendContactMessage,
} from "../services/chat.service";
import type { ChatDetail } from "../types/chat.types";

export function useChatDetail(conversationId: string | undefined) {
  return useQuery({
    queryKey: ["chat", conversationId],
    queryFn: () => fetchChatDetail(conversationId!),
    enabled: Boolean(conversationId),
    // New turns can land from the channel side at any time.
    refetchInterval: 5_000,
  });
}

function useChatInvalidation(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["chat", conversationId] });
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    queryClient.invalidateQueries({ queryKey: ["channel-nav"] });
  };
}

export function useSendMessage(chat: ChatDetail | undefined) {
  const invalidate = useChatInvalidation(chat?.id);
  return useMutation({
    mutationFn: (text: string) => {
      if (!chat) throw new Error("Conversation still loading");
      return sendContactMessage(chat, text);
    },
    onSettled: invalidate,
  });
}

export function useDraftActions(conversationId: string | undefined) {
  const invalidate = useChatInvalidation(conversationId);
  const approve = useMutation({
    mutationFn: (messageId: string) => approveDraft(messageId),
    onSettled: invalidate,
  });
  const discard = useMutation({
    mutationFn: (messageId: string) => discardDraft(messageId),
    onSettled: invalidate,
  });
  return { approve, discard };
}
