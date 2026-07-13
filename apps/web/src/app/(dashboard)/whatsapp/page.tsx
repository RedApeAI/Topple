import type { Metadata } from "next";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { ComingSoon } from "@/components/shared/ComingSoon";
import { WhatsAppIcon } from "@/components/shared/icons/brand-icons";

export const metadata: Metadata = { title: "WhatsApp — Plucia" };

export default function WhatsAppPage() {
  return (
    <DashboardPage breadcrumb={["Dashboard", "WhatsApp"]}>
      <ComingSoon
        icon={WhatsAppIcon}
        title="The full WhatsApp workspace is on the way"
        description="A dedicated 3-pane WhatsApp view — conversation list, thread, and the Operator side-by-side — is next up."
      />
    </DashboardPage>
  );
}
