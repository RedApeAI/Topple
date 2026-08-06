import { useEffect } from "react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { MailScreen } from "@/features/mail/components/MailScreen";

export function MailPage() {
  useEffect(() => {
    document.title = "Mail — Plucia";
  }, []);

  return (
    <DashboardPage breadcrumb={["Dashboard", "Gmail"]}>
      <MailScreen />
    </DashboardPage>
  );
}
