"use client";

import * as React from "react";
import { useConversations } from "../hooks/use-conversations";
import { InboxToolbar } from "./InboxToolbar";
import { InboxList } from "./InboxList";
import type { Conversation, InboxScope } from "../types/conversation.types";

export function InboxScreen() {
  const [scope, setScope] = React.useState<InboxScope>("all");
  const [activeId, setActiveId] = React.useState<string>();
  const { data: conversations, isLoading } = useConversations(scope);

  const handleSelect = (conversation: Conversation) =>
    setActiveId(conversation.id);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 rounded-[10px] bg-muted p-3">
      <InboxToolbar scope={scope} onScopeChange={setScope} />
      <InboxList
        conversations={conversations}
        isLoading={isLoading}
        activeId={activeId}
        onSelect={handleSelect}
      />
    </div>
  );
}
