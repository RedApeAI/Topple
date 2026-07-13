import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChannelBadge } from "@/components/shared/ChannelBadge";
import { cn } from "@/lib/utils";
import type { Conversation } from "../types/conversation.types";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface ConversationListItemProps {
  conversation: Conversation;
  active?: boolean;
  onSelect?: (conversation: Conversation) => void;
}

export function ConversationListItem({
  conversation,
  active,
  onSelect,
}: ConversationListItemProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(conversation)}
      aria-label={`Open conversation with ${conversation.name} on ${conversation.channel}`}
      className={cn(
        "flex w-full items-center gap-3.5 border-b border-border-subtle px-2.5 py-3 text-left transition-colors hover:bg-accent",
        active && "bg-accent",
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="h-[35px] w-[35px] shadow-avatar">
          <AvatarImage src={conversation.avatarUrl} alt={conversation.name} />
          <AvatarFallback className="text-[12px]">
            {initials(conversation.name)}
          </AvatarFallback>
        </Avatar>
        <ChannelBadge
          channel={conversation.channel}
          size={18}
          className="absolute -bottom-1 -right-1"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex w-full items-center justify-between gap-2">
          <span className="truncate font-heading text-[16px] leading-none tracking-[-0.16px] text-foreground">
            {conversation.name}
          </span>
          <span className="shrink-0 text-[12px] tracking-[-0.6px] text-muted-foreground/70">
            {conversation.timestamp}
          </span>
        </div>
        <p className="truncate text-[14px] leading-[1.3] tracking-[-0.7px] text-muted-foreground/80">
          {conversation.preview}
        </p>
      </div>
    </button>
  );
}
