import { useEffect } from "react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { LinkedInIcon } from "@/components/shared/icons/brand-icons";
import {
  ChannelConnection,
  ChannelConnectionLoading,
} from "@/features/channels/components/ChannelConnection";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { useChannelStore } from "@/store/channel.store";

export function LinkedInPage() {
  const status = useChannelStore((state) => state.status);
  const loading = useChannelStore((state) => state.loading);
  const connecting = useChannelStore((state) => state.connecting);
  const error = useChannelStore((state) => state.error);
  const load = useChannelStore((state) => state.load);
  const connect = useChannelStore((state) => state.connect);
  const reconnect = useChannelStore((state) => state.reconnect);
  const accounts =
    status?.accounts.filter((account) => account.provider === "linkedin") ?? [];
  const connected = accounts.some(
    (account) => account.enabled && account.status === "connected",
  );

  useEffect(() => {
    document.title = "LinkedIn — Plucia";
    void load().catch(() => undefined);
  }, [load]);

  return (
    <DashboardPage breadcrumb={["Dashboard", "LinkedIn"]}>
      {!status && loading ? (
        <ChannelConnectionLoading />
      ) : connected ? (
        <InboxScreen lockedScope="linkedin" title="LinkedIn" />
      ) : (
        <ChannelConnection
          platform="linkedin"
          label="LinkedIn"
          icon={LinkedInIcon}
          loading={loading}
          connecting={connecting === "linkedin"}
          error={error}
          reconnect={accounts.some((account) => account.status !== "connected")}
          onConnect={() =>
            void (
              accounts[0] ? reconnect(accounts[0]) : connect("linkedin")
            ).catch(() => undefined)
          }
          onRetry={() => void load(true).catch(() => undefined)}
        />
      )}
    </DashboardPage>
  );
}
