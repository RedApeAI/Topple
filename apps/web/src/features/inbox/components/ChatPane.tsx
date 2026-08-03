"use client";

import * as React from "react";
import {
  ArrowUp,
  ChartColumn,
  Check,
  EllipsisVertical,
  Loader2,
  Paperclip,
  Phone,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ChannelBadge } from "@/components/shared/ChannelBadge";
import { IconButton } from "@/components/shared/IconButton";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/api/client";
import {
  useChatDetail,
  useDraftActions,
  useSendMessage,
} from "../hooks/use-chat";
import type { ChatMessage } from "../types/chat.types";
import type { Conversation } from "../types/conversation.types";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const STAGE_LABELS: Record<string, string> = {
  GREETING: "Greeting",
  QUALIFYING: "Qualifying",
  ANSWERING: "Answering",
  SCHEDULING: "Scheduling",
  HANDOFF: "Handoff",
  CLOSED: "Closed",
};

function stageLabel(stage: string): string {
  return (
    STAGE_LABELS[stage] ??
    stage.charAt(0).toUpperCase() + stage.slice(1).toLowerCase()
  );
}

interface ChatPaneProps {
  conversation: Conversation;
  onClose: () => void;
}

export function ChatPane({ conversation, onClose }: ChatPaneProps) {
  const { data: chat, isLoading, isError } = useChatDetail(conversation);
  const send = useSendMessage(chat);
  const { approve, discard } = useDraftActions(conversation.id);

  return (
    <section
      aria-label={`Conversation with ${conversation.name}`}
      className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <Avatar className="h-[35px] w-[35px] shadow-avatar">
              <AvatarImage src={conversation.avatarUrl} alt="" />
              <AvatarFallback className="text-[12px]">
                {initials(chat?.contactName ?? conversation.name)}
              </AvatarFallback>
            </Avatar>
            <ChannelBadge
              channel={conversation.channel}
              size={18}
              className="absolute -bottom-1 -right-1"
            />
          </div>
          <span className="truncate font-heading text-[16px] font-semibold tracking-[-0.16px] text-foreground">
            {chat?.contactName ?? conversation.name}
          </span>
          {chat && (
            <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
              {stageLabel(chat.stage)}
            </span>
          )}
          {chat?.status === "handed_off" && (
            <span className="shrink-0 rounded-full bg-warning/15 px-2.5 py-1 text-[11px] font-medium text-warning">
              Handed off
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            aria-label="Conversation analytics"
            variant="ghost"
            className="h-8 w-8"
          >
            <ChartColumn className="h-4 w-4" />
          </IconButton>
          <IconButton
            aria-label="Call contact"
            variant="ghost"
            className="h-8 w-8"
          >
            <Phone className="h-4 w-4" />
          </IconButton>
          <IconButton
            aria-label="More options"
            variant="ghost"
            className="h-8 w-8"
          >
            <EllipsisVertical className="h-4 w-4" />
          </IconButton>
          <IconButton
            aria-label="Close conversation"
            variant="ghost"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      </header>

      {isLoading ? (
        <MessagesSkeleton />
      ) : isError || !chat ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
          <p className="text-[14px] font-medium text-foreground">
            Couldn&apos;t open this conversation
          </p>
          <p className="max-w-[360px] text-[13px] text-muted-foreground">
            The messages aren&apos;t available right now. Check the channel
            connection and try again.
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            // WhatsApp threads sit on the classic paper-beige canvas.
            conversation.channel === "whatsapp" &&
              "bg-[#ebe5de] dark:bg-[#1e1b17]",
          )}
        >
          <MessageList
            messages={chat.messages}
            pendingText={send.isPending ? send.variables : undefined}
            pendingOutbound={chat.source === "zernio"}
            onApprove={(id) => approve.mutate(id)}
            onDiscard={(id) => discard.mutate(id)}
            draftBusy={approve.isPending || discard.isPending}
          />
          {send.isError ? (
            <p className="px-4 pb-1 text-[12px] text-destructive" role="alert">
              {errorMessage(send.error, "Message could not be sent")}
            </p>
          ) : null}
          <Composer
            disabled={send.isPending}
            onSend={(text) => send.mutate(text)}
          />
        </div>
      )}
    </section>
  );
}

function MessagesSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-4">
      <Skeleton className="h-12 w-2/3 self-start rounded-[12px]" />
      <Skeleton className="h-12 w-1/2 self-end rounded-[12px]" />
      <Skeleton className="h-12 w-3/5 self-start rounded-[12px]" />
    </div>
  );
}

interface MessageListProps {
  messages: ChatMessage[];
  /** Optimistic echo of the message currently being sent. */
  pendingText?: string;
  pendingOutbound: boolean;
  onApprove: (messageId: string) => void;
  onDiscard: (messageId: string) => void;
  draftBusy: boolean;
}

function MessageList({
  messages,
  pendingText,
  pendingOutbound,
  onApprove,
  onDiscard,
  draftBusy,
}: MessageListProps) {
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const visible = messages.filter((m) => m.status !== "discarded");

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [visible.length, pendingText]);

  return (
    <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      {visible.length === 0 && !pendingText && (
        <p className="m-auto text-[13px] text-muted-foreground">
          No messages in this conversation yet.
        </p>
      )}
      {visible.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onApprove={onApprove}
          onDiscard={onDiscard}
          draftBusy={draftBusy}
        />
      ))}
      {pendingText && (
        <div
          className={cn(
            "flex max-w-[75%] flex-col gap-1",
            pendingOutbound ? "items-end self-end" : "items-start self-start",
          )}
        >
          <div
            className={cn(
              "rounded-[12px] px-3.5 py-2.5 text-[14px] leading-[1.4] text-foreground opacity-70",
              pendingOutbound
                ? "rounded-br-[4px] bg-bubble-outgoing"
                : "rounded-bl-[4px] border border-border/60 bg-bubble-incoming",
            )}
          >
            {pendingText}
          </div>
          <span className="flex items-center gap-1 px-1 text-[12px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {pendingOutbound ? "Sending…" : "Waiting for the agent…"}
          </span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  onApprove: (messageId: string) => void;
  onDiscard: (messageId: string) => void;
  draftBusy: boolean;
}

function MessageBubble({
  message,
  onApprove,
  onDiscard,
  draftBusy,
}: MessageBubbleProps) {
  const inbound = message.direction === "inbound";
  const isDraft = message.status === "draft";
  const suppressed = message.status === "suppressed";
  const failed = message.status === "failed";

  return (
    <div
      className={cn(
        "flex max-w-[75%] flex-col gap-1",
        inbound ? "items-start self-start" : "items-end self-end",
      )}
    >
      <div
        className={cn(
          "rounded-[12px] px-3.5 py-2.5 text-[14px] leading-[1.4] text-foreground",
          inbound
            ? "rounded-bl-[4px] border border-border/60 bg-bubble-incoming"
            : "rounded-br-[4px] bg-bubble-outgoing",
          isDraft &&
            "border border-dashed border-foreground/40 bg-bubble-outgoing/50",
          suppressed && "opacity-50",
          failed && "border border-destructive/40",
        )}
      >
        {message.text}
      </div>
      <span className="flex items-center gap-2 px-1 text-[12px] text-muted-foreground">
        {message.time}
        {isDraft && (
          <>
            <span className="font-medium text-success">Draft</span>
            <button
              type="button"
              disabled={draftBusy}
              onClick={() => onApprove(message.id)}
              className="flex items-center gap-0.5 font-medium text-foreground hover:underline disabled:opacity-50"
            >
              <Check className="h-3 w-3" />
              Approve &amp; send
            </button>
            <button
              type="button"
              disabled={draftBusy}
              onClick={() => onDiscard(message.id)}
              className="flex items-center gap-0.5 font-medium text-destructive hover:underline disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
              Discard
            </button>
          </>
        )}
        {suppressed && <span>Suppressed by guardrails</span>}
        {failed && <span className="text-destructive">Failed</span>}
      </span>
    </div>
  );
}

interface ComposerProps {
  disabled: boolean;
  onSend: (text: string) => void;
}

function Composer({ disabled, onSend }: ComposerProps) {
  const [value, setValue] = React.useState("");

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  };

  return (
    <div className="p-3">
      <div className="flex items-center gap-1 rounded-[14px] border border-border bg-card py-1.5 pl-1.5 pr-1.5">
        <IconButton
          aria-label="Attach a file"
          variant="ghost"
          className="h-8 w-8 shrink-0"
        >
          <Paperclip className="h-4 w-4" />
        </IconButton>
        <IconButton
          aria-label="Insert emoji"
          variant="ghost"
          className="h-8 w-8 shrink-0"
        >
          <Smile className="h-4 w-4" />
        </IconButton>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Type a message or /Plucia let agent chat"
          aria-label="Type a message"
          className="w-full bg-transparent px-1 text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || disabled}
          aria-label="Send message"
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
            value.trim() && !disabled
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground",
          )}
        >
          {disabled ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
