"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/** Shared refresh cadence for the "AI Powered Sales Analytics" card. */
const TICK_MS = 1400;

// Anchor points (px inside the 386.67x212 media canvas) over the map's
// highlighted countries, cycled by the tooltip.
const COUNTRIES = [
  { name: "Mexico", left: 206, top: 146, base: 860 },
  { name: "Brazil", left: 250, top: 182, base: 1240 },
  { name: "Nigeria", left: 299, top: 168, base: 980 },
  { name: "Egypt", left: 322, top: 148, base: 1130 },
  { name: "India", left: 356, top: 152, base: 1720 },
];

/**
 * Tooltip that hops across the map every 1.4s: a pulsing marker plus a small
 * bubble showing the highlighted country's name and a fresh customer count.
 */
export function AnalyticsTooltip() {
  const reduceMotion = useReducedMotion();
  const [tick, setTick] = useState(0);
  const [value, setValue] = useState(COUNTRIES[0].base);

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, [reduceMotion]);

  const country = COUNTRIES[tick % COUNTRIES.length];

  useEffect(() => {
    setValue(country.base + Math.round(Math.random() * 240));
  }, [tick, country.base]);

  return (
    <motion.div
      className="absolute z-10 pointer-events-none"
      initial={false}
      animate={{ left: country.left, top: country.top }}
      transition={{ type: "spring", stiffness: 190, damping: 24 }}
    >
      {/* pulsing map marker */}
      <span className="absolute left-[-4px] top-[-4px] block size-[8px]">
        <motion.span
          className="absolute inset-0 rounded-full bg-[#f97316]"
          animate={
            reduceMotion ? undefined : { scale: [1, 2.4], opacity: [0.5, 0] }
          }
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
        />
        <span className="absolute inset-0 rounded-full bg-[#f97316] border-[1.5px] border-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]" />
      </span>
      {/* bubble */}
      <div className="absolute left-0 bottom-[8px] -translate-x-1/2 whitespace-nowrap rounded-[8px] bg-white px-[10px] py-[5px] shadow-[0px_8px_16px_-4px_rgba(0,0,0,0.16),0px_2px_4px_rgba(0,0,0,0.08)]">
        <p className="font-inter font-medium leading-[10px] text-[7.5px] text-[#92929d] tracking-[0.4px] uppercase">
          {country.name}
        </p>
        <div className="flex gap-[3px] items-baseline">
          <motion.p
            key={value}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="font-inter font-semibold leading-[14px] text-[#171725] text-[10.5px]"
          >
            {value.toLocaleString()}
          </motion.p>
          <p className="font-inter leading-[10px] text-[7.5px] text-[#92929d]">
            customers
          </p>
        </div>
        <div className="-translate-x-1/2 absolute -bottom-[3px] left-1/2 rotate-45 bg-white size-[6px]" />
      </div>
    </motion.div>
  );
}

/**
 * Bar-chart column that springs to a new random height on every tick, so the
 * chart reads as live data. Drop-in replacement for the static bar <img>.
 */
export function LiveBar({ src }: { src: string }) {
  const reduceMotion = useReducedMotion();
  const [scaleY, setScaleY] = useState(1);

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(
      () => setScaleY(0.55 + Math.random() * 0.5),
      TICK_MS,
    );
    return () => clearInterval(id);
  }, [reduceMotion]);

  return (
    <motion.img
      alt=""
      src={src}
      className="absolute block inset-0 max-w-none size-full"
      style={{ transformOrigin: "50% 100%" }}
      animate={{ scaleY }}
      transition={{ type: "spring", stiffness: 120, damping: 17 }}
    />
  );
}

/** Subtle breathing motion for the yellow line chart, synced to the tick. */
export function LiveChart({ src }: { src: string }) {
  const reduceMotion = useReducedMotion();
  const [scaleY, setScaleY] = useState(1);

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(
      () => setScaleY(0.93 + Math.random() * 0.1),
      TICK_MS,
    );
    return () => clearInterval(id);
  }, [reduceMotion]);

  return (
    <motion.img
      alt=""
      src={src}
      className="block max-w-none size-full"
      style={{ transformOrigin: "50% 100%" }}
      animate={{ scaleY }}
      transition={{ type: "spring", stiffness: 90, damping: 18 }}
    />
  );
}
