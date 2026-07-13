import type { Metadata } from "next";
import { Phone } from "lucide-react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { ComingSoon } from "@/components/shared/ComingSoon";

export const metadata: Metadata = { title: "AI Cold Calling — Plucia" };

export default function AiCallingPage() {
  return (
    <DashboardPage breadcrumb={["Dashboard", "AI Cold Calling"]}>
      <ComingSoon
        icon={Phone}
        title="AI Cold Calling is on the way"
        description="Let the Operator place and log outbound calls, transcribe them, and hand off qualified leads."
      />
    </DashboardPage>
  );
}
