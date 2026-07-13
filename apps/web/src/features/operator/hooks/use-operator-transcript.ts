import { useQuery } from "@tanstack/react-query";
import { fetchOperatorTranscript } from "../services/operator.service";

export function useOperatorTranscript() {
  return useQuery({
    queryKey: ["operator-transcript"],
    queryFn: fetchOperatorTranscript,
  });
}
