import * as React from "react";
import {
  AlertCircle,
  BriefcaseBusiness,
  Camera,
  Link2,
  Loader2,
  MessageCircle,
  MessageCirclePlus,
  RefreshCw,
  Send,
  Sparkles,
  Unplug,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { errorMessage } from "@/lib/api/client";
import { useInboxStore } from "@/store/inbox.store";
import {
  connectMessagingAccount,
  disconnectMessagingAccount,
  fetchMessagingAccounts,
  reconnectMessagingAccount,
  shareMessagingAccount,
  startMessagingConversation,
  syncMessagingAccount,
  type MessagingAccount,
} from "../services/messaging.service";

const channels = [
  ["linkedin", "LinkedIn"],
  ["linkedin_sales_navigator", "Sales Navigator"],
  ["linkedin_recruiter", "Recruiter"],
  ["whatsapp", "WhatsApp"],
  ["instagram", "Instagram"],
  ["telegram", "Telegram"],
] as const;

const channelMeta: Record<
  string,
  { Icon: LucideIcon; iconClass: string; label?: string }
> = {
  linkedin: {
    Icon: BriefcaseBusiness,
    iconClass: "bg-channel-linkedin/10 text-channel-linkedin",
  },
  linkedin_sales_navigator: {
    Icon: BriefcaseBusiness,
    iconClass: "bg-channel-linkedin/10 text-channel-linkedin",
    label: "Sales Navigator",
  },
  linkedin_recruiter: {
    Icon: BriefcaseBusiness,
    iconClass: "bg-channel-linkedin/10 text-channel-linkedin",
    label: "Recruiter",
  },
  whatsapp: {
    Icon: MessageCircle,
    iconClass: "bg-channel-whatsapp/10 text-channel-whatsapp",
  },
  instagram: {
    Icon: Camera,
    iconClass: "surface-instagram-gradient text-white",
  },
  telegram: {
    Icon: Send,
    iconClass: "bg-secondary text-foreground",
  },
};

function getChannelMeta(provider: string) {
  return (
    channelMeta[provider] ?? {
      Icon: MessageCircle,
      iconClass: "bg-secondary text-foreground",
    }
  );
}

function formatProvider(provider: string): string {
  return (
    getChannelMeta(provider).label ??
    provider
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function StatusPill({
  status,
  enabled,
}: {
  status: MessagingAccount["status"];
  enabled: boolean;
}) {
  const connected = enabled && status === "connected";
  const pending = ["connecting", "syncing"].includes(status);
  const label = !enabled ? "Paused" : status;
  return (
    <span
      className={
        connected
          ? "inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-1 text-[10px] font-semibold capitalize text-success"
          : pending
            ? "inline-flex items-center gap-1.5 rounded-full bg-warning/12 px-2 py-1 text-[10px] font-semibold capitalize text-warning"
            : "inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-1 text-[10px] font-semibold capitalize text-destructive"
      }
    >
      <span
        className={
          connected
            ? "h-1.5 w-1.5 rounded-full bg-success"
            : pending
              ? "h-1.5 w-1.5 animate-pulse rounded-full bg-warning"
              : "h-1.5 w-1.5 rounded-full bg-destructive"
        }
      />
      {label}
    </span>
  );
}

function accountName(account: MessagingAccount): string {
  return (
    account.displayName ||
    account.username ||
    account.emailAddress ||
    account.phoneNumber ||
    account.provider
  );
}

function canStartConversation(account: MessagingAccount): boolean {
  return (
    account.enabled &&
    account.status === "connected" &&
    ["linkedin", "whatsapp", "instagram", "telegram"].includes(account.provider)
  );
}

export function MessagingAccountsPanel() {
  const [open, setOpen] = React.useState(false);
  const [newConversationOpen, setNewConversationOpen] = React.useState(false);
  const [accounts, setAccounts] = React.useState<MessagingAccount[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [newAccountId, setNewAccountId] = React.useState("");
  const [participantIds, setParticipantIds] = React.useState("");
  const [firstMessage, setFirstMessage] = React.useState("");
  const [linkedinProduct, setLinkedinProduct] = React.useState<
    "classic" | "sales_navigator" | "recruiter"
  >("classic");
  const [inmail, setInmail] = React.useState(false);
  const [inmailSubject, setInmailSubject] = React.useState("");
  const [inmailSignature, setInmailSignature] = React.useState("");
  const [newConversationError, setNewConversationError] = React.useState<
    string | null
  >(null);
  const [newConversationBusy, setNewConversationBusy] = React.useState(false);
  const refreshInbox = useInboxStore((state) => state.refreshInbox);

  const availableAccounts = React.useMemo(
    () => accounts.filter(canStartConversation),
    [accounts],
  );

  React.useEffect(() => {
    if (
      newConversationOpen &&
      !availableAccounts.some((account) => account.id === newAccountId)
    ) {
      setNewAccountId(availableAccounts[0]?.id ?? "");
    }
    const selected = availableAccounts.find(
      (account) => account.id === newAccountId,
    );
    if (selected?.provider === "linkedin") {
      const accountType = selected.providerAccountType?.toLowerCase() ?? "";
      setLinkedinProduct(
        accountType.includes("recruiter")
          ? "recruiter"
          : accountType.includes("sales")
            ? "sales_navigator"
            : "classic",
      );
    }
  }, [availableAccounts, newAccountId, newConversationOpen]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await fetchMessagingAccounts());
    } catch (cause) {
      setError(errorMessage(cause, "Connected accounts could not be loaded"));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) void load();
  }, [load, open]);

  const connect = async (channel: string) => {
    setBusyId(channel);
    setError(null);
    try {
      window.location.assign(await connectMessagingAccount(channel));
    } catch (cause) {
      setError(errorMessage(cause, "Account connection could not be started"));
      setBusyId(null);
    }
  };

  const disconnect = async (account: MessagingAccount) => {
    setBusyId(account.id);
    setError(null);
    try {
      await disconnectMessagingAccount(account.id);
      await load();
      await refreshInbox();
    } catch (cause) {
      setError(errorMessage(cause, "Account could not be disconnected"));
    } finally {
      setBusyId(null);
    }
  };

  const sync = async (account: MessagingAccount) => {
    setBusyId(account.id);
    setError(null);
    try {
      await syncMessagingAccount(account.id);
      await load();
    } catch (cause) {
      setError(
        errorMessage(cause, "Account synchronization could not be started"),
      );
    } finally {
      setBusyId(null);
    }
  };

  const reconnect = async (account: MessagingAccount) => {
    setBusyId(account.id);
    setError(null);
    try {
      const result = await reconnectMessagingAccount(account.id);
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      await load();
    } catch (cause) {
      setError(
        errorMessage(cause, "Account reconnection could not be started"),
      );
    } finally {
      setBusyId(null);
    }
  };

  const toggleSharing = async (account: MessagingAccount) => {
    setBusyId(account.id);
    setError(null);
    try {
      const updated = await shareMessagingAccount(account.id, !account.shared);
      setAccounts((current) =>
        current.map((candidate) =>
          candidate.id === updated.id ? updated : candidate,
        ),
      );
    } catch (cause) {
      setError(errorMessage(cause, "Account sharing could not be changed"));
    } finally {
      setBusyId(null);
    }
  };

  const createConversation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newConversationBusy) return;
    const ids = participantIds
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (!newAccountId || ids.length === 0 || !firstMessage.trim()) {
      setNewConversationError(
        "Choose an account, add a participant, and write a message",
      );
      return;
    }
    const selectedAccount = availableAccounts.find(
      (account) => account.id === newAccountId,
    );
    setNewConversationBusy(true);
    setNewConversationError(null);
    try {
      await startMessagingConversation({
        accountId: newAccountId,
        participantIds: ids,
        text: firstMessage.trim(),
        ...(selectedAccount?.provider === "linkedin"
          ? {
              linkedinProduct,
              inmail,
              ...(inmailSubject.trim()
                ? { inmailSubject: inmailSubject.trim() }
                : {}),
              ...(inmailSignature.trim()
                ? { inmailSignature: inmailSignature.trim() }
                : {}),
            }
          : {}),
      });
      await refreshInbox();
      setParticipantIds("");
      setFirstMessage("");
      setInmail(false);
      setInmailSubject("");
      setInmailSignature("");
      setNewConversationOpen(false);
    } catch (cause) {
      setNewConversationError(
        errorMessage(cause, "Conversation could not be started"),
      );
    } finally {
      setNewConversationBusy(false);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-2 rounded-lg border-border-subtle bg-card px-3 shadow-sm hover:border-border"
            />
          }
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Link2 className="h-3 w-3" />
          </span>
          <span>Accounts</span>
          {accounts.length > 0 ? (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">
              {accounts.length}
            </span>
          ) : null}
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[390px] overflow-hidden rounded-2xl border-border-subtle p-0 shadow-xl"
        >
          <PopoverHeader className="relative overflow-hidden border-b border-border-subtle bg-gradient-to-br from-secondary/75 via-background to-background px-4 py-4">
            <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-brand-3/10 blur-2xl" />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <PopoverTitle className="text-[14px]">
                    Messaging accounts
                  </PopoverTitle>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    One workspace, every conversation
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Refresh accounts"
                onClick={() => void load()}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <RefreshCw
                  className={
                    loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"
                  }
                />
              </button>
            </div>
            <PopoverDescription className="mt-3 rounded-lg border border-border-subtle bg-card/60 px-3 py-2 text-[11px] leading-relaxed">
              Connect a channel to bring its conversations into the shared
              inbox. Provider login opens in this tab.
            </PopoverDescription>
          </PopoverHeader>
          <div className="max-h-[480px] space-y-3 overflow-y-auto bg-popover p-4">
            {error ? (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>{error}</p>
              </div>
            ) : null}
            {accounts.map((account) => (
              <div
                key={account.id}
                className="rounded-xl border border-border-subtle bg-background/80 p-3.5 shadow-sm transition-all hover:-translate-y-px hover:border-border hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {(() => {
                      const { Icon, iconClass } = getChannelMeta(
                        account.provider,
                      );
                      return (
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                      );
                    })()}
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-foreground">
                        {accountName(account)}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {formatProvider(account.provider)}
                        {account.providerAccountType
                          ? ` · ${account.providerAccountType}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <StatusPill
                    status={account.status}
                    enabled={account.enabled}
                  />
                </div>
                {account.lastErrorMessage ? (
                  <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-destructive/8 px-2.5 py-2 text-[11px] text-destructive">
                    <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                    <p>{account.lastErrorMessage}</p>
                  </div>
                ) : null}
                <div className="mt-3 flex items-center gap-1.5 border-t border-border-subtle pt-2.5">
                  {account.status === "connected" && account.enabled ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busyId === account.id}
                      onClick={() => void sync(account)}
                      className="h-7 px-2 text-[11px]"
                    >
                      {busyId === account.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}{" "}
                      Sync
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busyId === account.id}
                      onClick={() => void reconnect(account)}
                      className="h-7 px-2 text-[11px]"
                    >
                      {busyId === account.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}{" "}
                      Reconnect
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busyId === account.id}
                    onClick={() => void toggleSharing(account)}
                    className="h-7 px-2 text-[11px]"
                  >
                    {account.shared ? "Unshare" : "Share"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busyId === account.id}
                    onClick={() => void disconnect(account)}
                    className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                  >
                    <Unplug className="h-3 w-3" /> Disconnect
                  </Button>
                </div>
              </div>
            ))}
            {!loading && accounts.length === 0 ? (
              <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-muted/45 px-5 py-7 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <p className="mt-3 text-[13px] font-semibold text-foreground">
                  No channels connected
                </p>
                <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-muted-foreground">
                  Choose a provider below to start building your unified inbox.
                </p>
              </div>
            ) : null}
            <div className="rounded-xl border border-border-subtle bg-muted/45 p-3">
              {availableAccounts.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  className="mb-3 h-9 w-full justify-center rounded-lg text-[12px] shadow-sm"
                  onClick={() => {
                    setNewConversationError(null);
                    setNewConversationOpen(true);
                  }}
                >
                  <MessageCirclePlus className="h-3.5 w-3.5" />
                  New conversation
                </Button>
              ) : null}
              <div className="mb-2.5 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Connect a channel
                </p>
                <span className="text-[10px] text-muted-foreground">OAuth</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {channels.map(([channel, label]) => (
                  <Button
                    key={channel}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyId === channel}
                    onClick={() => void connect(channel)}
                    className="h-9 justify-start rounded-lg bg-background text-[12px] shadow-sm"
                  >
                    {busyId === channel ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      (() => {
                        const { Icon, iconClass } = getChannelMeta(channel);
                        return (
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-md ${iconClass}`}
                          >
                            <Icon className="h-3 w-3" />
                          </span>
                        );
                      })()
                    )}
                    <span>{label}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={newConversationOpen} onOpenChange={setNewConversationOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start a messaging conversation</DialogTitle>
            <DialogDescription>
              Use the provider identifier expected by the selected channel. For
              WhatsApp this is usually an international phone number; for
              LinkedIn, Instagram, and Telegram it is the provider participant
              identifier.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => void createConversation(event)}
          >
            <label className="block space-y-1.5 text-[13px] font-medium text-foreground">
              Connected account
              <select
                value={newAccountId}
                onChange={(event) => setNewAccountId(event.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-[13px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                required
              >
                {availableAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountName(account)} · {account.provider}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5 text-[13px] font-medium text-foreground">
              Participant identifier(s)
              <textarea
                value={participantIds}
                onChange={(event) => setParticipantIds(event.target.value)}
                placeholder="One identifier per line"
                rows={3}
                className="w-full resize-none rounded-lg border border-input bg-background px-2.5 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
                required
              />
            </label>
            <label className="block space-y-1.5 text-[13px] font-medium text-foreground">
              First message
              <Input
                value={firstMessage}
                onChange={(event) => setFirstMessage(event.target.value)}
                placeholder="Write the first message"
                required
              />
            </label>
            {availableAccounts.find((account) => account.id === newAccountId)
              ?.provider === "linkedin" ? (
              <div className="space-y-3 rounded-lg border border-border-subtle p-3">
                <label className="block space-y-1.5 text-[13px] font-medium text-foreground">
                  LinkedIn product
                  <select
                    value={linkedinProduct}
                    onChange={(event) =>
                      setLinkedinProduct(
                        event.target.value as
                          | "classic"
                          | "sales_navigator"
                          | "recruiter",
                      )
                    }
                    className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-[13px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                  >
                    <option value="classic">Classic</option>
                    <option value="sales_navigator">Sales Navigator</option>
                    <option value="recruiter">Recruiter</option>
                  </select>
                </label>
                {linkedinProduct === "classic" ? (
                  <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={inmail}
                      onChange={(event) => setInmail(event.target.checked)}
                    />
                    Send as InMail
                  </label>
                ) : null}
                {linkedinProduct !== "classic" ? (
                  <label className="block space-y-1.5 text-[13px] font-medium text-foreground">
                    InMail subject
                    <Input
                      value={inmailSubject}
                      onChange={(event) => setInmailSubject(event.target.value)}
                      placeholder="Subject"
                      required
                    />
                  </label>
                ) : null}
                {linkedinProduct === "recruiter" ? (
                  <label className="block space-y-1.5 text-[13px] font-medium text-foreground">
                    Recruiter signature
                    <Input
                      value={inmailSignature}
                      onChange={(event) =>
                        setInmailSignature(event.target.value)
                      }
                      placeholder="Your name or team signature"
                      required
                    />
                  </label>
                ) : null}
              </div>
            ) : null}
            {newConversationError ? (
              <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                {newConversationError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewConversationOpen(false)}
                disabled={newConversationBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={newConversationBusy}>
                {newConversationBusy ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <MessageCirclePlus />
                )}
                {newConversationBusy ? "Starting…" : "Start conversation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
