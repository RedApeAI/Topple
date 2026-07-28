import { useMutation, useQueryClient } from "@tanstack/react-query";
import { contactLead } from "../services/contact-lead.service";
import type { LeadChannel } from "../types/lead.types";

export function useContactLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      leadChannel,
      text,
    }: {
      leadChannel: LeadChannel;
      text: string;
    }) => contactLead(leadChannel, text),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["channel-nav"] });
    },
  });
}
