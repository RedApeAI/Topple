/**
 * Color tokens — mirrors the CSS variables defined in `src/app/globals.css`.
 * Use these only where a JS/TS value is required (Recharts series, canvas,
 * dynamic inline styles). Everywhere else, use the Tailwind semantic
 * classes (`bg-background`, `text-muted-foreground`, …) so both themes
 * stay in sync automatically.
 */

export const channelColors = {
  whatsapp: "#34A853",
  linkedin: "#0A66C2",
  mail: "#FFFFFF",
  call: "#202020",
  instagram: {
    from: "#5342D6",
    via: "#EF2044",
    to: "#FEC053",
  },
} as const;

export const brandGradientStops = {
  1: "#FF2F2F",
  2: "#EF7B16",
  3: "#8A43E1",
  4: "#D511FD",
} as const;

export const chartPalette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export type ChannelKey = keyof typeof channelColors;
