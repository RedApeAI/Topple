import {
  ChevronDown,
  Database,
  FileSpreadsheet,
  Filter,
  Search,
  UserPlus,
} from "lucide-react";
import { IconButton } from "@/components/shared/IconButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScopeTabs } from "./ScopeTabs";
import type { InboxScope } from "../types/conversation.types";

interface InboxToolbarProps {
  scope: InboxScope;
  onScopeChange: (scope: InboxScope) => void;
}

export function InboxToolbar({ scope, onScopeChange }: InboxToolbarProps) {
  return (
    <div className="flex w-full items-center justify-between border-b border-border-subtle pb-2.5">
      <ScopeTabs value={scope} onChange={onScopeChange} />

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <IconButton
            aria-label="Filter conversations"
            className="h-8 w-8 rounded-[5px]"
          >
            <Filter className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            aria-label="Search conversations"
            className="h-8 w-8 rounded-[5px]"
          >
            <Search className="h-3.5 w-3.5" />
          </IconButton>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1 rounded-md bg-primary py-1.5 pl-2.5 pr-1.5 text-primary-foreground">
            <span className="border-r border-white/30 pr-1.5 text-[13px] font-medium">
              New
            </span>
            <ChevronDown className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem>
              <UserPlus className="h-3.5 w-3.5" />
              Add lead manually
            </DropdownMenuItem>
            <DropdownMenuItem>
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Import from Excel
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Database className="h-3.5 w-3.5" />
              Import from CRM
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
