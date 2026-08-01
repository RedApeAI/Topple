import { useEffect } from "react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";

export function MailPage() {
  useEffect(() => {
    document.title = "Mail — Plucia";
  }, []);

  return (
    <DashboardPage breadcrumb={["Dashboard", "Mail"]}>
      <InboxScreen lockedScope="mail" title="Mail" />
    </DashboardPage>
  );
}
