import { ArrowUpRight, CircleQuestionMark, Link2 } from "lucide-react";
import { useMailStore } from "../store/mail.store";
import { linkGoogleAccount } from "@/features/settings/services/settings.service";
import { errorMessage } from "@/lib/api/client";
import { useState } from "react";

/** Account bar above the mailbox — provider identity + connection state. */
export function MailHeader() {
  const status = useMailStore((state) => state.status);
  const account = useMailStore((state) => state.account);
  const connected = status === "ready";
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string>();

  const linkGoogle = async () => {
    setLinking(true);
    setLinkError(undefined);
    try {
      window.location.assign(await linkGoogleAccount());
    } catch (cause) {
      setLinkError(
        errorMessage(cause, "Google account linking could not be started"),
      );
      setLinking(false);
    }
  };
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="font-heading text-[23px] leading-none font-medium text-foreground">
          Gmail
        </span>
        <span
          className={`flex items-center gap-1.5 rounded-full px-2 py-[5px] text-white ${connected ? "bg-mail-connected" : "bg-muted-foreground"}`}
        >
          <Link2 className="size-3" aria-hidden />
          <span className="font-badge text-[11px] leading-none font-bold tracking-[-0.11px]">
            {status === "loading"
              ? "Connecting…"
              : connected
                ? "Connected"
                : "Not connected"}
          </span>
        </span>
        {account ? (
          <span className="text-[12px] text-mail-muted">{account.email}</span>
        ) : null}
        {!connected ? (
          <button
            type="button"
            onClick={() => void linkGoogle()}
            disabled={linking}
            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-mail-row-hover disabled:opacity-60"
          >
            {linking ? "Opening…" : "Connect Google"}
          </button>
        ) : null}
      </div>
      {linkError ? (
        <span className="text-[12px] text-destructive">{linkError}</span>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Mail help"
          className="flex size-7 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent"
        >
          <CircleQuestionMark className="size-3.5" aria-hidden />
        </button>
        <a
          href="https://support.google.com/mail"
          target="_blank"
          rel="noreferrer"
          className="flex h-7 items-center gap-1 rounded-full bg-secondary pl-3 pr-2 text-[12px] text-foreground transition-colors hover:bg-accent"
        >
          Docs
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}
