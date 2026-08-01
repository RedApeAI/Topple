import type {
  ApiOperatorActionResult,
  ApiOperatorStep,
} from "@/lib/api/orchestrator.types";

/** Status is an open string, not a closed enum — new agent workflows introduce new statuses. */
export type OperatorThreadStatus = string;

export interface OperatorThread {
  id: string;
  title: string;
  timestamp: string;
  /** Empty when the thread has no running/done state (agent threads). */
  status: OperatorThreadStatus;
}

export type OperatorMessageRole = "user" | "operator";

export interface OperatorMessage {
  id: string;
  role: OperatorMessageRole;
  text: string;
  /** "draft" = co-pilot reply awaiting the salesperson's approval. */
  status?: "running" | "done" | "draft";
  /** Agent reasoning trace (thoughts + tool calls), when this reply ran the loop. */
  steps?: ApiOperatorStep[];
  /** What the agent did (draft/send) — carries its own approval state. */
  action?: ApiOperatorActionResult | null;
}

export type OperatorPanelTab = "threads" | "history";
