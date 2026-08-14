import * as React from "react";
import { Check, Loader2, Plug, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  connectUrl,
  fetchConnectors,
  type Connector,
} from "@/features/connectors/connectors.service";

/**
 * Connectors: the accounts the agent is allowed to act on.
 *
 * Consent is incremental by design — signing in never asks for calendar
 * access, and connecting one thing asks for exactly that thing. Each connector
 * contributes tools the agent discovers over MCP, so what a card grants is
 * literally what the agent gains.
 */
export function ConnectorsPage() {
  const [connectors, setConnectors] = React.useState<Connector[]>();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setConnectors(await fetchConnectors());
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, "Couldn't load your connectors"));
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const connect = async (connector: Connector) => {
    setPending(connector.id);
    setError(null);
    try {
      // Full-page navigation, not a popup: Google's consent screen refuses to
      // render in an iframe, and a popup here would be blocked as often as not.
      window.location.assign(
        await connectUrl(connector.id, "/dashboard/connectors"),
      );
    } catch (cause) {
      setError(errorMessage(cause, `Couldn't connect ${connector.label}`));
      setPending(null);
    }
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-[22px] font-semibold text-foreground">
          Connectors
        </h1>
        <p className="max-w-[560px] text-[14px] text-muted-foreground">
          Accounts the Operator agent can act on. Connecting one asks Google for
          just that permission — nothing is granted at sign-in.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-[13px] text-foreground"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {connectors === undefined
          ? Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="h-[150px] animate-pulse rounded-xl border border-border bg-secondary/50"
              />
            ))
          : connectors.map((connector) => (
              <article
                key={connector.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Plug className="h-4 w-4 text-muted-foreground" />
                    <h2 className="font-heading text-[15px] font-semibold text-foreground">
                      {connector.label}
                    </h2>
                  </div>
                  <span
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium",
                      connector.connected
                        ? "bg-success/10 text-success"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {connector.connected && <Check className="h-3 w-3" />}
                    {connector.connected ? "Connected" : "Not connected"}
                  </span>
                </div>

                <p className="flex-1 text-[13px] leading-relaxed text-muted-foreground">
                  {connector.description}
                </p>

                {connector.tools.length > 0 && (
                  <p className="text-[12px] text-muted-foreground">
                    Gives the agent:{" "}
                    <span className="font-mono">
                      {connector.tools.join(", ")}
                    </span>
                  </p>
                )}

                <Button
                  variant={connector.connected ? "outline" : "default"}
                  disabled={pending === connector.id || connector.connected}
                  onClick={() => void connect(connector)}
                  className="self-start"
                >
                  {pending === connector.id && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {connector.connected ? "Connected" : "Connect"}
                </Button>
              </article>
            ))}
      </div>
    </main>
  );
}
