"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";

/**
 * Cursor-follow + scroll parallax for collage compositions.
 *
 * `ParallaxGroup` tracks the pointer over its box and exposes the position as
 * normalized −1..1 motion values (0,0 at center), plus the group's scroll
 * progress through the viewport (0 entering at the bottom, 1 leaving at the
 * top). Each `ParallaxItem` shifts toward the cursor by up to `strength` px,
 * smoothed through its own spring — `speed` scales the spring's
 * responsiveness, so items drift at different rates. `scrollDepth` adds a
 * vertical scroll-linked drift: the item travels from +depth px to −depth px
 * as the group crosses the viewport, so different depths (and signs) make
 * elements float up/down at independent speeds. Pointer-leave eases the
 * cursor part back to rest. Inert under prefers-reduced-motion and, for the
 * cursor part, on touch (no mousemove).
 */

const ParallaxCtx = createContext<{
  nx: MotionValue<number>;
  ny: MotionValue<number>;
  scroll: MotionValue<number>;
} | null>(null);

export function ParallaxGroup({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const nx = useMotionValue(0);
  const ny = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  // rAF-throttled pointer tracking: raw mousemove can fire far more often
  // than the display refresh rate, and getBoundingClientRect() forces a
  // synchronous layout read — doing that per-event (rather than at most
  // once per animation frame) was the main source of scroll/hover jank here.
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      onMouseMove={(e) => {
        if (reduceMotion) return;
        pendingRef.current = { x: e.clientX, y: e.clientY };
        if (rafRef.current != null) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const pending = pendingRef.current;
          if (!pending || !ref.current) return;
          const r = ref.current.getBoundingClientRect();
          nx.set(((pending.x - r.left) / r.width) * 2 - 1);
          ny.set(((pending.y - r.top) / r.height) * 2 - 1);
        });
      }}
      onMouseLeave={() => {
        nx.set(0);
        ny.set(0);
      }}
    >
      <ParallaxCtx.Provider value={{ nx, ny, scroll: scrollYProgress }}>
        {children}
      </ParallaxCtx.Provider>
    </div>
  );
}

export function ParallaxItem({
  strength = 16,
  speed = 1,
  scrollDepth = 0,
  className = "",
  children,
}: {
  /** Max shift toward the cursor, in px (reached at the group's edges). */
  strength?: number;
  /** Spring responsiveness multiplier — higher follows the cursor faster. */
  speed?: number;
  /**
   * Scroll-linked vertical travel in px: +depth when the group enters the
   * viewport → −depth when it leaves. Positive floats up as you scroll down,
   * negative lags down; 0 disables.
   */
  scrollDepth?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(ParallaxCtx);
  const fallback = useMotionValue(0);
  const scrollFallback = useMotionValue(0.5);
  const reduceMotion = useReducedMotion();
  const nx = ctx?.nx ?? fallback;
  const ny = ctx?.ny ?? fallback;
  const scroll = ctx?.scroll ?? scrollFallback;

  const spring = { stiffness: 50 * speed, damping: 16 + 5 * speed, mass: 1 };
  const x = useSpring(
    useTransform(nx, (v) => v * strength),
    spring,
  );
  const cursorY = useSpring(
    useTransform(ny, (v) => v * strength),
    spring,
  );
  const scrollY = useTransform(scroll, [0, 1], [scrollDepth, -scrollDepth]);
  const y = useTransform(() => cursorY.get() + scrollY.get());

  return (
    <motion.div
      className={`${className} ${reduceMotion ? "" : "will-change-transform"}`}
      style={reduceMotion ? undefined : { x, y }}
      data-parallax-item
    >
      {children}
    </motion.div>
  );
}
