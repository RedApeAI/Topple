/**
 * Low-level LLM client wrapper. Every higher-level AI service
 * (`operator.ts`, `conversations.ts`) calls through this module instead of
 * touching a provider SDK directly, so swapping providers or models later
 * never touches feature/UI code.
 *
 * TODO: install the `openai` SDK and construct a real client:
 *   import OpenAI from "openai";
 *   const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionResult {
  content: string;
  model: string;
  finishReason: "stop" | "length" | "mocked";
}

const DEFAULT_MODEL = "gpt-4o-mini";
const MOCK_LATENCY_MS = 400;

function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * Requests a single chat completion.
 * TODO: replace the mocked branch below with:
 *   const response = await client.chat.completions.create({
 *     model: request.model ?? DEFAULT_MODEL,
 *     messages: request.messages,
 *     temperature: request.temperature,
 *     max_tokens: request.maxTokens,
 *   });
 *   return { content: response.choices[0].message.content ?? "", model: response.model, finishReason: response.choices[0].finish_reason };
 */
export async function createChatCompletion(
  request: CompletionRequest,
): Promise<CompletionResult> {
  const lastUserMessage =
    [...request.messages].reverse().find((m) => m.role === "user")?.content ??
    "";

  return delay({
    content: `[mocked response] ${lastUserMessage.slice(0, 120)}`,
    model: request.model ?? DEFAULT_MODEL,
    finishReason: "mocked",
  });
}
