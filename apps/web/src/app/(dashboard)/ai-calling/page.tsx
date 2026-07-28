import type { Metadata } from "next";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";

export const metadata: Metadata = { title: "AI Cold Calling — Plucia" };

export default function AiCallingPage() {
  return (
    <DashboardPage breadcrumb={["Dashboard", "AI Cold Calling"]}>
      <InboxScreen lockedScope="call" title="AI Cold Calling" />
    </DashboardPage>
  );
}
