import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ExternalLink, Loader2, MessageCirclePlus } from "lucide-react";
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
import {
  fetchWhatsAppTemplates,
  startWhatsAppConversation,
} from "../services/zernio.service";
import type { WhatsAppTemplate } from "../types/zernio.types";

interface NewWhatsAppConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  onCreated: () => Promise<void>;
}

function templateLabel(template: WhatsAppTemplate) {
  return `${template.name.replaceAll("_", " ")} · ${template.language}`;
}

export function NewWhatsAppConversationDialog({
  open,
  onOpenChange,
  accountId,
  onCreated,
}: NewWhatsAppConversationDialogProps) {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>();
  const [templateName, setTemplateName] = useState("");
  const [phone, setPhone] = useState("");
  const [params, setParams] = useState("");
  const [error, setError] = useState<unknown>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(undefined);
    setTemplates(undefined);
    void fetchWhatsAppTemplates(accountId)
      .then((items) => {
        setTemplates(items);
        setTemplateName(items[0]?.name ?? "");
      })
      .catch(setError);
  }, [accountId, open]);

  const selected = useMemo(
    () => templates?.find((template) => template.name === templateName),
    [templateName, templates],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await startWhatsAppConversation({
        accountId,
        participantId: phone.trim(),
        templateName: selected.name,
        templateLanguage: selected.language,
        templateParams: params
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      });
      await onCreated();
      onOpenChange(false);
      setPhone("");
      setParams("");
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
            WhatsApp requires an approved template for the first message. Once
            the customer replies, you can send regular messages for 24 hours.
          </DialogDescription>
        </DialogHeader>

        {templates === undefined && !error ? (
          <div className="flex min-h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : templates?.length === 0 ? (
          <div className="space-y-3 rounded-xl border border-border bg-muted p-4">
            <p className="text-[14px] font-medium text-foreground">
              No approved templates yet
            </p>
            <p className="text-[13px] leading-5 text-muted-foreground">
              Ask the customer to message your business number first, or create
              and approve a WhatsApp template in Zernio before starting the
              conversation from Plucia.
            </p>
            <Button
              render={
                <a
                  href="https://zernio.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                />
              }
              variant="outline"
              size="sm"
            >
              Open Zernio templates
              <ExternalLink />
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <label className="block space-y-1.5 text-[13px] font-medium text-foreground">
              Customer phone number
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+14155550123"
                inputMode="tel"
                pattern="\+?[1-9][0-9]{6,14}"
                required
              />
              <span className="block text-[12px] font-normal text-muted-foreground">
                Include the country code.
              </span>
            </label>

            <label className="block space-y-1.5 text-[13px] font-medium text-foreground">
              Approved template
              <select
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-[13px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              >
                {templates?.map((template) => (
                  <option key={template.id} value={template.name}>
                    {templateLabel(template)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5 text-[13px] font-medium text-foreground">
              Template variables
              <textarea
                value={params}
                onChange={(event) => setParams(event.target.value)}
                placeholder={"One value per line\nAriyaman\nTomorrow at 10:00"}
                rows={4}
                className="w-full resize-none rounded-lg border border-input bg-background px-2.5 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
              <span className="block text-[12px] font-normal text-muted-foreground">
                Enter values in the same order as the placeholders in Meta.
              </span>
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
              <Button type="submit" disabled={submitting || !selected}>
                {submitting ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <MessageCirclePlus />
                )}
                {submitting ? "Sending…" : "Send template"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {error && templates === undefined ? (
          <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {errorMessage(error, "Could not load WhatsApp templates")}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
