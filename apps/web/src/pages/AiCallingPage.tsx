import { useEffect } from "react";
import { PhoneCall } from "lucide-react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { ComingSoon } from "@/components/shared/ComingSoon";

export function AiCallingPage() {
  useEffect(() => {
    document.title = "AI Cold Calling — Plucia";
  }, []);

  return (
    <DashboardPage breadcrumb={["Dashboard", "AI Cold Calling"]}>
      <ComingSoon
        icon={PhoneCall}
        title="AI Cold Calling needs a voice API"
        description="The current backend exposes voice turns to the Operator, but it does not yet expose a calling account, dialer, or call-history resource for this page."
      />
    </DashboardPage>
  );
}
