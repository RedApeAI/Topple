import type { Metadata } from "next";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";

export const metadata: Metadata = { title: "One Inbox — Plucia" };

export default function InboxPage() {
  return (
    <DashboardPage breadcrumb={["Dashboard", "One Inbox"]}>
      <InboxScreen />
    </DashboardPage>
  );
}
