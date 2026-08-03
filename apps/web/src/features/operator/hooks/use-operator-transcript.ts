import { useEffect } from "react";
import { useOperatorStore } from "@/store/operator.store";

export function useOperatorTranscript(conversationId?: string) {
  const data = useOperatorStore((state) =>
    conversationId ? state.transcripts[conversationId] : undefined,
  );
  const load = useOperatorStore((state) => state.loadTranscript);
  useEffect(() => {
    if (conversationId) void load(conversationId);
  }, [conversationId, load]);
  return { data };
}
