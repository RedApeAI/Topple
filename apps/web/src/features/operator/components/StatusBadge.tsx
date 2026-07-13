import { cn } from "@/lib/utils";
import { statusDotClassName } from "../constants/status-colors.constants";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

/** Dot + plain colored label — deliberately not a heavy chip, matching the Figma source. */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground",
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          statusDotClassName(status),
        )}
        aria-hidden
      />
      {status}
    </span>
  );
}
