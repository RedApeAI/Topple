"use client";

import { motion } from "framer-motion";
import { Check, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogoMark } from "@/components/shared/Logo";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { pulseVariants } from "@/design/tokens/motion";
import { AgentTrace } from "./AgentTrace";
import { ActionChip } from "./ActionChip";
import type { OperatorMessage } from "../types/operator.types";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface StreamingMessageProps {
  message: OperatorMessage;
  /** Draft (co-pilot) actions — for transcript drafts (messageId = the draft's
   * own id) and for agent action drafts (messageId = action.message_id). */
  onApprove?: (messageId: string) => void;
  onDiscard?: (messageId: string) => void;
  draftBusy?: boolean;
}

/**
 * One Operator-chat entry, per the Figma spec: user messages are gray
 * bubbles with the user's avatar on the right; Operator replies are plain
 * text beside the logo mark (no bubble); a running step pulses quietly.
 * Co-pilot drafts get a dashed outline and approve/discard actions.
 */
export function StreamingMessage({
  message,
  onApprove,
  onDiscard,
  draftBusy,
}: StreamingMessageProps) {
  const currentUser = useAuthStore((state) => state.user);
  const isUser = message.role === "user";
  const isRunning = message.status === "running";
  const isDraft = message.status === "draft";

  return (
    <div
      className={cn("flex items-start gap-2.5", isUser && "flex-row-reverse")}
    >
      {isUser ? (
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={currentUser?.image ?? undefined} alt="" />
          <AvatarFallback className="text-[11px]">
            {initials(currentUser?.name ?? "You")}
          </AvatarFallback>
        </Avatar>
      ) : (
        <LogoMark size={36} round className="shrink-0" />
      )}

      {isUser ? (
        <div className="max-w-[85%] rounded-[18px] bg-secondary px-4 py-2.5 text-[14px] leading-[1.45] text-secondary-foreground">
          {message.text}
        </div>
      ) : isRunning ? (
        <motion.p
          variants={pulseVariants}
          animate="animate"
          className="pt-2 text-[14px] font-medium text-muted-foreground"
        >
          {message.text}
        </motion.p>
      ) : isDraft ? (
        <div className="flex max-w-[85%] flex-col gap-1.5">
          <div className="rounded-[14px] border border-dashed border-foreground/40 bg-bubble-outgoing/50 px-3.5 py-2.5 text-[14px] leading-[1.45] text-foreground">
            {message.text}
          </div>
          <span className="flex items-center gap-2.5 px-1 text-[12px] text-muted-foreground">
            <span className="font-medium text-success">Draft</span>
            <button
              type="button"
              disabled={draftBusy}
              onClick={() => onApprove?.(message.id)}
              className="flex items-center gap-0.5 font-medium text-foreground hover:underline disabled:opacity-50"
            >
              <Check className="h-3 w-3" />
              Approve &amp; send
            </button>
            <button
              type="button"
              disabled={draftBusy}
              onClick={() => onDiscard?.(message.id)}
              className="flex items-center gap-0.5 font-medium text-destructive hover:underline disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
              Discard
            </button>
          </span>
        </div>
      ) : (
        <div className="flex max-w-[85%] flex-col gap-1.5 pt-1.5">
          {message.steps && message.steps.length > 0 && (
            <AgentTrace steps={message.steps} />
          )}
          <p className="text-[15px] leading-[1.5] text-foreground">
            {message.text}
          </p>
          {message.action && (
            <ActionChip
              action={message.action}
              busy={draftBusy}
              onApprove={
                message.action.message_id
                  ? () => onApprove?.(message.action!.message_id!)
                  : undefined
              }
              onDiscard={
                message.action.message_id
                  ? () => onDiscard?.(message.action!.message_id!)
                  : undefined
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
