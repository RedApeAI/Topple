import * as React from "react";
import { MessageSquareText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { useOperatorStore } from "@/store/operator.store";

interface HistoryProps {
  /** Called once a past chat has been loaded, so the panel can switch views. */
  onOpenChat?: () => void;
}

/**
 * The salesperson's past Operator chats, most recently used first.
 *
 * This list is what makes an earlier conversation reachable at all — the chat
 * itself only ever restored the single most recent thread. The rows come from
 * the BFF already scoped to the signed-in user, so everything shown here is
 * theirs.
 */
export function History({ onOpenChat }: HistoryProps) {
  const chats = useOperatorStore((state) => state.chats);
  const loading = useOperatorStore((state) => state.chatsLoading);
  const activeId = useOperatorStore((state) => state.agentThreadId);
  const loadChats = useOperatorStore((state) => state.loadChats);
  const openChat = useOperatorStore((state) => state.openChat);

  React.useEffect(() => {
    void loadChats();
  }, [loadChats]);

  if (loading && !chats) {
    return (
      <div className="flex flex-col gap-3 px-1 py-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (!chats?.length) {
    return (
      <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
        No past chats yet. Start one and it will show up here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {chats.map((chat) => (
        <button
          key={chat._id}
          type="button"
          onClick={() => {
            void openChat(chat._id).then(() => onOpenChat?.());
          }}
          className={cn(
            "flex w-full items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-left hover:bg-accent",
            chat._id === activeId && "bg-secondary",
          )}
        >
          <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-medium text-foreground">
              {chat.title || "Untitled chat"}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {formatRelativeTime(chat.last_message_at ?? chat.created_at)}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
