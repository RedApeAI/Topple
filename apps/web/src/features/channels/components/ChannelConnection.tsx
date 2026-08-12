import { ExternalLink, Loader2, LockKeyhole, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
import type { ConnectableChannel } from "../types/messaging.types";

interface ChannelConnectionProps {
  platform: ConnectableChannel;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  connecting: boolean;
  preparing?: boolean;
  error?: unknown;
  reconnect?: boolean;
  onConnect: () => void;
  onRetry: () => void;
}

export function ChannelConnection({
  platform,
  label,
  icon: Icon,
  loading,
  connecting,
  preparing = false,
  error,
  reconnect = false,
  onConnect,
  onRetry,
}: ChannelConnectionProps) {
  return (
    <div className="flex h-full min-h-[480px] items-center justify-center rounded-[10px] bg-muted p-6">
      <div className="w-full max-w-[520px] overflow-hidden rounded-2xl border border-border bg-card shadow-row">
        <div className="border-b border-border-subtle px-6 py-5">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-background shadow-row">
            <Icon className="h-7 w-7" />
          </div>
          <h1 className="font-heading text-[20px] font-semibold tracking-[-0.3px] text-foreground">
            {reconnect ? `Reconnect ${label}` : `Connect ${label}`}
          </h1>
          <p className="mt-1.5 text-[14px] leading-6 text-muted-foreground">
            {platform === "whatsapp"
              ? "Connect your WhatsApp Business account to read customer conversations and reply from Plucia."
              : platform.startsWith("linkedin")
                ? "Connect your LinkedIn account to read and reply to conversations from Plucia."
                : `Connect your ${label} account to read and reply to conversations from Plucia.`}
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="flex items-start gap-3 rounded-xl bg-muted px-4 py-3.5">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-[13px] leading-5 text-muted-foreground">
              {platform === "whatsapp"
                ? "The provider's secure hosted signup opens outside Plucia. Plucia never receives your account password."
                : "Authorization opens on the provider's secure hosted page. Plucia never receives your account password."}
            </p>
          </div>

          {error ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
              <p>{errorMessage(error, `Could not connect ${label}`)}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 inline-flex items-center gap-1 font-medium hover:underline"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Try status check again
              </button>
            </div>
          ) : null}

          <Button
            type="button"
            onClick={onConnect}
            disabled={loading || connecting || preparing}
            className="h-10 w-full rounded-lg"
          >
            {connecting || preparing ? (
              <Loader2 className="animate-spin" />
            ) : platform === "whatsapp" ? (
              <LockKeyhole />
            ) : (
              <ExternalLink />
            )}
            {preparing
              ? "Preparing secure signup…"
              : connecting
                ? "Waiting for provider authorization…"
                : reconnect
                  ? `Reconnect ${label}`
                  : `Continue with ${label}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ChannelConnectionLoading() {
  return (
    <div className="flex h-full min-h-[480px] items-center justify-center rounded-[10px] bg-muted">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
