import { useEffect, useRef } from "react";
import { useInboxStore } from "@/store/inbox.store";
import type { Conversation } from "../types/conversation.types";

const EVENT_TYPES = [
  "thread.created",
  "thread.updated",
  "thread.read_changed",
  "thread.archived",
  "message.created",
  "message.updated",
  "message.reaction",
  "message.delivery_updated",
  "attachment.updated",
  "connected_account.updated",
  "ai.summary_ready",
  "ai.classification_ready",
  "ai.draft_ready",
] as const;

function eventsUrl(): string {
  const base =
    (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
    "";
  return `${base}/api/v1/inbox/events`;
}

/**
 * The server uses a short-lived SSE response so Workers do not hold a request
 * forever. EventSource reconnects automatically and sends Last-Event-ID when
 * the browser can resume the stream. Each event is also deduplicated locally
 * before the normalized thread/message query is reconciled.
 */
export function useMessagingRealtime(active?: Conversation): void {
  const activeRef = useRef(active);
  const seen = useRef<Set<string>>(new Set());
  const refreshTimer = useRef<number | undefined>(undefined);
  const refreshInbox = useInboxStore((state) => state.refreshInbox);
  const mergeChat = useInboxStore((state) => state.mergeChat);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    let source: EventSource | undefined;
    let disposed = false;

    const scheduleReconcile = (threadId?: string) => {
      if (refreshTimer.current !== undefined)
        window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = undefined;
        void refreshInbox();
        const current = activeRef.current;
        if (current && (!threadId || current.id === threadId))
          void mergeChat(current);
      }, 150);
    };

    const onEvent = (event: MessageEvent<string>) => {
      if (!event.lastEventId || seen.current.has(event.lastEventId)) return;
      seen.current.add(event.lastEventId);
      if (seen.current.size > 500) {
        const first = seen.current.values().next().value as string | undefined;
        if (first) seen.current.delete(first);
      }
      try {
        const payload = JSON.parse(event.data) as {
          payload?: { threadId?: string };
        };
        scheduleReconcile(payload.payload?.threadId);
      } catch {
        scheduleReconcile();
      }
    };

    const open = () => {
      if (disposed) return;
      source = new EventSource(eventsUrl(), { withCredentials: true });
      for (const eventType of EVENT_TYPES)
        source.addEventListener(eventType, onEvent as EventListener);
      source.onerror = () => {
        // EventSource performs its own bounded retry. Closing only when the
        // browser has permanently closed the stream prevents a reconnect loop
        // from outliving the component.
        if (source?.readyState === EventSource.CLOSED && !disposed) {
          source.close();
          window.setTimeout(open, 1_000);
        }
      };
    };

    open();
    return () => {
      disposed = true;
      if (refreshTimer.current !== undefined)
        window.clearTimeout(refreshTimer.current);
      source?.close();
    };
  }, [mergeChat, refreshInbox]);
}
