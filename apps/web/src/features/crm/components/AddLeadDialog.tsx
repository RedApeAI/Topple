"use client";

import * as React from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useImportLeads } from "../hooks/use-import-leads";
// Missing integration module: ../lib/column-mapping
// import { LEAD_FIELD_LABELS } from "../lib/column-mapping";
// Missing integration module: @/lib/api/orchestrator.types
// import type { ApiLeadImportRow, ApiLeadImportRowResult } from "@/lib/api/orchestrator.types";
import { LEAD_FIELD_LABELS } from "../lib/column-mapping";
import type {
  ApiLeadImportRow,
  ApiLeadImportRowResult,
} from "@/lib/mock/orchestrator.types";

const FIELDS: (keyof ApiLeadImportRow)[] = [
  "name",
  "whatsapp",
  "email",
  "phone",
  "instagram",
  "linkedin",
];

const PLACEHOLDERS: Record<keyof ApiLeadImportRow, string> = {
  name: "Jane Doe",
  whatsapp: "+971501234567",
  email: "jane@example.com",
  phone: "+971501234567",
  instagram: "jane.doe",
  linkedin: "jane-doe",
};

const EMPTY_ROW: ApiLeadImportRow = {};

interface AddLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "Add lead manually" — a single-row version of the same import pipeline
 * the CSV/Excel upload uses, so a manually added lead is created, merged,
 * and logged exactly the same way. */
export function AddLeadDialog({ open, onOpenChange }: AddLeadDialogProps) {
  const [row, setRow] = React.useState<ApiLeadImportRow>(EMPTY_ROW);
  const [result, setResult] = React.useState<ApiLeadImportRowResult | null>(
    null,
  );
  const importLeads = useImportLeads();

  const reset = () => {
    setRow(EMPTY_ROW);
    setResult(null);
    importLeads.reset();
  };

  const hasChannel = Boolean(
    row.whatsapp || row.email || row.phone || row.instagram || row.linkedin,
  );

  const submit = () => {
    if (!hasChannel) return;
    importLeads.mutate([row], {
      onSuccess: (response) => setResult(response.results[0]),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add lead manually</DialogTitle>
          <DialogDescription>
            Needs at least one channel — WhatsApp, email, phone, Instagram, or
            LinkedIn — so this lead can actually be reached.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <ResultView result={result} onDone={() => onOpenChange(false)} />
        ) : (
          <div className="flex flex-col gap-3">
            {FIELDS.map((field) => (
              <div key={field} className="flex flex-col gap-1">
                <label
                  htmlFor={`lead-${field}`}
                  className="text-[12px] font-medium text-muted-foreground"
                >
                  {LEAD_FIELD_LABELS[field]}
                </label>
                <Input
                  id={`lead-${field}`}
                  value={row[field] ?? ""}
                  onChange={(e) =>
                    setRow((r) => ({ ...r, [field]: e.target.value }))
                  }
                  placeholder={PLACEHOLDERS[field]}
                />
              </div>
            ))}

            {!hasChannel && (
              <p className="text-[13px] text-warning">
                Add at least one channel to continue.
              </p>
            )}
            {importLeads.isError && (
              <p className="text-[13px] text-destructive">
                {importLeads.error instanceof Error
                  ? importLeads.error.message
                  : "Couldn't add that lead."}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={submit}
                disabled={!hasChannel || importLeads.isPending}
              >
                {importLeads.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Add lead
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResultView({
  result,
  onDone,
}: {
  result: ApiLeadImportRowResult;
  onDone: () => void;
}) {
  const ok = result.status !== "skipped";
  const label =
    result.status === "created"
      ? "Lead added"
      : result.status === "updated"
        ? "Matched an existing lead — merged"
        : "Couldn't add lead";

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-lg p-3",
          ok ? "bg-success/10" : "bg-warning/10",
        )}
      >
        {ok ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        ) : (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        )}
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium text-foreground">
            {label}
          </span>
          {result.reason && (
            <span className="text-[12px] text-muted-foreground">
              {result.reason}
            </span>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </div>
  );
}
