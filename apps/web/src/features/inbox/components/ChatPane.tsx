"use client";

import * as React from "react";
import {
  Archive,
  ArrowUp,
  ChartColumn,
  Check,
  EllipsisVertical,
  Inbox,
  Loader2,
  Paperclip,
  Phone,
  Sparkles,
  Tag,
  UserRound,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ChannelBadge } from "@/components/shared/ChannelBadge";
import { IconButton } from "@/components/shared/IconButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/api/client";
import { useAuthStore } from "@/store/auth.store";
import { useInboxStore } from "@/store/inbox.store";
import {
  useChatDetail,
  useDraftActions,
  useSendMessage,
} from "../hooks/use-chat";
import type { ChatMessage } from "../types/chat.types";
import type { Conversation } from "../types/conversation.types";
import {
  addMessagingThreadLabel,
  archiveMessagingThread,
  dismissMessagingAiArtifact,
  assignMessagingThread,
  fetchMessagingAiArtifacts,
  requestMessagingAiArtifact,
  markMessagingThreadUnread,
  requestMessagingAiDraft,
  removeMessagingThreadLabel,
  retryMessagingMessage,
  uploadMessagingAttachment,
  type MessagingAiArtifact,
  type MessagingAiArtifactType,
} from "../services/messaging.service";

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

function messagingAttachmentUrl(id: string): string {
  const base =
    (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
    "";
  return `${base}/api/v1/messaging/attachments/${encodeURIComponent(id)}`;
}

interface ChatPaneProps {
  conversation: Conversation;
  onClose: () => void;
}

export const ChatPane = React.memo(function ChatPane({
  conversation,
  onClose,
}: ChatPaneProps) {
  const { data: chat, isLoading, isError } = useChatDetail(conversation);
  const send = useSendMessage(chat);
  const { approve, discard } = useDraftActions(conversation.id);
  const currentUser = useAuthStore((state) => state.user);
  const refreshInbox = useInboxStore((state) => state.refreshInbox);
  const loadChat = useInboxStore((state) => state.loadChat);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | undefined>();
  const [aiDraft, setAiDraft] = React.useState<string | undefined>();
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | undefined>();
  const [aiArtifacts, setAiArtifacts] = React.useState<MessagingAiArtifact[]>(
    [],
  );
  const [insightsOpen, setInsightsOpen] = React.useState(false);
  const [insightBusy, setInsightBusy] = React.useState<
    MessagingAiArtifactType | undefined
  >();

  React.useEffect(() => {
    if (!chat || chat.source !== "messaging") {
      setAiArtifacts([]);
      return;
    }
    void fetchMessagingAiArtifacts(chat.id)
      .then(setAiArtifacts)
      .catch(() => setAiArtifacts([]));
  }, [chat]);

  const requestDraft = async () => {
    if (!chat || chat.source !== "messaging" || aiBusy) return;
    setAiBusy(true);
    setAiError(undefined);
    try {
      const requested = await requestMessagingAiDraft(chat.id);
      let artifact = requested;
      for (
        let attempt = 0;
        attempt < 12 &&
        artifact.status !== "ready" &&
        artifact.status !== "failed";
        attempt += 1
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        const artifacts = await fetchMessagingAiArtifacts(chat.id);
        artifact =
          artifacts.find((item) => item.id === requested.id) ?? artifact;
      }
      const draft =
        typeof artifact.content.draft === "string"
          ? artifact.content.draft
          : undefined;
      if (artifact.status !== "ready" || !draft)
        throw new Error(artifact.errorMessage ?? "AI draft is not available");
      setAiDraft(draft);
    } catch (cause) {
      setAiError(errorMessage(cause, "AI draft could not be generated"));
    } finally {
      setAiBusy(false);
    }
  };

  const runThreadAction = async (
    action: () => Promise<void>,
    close = false,
  ) => {
    setActionBusy(true);
    setActionError(undefined);
    try {
      await action();
      await refreshInbox();
      if (chat?.source === "messaging") {
        await loadChat(conversation, true);
      }
      if (close) onClose();
    } catch (cause) {
      setActionError(
        errorMessage(cause, "Conversation action could not be completed"),
      );
    } finally {
      setActionBusy(false);
    }
  };

  const requestInsight = async (artifactType: MessagingAiArtifactType) => {
    if (!chat || chat.source !== "messaging" || insightBusy) return;
    setInsightBusy(artifactType);
    setAiError(undefined);
    try {
      const requested = await requestMessagingAiArtifact(chat.id, artifactType);
      let artifact = requested;
      for (
        let attempt = 0;
        attempt < 12 &&
        artifact.status !== "ready" &&
        artifact.status !== "failed";
        attempt += 1
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        const artifacts = await fetchMessagingAiArtifacts(chat.id);
        artifact =
          artifacts.find((item) => item.id === requested.id) ?? artifact;
      }
      setAiArtifacts((current) => [
        artifact,
        ...current.filter((item) => item.id !== artifact.id),
      ]);
      if (artifact.status === "failed") {
        setAiError(
          artifact.errorMessage ?? "AI insight could not be generated",
        );
      }
    } catch (cause) {
      setAiError(errorMessage(cause, "AI insight could not be generated"));
    } finally {
      setInsightBusy(undefined);
    }
  };

  const dismissInsight = async (artifact: MessagingAiArtifact) => {
    try {
      await dismissMessagingAiArtifact(artifact.id);
      setAiArtifacts((current) =>
        current.map((item) =>
          item.id === artifact.id ? { ...item, status: "dismissed" } : item,
        ),
      );
    } catch (cause) {
      setAiError(errorMessage(cause, "AI insight could not be dismissed"));
    }
  };

  const addLabel = () => {
    if (!chat || chat.source !== "messaging") return;
    const name = window.prompt("Label name");
    if (name?.trim())
      void runThreadAction(() => addMessagingThreadLabel(chat.id, name.trim()));
  };

  const removeLabel = (labelId: string) => {
    if (!chat || chat.source !== "messaging") return;
    void runThreadAction(() => removeMessagingThreadLabel(chat.id, labelId));
  };

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
            aria-pressed={insightsOpen}
            onClick={() => setInsightsOpen((open) => !open)}
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
          {conversation.source === "messaging" && chat ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <IconButton
                    aria-label="More options"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={actionBusy}
                  />
                }
              >
                <EllipsisVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                {chat?.capabilities?.archive ? (
                  <DropdownMenuItem
                    onClick={() =>
                      void runThreadAction(
                        () =>
                          archiveMessagingThread(
                            chat.id,
                            chat.stage !== "archived",
                          ),
                        chat.stage !== "archived",
                      )
                    }
                  >
                    {chat.stage === "archived" ? (
                      <Inbox className="h-3.5 w-3.5" />
                    ) : (
                      <Archive className="h-3.5 w-3.5" />
                    )}
                    {chat.stage === "archived"
                      ? "Move to inbox"
                      : "Archive conversation"}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  onClick={() =>
                    void runThreadAction(() =>
                      markMessagingThreadUnread(chat.id),
                    )
                  }
                >
                  <Inbox className="h-3.5 w-3.5" /> Mark unread
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void runThreadAction(() =>
                      assignMessagingThread(chat.id, currentUser?.id ?? null),
                    )
                  }
                >
                  <UserRound className="h-3.5 w-3.5" /> Assign to me
                </DropdownMenuItem>
                <DropdownMenuItem onClick={addLabel}>
                  <Tag className="h-3.5 w-3.5" /> Add label
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <IconButton
              aria-label="More options"
              variant="ghost"
              className="h-8 w-8"
            >
              <EllipsisVertical className="h-4 w-4" />
            </IconButton>
          )}
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
          {actionError ? (
            <p className="px-4 pt-2 text-[12px] text-destructive" role="alert">
              {actionError}
            </p>
          ) : null}
          {insightsOpen && chat.source === "messaging" ? (
            <AiInsights
              artifacts={aiArtifacts}
              busy={insightBusy}
              error={aiError}
              onRequest={requestInsight}
              onDismiss={(artifact) => void dismissInsight(artifact)}
            />
          ) : null}
          {chat.source === "messaging" && chat.labels?.length ? (
            <div className="flex flex-wrap gap-1.5 px-4 pt-3">
              {chat.labels.map((label) => (
                <span
                  key={label.id}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[11px] text-secondary-foreground"
                >
                  {label.name}
                  <button
                    type="button"
                    aria-label={`Remove ${label.name} label`}
                    onClick={() => removeLabel(label.id)}
                    disabled={actionBusy}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <MessageList
            messages={chat.messages}
            onApprove={(id) => approve.mutate(id)}
            onDiscard={(id) => discard.mutate(id)}
            onRetry={
              chat.source === "messaging"
                ? (id) =>
                    void retryMessagingMessage(id)
                      .then(() => loadChat(conversation, true))
                      .then(() => refreshInbox())
                      .catch((cause) =>
                        setActionError(
                          errorMessage(cause, "Message could not be retried"),
                        ),
                      )
                : undefined
            }
            draftBusy={approve.isPending || discard.isPending}
          />
          {send.isError ? (
            <p className="px-4 pb-1 text-[12px] text-destructive" role="alert">
              {errorMessage(send.error, "Message could not be sent")}
            </p>
          ) : null}
          <Composer
            disabled={send.isPending}
            threadId={chat.id}
            allowAttachments={
              chat.source === "messaging" &&
              chat.capabilities?.attachments !== false
            }
            aiDraft={aiDraft}
            aiBusy={aiBusy}
            aiError={aiError}
            onRequestDraft={
              chat.source === "messaging"
                ? () => void requestDraft()
                : undefined
            }
            onSend={(text, attachmentIds) => send.mutate(text, attachmentIds)}
          />
        </div>
      )}
    </section>
  );
});

const INSIGHT_TYPES: Array<{ type: MessagingAiArtifactType; label: string }> = [
  { type: "summary", label: "Summary" },
  { type: "classification", label: "Classify" },
  { type: "entities", label: "Entities" },
  { type: "next_action", label: "Next action" },
];

function insightValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "—";
  return JSON.stringify(value);
}

function AiInsights({
  artifacts,
  busy,
  error,
  onRequest,
  onDismiss,
}: {
  artifacts: MessagingAiArtifact[];
  busy?: MessagingAiArtifactType;
  error?: string;
  onRequest: (type: MessagingAiArtifactType) => Promise<void>;
  onDismiss: (artifact: MessagingAiArtifact) => void;
}) {
  const visible = artifacts.filter(
    (artifact) => artifact.status !== "dismissed",
  );
  return (
    <div className="mx-4 mt-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-semibold text-foreground">
          AI insights
        </span>
        {INSIGHT_TYPES.map(({ type, label }) => (
          <button
            key={type}
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void onRequest(type)}
            className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {busy === type ? "Working…" : label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="mt-2 text-[12px] text-destructive">{error}</p>
      ) : null}
      {visible.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {visible.map((artifact) => (
            <article key={artifact.id} className="rounded-lg bg-muted p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {artifact.artifactType.replaceAll("_", " ")}
                </span>
                <button
                  type="button"
                  onClick={() => onDismiss(artifact)}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Dismiss
                </button>
              </div>
              {artifact.status === "ready" ? (
                <div className="mt-2 space-y-1 text-[12px] text-foreground">
                  {Object.entries(artifact.content).map(([key, value]) => (
                    <p key={key}>
                      <span className="font-medium">
                        {key.replaceAll("_", " ")}:
                      </span>{" "}
                      {insightValue(value)}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  {artifact.status === "failed"
                    ? (artifact.errorMessage ?? "Generation failed")
                    : `${artifact.status}…`}
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Generate a summary, classification, entities, or recommended next
          action.
        </p>
      )}
    </div>
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
  onApprove: (messageId: string) => void;
  onDiscard: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  draftBusy: boolean;
}

function MessageList({
  messages,
  onApprove,
  onDiscard,
  onRetry,
  draftBusy,
}: MessageListProps) {
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const visible = messages.filter((m) => m.status !== "discarded");

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [visible.length, messages.length]);

  return (
    <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      {visible.length === 0 ? (
        <p className="m-auto text-[13px] text-muted-foreground">
          No messages in this conversation yet.
        </p>
      ) : null}
      {visible.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onApprove={onApprove}
          onDiscard={onDiscard}
          onRetry={onRetry}
          draftBusy={draftBusy}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  onApprove: (messageId: string) => void;
  onDiscard: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  draftBusy: boolean;
}

function MessageBubble({
  message,
  onApprove,
  onDiscard,
  onRetry,
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
        {message.attachments?.length ? (
          <div className="mt-2 flex flex-col gap-1 border-t border-foreground/10 pt-2">
            {message.attachments.map((attachment) => (
              <a
                key={attachment.id}
                href={messagingAttachmentUrl(attachment.id)}
                target="_blank"
                rel="noreferrer"
                className="max-w-[220px] truncate text-[12px] underline underline-offset-2"
              >
                {attachment.filename}
              </a>
            ))}
          </div>
        ) : null}
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
        {failed && (
          <>
            <span className="text-destructive">Failed</span>
            {onRetry ? (
              <button
                type="button"
                onClick={() => onRetry(message.id)}
                className="font-medium text-foreground hover:underline"
              >
                Retry
              </button>
            ) : null}
          </>
        )}
      </span>
    </div>
  );
}

interface ComposerProps {
  disabled: boolean;
  threadId: string;
  allowAttachments: boolean;
  aiDraft?: string;
  aiBusy?: boolean;
  aiError?: string;
  onRequestDraft?: () => void;
  onSend: (text: string, attachmentIds?: string[]) => Promise<void>;
}

function Composer({
  disabled,
  threadId,
  allowAttachments,
  aiDraft,
  aiBusy = false,
  aiError,
  onRequestDraft,
  onSend,
}: ComposerProps) {
  const [value, setValue] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (aiDraft !== undefined) setValue(aiDraft);
  }, [aiDraft]);

  const submit = async () => {
    const text = value.trim();
    if ((!text && files.length === 0) || disabled || uploading) return;
    setUploading(files.length > 0);
    setUploadError(null);
    try {
      const attachmentIds =
        files.length > 0
          ? await Promise.all(
              files.map((file) =>
                uploadMessagingAttachment({ threadId, file }),
              ),
            )
          : undefined;
      await onSend(text, attachmentIds);
      setFiles([]);
      setValue("");
    } catch (cause) {
      setUploadError(errorMessage(cause, "Message could not be sent"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-3">
      <div className="flex items-center gap-1 rounded-[14px] border border-border bg-card py-1.5 pl-1.5 pr-1.5">
        <IconButton
          aria-label="Attach a file"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          disabled={!allowAttachments || disabled || uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </IconButton>
        {onRequestDraft ? (
          <IconButton
            aria-label="Generate AI reply draft"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            disabled={disabled || aiBusy || uploading}
            onClick={onRequestDraft}
          >
            <Sparkles className={cn("h-4 w-4", aiBusy && "animate-pulse")} />
          </IconButton>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          disabled={!allowAttachments || disabled || uploading}
          onChange={(event) => {
            setFiles(Array.from(event.target.files ?? []).slice(0, 20));
            event.currentTarget.value = "";
          }}
        />
        <IconButton
          aria-label="Insert emoji"
          variant="ghost"
          className="h-8 w-8 shrink-0"
        >
          <Smile className="h-4 w-4" />
        </IconButton>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Type a message or /Plucia let agent chat"
          aria-label="Type a message"
          className="w-full bg-transparent px-1 text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={submit}
          disabled={
            (!value.trim() && files.length === 0) || disabled || uploading
          }
          aria-label="Send message"
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
            (value.trim() || files.length > 0) && !disabled && !uploading
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground",
          )}
        >
          {disabled || uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </button>
      </div>
      {files.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5 px-1">
          {files.map((file) => (
            <button
              key={`${file.name}-${file.size}`}
              type="button"
              onClick={() =>
                setFiles((current) => current.filter((item) => item !== file))
              }
              className="max-w-full truncate rounded-full bg-secondary px-2 py-1 text-[11px] text-secondary-foreground hover:bg-accent"
            >
              {file.name} ×
            </button>
          ))}
        </div>
      ) : null}
      {uploadError ? (
        <p className="mt-1 px-1 text-[12px] text-destructive">{uploadError}</p>
      ) : null}
      {aiError ? (
        <p className="mt-1 px-1 text-[12px] text-destructive">{aiError}</p>
      ) : null}
    </div>
  );
}
