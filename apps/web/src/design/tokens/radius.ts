/** Corner radius scale — mirrors `--radius-*` in globals.css. */
export const radius = {
  sm: 4,
  md: 8,
  lg: 10,
  xl: 16,
  "2xl": 24,
  full: 9999,
} as const;

export type RadiusKey = keyof typeof radius;
