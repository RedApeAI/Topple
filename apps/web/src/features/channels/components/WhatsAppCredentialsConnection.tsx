import { useState, type FormEvent } from "react";
import { KeyRound, Loader2, LockKeyhole, RefreshCw } from "lucide-react";
import { WhatsAppIcon } from "@/components/shared/icons/brand-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/client";
import type { WhatsAppCredentialsInput } from "../services/zernio.service";

interface WhatsAppCredentialsConnectionProps {
  connecting: boolean;
  error?: unknown;
  reconnect?: boolean;
  onConnect: (input: WhatsAppCredentialsInput) => Promise<void>;
  onRetry: () => void;
}

export function WhatsAppCredentialsConnection({
  connecting,
  error,
  reconnect = false,
  onConnect,
  onRetry,
}: WhatsAppCredentialsConnectionProps) {
  const [accessToken, setAccessToken] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [pin, setPin] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await onConnect({
        accessToken: accessToken.trim(),
        wabaId: wabaId.trim(),
        phoneNumberId: phoneNumberId.trim(),
        ...(pin ? { pin } : {}),
      });
      setWabaId("");
      setPhoneNumberId("");
    } finally {
      // Do not retain secrets in component state after an attempted exchange.
      setAccessToken("");
      setPin("");
    }
  };

  return (
    <div className="flex h-full min-h-[560px] items-center justify-center rounded-[10px] bg-muted p-6">
      <div className="w-full max-w-[620px] overflow-hidden rounded-2xl border border-border bg-card shadow-row">
        <div className="border-b border-border-subtle px-6 py-5">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-background shadow-row">
            <WhatsAppIcon className="h-7 w-7" />
          </div>
          <h1 className="font-heading text-[20px] font-semibold tracking-[-0.3px] text-foreground">
            {reconnect ? "Reconnect WhatsApp" : "Connect WhatsApp"}
          </h1>
          <p className="mt-1.5 text-[14px] leading-6 text-muted-foreground">
            Use your Meta Business credentials for a headless, server-to-server
            connection. No popup, redirect, or Facebook JS SDK is required.
          </p>
        </div>

        <form className="space-y-4 px-6 py-5" onSubmit={submit}>
          <div className="rounded-xl bg-muted px-4 py-3.5">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="text-[13px] leading-5 text-muted-foreground">
                <p className="font-medium text-foreground">
                  Before you connect
                </p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                  <li>Create a System User in Meta Business Settings.</li>
                  <li>Assign the WhatsApp Business Account to that user.</li>
                  <li>
                    Generate a permanent token with
                    <code> whatsapp_business_management</code> and
                    <code> whatsapp_business_messaging</code> permissions.
                  </li>
                  <li>
                    Copy the WABA ID and Phone Number ID from WhatsApp Manager.
                  </li>
                </ol>
              </div>
            </div>
          </div>

          <CredentialField
            label="Permanent System User token"
            type="password"
            value={accessToken}
            placeholder="EAAG…"
            autoComplete="off"
            disabled={connecting}
            onChange={setAccessToken}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <CredentialField
              label="WhatsApp Business Account ID"
              value={wabaId}
              placeholder="WABA ID"
              inputMode="numeric"
              disabled={connecting}
              onChange={setWabaId}
            />
            <CredentialField
              label="Phone Number ID"
              value={phoneNumberId}
              placeholder="Phone number ID"
              inputMode="numeric"
              disabled={connecting}
              onChange={setPhoneNumberId}
            />
          </div>
          <CredentialField
            label="Two-step verification PIN (optional)"
            type="password"
            value={pin}
            placeholder="6 digits"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="off"
            required={false}
            disabled={connecting}
            onChange={(value) => setPin(value.replace(/\D/g, "").slice(0, 6))}
          />

          <div className="flex items-start gap-3 rounded-xl border border-border px-4 py-3.5">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-[13px] leading-5 text-muted-foreground">
              RedApeAI sends this token once through the authenticated API to
              Zernio. RedApeAI does not save it in the database or request logs.
            </p>
          </div>

          {error ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
              <p>{errorMessage(error, "Could not connect WhatsApp")}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 inline-flex items-center gap-1 font-medium hover:underline"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Check connection status again
              </button>
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={
              connecting ||
              !accessToken.trim() ||
              !wabaId.trim() ||
              !phoneNumberId.trim() ||
              (pin.length > 0 && pin.length !== 6)
            }
            className="h-10 w-full rounded-lg"
          >
            {connecting ? <Loader2 className="animate-spin" /> : <KeyRound />}
            {connecting
              ? "Connecting securely…"
              : reconnect
                ? "Reconnect WhatsApp"
                : "Connect WhatsApp"}
          </Button>
        </form>
      </div>
    </div>
  );
}

interface CredentialFieldProps {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
  inputMode?: "text" | "numeric";
  pattern?: string;
  maxLength?: number;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
}

function CredentialField({
  label,
  value,
  placeholder,
  onChange,
  type = "text",
  inputMode = "text",
  required = true,
  disabled = false,
  ...inputProps
}: CredentialFieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-foreground">{label}</span>
      <Input
        {...inputProps}
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="h-10"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
