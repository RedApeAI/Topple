import { useEffect, useRef } from "react";
import { useChannelStore } from "@/store/channel.store";
import { useInboxStore } from "@/store/inbox.store";
import { pollMessagingAccount } from "../services/messaging.service";
import type { Conversation, InboxScope } from "../types/conversation.types";

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
export function useMessagingRealtime(
  active: Conversation | undefined,
  scope: InboxScope,
): void {
  const activeRef = useRef(active);
  const seen = useRef<Set<string>>(new Set());
  const refreshTimer = useRef<number | undefined>(undefined);
  const pendingThreadIds = useRef<Set<string> | null>(new Set());
  const reconcileInFlight = useRef(false);
  const reconcileQueued = useRef(false);
  const refreshInbox = useInboxStore((state) => state.refreshInbox);
  const mergeChat = useInboxStore((state) => state.mergeChat);
  const accounts = useChannelStore((state) => state.status?.accounts);

  const provider =
    scope === "linkedin" ||
    scope === "whatsapp" ||
    scope === "instagram" ||
    scope === "telegram"
      ? scope
      : undefined;
  const pollingAccount = accounts?.find(
    (account) =>
      account.id === active?.accountId ||
      (!active && provider !== undefined && account.provider === provider),
  );
  const pollingAccountId =
    pollingAccount?.enabled &&
    ["connected", "syncing"].includes(pollingAccount.status) &&
    pollingAccount.realtimeMode === "polling"
      ? pollingAccount.id
      : undefined;

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    let source: EventSource | undefined;
    let disposed = false;

    const scheduleReconcile = (threadId?: string) => {
      if (threadId) {
        pendingThreadIds.current?.add(threadId);
      } else {
        // Events without a thread id (for example an account update) require
        // a broad refresh, but still share the same debounce window.
        pendingThreadIds.current = null;
      }
      if (refreshTimer.current !== undefined)
        window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = undefined;
        if (reconcileInFlight.current) {
          reconcileQueued.current = true;
          return;
        }

        const affectedThreadIds = pendingThreadIds.current;
        pendingThreadIds.current = new Set();
        reconcileInFlight.current = true;
        void (async () => {
          try {
            await refreshInbox();
            const current = activeRef.current;
            if (
              current &&
              (affectedThreadIds === null || affectedThreadIds.has(current.id))
            ) {
              await mergeChat(current);
            }
          } finally {
            reconcileInFlight.current = false;
            if (reconcileQueued.current && !disposed) {
              reconcileQueued.current = false;
              scheduleReconcile();
            }
          }
        })();
      }, 400);
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
      pendingThreadIds.current = new Set();
      reconcileQueued.current = false;
      source?.close();
    };
  }, [mergeChat, refreshInbox]);

  useEffect(() => {
    if (!pollingAccountId) return;
    let disposed = false;
    let inFlight = false;

    const poll = async () => {
      if (disposed || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const result = await pollMessagingAccount(pollingAccountId);
        if (
          !disposed &&
          ((result.changedThreads ?? 0) > 0 ||
            (result.insertedMessages ?? 0) > 0)
        ) {
          await refreshInbox();
          const current = activeRef.current;
          if (current?.accountId === pollingAccountId) await mergeChat(current);
        }
      } catch {
        // This is a local-development fallback. The next interval retries,
        // while provider and authentication errors remain visible through the
        // connected-account status UI.
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), 20_000);
    const onFocus = () => void poll();
    window.addEventListener("focus", onFocus);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [mergeChat, pollingAccountId, refreshInbox]);
}
