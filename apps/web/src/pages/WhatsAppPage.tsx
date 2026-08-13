import { useEffect, useState } from "react";
import { MessageCirclePlus, RefreshCw, Unplug } from "lucide-react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { Button } from "@/components/ui/button";
import {
  ChannelConnection,
  ChannelConnectionLoading,
} from "@/features/channels/components/ChannelConnection";
import { WhatsAppIcon } from "@/components/shared/icons/brand-icons";
import { DisconnectChannelDialog } from "@/features/channels/components/DisconnectChannelDialog";
import { NewWhatsAppConversationDialog } from "@/features/channels/components/NewWhatsAppConversationDialog";
import { accountNeedsReconnect } from "@/features/channels/types/messaging.types";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { useChannelStore } from "@/store/channel.store";
import { useInboxStore } from "@/store/inbox.store";

export function WhatsAppPage() {
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const status = useChannelStore((state) => state.status);
  const loading = useChannelStore((state) => state.loading);
  const connecting = useChannelStore((state) => state.connecting);
  const disconnecting = useChannelStore((state) => state.disconnecting);
  const error = useChannelStore((state) => state.error);
  const load = useChannelStore((state) => state.load);
  const connect = useChannelStore((state) => state.connect);
  const reconnect = useChannelStore((state) => state.reconnect);
  const disconnect = useChannelStore((state) => state.disconnect);
  const loadConversations = useInboxStore((state) => state.loadConversations);
  const account = status?.accounts.find(
    (candidate) => candidate.provider === "whatsapp",
  );

  useEffect(() => {
    document.title = "WhatsApp — Plucia";
    void load().catch(() => undefined);
  }, [load]);

  return (
    <DashboardPage breadcrumb={["Dashboard", "WhatsApp"]}>
      {!status && loading ? (
        <ChannelConnectionLoading />
      ) : account?.enabled ? (
        <>
          <InboxScreen
            lockedScope="whatsapp"
            title="WhatsApp"
            toolbarAction={
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setNewConversationOpen(true)}
                >
                  <MessageCirclePlus />
                  New chat
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDisconnectOpen(true)}
                >
                  <Unplug />
                  Disconnect
                </Button>
              </div>
            }
            emptyContent={
              <div className="flex flex-1 flex-col items-center justify-center rounded-2xl bg-background px-6 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366]/12 text-[#128C7E]">
                  <WhatsAppIcon className="h-6 w-6" />
                </div>
                <p className="text-[15px] font-medium text-foreground">
                  Your WhatsApp inbox is ready
                </p>
                <p className="mt-1 max-w-[380px] text-[13px] leading-5 text-muted-foreground">
                  No conversations have reached this connected number yet. Ask a
                  customer to message{" "}
                  {account.username || "your business number"}, or start with an
                  approved WhatsApp template.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setNewConversationOpen(true)}
                  >
                    <MessageCirclePlus />
                    Start conversation
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void loadConversations("whatsapp", true)}
                  >
                    <RefreshCw />
                    Check for messages
                  </Button>
                </div>
              </div>
            }
          />
          <NewWhatsAppConversationDialog
            open={newConversationOpen}
            onOpenChange={setNewConversationOpen}
            accountId={account.id}
            onCreated={() => loadConversations("whatsapp", true)}
          />
          <DisconnectChannelDialog
            open={disconnectOpen}
            onOpenChange={setDisconnectOpen}
            label="WhatsApp"
            accountName={account.displayName ?? account.username}
            disconnecting={disconnecting === account.id}
            error={disconnectOpen ? error : undefined}
            onConfirm={() => {
              void disconnect(account.id)
                .then(() => setDisconnectOpen(false))
                .catch(() => undefined);
            }}
          />
        </>
      ) : (
        <ChannelConnection
          platform="whatsapp"
          label="WhatsApp"
          icon={WhatsAppIcon}
          loading={loading}
          connecting={connecting === "whatsapp"}
          error={error}
          reconnect={Boolean(account && accountNeedsReconnect(account))}
          onConnect={() =>
            void (account ? reconnect(account) : connect("whatsapp")).catch(
              () => undefined,
            )
          }
          onRetry={() => void load(true).catch(() => undefined)}
        />
      )}
    </DashboardPage>
  );
}
