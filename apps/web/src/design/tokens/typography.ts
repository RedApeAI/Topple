/**
 * Typography tokens. Two families by design intent:
 *  - `heading` (Poppins) — person/contact names only (inbox rows, chat headers).
 *  - `sans` (Inter) — everything else (nav, buttons, body, badges).
 */
export const fontFamily = {
  sans: "var(--font-inter)",
  heading: "var(--font-poppins)",
  mono: "var(--font-geist-mono)",
} as const;

export const fontSize = {
  xs: "12px",
  sm: "13px",
  base: "14px",
  md: "15px",
  lg: "16px",
} as const;

/** Progressive negative tracking for dense list/preview rows — never apply to buttons or headings. */
export const tracking = {
  none: "0px",
  tight: "-0.16px",
  tighter: "-0.6px",
  tightest: "-0.7px",
} as const;

export const lineHeight = {
  ui: 1.5,
  preview: 1.3,
  none: 1,
} as const;
