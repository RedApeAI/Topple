import { useEffect } from "react";
import { CalendarMinus2 } from "lucide-react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { ComingSoon } from "@/components/shared/ComingSoon";

export function CalendarPage() {
  useEffect(() => {
    document.title = "Calendar — Plucia";
  }, []);

  return (
    <DashboardPage breadcrumb={["Dashboard", "Calendar"]}>
      <ComingSoon
        icon={CalendarMinus2}
        title="Calendar needs a calendar API"
        description="No calendar provider or event resource is currently exposed by the backend, so this page is intentionally inactive."
      />
    </DashboardPage>
  );
}
