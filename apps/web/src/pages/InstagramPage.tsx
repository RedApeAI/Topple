import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw, Unplug } from "lucide-react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { InstagramIcon } from "@/components/shared/icons/brand-icons";
import { Button } from "@/components/ui/button";
import {
  ChannelConnection,
  ChannelConnectionLoading,
} from "@/features/channels/components/ChannelConnection";
import { DisconnectChannelDialog } from "@/features/channels/components/DisconnectChannelDialog";
import { accountNeedsReconnect } from "@/features/channels/types/messaging.types";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { useInboxStore } from "@/store/inbox.store";
import { useChannelStore } from "@/store/channel.store";

export function InstagramPage() {
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const status = useChannelStore((state) => state.status);
  const loading = useChannelStore((state) => state.loading);
  const connecting = useChannelStore((state) => state.connecting);
  const disconnecting = useChannelStore((state) => state.disconnecting);
  const error = useChannelStore((state) => state.error);
  const load = useChannelStore((state) => state.load);
  const connect = useChannelStore((state) => state.connect);
  const reconnect = useChannelStore((state) => state.reconnect);
  const disconnect = useChannelStore((state) => state.disconnect);
  const sync = useChannelStore((state) => state.sync);
  const loadConversations = useInboxStore((state) => state.loadConversations);
  const account = status?.accounts.find(
    (candidate) => candidate.provider === "instagram",
  );
  const canOpenInbox = Boolean(account?.enabled);
  const syncing = account?.status === "syncing";
  const needsReconnect = Boolean(account && accountNeedsReconnect(account));

  const refreshInstagram = async () => {
    if (!account) return;
    await sync(account.id);
    await loadConversations("instagram", true);
  };

  useEffect(() => {
    document.title = "Instagram — Plucia";
    void load().catch(() => undefined);
  }, [load]);

  return (
    <DashboardPage breadcrumb={["Dashboard", "Instagram"]}>
      {!status && loading ? (
        <ChannelConnectionLoading />
      ) : canOpenInbox ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {account?.lastErrorMessage ? (
            <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  Instagram is connected, but conversation sync needs attention.
                </p>
                <p className="mt-0.5 break-words opacity-80">
                  {account.lastErrorMessage}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={syncing}
                onClick={() =>
                  void (
                    needsReconnect && account
                      ? reconnect(account)
                      : refreshInstagram()
                  ).catch(() => undefined)
                }
                className="shrink-0 border-amber-300 bg-transparent text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-950/40"
              >
                <RefreshCw className={syncing ? "animate-spin" : undefined} />
                {needsReconnect
                  ? "Reconnect"
                  : syncing
                    ? "Syncing…"
                    : "Retry sync"}
              </Button>
            </div>
          ) : null}
          <InboxScreen
            lockedScope="instagram"
            title="Instagram"
            toolbarAction={
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={syncing}
                  onClick={() => void refreshInstagram().catch(() => undefined)}
                >
                  <RefreshCw className={syncing ? "animate-spin" : undefined} />
                  {syncing ? "Syncing…" : "Sync"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDisconnectOpen(true)}
                >
                  <Unplug />
                  Disconnect
                </Button>
              </div>
            }
            emptyContent={
              <div className="flex flex-1 flex-col items-center justify-center rounded-2xl bg-background px-6 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-channel-instagram-from/15 via-channel-instagram-via/15 to-channel-instagram-to/20 text-channel-instagram-via">
                  <InstagramIcon className="h-6 w-6" />
                </div>
                <p className="text-[15px] font-medium text-foreground">
                  {syncing
                    ? "Instagram conversations are syncing"
                    : "No Instagram conversations yet"}
                </p>
                <p className="mt-1 max-w-[390px] text-[13px] leading-5 text-muted-foreground">
                  {syncing
                    ? "Your Instagram history will appear here as soon as the provider sync completes."
                    : "Use Sync to fetch existing Instagram conversations. New direct messages will appear here through the connected account."}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-4"
                  disabled={syncing}
                  onClick={() => void refreshInstagram().catch(() => undefined)}
                >
                  <RefreshCw className={syncing ? "animate-spin" : undefined} />
                  {syncing ? "Syncing…" : "Sync Instagram"}
                </Button>
              </div>
            }
          />
          <DisconnectChannelDialog
            open={disconnectOpen}
            onOpenChange={setDisconnectOpen}
            label="Instagram"
            accountName={account?.displayName ?? account?.username}
            disconnecting={disconnecting === account?.id}
            error={disconnectOpen ? error : undefined}
            onConfirm={() => {
              if (!account) return;
              void disconnect(account.id)
                .then(() => setDisconnectOpen(false))
                .catch(() => undefined);
            }}
          />
        </div>
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
