import { OperatorLauncher } from "@/features/operator/components/OperatorLauncher";
import { OperatorPanel } from "@/features/operator/components/OperatorPanel";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
        <OperatorPanel />
      </div>
      <OperatorLauncher />
    </div>
  );
}
