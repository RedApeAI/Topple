/** Status is an open string, not a closed enum — new agent workflows introduce new statuses. */
export type OperatorThreadStatus = string;

export interface OperatorThread {
  id: string;
  title: string;
  timestamp: string;
  status: OperatorThreadStatus;
}

export type OperatorMessageRole = "user" | "operator";

export interface OperatorMessage {
  id: string;
  role: OperatorMessageRole;
  text: string;
  status?: "running" | "done";
}

export type OperatorPanelTab = "threads" | "history";
