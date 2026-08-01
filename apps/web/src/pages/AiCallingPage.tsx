import { useEffect } from "react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";

export function AiCallingPage() {
  useEffect(() => {
    document.title = "AI Cold Calling — Plucia";
  }, []);

  return (
    <DashboardPage breadcrumb={["Dashboard", "AI Cold Calling"]}>
      <InboxScreen lockedScope="call" title="AI Cold Calling" />
    </DashboardPage>
  );
}
