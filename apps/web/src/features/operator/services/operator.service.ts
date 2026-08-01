import threadsFixture from "@mock/fixtures/operator-threads.json";
import historyFixture from "@mock/fixtures/operator-history.json";
import { isBackendUnreachable } from "@/lib/api/client";
import {
  getOperatorThreadMessages,
  listOperatorThreads,
} from "@/lib/api/operator-agent";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type {
  ApiOperatorMessage,
  ApiOperatorThread,
} from "@/lib/api/orchestrator.types";
import type { OperatorMessage, OperatorThread } from "../types/operator.types";

function toThread(thread: ApiOperatorThread): OperatorThread {
  return {
    id: thread._id,
    title: thread.title || "Operator chat",
    timestamp: formatRelativeTime(thread.last_message_at ?? thread.created_at),
    status: "", // agent threads have no running/done state yet — no badge
  };
}

/** The salesperson's recent Operator command threads. */
export async function fetchOperatorThreads(): Promise<OperatorThread[]> {
  try {
    const threads = await listOperatorThreads(30);
    return threads.map(toThread);
  } catch (error) {
    if (isBackendUnreachable(error)) {
      console.warn(
        "[operator] orchestrator unreachable — showing fixture data",
        error,
      );
      return threadsFixture as OperatorThread[];
    }
    throw error;
  }
}

/** Every Operator command thread — the full history. */
export async function fetchOperatorHistory(): Promise<OperatorThread[]> {
  try {
    const threads = await listOperatorThreads(100);
    return threads.map(toThread);
  } catch (error) {
    if (isBackendUnreachable(error)) {
      console.warn(
        "[operator] orchestrator unreachable — showing fixture data",
        error,
      );
      return historyFixture as OperatorThread[];
    }
    throw error;
  }
}

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

/** Replay one Operator command thread — its messages, reasoning, and drafts. */
export async function fetchOperatorThreadMessages(
  threadId: string,
): Promise<OperatorMessage[]> {
  const messages = await getOperatorThreadMessages(threadId);
  return messages.map(toOperatorMessage);
}
