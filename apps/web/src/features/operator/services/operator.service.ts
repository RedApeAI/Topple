import threadsFixture from "@mock/fixtures/operator-threads.json";
import historyFixture from "@mock/fixtures/operator-history.json";
import transcriptFixture from "@mock/fixtures/operator-transcript.json";
import { isBackendUnreachable } from "@/lib/api/client";
import { getConversation, listTurns } from "@/lib/mock/orchestrator";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { ApiTurnSummary } from "@/lib/mock/orchestrator.types";
import type { OperatorMessage, OperatorThread } from "../types/operator.types";

function turnTitle(turn: ApiTurnSummary): string {
  if (turn.intent) {
    const intent = turn.intent.replace(/_/g, " ");
    return intent.charAt(0).toUpperCase() + intent.slice(1);
  }
  if (turn.messages.length > 0) return turn.messages[0];
  return `${turn.channel} turn`;
}

function turnStatus(turn: ApiTurnSummary): string {
  if (turn.status === "in_progress") return "running";
  if (turn.status === "error") return "failed";
  if (turn.handoff) return "handed off";
  if (turn.reply_status === "draft") return "needs review";
  return "done";
}

function toThread(turn: ApiTurnSummary): OperatorThread {
  return {
    id: turn.request_id,
    title: turnTitle(turn),
    timestamp: formatRelativeTime(turn.ts_start),
    status: turnStatus(turn),
    conversationId: turn.conversation_id,
  };
}

/** Live and recently finished orchestrator turns. */
export async function fetchOperatorThreads(): Promise<OperatorThread[]> {
  try {
    const turns = await listTurns(30);
    return turns
      .filter((t) => t.status === "in_progress" || !t.error)
      .map(toThread);
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

/** Every recorded turn, errors included — the audit trail. */
export async function fetchOperatorHistory(): Promise<OperatorThread[]> {
  try {
    const turns = await listTurns(100);
    return turns.map(toThread);
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

/** Message history of one conversation. */
export async function fetchOperatorTranscript(
  conversationId: string,
): Promise<OperatorMessage[]> {
  try {
    const detail = await getConversation(conversationId);
    return detail.messages
      .filter((msg) => msg.status !== "discarded")
      .map((msg) => ({
        id: msg._id,
        role: msg.direction === "inbound" ? "user" : "operator",
        text: msg.text,
        status: msg.status === "draft" ? "draft" : "done",
      }));
  } catch (error) {
    if (isBackendUnreachable(error)) {
      console.warn(
        "[operator] orchestrator unreachable — showing fixture data",
        error,
      );
      return transcriptFixture as OperatorMessage[];
    }
    throw error;
  }
}
