import { ChevronRight } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { OperatorThread } from "../types/operator.types";

interface ThreadCardProps {
  thread: OperatorThread;
  onSelect?: (thread: OperatorThread) => void;
}

export function ThreadCard({ thread, onSelect }: ThreadCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(thread)}
      className="group flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-3 text-left transition-colors hover:bg-accent"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[14px] font-medium text-foreground">
          {thread.title}
        </span>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>{thread.timestamp}</span>
          {thread.status && <StatusBadge status={thread.status} />}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
