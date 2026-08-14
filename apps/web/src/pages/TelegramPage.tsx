import { useEffect } from "react";
import { Send } from "lucide-react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import {
  ChannelConnection,
  ChannelConnectionLoading,
} from "@/features/channels/components/ChannelConnection";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { useChannelStore } from "@/store/channel.store";

export function TelegramPage() {
  const status = useChannelStore((state) => state.status);
  const loading = useChannelStore((state) => state.loading);
  const connecting = useChannelStore((state) => state.connecting);
  const error = useChannelStore((state) => state.error);
  const load = useChannelStore((state) => state.load);
  const connect = useChannelStore((state) => state.connect);
  const reconnect = useChannelStore((state) => state.reconnect);
  const account = status?.accounts.find(
    (candidate) => candidate.provider === "telegram",
  );

  useEffect(() => {
    document.title = "Telegram — Plucia";
    void load().catch(() => undefined);
  }, [load]);

  return (
    <DashboardPage breadcrumb={["Dashboard", "Telegram"]}>
      {!status && loading ? (
        <ChannelConnectionLoading />
      ) : account?.status === "connected" && account.enabled ? (
        <InboxScreen lockedScope="telegram" title="Telegram" />
      ) : (
        <ChannelConnection
          platform="telegram"
          label="Telegram"
          icon={Send}
          loading={loading}
          connecting={connecting === "telegram"}
          error={error}
          reconnect={Boolean(account)}
          onConnect={() =>
            void (account ? reconnect(account) : connect("telegram")).catch(
              () => undefined,
            )
          }
          onRetry={() => void load(true).catch(() => undefined)}
        />
      )}
    </DashboardPage>
  );
}
