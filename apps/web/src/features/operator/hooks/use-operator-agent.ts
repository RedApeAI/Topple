import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
// Missing integration module: @/lib/api/operator-agent
// import { postOperatorCommand } from "@/lib/api/operator-agent";
import { useUIStore } from "@/store/ui.store";
// Missing integration module: @/lib/api/orchestrator.types
// import type { ApiOperatorMessage } from "@/lib/api/orchestrator.types";
import { postOperatorCommand } from "@/lib/mock/operator-agent";
import type {
  ApiOperatorActionResult,
  ApiOperatorMessage,
} from "@/lib/mock/orchestrator.types";
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
 * The thread id is assigned by the backend on the first command.
 */
export function useOperatorAgent() {
  const [threadId, setThreadId] = React.useState<string>();
  const [messages, setMessages] = React.useState<OperatorMessage[]>([]);
  const operatorMode = useUIStore((s) => s.operatorMode);
  const queryClient = useQueryClient();

  const send = useMutation({
    mutationFn: (input: { text: string; channel: ChannelKey }) =>
      postOperatorCommand({
        text: input.text,
        mode: operatorMode,
        threadId,
        preferredChannel: input.channel,
      }),
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
    },
  });

  const patchActionStatus = (
    messageId: string,
    status: ApiOperatorActionResult["status"],
  ) => {
    setMessages((current) =>
      current.map((m) =>
        m.id === messageId && m.action
          ? { ...m, action: { ...m.action, status } }
          : m,
      ),
    );
  };

  return { messages, send, patchActionStatus };
}
