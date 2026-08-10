import { useEffect, useRef, useState } from "react";
import {
  wsService,
  type MessageEvent,
  type MessageStatusEvent,
} from "@/lib/websocket/service";
import { useInboxStore } from "@/store/inbox.store";
import { useAuthStore } from "@/store/auth.store";
import { formatMessageTime } from "@/lib/format-relative-time";
import type { Conversation } from "@/features/inbox/types/conversation.types";

export function useRealtimeMessages(enabled: boolean, active?: Conversation) {
  const loadConversations = useInboxStore((state) => state.loadConversations);
  const appendMessageToChat = useInboxStore(
    (state) => state.appendMessageToChat,
  );
  const updateMessageStatus = useInboxStore(
    (state) => state.updateMessageStatus,
  );
  const bumpConversation = useInboxStore((state) => state.bumpConversation);
  const mergeChat = useInboxStore((state) => state.mergeChat);
  // The workspace room is keyed by the Better Auth organization id (the same
  // id the server resolves in the socket handshake and broadcasts to). Using
  // the Zernio profileId here previously put the client in a room that never
  // received events.
  const organizationId = useAuthStore(
    (state) => state.session?.activeOrganizationId ?? undefined,
  );
  const [connected, setConnected] = useState(false);

  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!enabled) return;

    wsService.connect().catch((error) => {
      console.error("Failed to initialize WebSocket:", error);
    });

    const markConnected = () => setConnected(true);
    const markDisconnected = () => setConnected(false);
    wsService.onConnect(markConnected);
    wsService.onDisconnect(markDisconnected);
    return () => {
      wsService.offConnect(markConnected);
      wsService.offDisconnect(markDisconnected);
    };
  }, [enabled]);

  useEffect(() => {
    if (enabled && connected && organizationId) {
      wsService.joinWorkspace(organizationId);
    }
  }, [enabled, connected, organizationId]);

  useEffect(() => {
    if (!enabled) return;

    // Every event below updates only the row or bubble it concerns — never a
    // full conversation/chat refetch — so realtime push does not re-render the
    // whole inbox. Realtime delivery relies on the Zernio webhook subscription
    // (registered from WhatsAppPage when a public URL is configured); there is
    // deliberately no polling fallback.
    const onMessageReceived = (data: MessageEvent) => {
      if (!isWhatsAppMessage(data)) return;
      const activeConversation = activeRef.current;
      const isActive =
        activeConversation?.id === data.conversationId &&
        activeConversation.source === "zernio";

      if (isActive) {
        appendMessageToChat(data.conversationId, {
          // Prefer the Zernio message id (externalId) so the same message
          // dedupes against the one fetched over REST; the event id is only a
          // fallback for messages that lack a Zernio id.
          id: data.externalId || data.id,
          direction: "inbound",
          text: data.content,
          status: "received",
          time: formatMessageTime(data.timestamp),
        });
      }
      // The user is reading this conversation, so it is not unread.
      bumpConversation(data.conversationId, data.content, !isActive);
    };

    const onMessageSent = (data: MessageEvent) => {
      if (!isWhatsAppMessage(data)) return;
      const activeConversation = activeRef.current;
      if (activeConversation?.id === data.conversationId) {
        // The optimistic `local-` bubble keeps its id when the send response
        // carried no messageId; reconcile it only in that rare case.
        const chat = useInboxStore.getState().chats[activeConversation.id];
        if (chat?.messages.some((message) => message.id.startsWith("local-"))) {
          void mergeChat(activeConversation);
        }
      }
    };

    const onMessageDelivered = (data: MessageStatusEvent) => {
      updateMessageStatus(data.conversationId, data.messageId, "delivered");
    };

    const onMessageRead = (data: MessageStatusEvent) => {
      updateMessageStatus(data.conversationId, data.messageId, "read");
    };

    const onMessageFailed = (data: MessageStatusEvent) => {
      updateMessageStatus(data.conversationId, data.messageId, "failed");
    };

    // A brand-new conversation is a list-level change (new row, ordering, nav
    // unread counts), so a single refresh is warranted here and only here.
    const onConversationStarted = () => {
      void loadConversations("whatsapp", true);
    };

    wsService.on("message:received", onMessageReceived);
    wsService.on("message:sent", onMessageSent);
    wsService.on("message:delivered", onMessageDelivered);
    wsService.on("message:read", onMessageRead);
    wsService.on("message:failed", onMessageFailed);
    wsService.on("conversation:created", onConversationStarted);
    wsService.on("conversation:updated", onConversationStarted);

    return () => {
      wsService.off("message:received", onMessageReceived);
      wsService.off("message:sent", onMessageSent);
      wsService.off("message:delivered", onMessageDelivered);
      wsService.off("message:read", onMessageRead);
      wsService.off("message:failed", onMessageFailed);
      wsService.off("conversation:created", onConversationStarted);
      wsService.off("conversation:updated", onConversationStarted);
    };
  }, [
    enabled,
    loadConversations,
    appendMessageToChat,
    updateMessageStatus,
    bumpConversation,
    mergeChat,
  ]);
}

function isWhatsAppMessage(data: { conversationId?: string }): boolean {
  return Boolean(data.conversationId);
}
