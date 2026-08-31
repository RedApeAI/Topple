import { useEffect } from "react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";

export function InboxPage() {
  useEffect(() => {
    document.title = "One Inbox — RedApeAI";
  }, []);

  return (
    <DashboardPage breadcrumb={["Dashboard", "One Inbox"]}>
      <InboxScreen />
    </DashboardPage>
  );
}
