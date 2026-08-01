"use client";

import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { motion, useReducedMotion, useSpring } from "framer-motion";

/**
 * Hover-focus card group.
 *
 * `FocusGroup` tracks which `FocusCard` the cursor is over. The hovered card
 * scales up and tilts in 3D toward the cursor (spring-smoothed rotateX/Y),
 * while every sibling card blurs, dims and shrinks slightly — pulling focus
 * to the card under the pointer. Everything eases back on pointer-leave.
 * Inert under prefers-reduced-motion and on touch (no mouse events).
 */

const FocusCtx = createContext<{
  hovered: string | null;
  setHovered: Dispatch<SetStateAction<string | null>>;
} | null>(null);

export function FocusGroup({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div className={className} style={{ perspective: 1200 }}>
      <FocusCtx.Provider value={{ hovered, setHovered }}>
        {children}
      </FocusCtx.Provider>
    </div>
  );
}

/** Max tilt toward the cursor, in degrees (reached at the card's edges). */
const MAX_TILT = 7;

export function FocusCard({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const ctx = useContext(FocusCtx);
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const rotateX = useSpring(0, { stiffness: 180, damping: 20 });
  const rotateY = useSpring(0, { stiffness: 180, damping: 20 });

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  const focused = ctx?.hovered === id;
  const dimmed = !!ctx?.hovered && !focused;

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 900,
        zIndex: focused ? 20 : 1,
      }}
      animate={{
        scale: focused ? 1.045 : dimmed ? 0.965 : 1,
        filter: dimmed ? "blur(6px)" : "blur(0px)",
        opacity: dimmed ? 0.7 : 1,
      }}
      transition={{
        scale: { type: "spring", stiffness: 220, damping: 20 },
        filter: { duration: 0.35 },
        opacity: { duration: 0.35 },
      }}
      onMouseEnter={() => ctx?.setHovered(id)}
      onMouseMove={(e) => {
        if (!ref.current) return;
        const r = ref.current.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * 2 - 1;
        const py = ((e.clientY - r.top) / r.height) * 2 - 1;
        rotateX.set(py * MAX_TILT);
        rotateY.set(px * MAX_TILT);
      }}
      onMouseLeave={() => {
        rotateX.set(0);
        rotateY.set(0);
        ctx?.setHovered((prev) => (prev === id ? null : prev));
      }}
    >
      {children}
    </motion.div>
  );
}
