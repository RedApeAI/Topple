import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { errorMessage } from "@/lib/api/client";
import { useChannelStore } from "@/store/channel.store";
import type { ConnectablePlatform } from "@/features/channels/types/zernio.types";
import {
  isOAuthPopup,
  publishOAuthResult,
  type ZernioOAuthResult,
} from "@/features/channels/lib/oauth-popup";

function asPlatform(value: string | null): ConnectablePlatform {
  return value === "linkedin" ? "linkedin" : "whatsapp";
}

export function ZernioCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const refresh = useChannelStore((state) => state.load);
  const [error, setError] = useState<unknown>();
  const platform = useMemo(
    () =>
      asPlatform(searchParams.get("connected") ?? searchParams.get("platform")),
    [searchParams],
  );
  const providerError =
    searchParams.get("error") ?? searchParams.get("message");

  useEffect(() => {
    const finish = (result: Omit<ZernioOAuthResult, "type" | "timestamp">) => {
      publishOAuthResult({
        type: "redape:zernio-oauth",
        timestamp: Date.now(),
        ...result,
      });
    };

    if (providerError) {
      const reason = new Error(providerError);
      setError(reason);
      finish({ platform, success: false, message: reason.message });
      return;
    }

    let active = true;
    void refresh(true)
      .then(() => {
        if (!active) return;
        finish({ platform, success: true });
        if (isOAuthPopup()) {
          window.close();
        } else {
          navigate(`/dashboard/${platform}`, { replace: true });
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        const connectionError =
          reason instanceof Error
            ? reason
            : new Error("Connection verification failed");
        setError(connectionError);
        finish({
          platform,
          success: false,
          message: connectionError.message,
        });
      });
    return () => {
      active = false;
    };
  }, [navigate, platform, providerError, refresh]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-[440px] rounded-2xl border border-border bg-card p-7 text-center shadow-row">
        {error ? (
          <>
            <TriangleAlert className="mx-auto h-8 w-8 text-destructive" />
            <h1 className="mt-4 font-heading text-xl font-semibold text-foreground">
              Connection wasn&apos;t completed
            </h1>
            <p className="mt-2 text-[14px] text-muted-foreground">
              {errorMessage(error)}
            </p>
            <button
              type="button"
              onClick={() =>
                navigate(`/dashboard/${platform}`, { replace: true })
              }
              className="mt-5 rounded-lg bg-primary px-4 py-2 text-[14px] font-medium text-primary-foreground"
            >
              Return to {platform === "linkedin" ? "LinkedIn" : "WhatsApp"}
            </button>
          </>
        ) : (
          <>
            <div className="relative mx-auto h-10 w-10">
              <Check className="absolute inset-0 h-10 w-10 text-success opacity-25" />
              <Loader2 className="absolute inset-1 h-8 w-8 animate-spin text-foreground" />
            </div>
            <h1 className="mt-4 font-heading text-xl font-semibold text-foreground">
              Finishing your connection
            </h1>
            <p className="mt-2 text-[14px] text-muted-foreground">
              Verifying the account with Zernio and bringing you back to
              RedApeAI…
            </p>
          </>
        )}
      </div>
    </main>
  );
}
