"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiOperatorStep } from "@/lib/api/orchestrator.types";

function summarize(observation: unknown, max = 180): string {
  const text = JSON.stringify(observation);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Collapsible reasoning trace on an agent reply: thoughts + tool calls. */
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

      {open && (
        <div className="flex flex-col gap-1.5 border-l-2 border-border py-1 pl-3">
          {steps.map((step, i) =>
            step.type === "thought" ? (
              <p key={i} className="text-[12px] italic text-muted-foreground">
                {step.text}
              </p>
            ) : (
              <div key={i} className="flex flex-col gap-0.5">
                <code className="font-mono text-[11px] text-foreground">
                  {step.tool}({JSON.stringify(step.args)})
                </code>
                <p className="break-all text-[11px] text-muted-foreground">
                  → {summarize(step.observation)}
                </p>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
