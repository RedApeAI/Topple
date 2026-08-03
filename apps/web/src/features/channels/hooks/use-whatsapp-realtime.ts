import { useEffect, useRef } from "react";
import {
  configureZernioWebhook,
  fetchZernioEvents,
} from "../services/zernio.service";
import { useInboxStore } from "@/store/inbox.store";
import type { Conversation } from "@/features/inbox/types/conversation.types";

let webhookSetupAttempted = false;

/**
 * Zernio pushes into our signed API webhook. The browser polls only the small
 * authenticated event cursor, then refreshes authoritative conversation data.
 * A slower direct refresh keeps local development useful when no public
 * webhook URL is available.
 */
export function useWhatsAppRealtime(enabled: boolean, active?: Conversation) {
  const cursor = useRef<string | undefined>(undefined);
  const polling = useRef(false);
  const tick = useRef(0);
  const loadConversations = useInboxStore((state) => state.loadConversations);
  const loadChat = useInboxStore((state) => state.loadChat);

  useEffect(() => {
    if (!enabled) return;
    if (!webhookSetupAttempted) {
      webhookSetupAttempted = true;
      void configureZernioWebhook().catch(() => undefined);
    }

    let disposed = false;
    const poll = async () => {
      if (disposed || polling.current || document.hidden) return;
      polling.current = true;
      try {
        const response = await fetchZernioEvents(cursor.current);
        cursor.current = response.cursor;
        tick.current += 1;

        const hasWhatsAppEvent = response.events.some(
          (event) => !event.platform || event.platform === "whatsapp",
        );
        // Every ~10 seconds, also refresh directly. This covers development
        // environments where Zernio cannot reach a localhost webhook.
        const fallbackRefresh = tick.current % 4 === 0;
        if (hasWhatsAppEvent || fallbackRefresh) {
          await Promise.all([
            loadConversations("whatsapp", true),
            active ? loadChat(active, true) : Promise.resolve(),
          ]);
        }
      } catch {
        // The regular inbox error UI handles authoritative fetch failures.
      } finally {
        polling.current = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 2_500);
    const onVisibility = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, enabled, loadChat, loadConversations]);
}
