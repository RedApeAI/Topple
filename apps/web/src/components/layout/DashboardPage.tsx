import { Topbar } from "./Topbar";

interface DashboardPageProps {
  breadcrumb: string[];
  children: React.ReactNode;
}

/** Standard per-page column: breadcrumb topbar + padded content area. */
export function DashboardPage({ breadcrumb, children }: DashboardPageProps) {
  return (
    <>
      <Topbar breadcrumb={breadcrumb} />
      <main className="flex min-h-0 flex-1 flex-col p-5">{children}</main>
    </>
  );
}
