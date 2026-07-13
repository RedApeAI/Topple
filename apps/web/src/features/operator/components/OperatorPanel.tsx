"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronLeft, Info, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IconButton } from "@/components/shared/IconButton";
import { LogoMark } from "@/components/shared/Logo";
import { useUIStore } from "@/store/ui.store";
import { useOperatorThreads } from "../hooks/use-operator-threads";
import { useOperatorTranscript } from "../hooks/use-operator-transcript";
import { ThreadsRunning } from "./ThreadsRunning";
import { History } from "./History";
import { StreamingMessage } from "./StreamingMessage";
import { PromptInput } from "./PromptInput";
import { drawerVariants } from "@/design/tokens/motion";

export function OperatorPanel() {
  const operatorOpen = useUIStore((s) => s.operatorOpen);
  const closeOperator = useUIStore((s) => s.closeOperator);
  const [view, setView] = React.useState<"list" | "chat">("list");

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

          {view === "list" ? (
            <ThreadsView onNewChat={() => setView("chat")} />
          ) : (
            <ChatView onBack={() => setView("list")} />
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function PanelHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        <LogoMark size={20} />
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

function ThreadsView({ onNewChat }: { onNewChat: () => void }) {
  const { data: threads } = useOperatorThreads();
  const [tab, setTab] = React.useState<"threads" | "history">("threads");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        onClick={onNewChat}
        className="flex items-center gap-2 border-b border-border px-4 py-3 text-[13px] font-medium text-foreground hover:bg-accent"
      >
        <ArrowRight className="h-4 w-4" />
        New Chat
      </button>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as "threads" | "history")}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-border px-2 pt-1">
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
              <span title="Completed and cancelled Operator threads">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/*
          Base UI's Tabs.Panel unmount relies on a transition-end event to flip
          `hidden` back on when switching away — since this panel defines no
          CSS transition, that event never fires and both panels stay visible
          stacked on top of each other. Render the active panel manually
          instead of using <TabsContent> for the content itself.
        */}
        <div
          role="tabpanel"
          aria-label={tab === "threads" ? "Threads Running" : "History"}
          className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-2 py-2"
        >
          {tab === "threads" ? <ThreadsRunning /> : <History />}
        </div>
      </Tabs>
    </div>
  );
}

function ChatView({ onBack }: { onBack: () => void }) {
  const { data: messages } = useOperatorTranscript();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to threads"
        className="flex w-full items-center gap-1.5 rounded-[10px] bg-secondary px-3 py-2.5 text-[13px] font-medium text-foreground hover:bg-accent"
      >
        <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        New Chat
      </button>

      <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-2">
        <span className="self-center text-[12px] font-medium text-muted-foreground">
          Today
        </span>
        {messages?.map((message) => (
          <StreamingMessage key={message.id} message={message} />
        ))}
      </div>

      <PromptInput />
    </div>
  );
}
