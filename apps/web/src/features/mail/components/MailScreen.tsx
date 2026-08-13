"use client";

import * as React from "react";
import { useMailStore } from "../store/mail.store";
import { selectMessages } from "../lib/mail-filter";
import { useMailShortcuts } from "../hooks/use-mail-shortcuts";
import { MailHeader } from "./MailHeader";
import { MailSidebar } from "./MailSidebar";
import { MailToolbar } from "./MailToolbar";
import { MailList } from "./MailList";
import { MailReader } from "./MailReader";
import { ComposeDialog } from "./ComposeDialog";
import { MailUndoToast } from "./MailUndoToast";

export function MailScreen() {
  const messages = useMailStore((state) => state.messages);
  const status = useMailStore((state) => state.status);
  const error = useMailStore((state) => state.error);
  const filter = useMailStore((state) => state.filter);
  const query = useMailStore((state) => state.query);
  const openId = useMailStore((state) => state.openId);
  const load = useMailStore((state) => state.load);

  const [focusedId, setFocusedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    void load();
  }, [load]);

  const visible = React.useMemo(
    () => selectMessages(messages, filter, query),
    [messages, filter, query],
  );

  // The keyboard cursor must never point at a row the current view dropped.
  React.useEffect(() => {
    if (focusedId && !visible.some((message) => message.id === focusedId)) {
      setFocusedId(null);
    }
  }, [visible, focusedId]);

  useMailShortcuts({ messages: visible, focusedId, setFocusedId });

  const open = openId
    ? messages.find((message) => message.id === openId)
    : undefined;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-card">
      <MailHeader />

      <div className="flex min-h-0 flex-1">
        <MailSidebar />

        {/* min-w-0 is load-bearing: without it this column refuses to shrink
            below the list's min-content width and the card clips its own
            right edge, toolbar actions included. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-mail-surface">
          {open ? (
            <MailReader message={open} />
          ) : (
            <>
              <MailToolbar visible={visible} />
              <div className="min-h-0 flex-1 overflow-y-auto">
                <MailList
                  messages={visible}
                  loading={status === "idle" || status === "loading"}
                  error={status === "error" ? error : undefined}
                  onRetry={() => void load(true)}
                  focusedId={focusedId}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <ComposeDialog />
      <MailUndoToast />
    </div>
  );
}
