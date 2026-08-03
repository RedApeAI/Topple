import { useCrmStore } from "@/store/crm.store";
import type {
  ApiLeadImportResponse,
  ApiLeadImportRow,
} from "@/lib/mock/orchestrator.types";

interface MutationOptions {
  onSuccess?: (response: ApiLeadImportResponse) => void;
  onError?: (error: unknown) => void;
}

export function useImportLeads() {
  const importRows = useCrmStore((state) => state.importRows);
  const isPending = useCrmStore((state) => state.importPending);
  const error = useCrmStore((state) => state.importError);
  const reset = useCrmStore((state) => state.resetImport);

  return {
    isPending,
    isError: Boolean(error),
    error,
    reset,
    mutate: (rows: ApiLeadImportRow[], options?: MutationOptions) => {
      void importRows(rows)
        .then((response) => options?.onSuccess?.(response))
        .catch((error: unknown) => options?.onError?.(error));
    },
  };
}
