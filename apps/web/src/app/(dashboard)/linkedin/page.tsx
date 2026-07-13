import type { Metadata } from "next";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { ComingSoon } from "@/components/shared/ComingSoon";
import { LinkedInIcon } from "@/components/shared/icons/brand-icons";

export const metadata: Metadata = { title: "LinkedIn — Plucia" };

export default function LinkedInPage() {
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
