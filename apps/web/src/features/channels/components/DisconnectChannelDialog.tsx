import { Loader2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api/client";

interface DisconnectChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  accountName?: string | null;
  disconnecting: boolean;
  error?: unknown;
  onConfirm: () => void;
}

export function DisconnectChannelDialog({
  open,
  onOpenChange,
  label,
  accountName,
  disconnecting,
  error,
  onConfirm,
}: DisconnectChannelDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect {label}?</DialogTitle>
          <DialogDescription>
            {accountName ? `${accountName} will` : `This account will`} stop
            receiving and sending messages through Plucia. You can connect it
            again later.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {errorMessage(error, `Could not disconnect ${label}`)}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={disconnecting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={disconnecting}
          >
            {disconnecting ? <Loader2 className="animate-spin" /> : <Unplug />}
            {disconnecting ? "Disconnecting…" : `Disconnect ${label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
