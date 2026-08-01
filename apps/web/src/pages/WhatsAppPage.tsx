import { useEffect } from "react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";

export function WhatsAppPage() {
  useEffect(() => {
    document.title = "WhatsApp — Plucia";
  }, []);

  return (
    <DashboardPage breadcrumb={["Dashboard", "WhatsApp"]}>
      <InboxScreen lockedScope="whatsapp" title="WhatsApp" />
    </DashboardPage>
  );
}
