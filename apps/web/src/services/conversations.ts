/**
 * AI actions scoped to a single conversation/thread: summarizing,
 * drafting replies, and pulling structured signal out of the message
 * history. Mocked today — every function is written against the
 * interface it will have once a real model is wired in via `openai.ts`.
 */
import { createChatCompletion, type ChatMessage } from "./openai";

export interface ConversationMessage {
  author: "contact" | "agent";
  text: string;
  timestamp: string;
}

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
}

export interface ReplyDraft {
  reply: string;
  tone: "friendly" | "formal" | "concise";
}

export interface ConversationAnalysis {
  sentiment: "positive" | "neutral" | "negative";
  intent: string;
  urgency: "low" | "medium" | "high";
  suggestedNextAction: string;
}

/**
 * TODO: feed the full message history + a summarization system prompt into
 * `createChatCompletion` and parse the structured result.
 */
export async function generateSummary(
  messages: ConversationMessage[],
): Promise<SummaryResult> {
  await createChatCompletion({
    messages: toChatMessages(messages, "Summarize this conversation."),
  });

  return {
    summary:
      messages.length > 0
        ? `Conversation with ${messages.length} messages — mocked summary pending real model wiring.`
        : "No messages yet.",
    keyPoints: ["Mocked key point A", "Mocked key point B"],
  };
}

/**
 * TODO: pass conversation history + desired tone into `createChatCompletion`
 * using a reply-drafting system prompt.
 */
export async function generateReply(
  messages: ConversationMessage[],
  tone: ReplyDraft["tone"] = "friendly",
): Promise<ReplyDraft> {
  const result = await createChatCompletion({
    messages: toChatMessages(messages, `Draft a ${tone} reply.`),
  });

  return { reply: result.content, tone };
}

/**
 * TODO: run a structured-output completion (JSON mode / function calling)
 * against the message history to extract sentiment/intent/urgency.
 */
export async function analyzeConversation(
  messages: ConversationMessage[],
): Promise<ConversationAnalysis> {
  await createChatCompletion({
    messages: toChatMessages(messages, "Analyze this conversation."),
  });

  return {
    sentiment: "neutral",
    intent: "Requesting sales contract details",
    urgency: "medium",
    suggestedNextAction: "Share the requested document and confirm next steps.",
  };
}

function toChatMessages(
  messages: ConversationMessage[],
  instruction: string,
): ChatMessage[] {
  return [
    { role: "system", content: instruction },
    ...messages.map<ChatMessage>((m) => ({
      role: m.author === "agent" ? "assistant" : "user",
      content: m.text,
    })),
  ];
}
