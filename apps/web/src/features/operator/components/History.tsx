import { Skeleton } from "@/components/ui/skeleton";
import { useOperatorHistory } from "../hooks/use-operator-threads";
import { ThreadCard } from "./ThreadCard";

export function History() {
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
        <ThreadCard key={thread.id} thread={thread} />
      ))}
    </div>
  );
}
