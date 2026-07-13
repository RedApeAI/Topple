/**
 * Spacing scale — base unit 2px. Matches the Tailwind default scale
 * (`p-1` = 4px, `p-5` = 20px, …), documented here for non-Tailwind
 * contexts (Framer Motion offsets, canvas/SVG layout, chart margins).
 */
export const spacing = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7.5: 30,
} as const;

export type SpacingKey = keyof typeof spacing;
