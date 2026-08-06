import { apiClient } from "@/lib/api/client";
import { sessionId } from "./orchestrator";
import { toApiChannel } from "@/lib/api/channel-map";
import type { ChannelKey } from "@/types/channel.types";
import type {
  ApiOperatorCommandResult,
  ApiOperatorMessage,
  ApiOperatorThread,
  OrchestratorMode,
} from "./orchestrator.types";

/**
 * The Operator agent plane — the salesperson's command chat.
 *
 * Routed through the BFF like the rest of the agent surface, so the thread
 * list and every transcript are scoped to the signed-in user by the server.
 * A thread id is not a capability: asking for one that belongs to someone else
 * returns nothing.
 */

export interface OperatorCommandInput {
  text: string;
  mode: OrchestratorMode;
  threadId?: string;
  /** Which channel the agent should prefer when it decides to send. */
  preferredChannel?: ChannelKey;
}

/**
 * Run one command. Resolves once the whole loop has finished and the reply is
 * persisted — individual steps stream separately over `/v1/events` as
 * `operator.step`, correlated by `client_ref`.
 */
export async function postOperatorCommand(
  input: OperatorCommandInput,
): Promise<ApiOperatorCommandResult> {
  const { data } = await apiClient.post<{ data: ApiOperatorCommandResult }>(
    "/api/v1/agent/operator/messages",
    {
      text: input.text,
      mode: input.mode,
      thread_id: input.threadId ?? null,
      preferred_channel: input.preferredChannel
        ? toApiChannel(input.preferredChannel)
        : null,
      session_id: sessionId(),
    },
  );
  return data.data;
}

/** The signed-in user's past Operator chats, most recently used first. */
export async function listOperatorThreads(
  limit = 30,
): Promise<ApiOperatorThread[]> {
  const { data } = await apiClient.get<{ data: ApiOperatorThread[] }>(
    "/api/v1/agent/operator/threads",
    { params: { limit } },
  );
  return data.data;
}

export async function listOperatorMessages(
  threadId: string,
): Promise<ApiOperatorMessage[]> {
  const { data } = await apiClient.get<{ data: ApiOperatorMessage[] }>(
    `/api/v1/agent/operator/threads/${encodeURIComponent(threadId)}/messages`,
  );
  return data.data;
}
