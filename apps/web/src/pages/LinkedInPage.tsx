import { useEffect } from "react";
import { BadgeCheck, MessageSquareOff } from "lucide-react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { LinkedInIcon } from "@/components/shared/icons/brand-icons";
import {
  ChannelConnection,
  ChannelConnectionLoading,
} from "@/features/channels/components/ChannelConnection";
import { useChannelStore } from "@/store/channel.store";

export function LinkedInPage() {
  const status = useChannelStore((state) => state.status);
  const loading = useChannelStore((state) => state.loading);
  const connecting = useChannelStore((state) => state.connecting);
  const error = useChannelStore((state) => state.error);
  const load = useChannelStore((state) => state.load);
  const connect = useChannelStore((state) => state.connect);
  const account = status?.accounts.find(
    (candidate) => candidate.platform === "linkedin",
  );

  useEffect(() => {
    document.title = "LinkedIn — RedApeAI";
    void load().catch(() => undefined);
  }, [load]);

  return (
    <DashboardPage breadcrumb={["Dashboard", "LinkedIn"]}>
      {!status && loading ? (
        <ChannelConnectionLoading />
      ) : account?.status === "active" ? (
        <div className="flex h-full min-h-[480px] items-center justify-center rounded-[10px] bg-muted p-6">
          <div className="w-full max-w-[560px] rounded-2xl border border-border bg-card p-6 shadow-row">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-background shadow-row">
                <LinkedInIcon className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="truncate font-heading text-[19px] font-semibold text-foreground">
                    {account.displayName ?? account.username ?? "LinkedIn"}
                  </h1>
                  <BadgeCheck className="h-5 w-5 shrink-0 text-success" />
                </div>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Connected through Zernio
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-border bg-muted px-4 py-4">
              <MessageSquareOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-[14px] font-medium text-foreground">
                  LinkedIn messaging is unavailable
                </p>
                <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                  LinkedIn does not provide direct-message access to third-party
                  applications. Your account is connected for supported LinkedIn
                  features, but RedApeAI cannot read or send LinkedIn DMs.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <ChannelConnection
          platform="linkedin"
          label="LinkedIn"
          icon={LinkedInIcon}
          loading={loading}
          connecting={connecting === "linkedin"}
          error={error}
          reconnect={account?.needsReconnection}
          onConnect={() => void connect("linkedin").catch(() => undefined)}
          onRetry={() => void load(true).catch(() => undefined)}
        />
      )}
    </DashboardPage>
  );
}
