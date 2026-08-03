import { useCrmStore } from "@/store/crm.store";
import type { LeadChannel } from "../types/lead.types";

export function useContactLead() {
  const contact = useCrmStore((state) => state.contact);
  const data = useCrmStore((state) => state.contactResult);
  const isPending = useCrmStore((state) => state.contactPending);
  const error = useCrmStore((state) => state.contactError);
  const reset = useCrmStore((state) => state.resetContact);
  return {
    data,
    isPending,
    isError: Boolean(error),
    error,
    reset,
    mutate: (input: { leadChannel: LeadChannel; text: string }) => {
      void contact(input.leadChannel, input.text).catch(() => undefined);
    },
  };
}
