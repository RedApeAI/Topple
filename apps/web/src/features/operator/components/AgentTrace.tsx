"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiOperatorStep } from "@/lib/api/orchestrator.types";

/** Present-tense verb for the live activity line (a command still in flight). */
const TOOL_VERB: Record<string, string> = {
  find_contact: "Searching contacts",
  get_conversation: "Reading the conversation",
  send_message: "Composing the message",
};

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "email",
  voice: "phone",
  instagram: "Instagram",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

// Belt-and-braces scrub for the model's own reasoning text: it should already
// speak in plain language, but never surface an id / email / phone if it slips.
const OBJECTID_RE = /\b[0-9a-f]{24}\b/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi;
const PHONE_RE = /\+\d[\d\s().-]{6,}\d/g; // international numbers (leading +) only

function scrub(text: string): string {
  return (text || "")
    .replace(OBJECTID_RE, "")
    .replace(EMAIL_RE, "[email]")
    .replace(PHONE_RE, "[number]")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * A human sentence describing what a tool step did, built only from a few known
 * fields (names, channel, counts) so the trace NEVER renders raw JSON, ids,
 * phone numbers, or emails. The full payload still lives on the persisted step
 * for evals — this is purely the person-facing view.
 */
function describeTool(step: {
  tool: string;
  args: Record<string, unknown>;
  observation: unknown;
}): { label: string; detail: string } {
  const obs = asRecord(step.observation);

  if (step.tool === "find_contact") {
    const query = typeof step.args.query === "string" ? step.args.query : "";
    const matches = Array.isArray(obs.matches) ? obs.matches : [];
    const names = matches
      .map((m) => asRecord(m).name)
      .filter((n): n is string => typeof n === "string" && n.length > 0);
    const detail =
      names.length === 0
        ? query
          ? `No match for “${query}”`
          : "No matches"
        : names.length === 1
          ? `Found ${names[0]}`
          : `Found ${names.length} matches`;
    return { label: "Searched contacts", detail };
  }

  if (step.tool === "get_conversation") {
    if (!obs.conversation) {
      return { label: "Read the conversation", detail: "No conversation yet" };
    }
    const convo = asRecord(obs.conversation);
    const channel = CHANNEL_LABEL[String(convo.channel)] ?? "";
    const count = Array.isArray(convo.recent_messages)
      ? convo.recent_messages.length
      : 0;
    const detail =
      count > 0
        ? `Reviewed ${count} recent message${count === 1 ? "" : "s"}${channel ? ` on ${channel}` : ""}`
        : "Opened the existing conversation";
    return { label: "Read the conversation", detail };
  }

  if (step.tool === "send_message") {
    const status = String(obs.status ?? "");
    const who =
      (typeof obs.contact_name === "string" && obs.contact_name) ||
      "the contact";
    const channel = CHANNEL_LABEL[String(obs.channel)] ?? "";
    const on = channel ? ` on ${channel}` : "";
    if (status === "sent")
      return { label: "Sent the message", detail: `Sent to ${who}${on}` };
    if (status === "draft")
      return {
        label: "Composed the message",
        detail: `Drafted for ${who}${on}`,
      };
    if (status === "duplicate")
      return { label: "Composed the message", detail: "Skipped a duplicate" };
    if (status === "failed")
      return {
        label: "Couldn’t send",
        detail:
          typeof obs.reason === "string"
            ? obs.reason
            : "the action didn’t go through",
      };
    return { label: "Composed the message", detail: "" };
  }

  return { label: TOOL_VERB[step.tool] ?? "Ran a step", detail: "" };
}

function StepRow({ step }: { step: ApiOperatorStep }) {
  if (step.type === "thought") {
    return (
      <p className="text-[12px] italic leading-[1.5] text-muted-foreground">
        {scrub(step.text)}
      </p>
    );
  }
  const { label, detail } = describeTool(step);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] font-medium text-foreground">{label}</span>
      {detail && (
        <span className="text-[11px] leading-[1.4] text-muted-foreground">
          {detail}
        </span>
      )}
    </div>
  );
}

/** Collapsible reasoning trace on a finished agent reply. */
export function AgentTrace({ steps }: { steps: ApiOperatorStep[] }) {
  const [open, setOpen] = React.useState(false);
  const toolCalls = steps.filter((s) => s.type === "tool").length;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 self-start text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={cn("h-3 w-3 transition-transform", open && "rotate-90")}
        />
        Thinking · {steps.length} step{steps.length === 1 ? "" : "s"}
        {toolCalls > 0 &&
          ` · ${toolCalls} tool call${toolCalls === 1 ? "" : "s"}`}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1.5 border-l-2 border-border py-1 pl-3">
              {steps.map((step, i) => (
                <StepRow key={i} step={step} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The live "thinking" view shown while a command is in flight: steps stream
 * in one by one with a soft fade/slide, and a pulsing line trails the newest
 * activity — the Claude-Code style of watching the agent work.
 */
export function LiveThinking({ steps }: { steps: ApiOperatorStep[] }) {
  const bottomRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [steps.length]);

  const latest = steps[steps.length - 1];
  const activity =
    latest?.type === "tool"
      ? (TOOL_VERB[latest.tool] ?? "Working")
      : "Thinking";

  return (
    <div className="flex flex-col gap-1.5 border-l-2 border-border/70 pl-3">
      <AnimatePresence initial={false}>
        {steps.map((step, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <StepRow step={step} />
          </motion.div>
        ))}
      </AnimatePresence>

      <motion.span
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        className="text-[12px] font-medium text-muted-foreground"
      >
        {activity}
        <ThinkingDots />
      </motion.span>
      <div ref={bottomRef} />
    </div>
  );
}

function ThinkingDots() {
  const [n, setN] = React.useState(1);
  React.useEffect(() => {
    const t = setInterval(() => setN((v) => (v % 3) + 1), 400);
    return () => clearInterval(t);
  }, []);
  return <span>{".".repeat(n)}</span>;
}
