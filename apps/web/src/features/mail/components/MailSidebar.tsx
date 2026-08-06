"use client";

import * as React from "react";
import {
  Bell,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock,
  FileText,
  Mail,
  Plus,
  Send,
  Star,
  Trash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMailStore } from "../store/mail.store";
import { countFor } from "../lib/mail-filter";
import type { MailFilter, MailView } from "../types/mail.types";

interface ViewRow {
  view: MailView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Sent / Done / Trash / Spam carry no count in the design. */
  showCount: boolean;
}

const VIEW_ROWS: ViewRow[] = [
  { view: "all", label: "All", icon: Mail, showCount: true },
  { view: "starred", label: "Starred", icon: Star, showCount: true },
  { view: "reminders", label: "Reminders", icon: Bell, showCount: true },
  { view: "scheduled", label: "Scheduled", icon: Clock, showCount: true },
  { view: "drafts", label: "Drafts", icon: FileText, showCount: true },
  { view: "sent", label: "Sent", icon: Send, showCount: false },
  { view: "done", label: "Done", icon: CircleCheck, showCount: false },
  { view: "trash", label: "Trash", icon: Trash, showCount: false },
  { view: "spam", label: "Spam", icon: CircleAlert, showCount: false },
];

function isActive(filter: MailFilter, candidate: MailFilter): boolean {
  return filter.kind === candidate.kind && filter.value === candidate.value;
}

function AddLabelPopover() {
  const addLabel = useMailStore((state) => state.addLabel);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    addLabel(trimmed);
    setName("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-mail-rail-active">
        <span className="text-[14px] font-medium text-muted-foreground">
          Add label
        </span>
        <Plus className="size-3.5 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60">
        <form onSubmit={submit} className="flex flex-col gap-2">
          <label
            htmlFor="mail-new-label"
            className="text-[12px] font-medium text-muted-foreground"
          >
            New label
          </label>
          <Input
            id="mail-new-label"
            value={name}
            autoFocus
            placeholder="e.g. Investors"
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" size="sm" className="self-end">
            Create
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function MailSidebar() {
  const messages = useMailStore((state) => state.messages);
  const labels = useMailStore((state) => state.labels);
  const filter = useMailStore((state) => state.filter);
  const setFilter = useMailStore((state) => state.setFilter);
  const openCompose = useMailStore((state) => state.openCompose);
  const [mailOpen, setMailOpen] = React.useState(true);

  return (
    <aside className="flex w-[220px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-mail-rail p-3 xl:w-[260px]">
      <button
        type="button"
        onClick={() => openCompose()}
        className="surface-primary-gradient flex w-full items-center justify-center gap-1 rounded-lg py-2.5 pl-3 pr-4 text-[15px] font-medium text-white transition-transform active:translate-y-px"
      >
        <Plus className="size-5" aria-hidden />
        Compose mail
      </button>

      <div className="flex flex-col gap-0.5">
        {labels.map((label) => {
          const candidate: MailFilter = { kind: "label", value: label };
          const active = isActive(filter, candidate);
          return (
            <button
              key={label}
              type="button"
              onClick={() => setFilter(candidate)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-mail-rail-active",
                active && "bg-mail-rail-active",
              )}
            >
              <span
                className={cn(
                  "text-[14px] text-foreground",
                  active && "font-semibold",
                )}
              >
                {label}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {countFor(messages, candidate)}
              </span>
            </button>
          );
        })}
        <AddLabelPopover />
      </div>

      <hr className="border-t border-border" />

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setMailOpen((open) => !open)}
          aria-expanded={mailOpen}
          className="flex items-center justify-between px-3 py-1.5"
        >
          <span className="text-[12px] font-semibold uppercase text-muted-foreground/70">
            Mail
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 text-muted-foreground/70 transition-transform",
              !mailOpen && "-rotate-90",
            )}
            aria-hidden
          />
        </button>

        {mailOpen && (
          <div className="flex flex-col gap-0.5">
            {VIEW_ROWS.map(({ view, label, icon: Icon, showCount }) => {
              const candidate: MailFilter = { kind: "view", value: view };
              const active = isActive(filter, candidate);
              return (
                <button
                  key={view}
                  type="button"
                  onClick={() => setFilter(candidate)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-mail-rail-active",
                    active && "bg-mail-rail-active",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Icon
                      className={cn(
                        "size-[18px]",
                        active ? "text-foreground" : "text-muted-foreground",
                      )}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "text-[14px]",
                        active
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {label}
                    </span>
                  </span>
                  {showCount && (
                    <span
                      className={cn(
                        "text-[13px] text-muted-foreground",
                        active && "font-medium",
                      )}
                    >
                      {countFor(messages, candidate)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
