/**
 * Status is an open string (new agent workflows introduce new labels), so
 * color is resolved by keyword rather than a closed map. Falls back to a
 * neutral dot for anything unrecognized.
 */
const STATUS_KEYWORDS: { test: RegExp; className: string }[] = [
  { test: /waiting|pending|blocked/i, className: "bg-warning" },
  {
    test: /progress|development|ongoing|running|outreach/i,
    className: "bg-chart-2",
  },
  { test: /scheduled|planned|completed|done/i, className: "bg-success" },
  { test: /cancelled|failed/i, className: "bg-destructive" },
  { test: /research|brainstorm|draft/i, className: "bg-chart-3" },
];

export function statusDotClassName(status: string): string {
  return (
    STATUS_KEYWORDS.find((s) => s.test.test(status))?.className ??
    "bg-muted-foreground"
  );
}
