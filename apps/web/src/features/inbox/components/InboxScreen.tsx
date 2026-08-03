"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useConversations } from "../hooks/use-conversations";
import { InboxToolbar } from "./InboxToolbar";
import { InboxList } from "./InboxList";
import { ChatPane } from "./ChatPane";
import type { Conversation, InboxScope } from "../types/conversation.types";
import { useWhatsAppRealtime } from "@/features/channels/hooks/use-whatsapp-realtime";

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
  const {
    data: conversations,
    isLoading,
    isError,
    error,
    retry,
  } = useConversations(scope);
  useWhatsAppRealtime(lockedScope === "whatsapp", active);

  const handleScopeChange = (next: InboxScope) => {
    setScope(next);
    setActive(undefined);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 rounded-[10px] bg-muted p-3">
      <InboxToolbar
        scope={scope}
        onScopeChange={handleScopeChange}
        title={lockedScope ? title : undefined}
        action={toolbarAction}
      />
      <div className="flex min-h-0 flex-1 gap-3">
        <div
          className={cn(
            "flex min-h-0 flex-col",
            active ? "hidden w-[360px] shrink-0 md:flex" : "flex-1",
          )}
        >
          <InboxList
            conversations={conversations}
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
            onClose={() => setActive(undefined)}
          />
        )}
      </div>
    </div>
  );
}
