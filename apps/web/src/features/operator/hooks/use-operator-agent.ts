import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postOperatorCommand } from "@/lib/api/operator-agent";
import { useUIStore } from "@/store/ui.store";
import { fetchOperatorThreadMessages } from "../services/operator.service";
import { onOperatorStep } from "../lib/operator-stream";
import type {
  ApiOperatorMessage,
  ApiOperatorStep,
} from "@/lib/api/orchestrator.types";
import type { ChannelKey } from "@/types/channel.types";
import type { OperatorMessage } from "../types/operator.types";

function toOperatorMessage(api: ApiOperatorMessage): OperatorMessage {
  return {
    id: api._id,
    role: api.role,
    text: api.text,
    status: "done",
    steps: api.steps,
    action: api.action,
  };
}

/**
 * One operator agent chat session: local message list, the send mutation,
 * and patching of an action's status after draft approval/discard.
 *
 * With `initialThreadId` the session hydrates from an existing thread (opened
 * from Threads Running / History); otherwise it starts empty (New Chat) and
 * the backend assigns a thread id on the first command.
 */
export function useOperatorAgent(initialThreadId?: string) {
  const [threadId, setThreadId] = React.useState(initialThreadId);
  const [messages, setMessages] = React.useState<OperatorMessage[]>([]);
  const [hydrating, setHydrating] = React.useState(Boolean(initialThreadId));
  // Reasoning steps streamed live over SSE while a command is in flight.
  const [liveSteps, setLiveSteps] = React.useState<ApiOperatorStep[]>([]);
  const operatorMode = useUIStore((s) => s.operatorMode);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!initialThreadId) return;
    let cancelled = false;
    setHydrating(true);
    fetchOperatorThreadMessages(initialThreadId)
      .then((loaded) => {
        if (!cancelled) setMessages(loaded);
      })
      .catch(() => {
        /* leave empty — the composer still works to continue the thread */
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialThreadId]);

  // Each in-flight command subscribes to its own client_ref so live steps
  // land on the right session; the ref is cleaned up when the command settles.
  const unsubscribeRef = React.useRef<(() => void) | null>(null);

  const send = useMutation({
    mutationFn: (input: { text: string; channel: ChannelKey }) => {
      const clientRef = crypto.randomUUID();
      setLiveSteps([]);
      unsubscribeRef.current = onOperatorStep(clientRef, (step) =>
        setLiveSteps((current) => [...current, step]),
      );
      return postOperatorCommand({
        text: input.text,
        mode: operatorMode,
        threadId,
        preferredChannel: input.channel,
        clientRef,
      });
    },
    onMutate: (input) => {
      setMessages((current) => [
        ...current,
        {
          id: `local-${Date.now()}`,
          role: "user",
          text: input.text,
          status: "done",
        },
      ]);
    },
    onSuccess: (response) => {
      setThreadId(response.thread_id);
      setMessages((current) => [
        ...current,
        toOperatorMessage(response.message),
      ]);
      // The agent may have created contacts' conversations or drafts.
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["channel-nav"] });
      queryClient.invalidateQueries({ queryKey: ["operator-threads"] });
      queryClient.invalidateQueries({ queryKey: ["operator-history"] });
    },
    onSettled: () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      setLiveSteps([]);
    },
  });

  React.useEffect(() => () => unsubscribeRef.current?.(), []);

  const patchActionStatus = (messageId: string, status: string) => {
    setMessages((current) =>
      current.map((m) =>
        m.id === messageId && m.action
          ? { ...m, action: { ...m.action, status } }
          : m,
      ),
    );
  };

  return { messages, hydrating, liveSteps, send, patchActionStatus };
}
