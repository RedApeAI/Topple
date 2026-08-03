import { Bell, Plus, Settings } from "lucide-react";
import { AvatarStack } from "@/components/shared/AvatarStack";
import { IconButton } from "@/components/shared/IconButton";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { team } from "@/constants/team.constants";
import { cn } from "@/lib/utils";

interface TopbarProps {
  breadcrumb: string[];
  className?: string;
  onCreateTask?: () => void;
}

export function Topbar({ breadcrumb, className, onCreateTask }: TopbarProps) {
  return (
    <header
      className={cn(
        "flex h-[84px] shrink-0 items-center justify-between border-b border-border px-5",
        className,
      )}
    >
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-[14px] font-medium"
      >
        {breadcrumb.map((segment, i) => {
          const isLast = i === breadcrumb.length - 1;
          return (
            <span key={segment} className="flex items-center gap-2">
              {i > 0 && <span className="text-foreground">/</span>}
              <span
                className={isLast ? "text-foreground" : "text-muted-foreground"}
              >
                {segment}
              </span>
            </span>
          );
        })}
      </nav>

      <div className="flex items-center gap-5">
        <AvatarStack members={team} visibleCount={3} />

        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <IconButton aria-label="Settings">
            <Settings className="h-5 w-5" />
          </IconButton>
          <IconButton aria-label="Notifications" className="relative">
            <Bell className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive" />
          </IconButton>
        </div>

        <button
          type="button"
          onClick={onCreateTask}
          className="surface-primary-gradient topbar-task-button flex items-center gap-1 rounded-md py-2.5 pl-3 pr-4 text-[15px] font-medium text-primary-foreground"
        >
          <Plus className="h-5 w-5" />
          Create Task
        </button>
      </div>
    </header>
  );
}
