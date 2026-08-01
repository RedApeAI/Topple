"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Upload, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseLeadFile, type ParsedSheet } from "../services/file-parser";
// Missing integration module: ../lib/column-mapping
// import {
//   applyColumnMapping,
//   guessColumnMapping,
//   LEAD_FIELD_LABELS,
//   LEAD_FIELD_OPTIONS,
//   type LeadField,
// } from "../lib/column-mapping";
import {
  applyColumnMapping,
  guessColumnMapping,
  LEAD_FIELD_LABELS,
  LEAD_FIELD_OPTIONS,
  type LeadField,
} from "../lib/column-mapping";
import { useImportLeads } from "../hooks/use-import-leads";
// Missing integration module: @/lib/api/orchestrator.types
// import type { ApiLeadImportResponse } from "@/lib/api/orchestrator.types";
import type { ApiLeadImportResponse } from "@/lib/mock/orchestrator.types";

type Step =
  | { kind: "upload"; error?: string }
  | { kind: "map"; sheet: ParsedSheet; mapping: Record<string, LeadField> }
  | { kind: "result"; response: ApiLeadImportResponse };

interface ImportLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportLeadsDialog({
  open,
  onOpenChange,
}: ImportLeadsDialogProps) {
  const [step, setStep] = React.useState<Step>({ kind: "upload" });
  const importLeads = useImportLeads();

  const reset = () => {
    setStep({ kind: "upload" });
    importLeads.reset();
  };

  const handleFile = async (file: File) => {
    try {
      const sheet = await parseLeadFile(file);
      if (sheet.headers.length === 0) {
        setStep({
          kind: "upload",
          error: "That file has no rows we could read — check it isn't empty.",
        });
        return;
      }
      setStep({
        kind: "map",
        sheet,
        mapping: guessColumnMapping(sheet.headers),
      });
    } catch {
      setStep({
        kind: "upload",
        error: "Couldn't read that file — is it a valid .csv or .xlsx?",
      });
    }
  };

  const runImport = () => {
    if (step.kind !== "map") return;
    const rows = applyColumnMapping(step.sheet.rows, step.mapping);
    importLeads.mutate(rows, {
      onSuccess: (response) => setStep({ kind: "result", response }),
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import leads</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file. Each lead can carry a WhatsApp number,
            email, phone, Instagram handle, or LinkedIn profile — whichever
            channels they show up on become contactable from here.
          </DialogDescription>
        </DialogHeader>

        {step.kind === "upload" && (
          <UploadStep error={step.error} onFile={handleFile} />
        )}

        {step.kind === "map" && (
          <MapStep
            sheet={step.sheet}
            mapping={step.mapping}
            onMappingChange={(mapping) => setStep({ ...step, mapping })}
            onBack={reset}
            onImport={runImport}
            importing={importLeads.isPending}
            error={
              importLeads.isError
                ? importLeads.error instanceof Error
                  ? importLeads.error.message
                  : "Import failed — is the orchestrator reachable?"
                : undefined
            }
          />
        )}

        {step.kind === "result" && (
          <ResultStep
            response={step.response}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function UploadStep({
  error,
  onFile,
}: {
  error?: string;
  onFile: (file: File) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

  return (
    <div className="flex flex-col gap-2">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-6 py-10 text-center transition-colors",
          dragOver && "border-foreground bg-accent",
        )}
      >
        <Upload className="h-6 w-6 text-muted-foreground" />
        <span className="text-[14px] font-medium text-foreground">
          Drop a file, or click to browse
        </span>
        <span className="text-[12px] text-muted-foreground">
          .csv, .xlsx, or .xls
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </label>
      {error && <p className="text-[13px] text-destructive">{error}</p>}
    </div>
  );
}

interface MapStepProps {
  sheet: ParsedSheet;
  mapping: Record<string, LeadField>;
  onMappingChange: (mapping: Record<string, LeadField>) => void;
  onBack: () => void;
  onImport: () => void;
  importing: boolean;
  error?: string;
}

function MapStep({
  sheet,
  mapping,
  onMappingChange,
  onBack,
  onImport,
  importing,
  error,
}: MapStepProps) {
  const mappedFields = Object.values(mapping).filter((f) => f !== "ignore");
  const hasChannelMapped = mappedFields.some((f) => f !== "name");

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">
        {sheet.rows.length} row{sheet.rows.length === 1 ? "" : "s"} found. Match
        each column to a field — anything left as &quot;Ignore&quot; won&apos;t
        be imported.
      </p>

      <div className="scrollbar-none flex max-h-[240px] flex-col gap-1.5 overflow-y-auto rounded-lg border border-border p-2">
        {sheet.headers.map((header) => (
          <div key={header} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
              {header || (
                <em className="text-muted-foreground">(blank header)</em>
              )}
            </span>
            <select
              value={mapping[header] ?? "ignore"}
              onChange={(e) =>
                onMappingChange({
                  ...mapping,
                  [header]: e.target.value as LeadField,
                })
              }
              className="h-8 w-40 shrink-0 rounded-lg border border-input bg-transparent px-2 text-[13px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {LEAD_FIELD_OPTIONS.map((field) => (
                <option key={field} value={field}>
                  {field === "ignore" ? "Ignore" : LEAD_FIELD_LABELS[field]}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {!hasChannelMapped && (
        <p className="text-[13px] text-warning">
          Map at least one channel (WhatsApp, email, phone, Instagram, or
          LinkedIn) — leads with no channel can&apos;t be contacted.
        </p>
      )}
      {error && <p className="text-[13px] text-destructive">{error}</p>}

      <DialogFooter>
        <Button variant="outline" onClick={onBack} disabled={importing}>
          Back
        </Button>
        <Button
          onClick={onImport}
          disabled={importing || sheet.rows.length === 0 || !hasChannelMapped}
        >
          {importing && <Loader2 className="h-4 w-4 animate-spin" />}
          Import {sheet.rows.length} lead{sheet.rows.length === 1 ? "" : "s"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function ResultStep({
  response,
  onDone,
}: {
  response: ApiLeadImportResponse;
  onDone: () => void;
}) {
  const problems = response.results.filter((r) => r.status === "skipped");

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Created" value={response.created} tone="success" />
        <Stat label="Updated" value={response.updated} tone="neutral" />
        <Stat label="Skipped" value={response.skipped} tone="warning" />
      </div>

      {problems.length > 0 && (
        <div className="scrollbar-none flex max-h-[160px] flex-col gap-1 overflow-y-auto rounded-lg border border-border p-2">
          {problems.map((row) => (
            <div
              key={row.row}
              className="flex items-center gap-2 text-[13px] text-muted-foreground"
            >
              <XCircle className="h-3.5 w-3.5 shrink-0 text-warning" />
              Row {row.row + 1}: {row.reason}
            </div>
          ))}
        </div>
      )}

      {problems.length === 0 && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
          Every row imported cleanly.
        </div>
      )}

      <DialogFooter>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "neutral";
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-secondary py-3">
      <span
        className={cn(
          "text-[20px] font-semibold",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="text-[12px] text-muted-foreground">{label}</span>
    </div>
  );
}
