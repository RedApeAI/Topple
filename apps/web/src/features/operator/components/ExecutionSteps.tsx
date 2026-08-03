import { Check, Circle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowStep } from "../types/operator.types";

const STEP_ICON: Record<
  WorkflowStep["status"],
  React.ComponentType<{ className?: string }>
> = {
  done: Check,
  running: Loader2,
  pending: Circle,
  failed: X,
};

const STEP_ICON_CLASS: Record<WorkflowStep["status"], string> = {
  done: "text-success",
  running: "text-chart-2 animate-spin",
  pending: "text-muted-foreground",
  failed: "text-destructive",
};

interface ExecutionStepsProps {
  name: string;
  steps: WorkflowStep[];
}

/** Compact vertical checklist for a running `executeWorkflow()` call. */
export function ExecutionSteps({ name, steps }: ExecutionStepsProps) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <span className="text-[13px] font-medium text-foreground">{name}</span>
      <div className="flex flex-col gap-1.5">
        {steps.map((step) => {
          const Icon = STEP_ICON[step.status];
          return (
            <div
              key={step.label}
              className="flex items-center gap-2 text-[13px]"
            >
              <Icon
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  STEP_ICON_CLASS[step.status],
                )}
              />
              <span
                className={cn(
                  "text-muted-foreground",
                  step.status === "done" && "text-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
