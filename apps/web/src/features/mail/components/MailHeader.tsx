import { ArrowUpRight, CircleQuestionMark, Link2 } from "lucide-react";

/** Account bar above the mailbox — provider identity + connection state. */
export function MailHeader() {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="font-heading text-[23px] leading-none font-medium text-foreground">
          Gmail
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-mail-connected px-2 py-[5px] text-white">
          <Link2 className="size-3" aria-hidden />
          <span className="font-badge text-[11px] leading-none font-bold tracking-[-0.11px]">
            Connected
          </span>
        </span>
      </div>

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
