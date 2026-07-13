/**
 * Agent-level actions the Operator can take across channels: qualifying a
 * lead, creating a task, searching internal knowledge, and running a
 * multi-step workflow. Mocked today — every function is written against
 * the interface it will have once real model + tool calls are wired in.
 */
import { createChatCompletion } from "./openai";

export interface LeadQualification {
  qualified: boolean;
  score: number; // 0-100
  reasons: string[];
}

export interface CreateTaskInput {
  title: string;
  channel?: string;
  dueDate?: string;
  assignee?: string;
}

export interface CreatedTask extends CreateTaskInput {
  id: string;
  status: "Pending";
  createdAt: string;
}

export interface KnowledgeResult {
  id: string;
  title: string;
  snippet: string;
  score: number;
}

export interface WorkflowStep {
  label: string;
  status: "pending" | "running" | "done" | "failed";
}

export interface WorkflowExecution {
  id: string;
  name: string;
  steps: WorkflowStep[];
}

/**
 * TODO: run a structured-output completion against the lead's message
 * history + CRM context to score qualification.
 */
export async function qualifyLead(
  leadContext: string,
): Promise<LeadQualification> {
  await createChatCompletion({
    messages: [
      { role: "system", content: "Qualify this lead." },
      { role: "user", content: leadContext },
    ],
  });

  return {
    qualified: true,
    score: 72,
    reasons: [
      "Mocked signal: expressed budget",
      "Mocked signal: timeline within 30 days",
    ],
  };
}

/** TODO: persist to the real task store once the Tasks backend exists. */
export async function createTask(input: CreateTaskInput): Promise<CreatedTask> {
  return {
    ...input,
    id: `task-${Math.random().toString(36).slice(2, 9)}`,
    status: "Pending",
    createdAt: new Date().toISOString(),
  };
}

/**
 * TODO: replace with a real vector-search / RAG call over the connected
 * knowledge base (docs, CRM notes, past conversations).
 */
export async function searchKnowledge(
  query: string,
): Promise<KnowledgeResult[]> {
  if (!query.trim()) return [];

  return [
    {
      id: "kb-1",
      title: "Mocked knowledge result",
      snippet: `Related to "${query}" — connect a real knowledge base to replace this.`,
      score: 0.82,
    },
  ];
}

/**
 * TODO: replace with a real workflow engine call (e.g. a durable-execution
 * queue) that emits step-by-step progress events the UI can subscribe to.
 */
export async function executeWorkflow(
  name: string,
): Promise<WorkflowExecution> {
  return {
    id: `wf-${Math.random().toString(36).slice(2, 9)}`,
    name,
    steps: [
      { label: "Interpret request", status: "done" },
      { label: "Draft response", status: "done" },
      { label: "Send via channel", status: "running" },
      { label: "Log outcome", status: "pending" },
    ],
  };
}
