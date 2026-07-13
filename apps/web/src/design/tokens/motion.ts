import type { Variants } from "framer-motion";

/** Motion tokens for Framer Motion — durations capped at 150–300ms per design.md §8. */
export const duration = {
  fast: 0.15,
  base: 0.2,
  slow: 0.25,
  slower: 0.3,
} as const;

export const ease = {
  out: [0.16, 1, 0.3, 1],
  in: [0.7, 0, 0.84, 0],
  inOut: [0.65, 0, 0.35, 1],
} satisfies Record<string, [number, number, number, number]>;

export const drawerVariants: Variants = {
  hidden: { x: 24, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { duration: duration.slow, ease: ease.out },
  },
  exit: {
    x: 24,
    opacity: 0,
    transition: { duration: duration.base, ease: ease.in },
  },
};

export const fadeInVariants: Variants = {
  hidden: { opacity: 0, y: -4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.base, ease: ease.out },
  },
};

export const pulseVariants: Variants = {
  animate: {
    opacity: [0.5, 1, 0.5],
    transition: { duration: 1.2, repeat: Infinity, ease: ease.inOut },
  },
};
