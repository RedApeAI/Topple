import { useEffect } from "react";
import { CalendarMinus2 } from "lucide-react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { ComingSoon } from "@/components/shared/ComingSoon";

export function CalendarPage() {
  useEffect(() => {
    document.title = "Calendar — RedApeAI";
  }, []);

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
