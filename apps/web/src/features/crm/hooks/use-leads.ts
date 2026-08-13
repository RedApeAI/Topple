import { useEffect } from "react";
import { useCrmStore } from "@/store/crm.store";

export function useLeads() {
  const data = useCrmStore((state) => state.leads);
  const isLoading = useCrmStore((state) => state.leadsLoading);
  const error = useCrmStore((state) => state.leadsError);
  const load = useCrmStore((state) => state.loadLeads);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, isLoading, error, retry: () => load(true) };
}
