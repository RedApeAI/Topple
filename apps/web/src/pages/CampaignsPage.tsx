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
        title="Campaigns need a campaign API"
        description="The current backend exposes Operator turns and messaging conversations, but it does not yet expose campaign creation, scheduling, or campaign analytics."
      />
    </DashboardPage>
  );
}
