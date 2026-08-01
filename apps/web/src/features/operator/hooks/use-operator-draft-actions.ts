import { useMutation, useQueryClient } from "@tanstack/react-query";
// Missing integration module: @/lib/api/orchestrator
// import { approveDraft, discardDraft } from "@/lib/api/orchestrator";
import { approveDraft, discardDraft } from "@/lib/mock/orchestrator";

/** Approve (dispatch) or discard a co-pilot draft from the Operator panel. */
export function useOperatorDraftActions() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["operator-transcript"] });
    queryClient.invalidateQueries({ queryKey: ["operator-threads"] });
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    queryClient.invalidateQueries({ queryKey: ["channel-nav"] });
  };
  const approve = useMutation({
    mutationFn: (messageId: string) => approveDraft(messageId),
    onSettled: invalidate,
  });
  const discard = useMutation({
    mutationFn: (messageId: string) => discardDraft(messageId),
    onSettled: invalidate,
  });
  return { approve, discard };
}
