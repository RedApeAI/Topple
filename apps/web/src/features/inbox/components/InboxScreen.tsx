"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useConversations } from "../hooks/use-conversations";
import { InboxToolbar } from "./InboxToolbar";
import { InboxList } from "./InboxList";
import { ChatPane } from "./ChatPane";
import type { Conversation, InboxScope } from "../types/conversation.types";

interface InboxScreenProps {
  /** Pin the screen to one channel (channel pages) instead of showing scope tabs. */
  lockedScope?: InboxScope;
  /** Toolbar heading shown in place of the scope tabs when the scope is locked. */
  title?: string;
}

export function InboxScreen({ lockedScope, title }: InboxScreenProps) {
  const [scope, setScope] = React.useState<InboxScope>(lockedScope ?? "all");
  const [active, setActive] = React.useState<Conversation>();
  const { data: conversations, isLoading } = useConversations(scope);

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
            activeId={active?.id}
            onSelect={setActive}
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
