import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw, Unplug } from "lucide-react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { LinkedInIcon } from "@/components/shared/icons/brand-icons";
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

export function LinkedInPage() {
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
  const accounts =
    status?.accounts.filter((account) => account.provider === "linkedin") ?? [];
  const account = accounts[0];
  // Keep the conversation surface available for enabled accounts even when a
  // background provider sync failed. Existing history should remain readable,
  // and the page can explain/retry the sync instead of replacing the inbox
  // with a connection screen.
  const canOpenInbox = Boolean(account?.enabled);
  const syncing = account?.status === "syncing";
  const needsReconnect = Boolean(account && accountNeedsReconnect(account));

  const refreshLinkedIn = async () => {
    if (!account) return;
    await sync(account.id);
    await loadConversations("linkedin", true);
  };

  useEffect(() => {
    document.title = "LinkedIn — Plucia";
    void load().catch(() => undefined);
  }, [load]);

  return (
    <DashboardPage breadcrumb={["Dashboard", "LinkedIn"]}>
      {!status && loading ? (
        <ChannelConnectionLoading />
      ) : canOpenInbox ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {account?.lastErrorMessage ? (
            <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  LinkedIn is connected, but conversation sync needs attention.
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
                      : refreshLinkedIn()
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
            lockedScope="linkedin"
            title="LinkedIn"
            toolbarAction={
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={syncing}
                  onClick={() => void refreshLinkedIn().catch(() => undefined)}
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
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-channel-linkedin/10 text-channel-linkedin">
                  <LinkedInIcon className="h-6 w-6" />
                </div>
                <p className="text-[15px] font-medium text-foreground">
                  {syncing
                    ? "LinkedIn conversations are syncing"
                    : "No LinkedIn conversations yet"}
                </p>
                <p className="mt-1 max-w-[390px] text-[13px] leading-5 text-muted-foreground">
                  {syncing
                    ? "Your LinkedIn history will appear here as soon as the provider sync completes."
                    : "Use Sync to fetch existing LinkedIn conversations, or start a new conversation from the account menu."}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-4"
                  disabled={syncing}
                  onClick={() => void refreshLinkedIn().catch(() => undefined)}
                >
                  <RefreshCw className={syncing ? "animate-spin" : undefined} />
                  {syncing ? "Syncing…" : "Sync LinkedIn"}
                </Button>
              </div>
            }
          />
          <DisconnectChannelDialog
            open={disconnectOpen}
            onOpenChange={setDisconnectOpen}
            label="LinkedIn"
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
          platform="linkedin"
          label="LinkedIn"
          icon={LinkedInIcon}
          loading={loading}
          connecting={connecting === "linkedin"}
          error={error}
          reconnect={Boolean(account)}
          onConnect={() =>
            void (account ? reconnect(account) : connect("linkedin")).catch(
              () => undefined,
            )
          }
          onRetry={() => void load(true).catch(() => undefined)}
        />
      )}
    </DashboardPage>
  );
}
