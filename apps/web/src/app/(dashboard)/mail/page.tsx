import type { Metadata } from "next";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";

export const metadata: Metadata = { title: "Mail — Plucia" };

export default function MailPage() {
  return (
    <DashboardPage breadcrumb={["Dashboard", "Mail"]}>
      <InboxScreen lockedScope="mail" title="Mail" />
    </DashboardPage>
  );
}
