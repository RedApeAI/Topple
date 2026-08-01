import { useQuery } from "@tanstack/react-query";
import { fetchOperatorTranscript } from "../services/operator.service";

/** No query until a real conversation exists — a brand-new chat starts empty. */
export function useOperatorTranscript(conversationId?: string) {
  return useQuery({
    queryKey: ["operator-transcript", conversationId ?? "new"],
    queryFn: () => fetchOperatorTranscript(conversationId!),
    enabled: Boolean(conversationId),
    refetchInterval: 5_000,
  });
}
