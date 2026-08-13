import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CircleAlert,
  Inbox,
  Link2,
  RefreshCw,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
import {
  fetchMessagingAccounts,
  fetchMessagingConversations,
} from "@/features/inbox/services/messaging.service";
import { listOperatorThreads } from "@/lib/mock/operator-agent";
import { fetchLeads } from "@/features/crm/services/lead.service";

interface OverviewData {
  connectedAccounts: number;
  conversations: number;
  unread: number;
  leads: number;
  operatorThreads: number;
  channels: Array<{ channel: string; count: number }>;
}

function isFulfilled<T>(
  result: PromiseSettledResult<T>,
): result is PromiseFulfilledResult<T> {
  return result.status === "fulfilled";
}

export function OverviewPage() {
  const [data, setData] = useState<OverviewData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const results = await Promise.allSettled([
      fetchMessagingAccounts(),
      fetchMessagingConversations("all"),
      fetchLeads(),
      listOperatorThreads(30),
    ]);
    const [accountsResult, conversationsResult, leadsResult, threadsResult] =
      results;
    const accounts = isFulfilled(accountsResult) ? accountsResult.value : [];
    const conversations = isFulfilled(conversationsResult)
      ? conversationsResult.value
      : [];
    const leads = isFulfilled(leadsResult) ? leadsResult.value : [];
    const threads = isFulfilled(threadsResult) ? threadsResult.value : [];
    const channelCounts = new Map<string, number>();
    for (const conversation of conversations) {
      channelCounts.set(
        conversation.channel,
        (channelCounts.get(conversation.channel) ?? 0) + 1,
      );
    }
    setData({
      connectedAccounts: accounts.filter(
        (account) => account.enabled && account.status === "connected",
      ).length,
      conversations: conversations.length,
      unread: conversations.reduce(
        (total, conversation) => total + (conversation.unreadCount ?? 0),
        0,
      ),
      leads: leads.length,
      operatorThreads: threads.length,
      channels: [...channelCounts.entries()]
        .sort(([, a], [, b]) => b - a)
        .map(([channel, count]) => ({ channel, count })),
    });
    const firstFailure = results.find((result) => result.status === "rejected");
    if (firstFailure?.status === "rejected") {
      setError(
        errorMessage(
          firstFailure.reason,
          "Some overview data could not be loaded.",
        ),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    document.title = "Overview — Plucia";
    void load();
  }, [load]);

  return (
    <DashboardPage breadcrumb={["Dashboard", "Overview"]}>
      <div className="flex h-full min-h-0 flex-1 flex-col gap-4 rounded-[10px] bg-muted p-3">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-border-subtle bg-gradient-to-br from-background via-background to-secondary/35 px-4 py-4 shadow-sm">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Live workspace
            </div>
            <h1 className="font-heading text-[20px] font-semibold tracking-[-0.3px] text-foreground">
              Workspace overview
            </h1>
            <p className="mt-1 px-1 text-[12px] text-muted-foreground">
              Live counts from your connected messaging, CRM, and Operator data.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-[13px] text-foreground">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>{error}</span>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-2xl bg-background"
              />
            ))}
          </div>
        ) : data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <OverviewCard
                icon={Inbox}
                label="Inbox conversations"
                value={data.conversations}
                href="/dashboard/inbox"
                tone="violet"
              />
              <OverviewCard
                icon={Activity}
                label="Unread messages"
                value={data.unread}
                href="/dashboard/inbox"
                tone="orange"
              />
              <OverviewCard
                icon={Link2}
                label="Connected accounts"
                value={data.connectedAccounts}
                href="/dashboard/inbox"
                tone="green"
              />
              <OverviewCard
                icon={Users}
                label="CRM leads"
                value={data.leads}
                href="/dashboard/crm"
                tone="blue"
              />
            </div>

            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
              <section className="rounded-2xl border border-border-subtle bg-background/85 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="font-heading text-[15px] font-semibold text-foreground">
                    Conversations by channel
                  </h2>
                  <Link
                    to="/dashboard/inbox"
                    className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    Open inbox <ArrowUpRight className="inline h-3.5 w-3.5" />
                  </Link>
                </div>
                {data.channels.length ? (
                  <div className="mt-4 space-y-3">
                    {data.channels.map(({ channel, count }) => (
                      <div key={channel}>
                        <div className="flex items-center justify-between text-[13px]">
                          <span className="capitalize text-foreground">
                            {channel}
                          </span>
                          <span className="text-muted-foreground">{count}</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-brand-3 to-brand-4 transition-all"
                            style={{
                              width: `${Math.max(
                                8,
                                (count / data.conversations) * 100,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-[13px] text-muted-foreground">
                    No messaging conversations have been synced yet.
                  </p>
                )}
              </section>

              <section className="relative overflow-hidden rounded-2xl border border-border-subtle bg-background/85 p-4 shadow-sm">
                <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-brand-3/10 blur-2xl" />
                <div className="relative flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                    <Activity className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="font-heading text-[15px] font-semibold text-foreground">
                      Operator activity
                    </h2>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      {data.operatorThreads} recent Operator threads are
                      available.
                    </p>
                  </div>
                </div>
                <Link
                  to="/dashboard/inbox"
                  className="relative mt-6 inline-flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-[12px] font-semibold text-secondary-foreground transition-colors hover:bg-accent"
                >
                  Open the Operator <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </DashboardPage>
  );
}

function OverviewCard({
  icon: Icon,
  label,
  value,
  href,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  href: string;
  tone: "violet" | "orange" | "green" | "blue";
}) {
  const toneClasses = {
    violet: "bg-brand-3/10 text-brand-3",
    orange: "bg-warning/12 text-warning",
    green: "bg-success/10 text-success",
    blue: "bg-channel-linkedin/10 text-channel-linkedin",
  } as const;

  return (
    <Link
      to={href}
      className="group rounded-2xl border border-border-subtle bg-background/85 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-border hover:bg-background hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-muted-foreground">
          {label}
        </span>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-xl ${toneClasses[tone]}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-2">
        <p className="font-heading text-2xl font-semibold text-foreground">
          {value}
        </p>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
