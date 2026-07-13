import { Skeleton } from "@/components/ui/skeleton";
import { ConversationListItem } from "./ConversationListItem";
import type { Conversation } from "../types/conversation.types";

interface InboxListProps {
  conversations: Conversation[] | undefined;
  isLoading: boolean;
  activeId?: string;
  onSelect?: (conversation: Conversation) => void;
}

export function InboxList({
  conversations,
  isLoading,
  activeId,
  onSelect,
}: InboxListProps) {
  if (isLoading) {
    return (
      <div className="flex w-full flex-1 flex-col gap-0 overflow-hidden rounded-2xl bg-background">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3.5 border-b border-border-subtle px-2.5 py-3"
          >
            <Skeleton className="h-[35px] w-[35px] shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!conversations || conversations.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl bg-background text-center">
        <p className="text-[14px] font-medium text-foreground">
          No conversations yet
        </p>
        <p className="text-[13px] text-muted-foreground">
          New messages on this channel will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="scrollbar-none flex w-full flex-1 flex-col overflow-y-auto rounded-2xl bg-background">
      {conversations.map((conversation) => (
        <ConversationListItem
          key={conversation.id}
          conversation={conversation}
          active={conversation.id === activeId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
