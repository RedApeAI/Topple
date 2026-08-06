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
import { LogoSmall } from "@/components/shared/Logo";
import { useUIStore } from "@/store/ui.store";
import { useOperatorStore } from "@/store/operator.store";
import { useOperatorThreads } from "../hooks/use-operator-threads";
import { useOperatorTranscript } from "../hooks/use-operator-transcript";
import { useOperatorAgent } from "../hooks/use-operator-agent";
import { useOperatorDraftActions } from "../hooks/use-operator-draft-actions";
import { ThreadsRunning } from "./ThreadsRunning";
import { History } from "./History";
import { StreamingMessage } from "./StreamingMessage";
import { PromptInput } from "./PromptInput";
import { drawerVariants } from "@/design/tokens/motion";
import type { OperatorThread } from "../types/operator.types";

type PanelTab = "threads" | "history";
type PanelView = { mode: "list" } | { mode: "chat"; thread?: OperatorThread };

export function OperatorPanel() {
  const operatorOpen = useUIStore((s) => s.operatorOpen);
  const closeOperator = useUIStore((s) => s.closeOperator);
  const [tab, setTab] = React.useState<PanelTab>("threads");
  const [view, setView] = React.useState<PanelView>({ mode: "list" });
  const loadAgentThread = useOperatorStore((s) => s.loadAgentThread);
  const startNewChat = useOperatorStore((s) => s.startNewChat);
  const hasAgentChat = useOperatorStore((s) => s.agentMessages.length > 0);

  // The chat lives on the server but the store is in-memory, so a refresh
  // empties it. Pull the most recent thread back whenever the panel opens.
  React.useEffect(() => {
    if (operatorOpen) void loadAgentThread();
  }, [operatorOpen, loadAgentThread]);

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
              {/* Opening the restored conversation and starting a fresh one
                  are different intents — one button each, so continuing never
                  silently discards the thread the agent still has context on. */}
              <div className="flex items-center border-b border-border">
                <button
                  type="button"
                  onClick={() => setView({ mode: "chat" })}
                  className="flex flex-1 items-center gap-2 px-4 py-3 text-[13px] font-medium text-foreground hover:bg-accent"
                >
                  <ArrowRight className="h-4 w-4" />
                  {hasAgentChat ? "Continue Chat" : "New Chat"}
                </button>
                {hasAgentChat && (
                  <button
                    type="button"
                    onClick={() => {
                      startNewChat();
                      setView({ mode: "chat" });
                    }}
                    className="px-4 py-3 text-[13px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    New
                  </button>
                )}
              </div>
              <div
                role="tabpanel"
                aria-label={
                  tab === "threads" ? "Threads Running" : "Past chats"
                }
                className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-2 py-2"
              >
                {tab === "threads" ? (
                  <ThreadsRunning
                    onSelectThread={(thread) =>
                      setView({ mode: "chat", thread })
                    }
                  />
                ) : (
                  <History onOpenChat={() => setView({ mode: "chat" })} />
                )}
              </div>
            </div>
          ) : view.thread ? (
            <TranscriptView
              thread={view.thread}
              onBack={() => setView({ mode: "list" })}
            />
          ) : (
            <AgentChatView onBack={() => setView({ mode: "list" })} />
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

/**
 * The command chat with the Operator agent: intent → tools → clarify or act.
 * Messages live on an operator thread created by the backend on first send.
 */
function AgentChatView({ onBack }: { onBack: () => void }) {
  const { messages, send, patchActionStatus } = useOperatorAgent();
  const { approve, discard } = useOperatorDraftActions();
  const operatorMode = useUIStore((s) => s.operatorMode);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, send.isPending]);

  const approveAction = (message: (typeof messages)[number]) => (id: string) =>
    approve.mutate(id, {
      onSuccess: () => patchActionStatus(message.id, "sent"),
    });
  const discardAction = (message: (typeof messages)[number]) => (id: string) =>
    discard.mutate(id, {
      onSuccess: () => patchActionStatus(message.id, "discarded"),
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <BackBar label="New Chat" onBack={onBack} />

      <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 py-2">
        {messages.length === 0 && !send.isPending ? (
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
          <StreamingMessage
            message={{
              id: "pending-status",
              role: "operator",
              text: operatorMode === "copilot" ? "Working on it…" : "On it…",
              status: "running",
            }}
          />
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

/** Read-only view of a live buyer conversation behind a turn thread. */
function TranscriptView({
  thread,
  onBack,
}: {
  thread: OperatorThread;
  onBack: () => void;
}) {
  const { data: messages } = useOperatorTranscript(
    thread.conversationId ?? undefined,
  );
  const { approve, discard } = useOperatorDraftActions();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <BackBar label={thread.title} onBack={onBack} />

      <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 py-2">
        <span className="self-center text-[12px] font-medium text-muted-foreground">
          Today
        </span>
        {messages?.map((message) => (
          <StreamingMessage
            key={message.id}
            message={message}
            onApprove={(id) => approve.mutate(id)}
            onDiscard={(id) => discard.mutate(id)}
            draftBusy={approve.isPending || discard.isPending}
          />
        ))}
      </div>

      <p className="rounded-[12px] bg-secondary px-3 py-2.5 text-center text-[12px] text-muted-foreground">
        Live conversation transcript — start a New Chat to command the Operator
        about it.
      </p>
    </div>
  );
}
