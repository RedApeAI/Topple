import { useOperatorStore } from "@/store/operator.store";
import type { ChannelKey } from "@/types/channel.types";

export function useOperatorAgent() {
  const messages = useOperatorStore((state) => state.agentMessages);
  const sendCommand = useOperatorStore((state) => state.sendCommand);
  const isPending = useOperatorStore((state) => state.sendPending);
  const error = useOperatorStore((state) => state.sendError);
  const patchActionStatus = useOperatorStore(
    (state) => state.patchActionStatus,
  );
  return {
    messages,
    patchActionStatus,
    send: {
      isPending,
      isError: Boolean(error),
      error,
      mutate: (input: { text: string; channel: ChannelKey }) =>
        void sendCommand(input.text, input.channel),
    },
  };
}
