import { useEffect } from "react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { InstagramIcon } from "@/components/shared/icons/brand-icons";
import {
  ChannelConnection,
  ChannelConnectionLoading,
} from "@/features/channels/components/ChannelConnection";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { useChannelStore } from "@/store/channel.store";

export function InstagramPage() {
  const status = useChannelStore((state) => state.status);
  const loading = useChannelStore((state) => state.loading);
  const connecting = useChannelStore((state) => state.connecting);
  const error = useChannelStore((state) => state.error);
  const load = useChannelStore((state) => state.load);
  const connect = useChannelStore((state) => state.connect);
  const reconnect = useChannelStore((state) => state.reconnect);
  const account = status?.accounts.find(
    (candidate) => candidate.provider === "instagram",
  );

  useEffect(() => {
    document.title = "Instagram — Plucia";
    void load().catch(() => undefined);
  }, [load]);

  return (
    <DashboardPage breadcrumb={["Dashboard", "Instagram"]}>
      {!status && loading ? (
        <ChannelConnectionLoading />
      ) : account?.status === "connected" && account.enabled ? (
        <InboxScreen lockedScope="instagram" title="Instagram" />
      ) : (
        <ChannelConnection
          platform="instagram"
          label="Instagram"
          icon={InstagramIcon}
          loading={loading}
          connecting={connecting === "instagram"}
          error={error}
          reconnect={Boolean(account)}
          onConnect={() =>
            void (account ? reconnect(account) : connect("instagram")).catch(
              () => undefined,
            )
          }
          onRetry={() => void load(true).catch(() => undefined)}
        />
      )}
    </DashboardPage>
  );
}
