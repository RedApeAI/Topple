import { useMutation, useQueryClient } from "@tanstack/react-query";
import { importLeads } from "@/lib/api/orchestrator";
import type {
  ApiLeadImportResponse,
  ApiLeadImportRow,
} from "@/lib/api/orchestrator.types";

export function useImportLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rows: ApiLeadImportRow[]) => importLeads(rows),
    onSuccess: (response: ApiLeadImportResponse) => {
      console.log(
        `[leads] import: ${response.created} created, ${response.updated} updated, ${response.skipped} skipped`,
      );
      console.table(response.results);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["channel-nav"] });
    },
    onError: (error) => {
      console.error("[leads] import failed:", error);
    },
  });
}
