import { useQuery } from "@tanstack/react-query";
import { fetchLeads } from "../services/lead.service";

export function useLeads() {
  return useQuery({
    queryKey: ["leads"],
    queryFn: fetchLeads,
    refetchInterval: 15_000,
  });
}
