"use client";

import * as React from "react";
import { Link } from "react-router-dom";
import { Loader2, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChannelBadge } from "@/components/shared/ChannelBadge";
import { useContactLead } from "../hooks/use-contact-lead";
import type { Lead, LeadChannel } from "../types/lead.types";

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  mail: "email",
  call: "a call-back",
  instagram: "Instagram",
};

const CHANNEL_INBOX_HREF: Record<string, string> = {
  whatsapp: "/whatsapp",
  mail: "/mail",
  call: "/ai-calling",
  instagram: "/instagram",
};

interface ContactLeadDialogProps {
  lead: Lead | null;
  channel: LeadChannel | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Contact this lead" — the CRM's entry point into a brand new conversation.
 * There's no outbound-first endpoint on the orchestrator, so this plays the
 * lead's first message and shows the agent's live reply, same mechanic as
 * the inbox composer (see `sendInboundMessage`).
 */
export function ContactLeadDialog({
  lead,
  channel,
  onOpenChange,
}: ContactLeadDialogProps) {
  const [text, setText] = React.useState("");
  const contact = useContactLead();
  const open = Boolean(lead && channel);

  React.useEffect(() => {
    if (!open) return;
    setText("");
    contact.reset();
    // Reset only when a *new* lead/channel pair opens, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id, channel?.channel, open]);

  if (!lead || !channel) return null;

  const send = () => {
    if (!text.trim()) return;
    contact.mutate({ leadChannel: channel, text: text.trim() });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ChannelBadge channel={channel.channel} size={22} />
            <DialogTitle>Message {lead.name}</DialogTitle>
          </div>
          <DialogDescription>
            Sends on {CHANNEL_LABEL[channel.channel] ?? channel.channel} to{" "}
            {channel.externalId}. There&apos;s no live channel gateway yet, so
            this plays the lead&apos;s first message and lets the AI agent reply
            — same as the inbox composer.
          </DialogDescription>
        </DialogHeader>

        {contact.data ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                You (as {lead.name})
              </span>
              <p className="text-[14px] text-foreground">{text}</p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                Agent reply
              </span>
              {contact.data.reply.messages.length > 0 ? (
                contact.data.reply.messages.map((message, i) => (
                  <p key={i} className="text-[14px] text-foreground">
                    {message}
                  </p>
                ))
              ) : (
                <p className="text-[13px] italic text-muted-foreground">
                  {contact.data.reply.status === "suppressed"
                    ? "Suppressed by guardrails."
                    : "No reply generated."}
                </p>
              )}
            </div>
            <Link
              to={CHANNEL_INBOX_HREF[channel.channel] ?? "/inbox"}
              className="self-start text-[13px] font-medium text-foreground underline underline-offset-2"
            >
              Continue in the{" "}
              {CHANNEL_LABEL[channel.channel] ?? channel.channel} inbox →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder={`First message from ${lead.name}…`}
              aria-label="First message"
              className="w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-[14px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            {contact.isError && (
              <p className="text-[13px] text-destructive">
                {contact.error instanceof Error
                  ? contact.error.message
                  : "Couldn't send that message."}
              </p>
            )}
            <Button
              onClick={send}
              disabled={!text.trim() || contact.isPending}
              className="self-end"
            >
              {contact.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
