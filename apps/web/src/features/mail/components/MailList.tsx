"use client";

import * as React from "react";
import { Inbox, Loader2, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useMailStore } from "../store/mail.store";
import { groupByDate } from "../lib/mail-filter";
import { MailRow } from "./MailRow";
import { MailRowMenu, createMailRowMenuHandle } from "./MailRowMenu";
import { errorMessage } from "@/lib/api/client";
import type { MailMessage } from "../types/mail.types";

interface MailListProps {
  messages: MailMessage[];
  loading: boolean;
  error?: unknown;
  onRetry?: () => void;
  focusedId: string | null;
}

function LoadingRows() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 border-b border-mail-line py-3 pl-4 pr-6"
        >
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-3.5 w-[180px]" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-14" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-20 text-center">
      <Inbox className="size-8 text-mail-muted/60" aria-hidden />
      <p className="text-[15px] font-medium text-mail-strong">
        Nothing here yet
      </p>
      <p className="max-w-xs text-[13px] text-mail-muted">
        No messages match this view. Try a different folder or clear the active
        filters.
      </p>
    </div>
  );
}

export function MailList({
  messages,
  loading,
  error,
  onRetry,
  focusedId,
}: MailListProps) {
  const selectedIds = useMailStore((state) => state.selectedIds);
  const nextPageToken = useMailStore((state) => state.nextPageToken);
  const loadingMore = useMailStore((state) => state.loadingMore);
  const loadMore = useMailStore((state) => state.loadMore);
  // One handle for the whole list — see MailRowMenu for why this can't be
  // per-row without reintroducing the two-menus-open / flash-to-origin bugs.
  const menuHandle = React.useMemo(() => createMailRowMenuHandle(), []);

  if (loading) return <LoadingRows />;
  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-20 text-center">
        <p className="text-[15px] font-medium text-mail-strong">
          Couldn&apos;t load Gmail
        </p>
        <p className="max-w-sm text-[13px] text-mail-muted">
          {errorMessage(error, "The mailbox is unavailable right now.")}
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-mail-line px-3 py-2 text-[13px] font-medium text-mail-strong hover:bg-mail-row-hover"
          >
            <RefreshCw className="size-3.5" /> Try again
          </button>
        ) : null}
      </div>
    );
  }
  if (!messages.length) return <EmptyState />;

  return (
    <div className="flex flex-col">
      {groupByDate(messages).map((group) => (
        <section key={group.label}>
          <h3 className="px-4 pb-2 pt-6 text-[13px] font-semibold text-mail-muted">
            {group.label}
          </h3>
          <div className="flex flex-col gap-0.5">
            {group.messages.map((message) => (
              <MailRow
                key={message.id}
                message={message}
                selected={selectedIds.includes(message.id)}
                focused={focusedId === message.id}
                menuHandle={menuHandle}
              />
            ))}
          </div>
        </section>
      ))}
      <MailRowMenu handle={menuHandle} />
      {nextPageToken ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mx-auto my-4 inline-flex items-center gap-2 rounded-lg border border-mail-line px-3 py-2 text-[13px] font-medium text-mail-muted hover:bg-mail-row-hover disabled:opacity-60"
        >
          {loadingMore ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {loadingMore ? "Loading…" : "Load more mail"}
        </button>
      ) : null}
    </div>
  );
}
