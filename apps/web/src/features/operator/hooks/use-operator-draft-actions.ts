import { useOperatorStore } from "@/store/operator.store";

interface MutationOptions {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

export function useOperatorDraftActions() {
  const approveAction = useOperatorStore((state) => state.approve);
  const discardAction = useOperatorStore((state) => state.discard);
  const isPending = useOperatorStore((state) => state.draftPending);
  const wrap = (action: (messageId: string) => Promise<void>) => ({
    isPending,
    mutate: (messageId: string, options?: MutationOptions) => {
      void action(messageId)
        .then(() => options?.onSuccess?.())
        .catch((error: unknown) => options?.onError?.(error));
    },
  });
  return { approve: wrap(approveAction), discard: wrap(discardAction) };
}
