import type { Metadata } from "next";
import { CalendarMinus2 } from "lucide-react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { ComingSoon } from "@/components/shared/ComingSoon";

export const metadata: Metadata = { title: "Calendar — Plucia" };

export default function CalendarPage() {
  return (
    <DashboardPage breadcrumb={["Dashboard", "Calendar"]}>
      <ComingSoon
        icon={CalendarMinus2}
        title="Calendar is on the way"
        description="See every meeting the Operator books for you, synced across channels."
      />
    </DashboardPage>
  );
}
