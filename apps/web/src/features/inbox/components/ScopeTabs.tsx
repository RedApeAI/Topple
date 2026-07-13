import { cn } from "@/lib/utils";
import { scopeTabs } from "../constants/scope-tabs.constants";
import type { InboxScope } from "../types/conversation.types";

interface ScopeTabsProps {
  value: InboxScope;
  onChange: (value: InboxScope) => void;
}

/** Segmented channel-scope control — active tab is a white pill inside a gray track. */
export function ScopeTabs({ value, onChange }: ScopeTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Inbox scope"
      className="flex items-center gap-0.5 rounded-md bg-secondary p-1"
    >
      {scopeTabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(tab.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-[6px] px-2.5 py-2 text-[12px] font-medium text-secondary-foreground transition-colors",
              active && "bg-card text-foreground shadow-row",
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
