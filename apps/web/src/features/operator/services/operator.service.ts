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
  const turns = await listTurns(30);
  return turns
    .filter((t) => t.status === "in_progress" || !t.error)
    .map(toThread);
}

/** Every recorded turn, errors included — the audit trail. */
export async function fetchOperatorHistory(): Promise<OperatorThread[]> {
  const turns = await listTurns(100);
  return turns.map(toThread);
}

/** Message history of one conversation. */
export async function fetchOperatorTranscript(
  conversationId: string,
): Promise<OperatorMessage[]> {
  const detail = await getConversation(conversationId);
  return detail.messages
    .filter((msg) => msg.status !== "discarded")
    .map((msg) => ({
      id: msg._id,
      role: msg.direction === "inbound" ? "user" : "operator",
      text: msg.text,
      status: msg.status === "draft" ? "draft" : "done",
    }));
}
