import type { Metadata } from "next";
import { Activity } from "lucide-react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { ComingSoon } from "@/components/shared/ComingSoon";

export const metadata: Metadata = { title: "Overview — Plucia" };

export default function OverviewPage() {
  return (
    <DashboardPage breadcrumb={["Dashboard", "Overview"]}>
      <ComingSoon
        icon={Activity}
        title="Overview is on the way"
        description="Pipeline health, revenue signals, and AI Operator activity across every channel will land here."
      />
    </DashboardPage>
  );
}
