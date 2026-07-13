import type { Metadata } from "next";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { ComingSoon } from "@/components/shared/ComingSoon";
import { InstagramIcon } from "@/components/shared/icons/brand-icons";

export const metadata: Metadata = { title: "Instagram — Plucia" };

export default function InstagramPage() {
  return (
    <DashboardPage breadcrumb={["Dashboard", "Instagram"]}>
      <ComingSoon
        icon={InstagramIcon}
        title="Instagram is on the way"
        description="Reply to DMs and comments with the same unified inbox and Operator handoff as every other channel."
      />
    </DashboardPage>
  );
}
