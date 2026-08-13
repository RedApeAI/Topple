import { Bell, Plus, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { IconButton } from "@/components/shared/IconButton";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
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
        "flex h-[84px] shrink-0 items-center justify-between border-b border-border/70 bg-background/80 px-5 backdrop-blur-xl md:px-7",
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
        <div className="flex items-center gap-2.5">
          <span className="hidden items-center gap-1.5 rounded-full border border-border-subtle bg-card/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground lg:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_0_3px_color-mix(in_srgb,var(--success)_14%,transparent)]" />
            Workspace ready
          </span>
          <ThemeToggle />
          <Link
            to="/dashboard/settings"
            aria-label="Settings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent"
          >
            <Settings className="h-5 w-5" />
          </Link>
          <IconButton aria-label="Notifications" className="relative">
            <Bell className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive" />
          </IconButton>
        </div>

        <button
          type="button"
          onClick={onCreateTask}
          className="surface-primary-gradient flex items-center gap-1 rounded-lg px-3 py-2.5 text-[14px] font-medium text-primary-foreground shadow-sm transition-transform hover:-translate-y-px dark:!bg-none dark:!bg-white dark:!text-black dark:hover:!bg-white/90"
        >
          <Plus className="h-5 w-5" />
          Create Task
        </button>
      </div>
    </header>
  );
}
