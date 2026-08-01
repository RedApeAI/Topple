import { useEffect } from "react";
import { GalleryVerticalEnd } from "lucide-react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { ComingSoon } from "@/components/shared/ComingSoon";

export function CampaignsPage() {
  useEffect(() => {
    document.title = "AI Agent Campaigns — Plucia";
  }, []);

  return (
    <DashboardPage breadcrumb={["Dashboard", "AI Agent Campaigns"]}>
      <ComingSoon
        icon={GalleryVerticalEnd}
        title="AI Agent Campaigns is on the way"
        description="Launch and monitor autonomous outbound campaigns run by your AI Agents across every channel."
      />
    </DashboardPage>
  );
}
