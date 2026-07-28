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
import { AddLeadDialog } from "@/features/crm/components/AddLeadDialog";
import { ImportLeadsDialog } from "@/features/crm/components/ImportLeadsDialog";
import { ScopeTabs } from "./ScopeTabs";
import type { InboxScope } from "../types/conversation.types";

interface InboxToolbarProps {
  scope: InboxScope;
  onScopeChange: (scope: InboxScope) => void;
  /** When set, the toolbar shows this heading instead of the scope tabs. */
  title?: string;
}

export function InboxToolbar({
  scope,
  onScopeChange,
  title,
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

      <ImportLeadsDialog open={importOpen} onOpenChange={setImportOpen} />
      <AddLeadDialog open={addLeadOpen} onOpenChange={setAddLeadOpen} />
    </div>
  );
}
