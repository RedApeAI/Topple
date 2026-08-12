"use client";

import * as React from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLeads } from "../hooks/use-leads";
import { LeadsTable } from "./LeadsTable";
import { ImportLeadsDialog } from "./ImportLeadsDialog";
import { ContactLeadDialog } from "./ContactLeadDialog";
import type { Lead, LeadChannel } from "../types/lead.types";

export function CrmScreen() {
  const { data: leads, isLoading, error, retry } = useLeads();
  const [importOpen, setImportOpen] = React.useState(false);
  const [contactTarget, setContactTarget] = React.useState<{
    lead: Lead;
    channel: LeadChannel;
  } | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 rounded-[10px] bg-muted p-3">
      <div className="flex w-full items-center justify-between border-b border-border-subtle pb-2.5">
        <span className="px-1 font-heading text-[16px] tracking-[-0.16px] text-foreground">
          Leads
        </span>
        <Button onClick={() => setImportOpen(true)}>
          <Upload className="h-3.5 w-3.5" />
          Import leads
        </Button>
      </div>

      <LeadsTable
        leads={leads}
        isLoading={isLoading}
        error={error}
        onRetry={() => void retry()}
        onContact={(lead, channel) => setContactTarget({ lead, channel })}
      />

      <ImportLeadsDialog open={importOpen} onOpenChange={setImportOpen} />
      <ContactLeadDialog
        lead={contactTarget?.lead ?? null}
        channel={contactTarget?.channel ?? null}
        onOpenChange={(open) => {
          if (!open) setContactTarget(null);
        }}
      />
    </div>
  );
}
