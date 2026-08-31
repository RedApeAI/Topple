import { useEffect } from "react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";

export function InstagramPage() {
  useEffect(() => {
    document.title = "Instagram — RedApeAI";
  }, []);

  return (
    <DashboardPage breadcrumb={["Dashboard", "Instagram"]}>
      <InboxScreen lockedScope="instagram" title="Instagram" />
    </DashboardPage>
  );
}
