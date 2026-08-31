import { useEffect } from "react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { CrmScreen } from "@/features/crm/components/CrmScreen";

export function CrmPage() {
  useEffect(() => {
    document.title = "CRM — RedApeAI";
  }, []);

  return (
    <DashboardPage breadcrumb={["Dashboard", "CRM"]}>
      <CrmScreen />
    </DashboardPage>
  );
}
