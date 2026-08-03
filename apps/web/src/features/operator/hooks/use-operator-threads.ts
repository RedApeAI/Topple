import { useEffect } from "react";
import { useOperatorStore } from "@/store/operator.store";

export function useOperatorThreads() {
  const data = useOperatorStore((state) => state.threads);
  const isLoading = useOperatorStore((state) => state.threadsLoading);
  const load = useOperatorStore((state) => state.loadThreads);
  useEffect(() => void load(), [load]);
  return { data, isLoading };
}

export function useOperatorHistory() {
  const data = useOperatorStore((state) => state.history);
  const isLoading = useOperatorStore((state) => state.historyLoading);
  const load = useOperatorStore((state) => state.loadHistory);
  useEffect(() => void load(), [load]);
  return { data, isLoading };
}
