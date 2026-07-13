import { Skeleton } from "@/components/ui/skeleton";
import { useOperatorThreads } from "../hooks/use-operator-threads";
import { ThreadCard } from "./ThreadCard";
import type { OperatorThread } from "../types/operator.types";

interface ThreadsRunningProps {
  onSelectThread?: (thread: OperatorThread) => void;
}

export function ThreadsRunning({ onSelectThread }: ThreadsRunningProps) {
  const { data: threads, isLoading } = useOperatorThreads();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 px-1 py-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {threads?.map((thread) => (
        <ThreadCard key={thread.id} thread={thread} onSelect={onSelectThread} />
      ))}
    </div>
  );
}
