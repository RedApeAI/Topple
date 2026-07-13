import threadsFixture from "@mock/fixtures/operator-threads.json";
import historyFixture from "@mock/fixtures/operator-history.json";
import transcriptFixture from "@mock/fixtures/operator-transcript.json";
import type { OperatorMessage, OperatorThread } from "../types/operator.types";

const MOCK_LATENCY_MS = 250;

function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** TODO: replace with a real API call once the Operator backend is available. */
export async function fetchOperatorThreads(): Promise<OperatorThread[]> {
  return delay(threadsFixture as OperatorThread[]);
}

/** TODO: replace with a real API call — this currently replays a fixed demo transcript. */
export async function fetchOperatorTranscript(): Promise<OperatorMessage[]> {
  return delay(transcriptFixture as OperatorMessage[]);
}

/** TODO: replace with a real API call once the Operator backend is available. */
export async function fetchOperatorHistory(): Promise<OperatorThread[]> {
  return delay(historyFixture as OperatorThread[]);
}
