"use client";

import * as React from "react";
import { Loader2, MessageCirclePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/client";
import { startMessagingConversation } from "@/features/inbox/services/messaging.service";

interface NewWhatsAppConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  onCreated: () => Promise<void>;
}

export function NewWhatsAppConversationDialog({
  open,
  onOpenChange,
  accountId,
  onCreated,
}: NewWhatsAppConversationDialogProps) {
  const [phone, setPhone] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState<unknown>();
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!phone.trim() || !message.trim() || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await startMessagingConversation({
        accountId,
        participantIds: [phone.trim()],
        text: message.trim(),
      });
      await onCreated();
      setPhone("");
      setMessage("");
      onOpenChange(false);
    } catch (cause) {
      setError(cause);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start a WhatsApp conversation</DialogTitle>
          <DialogDescription>
            Enter the customer&apos;s number with its country code. WhatsApp
            policy or provider restrictions are validated by the API when
            sending.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="block space-y-1.5 text-[13px] font-medium text-foreground">
            Customer phone number
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+14155550123"
              inputMode="tel"
              pattern="\\+?[1-9][0-9]{6,14}"
              required
            />
          </label>
          <label className="block space-y-1.5 text-[13px] font-medium text-foreground">
            First message
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Write the first message"
              rows={4}
              required
              className="w-full resize-none rounded-lg border border-input bg-background px-2.5 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </label>
          {error ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              {errorMessage(error, "Could not start the conversation")}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <MessageCirclePlus />
              )}
              {submitting ? "Starting…" : "Start conversation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
