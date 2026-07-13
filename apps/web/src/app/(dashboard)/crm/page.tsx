import type { Metadata } from "next";
import { Route } from "lucide-react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { ComingSoon } from "@/components/shared/ComingSoon";

export const metadata: Metadata = { title: "CRM — Plucia" };

export default function CrmPage() {
  return (
    <DashboardPage breadcrumb={["Dashboard", "CRM"]}>
      <ComingSoon
        icon={Route}
        title="CRM is on the way"
        description="Track deals, pipeline stages, and every AI-touched lead in one relationship view."
      />
    </DashboardPage>
  );
}
