import type { Metadata } from "next";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { CrmScreen } from "@/features/crm/components/CrmScreen";

export const metadata: Metadata = { title: "CRM — Plucia" };

export default function CrmPage() {
  return (
    <DashboardPage breadcrumb={["Dashboard", "CRM"]}>
      <CrmScreen />
    </DashboardPage>
  );
}
