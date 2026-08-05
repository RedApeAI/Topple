import { useEffect, useState } from "react";
import { wsService, type TypingEvent } from "@/lib/websocket/service";

const TYPING_EXPIRY_MS = 4000;

/**
 * Join the conversation room and surface whether a peer is currently typing.
 * Typing events only reach sockets that have joined the conversation room, so
 * the room is joined on mount and left on unmount.
 */
export function useTypingIndicator(
  conversationId: string | undefined,
): boolean {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    const timers = new Map<string, number>();
    setTyping(false);
    wsService.joinConversation(conversationId);

    const onTypingStart = (data: TypingEvent) => {
      if (data.conversationId !== conversationId) return;
      const existing = timers.get(data.userId);
      if (existing) window.clearTimeout(existing);
      // Peers may drop the socket without sending `typing:stop`; expire the
      // indicator on a timer instead of waiting forever.
      timers.set(
        data.userId,
        window.setTimeout(() => {
          timers.delete(data.userId);
          if (timers.size === 0) setTyping(false);
        }, TYPING_EXPIRY_MS),
      );
      setTyping(true);
    };

    const onTypingStop = (data: TypingEvent) => {
      if (data.conversationId !== conversationId) return;
      const existing = timers.get(data.userId);
      if (existing) {
        window.clearTimeout(existing);
        timers.delete(data.userId);
      }
      if (timers.size === 0) setTyping(false);
    };

    wsService.on("typing:start", onTypingStart);
    wsService.on("typing:stop", onTypingStop);
    return () => {
      wsService.off("typing:start", onTypingStart);
      wsService.off("typing:stop", onTypingStop);
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
      wsService.leaveConversation(conversationId);
    };
  }, [conversationId]);

  return typing;
}
