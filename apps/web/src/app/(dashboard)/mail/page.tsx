import type { Metadata } from "next";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { ComingSoon } from "@/components/shared/ComingSoon";
import { GmailIcon } from "@/components/shared/icons/brand-icons";

export const metadata: Metadata = { title: "Mail — Plucia" };

export default function MailPage() {
  return (
    <DashboardPage breadcrumb={["Dashboard", "Mail"]}>
      <ComingSoon
        icon={GmailIcon}
        title="Mail is on the way"
        description="Connect your inbox and let the Operator draft, summarize, and triage email threads for you."
      />
    </DashboardPage>
  );
}
