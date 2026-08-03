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
}

export function InboxToolbar({
  scope,
  onScopeChange,
  title,
  action,
}: InboxToolbarProps) {
  const [importOpen, setImportOpen] = React.useState(false);
  const [addLeadOpen, setAddLeadOpen] = React.useState(false);

  return (
    <div className="flex w-full items-center justify-between border-b border-border-subtle pb-2.5">
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
