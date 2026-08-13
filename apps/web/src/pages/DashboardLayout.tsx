import { useEffect } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { Outlet, useSearchParams } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { useChannelStore } from "@/store/channel.store";

export function DashboardLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const loadMessagingAccounts = useChannelStore((state) => state.load);
  const messagingStatus = searchParams.get("messaging");
  const channel = searchParams.get("channel");
  const callbackMessage = searchParams.get("messagingMessage");
  const showCallbackNotice = ["connected", "error"].includes(
    messagingStatus ?? "",
  );

  // Connected accounts belong to the signed-in organization and are restored
  // from the API whenever the authenticated dashboard mounts. Provider auth is
  // persistent; users should only see Hosted Auth again after a real expiry or
  // an explicit disconnect.
  useEffect(() => {
    void loadMessagingAccounts(true).catch(() => undefined);
  }, [loadMessagingAccounts]);

  const dismissCallbackNotice = () => {
    const next = new URLSearchParams(searchParams);
    for (const key of [
      "messaging",
      "messagingCode",
      "messagingMessage",
      "channel",
      "accountId",
    ])
      next.delete(key);
    setSearchParams(next, { replace: true });
  };

  return (
    <AppShell>
      {showCallbackNotice ? (
        <div
          className={`mx-5 mt-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px] shadow-sm ${
            messagingStatus === "connected"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-destructive/20 bg-destructive/10 text-destructive"
          }`}
          role={messagingStatus === "error" ? "alert" : "status"}
        >
          {messagingStatus === "connected" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {messagingStatus === "connected"
                ? `${channel ? `${channel[0]?.toUpperCase()}${channel.slice(1)}` : "Messaging account"} connected`
                : "Account connection was not completed"}
            </p>
            <p className="mt-0.5 opacity-80">
              {messagingStatus === "connected"
                ? "Your conversations are syncing and will appear here automatically."
                : callbackMessage ||
                  "The provider rejected the connection. Please try again."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss connection status"
            onClick={dismissCallbackNotice}
            className="rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      <Outlet />
    </AppShell>
  );
}
