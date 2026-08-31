import { useEffect } from "react";
import { Activity } from "lucide-react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { ComingSoon } from "@/components/shared/ComingSoon";

export function OverviewPage() {
  useEffect(() => {
    document.title = "Overview — RedApeAI";
  }, []);

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
