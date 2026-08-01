"use client";

import { Check, CheckCircle2, Trash2, XCircle } from "lucide-react";
// Missing integration module: @/lib/api/orchestrator.types
// import type { ApiOperatorActionResult } from "@/lib/api/orchestrator.types";
import type { ApiOperatorActionResult } from "@/lib/mock/orchestrator.types";

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "email",
  voice: "phone",
  instagram: "Instagram",
};

interface ActionChipProps {
  action: ApiOperatorActionResult;
  busy?: boolean;
  onApprove?: () => void;
  onDiscard?: () => void;
}

/** The outcome of an agent action, with draft approval controls in co-pilot. */
export function ActionChip({
  action,
  busy,
  onApprove,
  onDiscard,
}: ActionChipProps) {
  const channel = CHANNEL_LABELS[action.channel ?? ""] ?? action.channel;
  const who = action.contact_name ?? "the contact";

  if (action.status === "failed") {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-foreground">
        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
        <span>Couldn&apos;t complete the action — {action.reason}</span>
      </div>
    );
  }

  if (action.status === "draft") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-foreground/40 bg-bubble-outgoing/50 px-3 py-2.5">
        <span className="text-[12px] font-medium text-muted-foreground">
          Draft to {who} on {channel}
        </span>
        <p className="text-[14px] leading-[1.45] text-foreground">
          {action.text}
        </p>
        <span className="flex items-center gap-2.5 text-[12px]">
          <button
            type="button"
            disabled={busy}
            onClick={onApprove}
            className="flex items-center gap-0.5 font-medium text-foreground hover:underline disabled:opacity-50"
          >
            <Check className="h-3 w-3" />
            Approve &amp; send
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDiscard}
            className="flex items-center gap-0.5 font-medium text-destructive hover:underline disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            Discard
          </button>
        </span>
      </div>
    );
  }

  if (action.status === "discarded") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-[13px] text-muted-foreground">
        <Trash2 className="h-3.5 w-3.5 shrink-0" />
        Draft discarded
      </div>
    );
  }

  // sent / approved
  return (
    <div className="flex items-start gap-2 rounded-lg bg-success/10 px-3 py-2 text-[13px] text-foreground">
      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
      <span>
        Sent to {who} on {channel}: &ldquo;{action.text}&rdquo;
      </span>
    </div>
  );
}
