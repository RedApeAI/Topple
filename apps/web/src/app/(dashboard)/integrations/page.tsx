import type { Metadata } from "next";
import { Route } from "lucide-react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { ComingSoon } from "@/components/shared/ComingSoon";

export const metadata: Metadata = { title: "Integrations — Plucia" };

export default function IntegrationsPage() {
  return (
    <DashboardPage breadcrumb={["Dashboard", "Integrations"]}>
      <ComingSoon
        icon={Route}
        title="Integrations is on the way"
        description="Connect Supabase, your calendar, and every channel provider from one settings page."
      />
    </DashboardPage>
  );
}
