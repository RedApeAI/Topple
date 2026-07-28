import { Skeleton } from "@/components/ui/skeleton";
import { useOperatorHistory } from "../hooks/use-operator-threads";
import { ThreadCard } from "./ThreadCard";
import type { OperatorThread } from "../types/operator.types";

interface HistoryProps {
  onSelectThread?: (thread: OperatorThread) => void;
}

export function History({ onSelectThread }: HistoryProps) {
  const { data: history, isLoading } = useOperatorHistory();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 px-1 py-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {history?.map((thread) => (
        <ThreadCard key={thread.id} thread={thread} onSelect={onSelectThread} />
      ))}
    </div>
  );
}
