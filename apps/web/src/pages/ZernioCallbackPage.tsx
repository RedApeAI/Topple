import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { errorMessage } from "@/lib/api/client";
import { useChannelStore } from "@/store/channel.store";
import { WhatsAppPhoneNumberPicker } from "@/features/channels/components/WhatsAppPhoneNumberPicker";
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

  const finish = (result: Omit<ZernioOAuthResult, "type" | "timestamp">) => {
    publishOAuthResult({
      type: "plucia:zernio-oauth",
      timestamp: Date.now(),
      ...result,
    });
  };

  const complete = () => {
    finish({ platform, success: true });
    if (isOAuthPopup()) {
      window.close();
    } else {
      navigate(`/dashboard/${platform}`, { replace: true });
    }
  };

  const fail = (reason: unknown) => {
    const message =
      reason instanceof Error ? reason.message : "Connection was not completed";
    setError(reason);
    finish({ platform, success: false, message });
  };

  // Headless Embedded Signup for WhatsApp: when the connected WABA has more
  // than one phone number, Zernio redirects here with step=select_phone_number
  // and a single-use tempToken so Plucia can host the number picker.
  const needsPhoneSelection =
    platform === "whatsapp" &&
    searchParams.get("step") === "select_phone_number" &&
    Boolean(searchParams.get("tempToken"));

  useEffect(() => {
    if (providerError) {
      fail(new Error(providerError));
      return;
    }
    if (needsPhoneSelection) return;

    let active = true;
    void refresh(true)
      .then(() => {
        if (!active) return;
        complete();
      })
      .catch((reason: unknown) => {
        if (!active) return;
        fail(reason);
      });
    return () => {
      active = false;
    };
    // Runs once per page load; the picker drives its own completion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const returnLabel = platform === "linkedin" ? "LinkedIn" : "WhatsApp";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      {needsPhoneSelection ? (
        <WhatsAppPhoneNumberPicker
          tempToken={searchParams.get("tempToken") ?? ""}
          onComplete={complete}
        />
      ) : (
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
                Return to {returnLabel}
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
                Plucia…
              </p>
            </>
          )}
        </div>
      )}
    </main>
  );
}
