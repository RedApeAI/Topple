"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const imgCallSpark02 = "/assets/icons/call-spark-02.svg";

// Baseline bar heights from the Figma design, either side of the call button.
const LEFT_BARS = [
  60, 43.333, 36.667, 60, 80, 73.333, 50, 60, 43.333, 36.667, 60, 80, 73.333,
  50, 56.667, 36.667, 43.333, 36.667, 73.333, 43.333,
];
const RIGHT_BARS = [
  43.333, 66.667, 83.333, 63.333, 43.333, 30, 56.667, 40, 46.667, 70, 40,
  56.667, 56.667, 40, 46.667, 70, 40, 56.667,
];

const GRADIENT_STOPS =
  "<stop stop-color='rgba(255,255,255,1)' offset='0'/><stop stop-color='rgba(223,223,223,1)' offset='0.0625'/><stop stop-color='rgba(191,191,191,1)' offset='0.125'/><stop stop-color='rgba(159,159,159,1)' offset='0.1875'/><stop stop-color='rgba(128,128,128,1)' offset='0.25'/><stop stop-color='rgba(96,96,96,1)' offset='0.3125'/><stop stop-color='rgba(64,64,64,1)' offset='0.375'/><stop stop-color='rgba(48,48,48,1)' offset='0.40625'/><stop stop-color='rgba(32,32,32,1)' offset='0.4375'/><stop stop-color='rgba(16,16,16,1)' offset='0.46875'/><stop stop-color='rgba(8,8,8,1)' offset='0.48438'/><stop stop-color='rgba(0,0,0,1)' offset='0.5'/><stop stop-color='rgba(0,0,0,0)' offset='1'/>";

/** Rebuilds the Figma bar gradient (center-faded black line) for a given height. */
function barBg(h: number) {
  return `url("data:image/svg+xml;utf8,<svg viewBox='0 0 2.6667 ${h}' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(0.13333 0 0 ${(h / 20).toFixed(4)} 1.3333 ${(h / 2).toFixed(3)})'>${GRADIENT_STOPS}</radialGradient></defs></svg>")`;
}

// Deterministic PRNG so each bar gets stable "random" keyframes on both the
// server and client render (avoids hydration mismatches).
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One waveform bar, endlessly oscillating through its own random keyframes. */
function Bar({ h, seed }: { h: number; seed: number }) {
  const reduceMotion = useReducedMotion();
  const { frames, duration, delay } = useMemo(() => {
    const rand = mulberry32(seed * 7919 + 17);
    return {
      frames: [
        1,
        0.45 + rand() * 0.7,
        0.6 + rand() * 0.65,
        0.4 + rand() * 0.75,
        1,
      ],
      duration: 0.8 + rand() * 0.7,
      delay: rand() * 0.4,
    };
  }, [seed]);

  return (
    <motion.div
      className="relative shrink-0 w-[2.667px]"
      style={{ height: h, backgroundImage: barBg(h) }}
      animate={reduceMotion ? undefined : { scaleY: frames }}
      transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

const TOAST_CYCLE_MS = 2000;
const TOAST_VISIBLE_MS = 1500;
const DEAL_COUNTS = [4, 2, 6, 3, 7, 5];

/** "N more deals closed by AI cold call" toast, re-announced every 2s. */
function DealsToast() {
  const reduceMotion = useReducedMotion();
  const [cycle, setCycle] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;
    let hide: ReturnType<typeof setTimeout>;
    const id = setInterval(() => {
      setCycle((c) => c + 1);
      setVisible(true);
      hide = setTimeout(() => setVisible(false), TOAST_VISIBLE_MS);
    }, TOAST_CYCLE_MS);
    return () => {
      clearInterval(id);
      clearTimeout(hide);
    };
  }, [reduceMotion]);

  const deals = DEAL_COUNTS[cycle % DEAL_COUNTS.length];

  return (
    <div className="absolute bottom-[12px] flex justify-center left-0 pointer-events-none right-0 z-20">
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="flex gap-[8px] items-center rounded-full bg-[#1c1c1c] px-[14px] py-[8px] shadow-[0px_10px_24px_-6px_rgba(0,0,0,0.35)]"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="8" fill="#34a853" />
              <path
                d="M4.5 8.2l2.2 2.2L11.5 5.6"
                stroke="white"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="font-inter font-medium text-[11.5px] text-white whitespace-nowrap">
              {deals} more deals closed by AI cold call
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Live center content of the "AI Cold Calling Agents" card: vibrating voice
 * waveform around the call button, plus the recurring closed-deals toast.
 */
export default function CallVoiceLive() {
  return (
    <>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute content-stretch flex gap-[10.667px] items-center left-[calc(50%-11px)] top-1/2">
        <div className="content-stretch flex gap-[8px] items-center overflow-clip relative shrink-0">
          {LEFT_BARS.map((h, i) => (
            <Bar key={i} h={h} seed={i + 1} />
          ))}
        </div>
        <div className="bg-white content-stretch flex flex-col items-start overflow-clip p-[26px] relative rounded-[6666px] shadow-[0px_32px_32px_-16px_rgba(51,51,51,0.04),0px_16px_16px_-8px_rgba(51,51,51,0.03),0px_8px_8px_-4px_rgba(51,51,51,0.03),0px_4px_4.667px_-2px_rgba(51,51,51,0.02),0px_0.667px_0.667px_0.333px_rgba(51,51,51,0.03)] shrink-0">
          <div className="relative shrink-0 size-[24px]">
            <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[34.379px] top-1/2">
              <img
                alt=""
                className="absolute block inset-0 max-w-none size-full"
                src={imgCallSpark02}
              />
            </div>
          </div>
        </div>
        <div className="content-stretch flex gap-[8px] h-[80px] items-center justify-center overflow-clip relative shrink-0">
          {RIGHT_BARS.map((h, i) => (
            <Bar key={i} h={h} seed={i + 101} />
          ))}
        </div>
      </div>
      <DealsToast />
    </>
  );
}
