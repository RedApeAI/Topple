import type { Metadata } from "next";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";

export const metadata: Metadata = { title: "WhatsApp — Plucia" };

export default function WhatsAppPage() {
  return (
    <DashboardPage breadcrumb={["Dashboard", "WhatsApp"]}>
      <InboxScreen lockedScope="whatsapp" title="WhatsApp" />
    </DashboardPage>
  );
}
