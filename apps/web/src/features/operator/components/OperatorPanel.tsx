"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ChevronLeft,
  History as HistoryIcon,
  X,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IconButton } from "@/components/shared/IconButton";
import { LogoMark, LogoSmall } from "@/components/shared/Logo";
import { useUIStore } from "@/store/ui.store";
import { Skeleton } from "@/components/ui/skeleton";
import { useOperatorThreads } from "../hooks/use-operator-threads";
import { useOperatorAgent } from "../hooks/use-operator-agent";
import { useOperatorDraftActions } from "../hooks/use-operator-draft-actions";
import { ThreadsRunning } from "./ThreadsRunning";
import { History } from "./History";
import { StreamingMessage } from "./StreamingMessage";
import { LiveThinking } from "./AgentTrace";
import { PromptInput } from "./PromptInput";
import { drawerVariants } from "@/design/tokens/motion";

type PanelTab = "threads" | "history";
/** New Chat opens a fresh session; selecting a thread opens it by id. */
type PanelView =
  | { mode: "list" }
  | { mode: "chat"; threadId?: string; title?: string };

export function OperatorPanel() {
  const operatorOpen = useUIStore((s) => s.operatorOpen);
  const closeOperator = useUIStore((s) => s.closeOperator);
  const [tab, setTab] = React.useState<PanelTab>("threads");
  const [view, setView] = React.useState<PanelView>({ mode: "list" });

  // Selecting a tab always returns to the corresponding list.
  const selectTab = (next: PanelTab) => {
    setTab(next);
    setView({ mode: "list" });
  };

  return (
    <AnimatePresence>
      {operatorOpen && (
        <motion.aside
          variants={drawerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="my-3 mr-3 flex w-[420px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
        >
          <PanelHeader onClose={closeOperator} />
          <TabsBar tab={tab} onTabChange={selectTab} />

          {view.mode === "list" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <button
                type="button"
                onClick={() => setView({ mode: "chat" })}
                className="flex items-center gap-2 border-b border-border px-4 py-3 text-[13px] font-medium text-foreground hover:bg-accent"
              >
                <ArrowRight className="h-4 w-4" />
                New Chat
              </button>
              <div
                role="tabpanel"
                aria-label={tab === "threads" ? "Threads Running" : "History"}
                className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-2 py-2"
              >
                {tab === "threads" ? (
                  <ThreadsRunning
                    onSelectThread={(thread) =>
                      setView({
                        mode: "chat",
                        threadId: thread.id,
                        title: thread.title,
                      })
                    }
                  />
                ) : (
                  <History
                    onSelectThread={(thread) =>
                      setView({
                        mode: "chat",
                        threadId: thread.id,
                        title: thread.title,
                      })
                    }
                  />
                )}
              </div>
            </div>
          ) : (
            <AgentChatView
              key={view.threadId ?? "new"}
              threadId={view.threadId}
              title={view.title}
              onBack={() => setView({ mode: "list" })}
            />
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function PanelHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary py-1 pl-1.5 pr-2.5">
        <LogoSmall size={20} />
        <span className="text-[13px] font-medium text-foreground">
          Operator
        </span>
      </div>
      <IconButton
        aria-label="Close Operator"
        variant="ghost"
        onClick={onClose}
        className="h-7 w-7"
      >
        <X className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

function TabsBar({
  tab,
  onTabChange,
}: {
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
}) {
  const { data: threads } = useOperatorThreads();

  return (
    <Tabs value={tab} onValueChange={(value) => onTabChange(value as PanelTab)}>
      <div className="border-b border-border px-2">
        <TabsList className="h-auto bg-transparent p-0">
          <TabsTrigger
            value="threads"
            className="gap-1.5 rounded-none border-x-0 border-t-0 border-b-[1.4px] border-transparent px-3 py-2.5 data-active:border-b-foreground data-active:bg-transparent data-active:shadow-none"
          >
            Threads Running
            <span className="rounded-[4px] bg-secondary px-1.5 py-0.5 text-[11px]">
              {threads?.length ?? 0}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="gap-1.5 rounded-none border-x-0 border-t-0 border-b-[1.4px] border-transparent px-3 py-2.5 data-active:border-b-foreground data-active:bg-transparent data-active:shadow-none"
          >
            History
            <HistoryIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </TabsTrigger>
        </TabsList>
      </div>
    </Tabs>
  );
}

function BackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="Back to threads"
      className="flex w-full items-center gap-1.5 rounded-[12px] bg-secondary px-3 py-2.5 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </button>
  );
}

interface AgentChatViewProps {
  /** Existing thread to reopen; omitted for a fresh New Chat. */
  threadId?: string;
  title?: string;
  onBack: () => void;
}

/**
 * The command chat with the Operator agent: intent → tools → clarify or act.
 * Opens fresh (New Chat) or reopens an existing thread by id, replaying its
 * messages, reasoning traces, and pending drafts.
 */
function AgentChatView({ threadId, title, onBack }: AgentChatViewProps) {
  const { messages, hydrating, liveSteps, send, patchActionStatus } =
    useOperatorAgent(threadId);
  const { approve, discard } = useOperatorDraftActions();
  const operatorMode = useUIStore((s) => s.operatorMode);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, send.isPending, hydrating, liveSteps.length]);

  const approveAction = (message: (typeof messages)[number]) => (id: string) =>
    approve.mutate(id, {
      onSuccess: () => patchActionStatus(message.id, "sent"),
    });
  const discardAction = (message: (typeof messages)[number]) => (id: string) =>
    discard.mutate(id, {
      onSuccess: () => patchActionStatus(message.id, "discarded"),
    });

  const showEmptyHint =
    !threadId && messages.length === 0 && !send.isPending && !hydrating;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <BackBar label={title ?? "New Chat"} onBack={onBack} />

      <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 py-2">
        {hydrating ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-2/3 self-end rounded-[16px]" />
            <Skeleton className="h-16 w-4/5 self-start rounded-[16px]" />
          </div>
        ) : showEmptyHint ? (
          <p className="m-auto max-w-[280px] text-center text-[13px] text-muted-foreground">
            Command the Operator — &ldquo;say hi to Priya Patel&rdquo;,
            &ldquo;what&apos;s the latest with Mary?&rdquo;, &ldquo;draft a
            follow-up for cold leads&rdquo;.
          </p>
        ) : (
          <span className="self-center text-[12px] font-medium text-muted-foreground">
            Today
          </span>
        )}
        {messages.map((message) => (
          <StreamingMessage
            key={message.id}
            message={message}
            onApprove={approveAction(message)}
            onDiscard={discardAction(message)}
            draftBusy={approve.isPending || discard.isPending}
          />
        ))}
        {send.isPending && (
          <div className="flex items-start gap-2.5">
            <LogoMark size={36} round className="shrink-0" />
            <div className="max-w-[85%] flex-1 pt-1.5">
              {liveSteps.length > 0 ? (
                <LiveThinking steps={liveSteps} />
              ) : (
                <motion.span
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{
                    duration: 1.4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="text-[14px] font-medium text-muted-foreground"
                >
                  {operatorMode === "copilot" ? "Working on it…" : "On it…"}
                </motion.span>
              )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {send.isError && (
        <p className="px-1 text-[13px] text-destructive">
          {send.error instanceof Error
            ? send.error.message
            : "Couldn't reach the orchestrator"}
        </p>
      )}
      <PromptInput
        onSubmit={(text, channel) => send.mutate({ text, channel })}
        disabled={send.isPending}
      />
    </div>
  );
}
