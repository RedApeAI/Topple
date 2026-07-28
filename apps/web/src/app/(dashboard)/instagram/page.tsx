import type { Metadata } from "next";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";

export const metadata: Metadata = { title: "Instagram — Plucia" };

export default function InstagramPage() {
  return (
    <DashboardPage breadcrumb={["Dashboard", "Instagram"]}>
      <InboxScreen lockedScope="instagram" title="Instagram" />
    </DashboardPage>
  );
}
