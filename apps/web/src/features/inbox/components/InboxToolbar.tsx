"use client";

import * as React from "react";
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

const AddLeadDialog = React.lazy(() =>
  import("@/features/crm/components/AddLeadDialog").then((module) => ({
    default: module.AddLeadDialog,
  })),
);
const ImportLeadsDialog = React.lazy(() =>
  import("@/features/crm/components/ImportLeadsDialog").then((module) => ({
    default: module.ImportLeadsDialog,
  })),
);

interface InboxToolbarProps {
  scope: InboxScope;
  onScopeChange: (scope: InboxScope) => void;
  /** When set, the toolbar shows this heading instead of the scope tabs. */
  title?: string;
  action?: React.ReactNode;
  search?: string;
  onSearchChange?: (value: string) => void;
  unreadOnly?: boolean;
  onUnreadOnlyChange?: (value: boolean) => void;
}

export function InboxToolbar({
  scope,
  onScopeChange,
  title,
  action,
  search = "",
  onSearchChange,
  unreadOnly = false,
  onUnreadOnlyChange,
}: InboxToolbarProps) {
  const [importOpen, setImportOpen] = React.useState(false);
  const [addLeadOpen, setAddLeadOpen] = React.useState(false);

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-background/75 px-2.5 py-2 shadow-sm backdrop-blur-sm">
      {title ? (
        <span className="px-1 font-heading text-[16px] tracking-[-0.16px] text-foreground">
          {title}
        </span>
      ) : (
        <ScopeTabs value={scope} onChange={onScopeChange} />
      )}

      <div className="flex items-center gap-2">
        {action}
        <div className="flex items-center gap-1.5">
          <div className="hidden items-center gap-1.5 rounded-lg border border-border-subtle bg-card px-2 shadow-sm sm:flex">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder="Search"
              aria-label="Search conversations"
              className="h-7 w-28 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <IconButton
            aria-label="Filter conversations"
            className="h-8 w-8 rounded-lg border border-transparent hover:border-border-subtle"
            aria-pressed={unreadOnly}
            onClick={() => onUnreadOnlyChange?.(!unreadOnly)}
          >
            <Filter className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            aria-label="Search conversations"
            className="h-8 w-8 rounded-lg border border-transparent hover:border-border-subtle"
            onClick={() => onSearchChange?.(search ? "" : " ")}
          >
            <Search className="h-3.5 w-3.5" />
          </IconButton>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="surface-primary-gradient flex items-center gap-1 rounded-lg py-1.5 pl-2.5 pr-1.5 text-primary-foreground shadow-sm transition-transform hover:-translate-y-px">
            <span className="border-r border-white/30 pr-1.5 text-[13px] font-medium">
              New
            </span>
            <ChevronDown className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem onClick={() => setAddLeadOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" />
              Add lead manually
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setImportOpen(true)}>
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

      {importOpen ? (
        <React.Suspense fallback={null}>
          <ImportLeadsDialog open onOpenChange={setImportOpen} />
        </React.Suspense>
      ) : null}
      {addLeadOpen ? (
        <React.Suspense fallback={null}>
          <AddLeadDialog open onOpenChange={setAddLeadOpen} />
        </React.Suspense>
      ) : null}
    </div>
  );
}
