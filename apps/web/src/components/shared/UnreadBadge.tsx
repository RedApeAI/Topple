import { cn } from "@/lib/utils";

interface UnreadBadgeProps {
  count: number;
  className?: string;
}

/** Small red rounded-square count badge used on sidebar nav rows. */
export function UnreadBadge({ count, className }: UnreadBadgeProps) {
  if (count <= 0) return null;

  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-destructive px-1 text-[11px] font-medium text-destructive-foreground",
        className,
      )}
      aria-label={`${count} unread`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
