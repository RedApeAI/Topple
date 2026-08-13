"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useConversations } from "../hooks/use-conversations";
import { InboxToolbar } from "./InboxToolbar";
import { InboxList } from "./InboxList";
import { ChatPane } from "./ChatPane";
import { useMessagingRealtime } from "../hooks/use-messaging-realtime";
import { MessagingAccountsPanel } from "./MessagingAccountsPanel";
import type { Conversation, InboxScope } from "../types/conversation.types";

interface InboxScreenProps {
  lockedScope?: InboxScope;
  title?: string;
  toolbarAction?: React.ReactNode;
  emptyContent?: React.ReactNode;
}

export function InboxScreen({
  lockedScope,
  title,
  toolbarAction,
  emptyContent,
}: InboxScreenProps) {
  const [scope, setScope] = React.useState<InboxScope>(lockedScope ?? "all");
  const [active, setActive] = React.useState<Conversation>();
  const [search, setSearch] = React.useState("");
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const {
    data: conversations,
    isLoading,
    isError,
    error,
    retry,
  } = useConversations(scope);

  const handleScopeChange = (next: InboxScope) => {
    setScope(next);
    setActive(undefined);
  };
  const handleCloseChat = React.useCallback(() => setActive(undefined), []);

  useMessagingRealtime(active, scope);

  const visibleConversations = conversations?.filter((conversation) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      `${conversation.name} ${conversation.preview} ${conversation.accountLabel ?? ""}`
        .toLowerCase()
        .includes(query);
    return matchesSearch && (!unreadOnly || conversation.unread);
  });

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 rounded-[18px] border border-border-subtle bg-muted/75 p-3 shadow-sm">
      <InboxToolbar
        scope={scope}
        onScopeChange={handleScopeChange}
        title={lockedScope ? title : undefined}
        search={search}
        onSearchChange={setSearch}
        unreadOnly={unreadOnly}
        onUnreadOnlyChange={setUnreadOnly}
        action={
          <div className="flex items-center gap-2">
            {toolbarAction}
            <MessagingAccountsPanel />
          </div>
        }
      />
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden rounded-2xl border border-border-subtle bg-background/35 p-1.5">
        <div
          className={cn(
            "flex min-h-0 flex-col",
            active ? "hidden w-[360px] shrink-0 md:flex" : "flex-1",
          )}
        >
          <InboxList
            conversations={visibleConversations}
            isLoading={isLoading}
            error={isError ? error : undefined}
            onRetry={() => void retry().catch(() => undefined)}
            activeId={active?.id}
            onSelect={setActive}
            emptyContent={emptyContent}
          />
        </div>
        {active && (
          <ChatPane
            key={active.id}
            conversation={active}
            onClose={handleCloseChat}
          />
        )}
      </div>
    </div>
  );
}
