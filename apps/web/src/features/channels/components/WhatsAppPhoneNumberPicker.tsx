import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Loader2,
  MessageCircle,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/shared/icons/brand-icons";
import { errorMessage } from "@/lib/api/client";
import {
  listWhatsAppPhoneNumbers,
  selectWhatsAppPhoneNumber,
} from "../services/zernio.service";
import type { WhatsAppPhoneNumber } from "../types/zernio.types";

interface WhatsAppPhoneNumberPickerProps {
  tempToken: string;
  onComplete: () => void;
}

export function WhatsAppPhoneNumberPicker({
  tempToken,
  onComplete,
}: WhatsAppPhoneNumberPickerProps) {
  const [numbers, setNumbers] = useState<WhatsAppPhoneNumber[]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [selectedId, setSelectedId] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    setError(undefined);
    listWhatsAppPhoneNumbers(tempToken)
      .then(setNumbers)
      .catch((reason: unknown) => setError(reason))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // Load once; the tempToken is single-use so retries are manual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = async () => {
    const chosen = numbers?.find((number) => number.id === selectedId);
    if (!chosen) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await selectWhatsAppPhoneNumber({
        tempToken,
        phoneNumberId: chosen.id,
        wabaId: chosen.wabaId,
      });
      onComplete();
    } catch (reason: unknown) {
      setError(reason);
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-[440px] rounded-2xl border border-border bg-card p-7 text-center shadow-row">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-background shadow-row">
        <WhatsAppIcon className="h-7 w-7" />
      </div>
      <h1 className="font-heading text-xl font-semibold text-foreground">
        Choose your WhatsApp number
      </h1>
      <p className="mt-2 text-[14px] leading-6 text-muted-foreground">
        Your Meta account has more than one business phone number. Pick the one
        you want Plucia to use.
      </p>

      {error ? (
        <div className="mt-5 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
          <p>{errorMessage(error, "Could not complete this request")}</p>
          <button
            type="button"
            onClick={load}
            className="mt-2 inline-flex items-center gap-1 font-medium hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className="mt-8 flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-[13px]">Finding your phone numbers…</p>
        </div>
      ) : numbers && numbers.length > 0 ? (
        <div className="mt-5 space-y-2 text-left">
          {numbers.map((number) => (
            <button
              key={number.id}
              type="button"
              onClick={() => setSelectedId(number.id)}
              disabled={submitting}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                selectedId === number.id
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background hover:border-muted-foreground/40"
              }`}
            >
              <MessageCircle className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-foreground">
                  {number.display_phone_number}
                </span>
                <span className="block truncate text-[13px] text-muted-foreground">
                  {number.verified_name} · {number.wabaName}
                </span>
              </span>
              {selectedId === number.id ? (
                <BadgeCheck className="h-5 w-5 shrink-0 text-primary" />
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-border bg-muted px-4 py-3.5 text-left">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-[13px] leading-5 text-muted-foreground">
            No phone numbers were returned. If the number is still verifying
            with Meta, wait a moment and check again.
          </p>
        </div>
      )}

      {!error && !loading && numbers && numbers.length > 0 ? (
        <Button
          type="button"
          onClick={() => void confirm()}
          disabled={!selectedId || submitting}
          className="mt-5 h-10 w-full rounded-lg"
        >
          {submitting ? <Loader2 className="animate-spin" /> : <BadgeCheck />}
          {submitting ? "Connecting WhatsApp…" : "Connect this number"}
        </Button>
      ) : null}
    </div>
  );
}
