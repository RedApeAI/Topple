"use client";

import * as React from "react";
import {
  LoaderCircle,
  Maximize2,
  Minimize2,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMailStore } from "../store/mail.store";
import { generateMailDraft } from "../services/mail.service";
import { errorMessage } from "@/lib/api/client";
import { mailInitials, parseAddressList } from "../lib/mail-format";

interface RecipientFieldProps {
  label: string;
  values: string[];
  draft: string;
  onDraftChange: (value: string) => void;
  onCommit: () => void;
  onRemove: (email: string) => void;
  children?: React.ReactNode;
}

/** Chip-based address field — commits on Enter, comma or blur. */
function RecipientField({
  label,
  values,
  draft,
  onDraftChange,
  onCommit,
  onRemove,
  children,
}: RecipientFieldProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="shrink-0 text-[13px] font-medium text-foreground">
          {label}
        </span>
        {values.map((email) => (
          <span
            key={email}
            className="flex h-7 items-center gap-1.5 rounded-md bg-mail-recipient-surface py-1 pl-1.5 pr-2.5"
          >
            <span className="flex size-[18px] items-center justify-center rounded-[4px] bg-mail-recipient/20 text-[8px] font-semibold text-mail-recipient">
              {mailInitials(email)}
            </span>
            <span className="text-[13px] font-medium text-mail-recipient">
              {email}
            </span>
            <button
              type="button"
              aria-label={`Remove ${email}`}
              onClick={() => onRemove(email)}
              className="text-mail-recipient/70 transition-colors hover:text-mail-recipient"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              onCommit();
            }
          }}
          aria-label={`${label} recipients`}
          placeholder={values.length ? "" : "name@company.com"}
          className="min-w-[140px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
      </div>
      {children}
    </div>
  );
}

export function ComposeDialog() {
  const open = useMailStore((state) => state.composeOpen);
  const initial = useMailStore((state) => state.composeInitial);
  const closeCompose = useMailStore((state) => state.closeCompose);
  const send = useMailStore((state) => state.send);
  const saveDraft = useMailStore((state) => state.saveDraft);

  const [to, setTo] = React.useState<string[]>([]);
  const [cc, setCc] = React.useState<string[]>([]);
  const [bcc, setBcc] = React.useState<string[]>([]);
  const [toDraft, setToDraft] = React.useState("");
  const [ccDraft, setCcDraft] = React.useState("");
  const [bccDraft, setBccDraft] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [files, setFiles] = React.useState<string[]>([]);
  const [showCc, setShowCc] = React.useState(false);
  const [showBcc, setShowBcc] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [aiDrafted, setAiDrafted] = React.useState(false);
  const [drafting, setDrafting] = React.useState(false);
  const [draftError, setDraftError] = React.useState<string | null>(null);

  // Reply / forward seed the composer through the store.
  React.useEffect(() => {
    if (!open) return;
    setTo(parseAddressList(initial?.to ?? ""));
    setCc(parseAddressList(initial?.cc ?? ""));
    setBcc(parseAddressList(initial?.bcc ?? ""));
    setToDraft("");
    setCcDraft("");
    setBccDraft("");
    setSubject(initial?.subject ?? "");
    setBody(initial?.body ?? "");
    setFiles([]);
    setShowCc(!!initial?.cc);
    setShowBcc(!!initial?.bcc);
    setExpanded(false);
    setAiDrafted(false);
    setDrafting(false);
  }, [open, initial]);

  if (!open) return null;

  const commit = (
    draft: string,
    setDraft: (value: string) => void,
    setValues: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    const parsed = parseAddressList(draft);
    if (parsed.length) {
      setValues((current) => [...new Set([...current, ...parsed])]);
    }
    setDraft("");
  };

  const asDraft = () => ({
    to: [...to, ...parseAddressList(toDraft)].join(", "),
    cc: [...cc, ...parseAddressList(ccDraft)].join(", "),
    bcc: [...bcc, ...parseAddressList(bccDraft)].join(", "),
    subject,
    body,
  });

  const bodyEmpty = body.trim().length === 0;
  const canSend = to.length > 0 || parseAddressList(toDraft).length > 0;

  const runAiDraft = async () => {
    setDrafting(true);
    setDraftError(null);
    try {
      const generated = await generateMailDraft({
        to: [...to, ...parseAddressList(toDraft)],
        subject,
      });
      setBody(generated);
      setAiDrafted(true);
    } catch (error) {
      // The agent runs in the orchestrator, which may simply be down. Keep
      // whatever the user had typed and say so, rather than clearing the body.
      setDraftError(errorMessage(error, "The agent couldn't draft that"));
    } finally {
      setDrafting(false);
    }
  };

  return (
    /* Deliberately non-modal: no backdrop, no blur — the list stays usable
       behind the composer, the way a real mail client behaves. The bottom
       offset clears the Operator launcher rather than sitting under it. */
    <div
      role="dialog"
      aria-modal="false"
      aria-label="New message"
      className={cn(
        "absolute z-30 flex flex-col overflow-hidden rounded-xl border border-black/15 bg-card shadow-[0_16px_29px_-9px_rgba(0,0,0,0.16)]",
        expanded
          ? "inset-x-6 top-6 bottom-20 mx-auto w-auto max-w-[1000px]"
          : "bottom-20 right-4 h-[540px] max-h-[calc(100%-6.5rem)] w-[560px] max-w-[calc(100%-2rem)]",
      )}
    >
      <header className="flex h-11 shrink-0 items-center justify-between bg-mail-compose-chrome py-3 pl-5 pr-3">
        <h2 className="text-[14px] font-medium text-foreground">New message</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? "Collapse composer" : "Expand composer"}
            aria-pressed={expanded}
            className="text-foreground/70 transition-colors hover:text-foreground"
          >
            {expanded ? (
              <Minimize2 className="size-4" aria-hidden />
            ) : (
              <Maximize2 className="size-4" aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={closeCompose}
            aria-label="Close composer"
            className="text-foreground/70 transition-colors hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </header>

      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          // Without this a stray Enter in any field reloads the page.
          event.preventDefault();
          if (canSend) send(asDraft());
        }}
      >
        <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-4">
          <div className="flex flex-col gap-2.5">
            <RecipientField
              label="To"
              values={to}
              draft={toDraft}
              onDraftChange={setToDraft}
              onCommit={() => commit(toDraft, setToDraft, setTo)}
              onRemove={(email) =>
                setTo((current) => current.filter((value) => value !== email))
              }
            >
              <div className="flex shrink-0 items-center gap-2.5 text-[13px] font-medium">
                {!showCc && (
                  <button
                    type="button"
                    onClick={() => setShowCc(true)}
                    className="text-foreground transition-colors hover:text-mail-recipient"
                  >
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button
                    type="button"
                    onClick={() => setShowBcc(true)}
                    className="text-foreground transition-colors hover:text-mail-recipient"
                  >
                    Bcc
                  </button>
                )}
              </div>
            </RecipientField>

            {showCc && (
              <RecipientField
                label="Cc"
                values={cc}
                draft={ccDraft}
                onDraftChange={setCcDraft}
                onCommit={() => commit(ccDraft, setCcDraft, setCc)}
                onRemove={(email) =>
                  setCc((current) => current.filter((value) => value !== email))
                }
              />
            )}
            {showBcc && (
              <RecipientField
                label="Bcc"
                values={bcc}
                draft={bccDraft}
                onDraftChange={setBccDraft}
                onCommit={() => commit(bccDraft, setBccDraft, setBcc)}
                onRemove={(email) =>
                  setBcc((current) =>
                    current.filter((value) => value !== email),
                  )
                }
              />
            )}
          </div>

          <hr className="border-t border-border" />

          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject"
            aria-label="Subject"
            className="w-full bg-transparent text-[16px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/60"
          />

          {draftError && (
            <p role="alert" className="text-[12px] text-destructive">
              {draftError}
            </p>
          )}

          {/* Unframed by default; the gradient frame is the AI-drafted state. */}
          <div
            className={cn(
              "flex min-h-[200px] flex-1 flex-col rounded-lg",
              aiDrafted && "surface-ai-gradient p-0.5",
            )}
          >
            <div
              className={cn(
                "relative flex min-h-0 flex-1 flex-col",
                aiDrafted && "rounded-[6px] bg-card",
              )}
            >
              <textarea
                value={body}
                onChange={(event) => {
                  setBody(event.target.value);
                  // Editing an AI draft is still approving it; only clearing
                  // the body puts the composer back to a blank slate.
                  if (aiDrafted && !event.target.value.trim()) {
                    setAiDrafted(false);
                  }
                }}
                placeholder="Write your message…"
                aria-label="Message body"
                className="scrollbar-none min-h-[190px] w-full flex-1 resize-none bg-transparent py-1 text-[13px] leading-[1.5] text-foreground outline-none placeholder:text-muted-foreground"
              />

              {bodyEmpty && (
                <button
                  type="button"
                  onClick={runAiDraft}
                  disabled={drafting}
                  className="absolute bottom-2 left-0 flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] font-medium text-foreground shadow-row transition-colors hover:bg-secondary disabled:opacity-60"
                >
                  {drafting ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="size-4" aria-hidden />
                  )}
                  {drafting ? "Drafting…" : "Draft with AI"}
                </button>
              )}
            </div>
          </div>
        </div>

        {files.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-2 px-5 pb-2">
            {files.map((name, index) => (
              <span
                key={`${name}-${index}`}
                className="flex items-center gap-1.5 rounded-md bg-mail-chip px-2 py-1 text-[12px] text-mail-chip-foreground"
              >
                {name}
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  onClick={() =>
                    setFiles((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-black/10 bg-mail-compose-chrome px-5 py-3">
          <div className="flex items-center gap-1.5">
            <button
              type="submit"
              disabled={!canSend}
              className={cn(
                "flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-medium transition-opacity disabled:opacity-50",
                aiDrafted
                  ? "surface-ai-gradient text-white"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {!aiDrafted && <Send className="size-4" aria-hidden />}
              {aiDrafted ? "Approve & Send" : "Send"}
            </button>

            <label className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-accent">
              <Paperclip className="size-4" aria-hidden />
              Attach a file
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  const names = Array.from(event.target.files ?? []).map(
                    (file) => file.name,
                  );
                  setFiles((current) => [...current, ...names]);
                  event.target.value = "";
                }}
              />
            </label>

            <button
              type="button"
              onClick={() => saveDraft(asDraft())}
              className="h-9 rounded-lg px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
            >
              Save draft
            </button>
          </div>

          <button
            type="button"
            onClick={closeCompose}
            aria-label="Discard draft"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </footer>
      </form>
    </div>
  );
}
