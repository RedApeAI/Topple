import { useEffect } from "react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { ComingSoon } from "@/components/shared/ComingSoon";
import { LinkedInIcon } from "@/components/shared/icons/brand-icons";

export function LinkedInPage() {
  useEffect(() => {
    document.title = "LinkedIn — Plucia";
  }, []);

  return (
    <DashboardPage breadcrumb={["Dashboard", "Linkedin"]}>
      <ComingSoon
        icon={LinkedInIcon}
        title="LinkedIn is on the way"
        description="Manage LinkedIn conversations and let the Operator qualify and respond to inbound connections."
      />
    </DashboardPage>
  );
}
