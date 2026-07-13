import { useQuery } from "@tanstack/react-query";
import {
  fetchOperatorHistory,
  fetchOperatorThreads,
} from "../services/operator.service";

export function useOperatorThreads() {
  return useQuery({
    queryKey: ["operator-threads"],
    queryFn: fetchOperatorThreads,
  });
}

export function useOperatorHistory() {
  return useQuery({
    queryKey: ["operator-history"],
    queryFn: fetchOperatorHistory,
  });
}
