"use client";

import { Fragment, useEffect, useRef } from "react";
import { useAnimationFrame, useReducedMotion } from "framer-motion";

/**
 * GSAP-homepage-style cursor distortion for headlines.
 *
 * Splits `text` into per-character spans. Characters within `radius` px of
 * the cursor get pushed away, rotate with the push, scale up a hair, and —
 * because Manrope/Inter are loaded as variable fonts — their weight bends
 * from `baseWeight` toward `baseWeight + weightShift`. Everything relaxes
 * back through a frame-rate-independent lerp, so letters "smear" and recover
 * like liquid. Styles are written straight to the DOM in one rAF loop (no
 * React re-renders). Mouse pointers only (touch is inert) and fully disabled
 * under prefers-reduced-motion. Screen readers get the plain string via an
 * sr-only span; the visual chars are aria-hidden.
 *
 * Renders as plain inline content, so wrapping and text-align on the parent
 * keep working; word chunks are whitespace-nowrap so words never break.
 */

const cursor = { x: -1e5, y: -1e5 };
let cursorBound = false;

function bindCursor() {
  if (cursorBound || typeof window === "undefined") return;
  cursorBound = true;
  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType === "mouse") {
        cursor.x = e.clientX;
        cursor.y = e.clientY;
      }
    },
    { passive: true },
  );
}

type CharState = { el: HTMLSpanElement; x: number; y: number; w: number };

export default function DistortText({
  text,
  className = "",
  baseWeight = 600,
  weightShift = 200,
  radius = 130,
  strength = 18,
}: {
  text: string;
  className?: string;
  /** Resting wght of the variable font (match the parent's font-weight). */
  baseWeight?: number;
  /** How far wght bends at the cursor (Manrope maxes out at 800). */
  weightShift?: number;
  /** Cursor influence radius in px. */
  radius?: number;
  /** Max push distance in px at the cursor. */
  strength?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const charsRef = useRef<CharState[]>([]);
  const settledRef = useRef(true);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    bindCursor();
    const container = ref.current;
    if (!container) return;
    charsRef.current = Array.from(
      container.querySelectorAll<HTMLSpanElement>("[data-ch]"),
    ).map((el) => ({ el, x: 0, y: 0, w: 0 }));
    settledRef.current = false;
  }, [text]);

  useAnimationFrame((_, delta) => {
    if (reduceMotion) return;
    const container = ref.current;
    if (!container || charsRef.current.length === 0) return;

    const rect = container.getBoundingClientRect();
    const margin = radius + strength;
    const near =
      cursor.x > rect.left - margin &&
      cursor.x < rect.right + margin &&
      cursor.y > rect.top - margin &&
      cursor.y < rect.bottom + margin;
    if (!near && settledRef.current) return;

    // frame-rate-independent smoothing (~90ms time constant)
    const k = 1 - Math.exp(-delta / 90);
    let settled = !near;

    for (const c of charsRef.current) {
      let tx = 0;
      let ty = 0;
      let tw = 0;
      if (near) {
        const r = c.el.getBoundingClientRect();
        // subtract the current push to measure the char's natural center
        const cx = r.left + r.width / 2 - c.x;
        const cy = r.top + r.height / 2 - c.y;
        const dx = cx - cursor.x;
        const dy = cy - cursor.y;
        const d = Math.hypot(dx, dy);
        if (d < radius) {
          const t = 1 - d / radius;
          const ease = t * t * (3 - 2 * t);
          const inv = d > 0.001 ? 1 / d : 0;
          tx = dx * inv * strength * ease;
          ty = dy * inv * strength * ease;
          tw = ease;
        }
      }

      c.x += (tx - c.x) * k;
      c.y += (ty - c.y) * k;
      c.w += (tw - c.w) * k;

      const active =
        c.w > 0.004 || Math.abs(c.x) > 0.05 || Math.abs(c.y) > 0.05;
      if (active) {
        settled = false;
        c.el.style.transform = `translate3d(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px, 0) rotate(${(c.x * 0.35).toFixed(2)}deg) scale(${(1 + c.w * 0.08).toFixed(3)})`;
        c.el.style.fontVariationSettings = `"wght" ${Math.round(baseWeight + weightShift * c.w)}`;
      } else if (c.el.style.transform) {
        c.el.style.transform = "";
        c.el.style.fontVariationSettings = "";
        c.x = 0;
        c.y = 0;
        c.w = 0;
      }
    }
    settledRef.current = settled;
  });

  const words = text.split(" ").filter(Boolean);

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden ref={ref}>
        {words.map((word, wi) => (
          <Fragment key={wi}>
            <span className="inline-block whitespace-nowrap">
              {Array.from(word).map((ch, ci) => (
                <span data-ch key={ci} className="inline-block">
                  {ch}
                </span>
              ))}
            </span>
            {wi < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </span>
    </span>
  );
}
