"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

/**
 * The prompt card inside the "Just Tell RedApeAI" dark motion card, animated:
 * the instruction types out character by character behind a blinking caret,
 * a mouse pointer glides in from below, clicks the send arrow (the button
 * presses down), the text clears, and the loop restarts. Markup/classes are
 * pixel-identical to the original static card (design-space px, scaled by
 * the surrounding ScaleBox). Runs only while in view; under
 * prefers-reduced-motion the full text renders statically with no cursor.
 */

const TEXT =
  "Handle my WhatsApp leads for me. Just talk to them like I would, answer their questions, and help move them toward a meeting or a sale.";

type Phase = "typing" | "cursor" | "click" | "sent" | "rest";

export default function PromptCardAnimated() {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-10% 0px" });
  const [phase, setPhase] = useState<Phase>("typing");
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    if (reduceMotion || !inView) return;
    let t: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      t =
        charCount < TEXT.length
          ? setTimeout(() => setCharCount((c) => c + 1), 24)
          : setTimeout(() => setPhase("cursor"), 550);
    } else if (phase === "cursor") {
      t = setTimeout(() => setPhase("click"), 750);
    } else if (phase === "click") {
      t = setTimeout(() => setPhase("sent"), 320);
    } else if (phase === "sent") {
      t = setTimeout(() => {
        setCharCount(0);
        setPhase("rest");
      }, 450);
    } else {
      t = setTimeout(() => setPhase("typing"), 1000);
    }
    return () => clearTimeout(t);
  }, [phase, charCount, inView, reduceMotion]);

  const typedText = reduceMotion ? TEXT : TEXT.slice(0, charCount);
  const showCaret = !reduceMotion && (phase === "typing" || phase === "rest");

  return (
    <div
      ref={ref}
      className="-translate-x-1/2 absolute bg-[#f1f1f1] border-[2.508px] border-solid border-white flex flex-col gap-[9.641px] h-[133.049px] items-start left-[calc(50%+0.03px)] p-[9.641px] rounded-[19.282px] shadow-[0px_4.821px_14.462px_0px_rgba(0,0,0,0.15)] top-[465.18px] w-[349.012px]"
    >
      <div className="bg-[#fcfcfc] flex flex-[1_0_0] items-start min-h-px overflow-clip p-[9.641px] relative rounded-[11.569px] w-full">
        <p className="flex-[1_0_0] font-inter font-normal h-full leading-[normal] min-w-px relative text-[13.498px] text-black">
          {typedText}
          {showCaret && (
            <motion.span
              aria-hidden
              className="bg-black inline-block ml-[1px] w-[1.5px]"
              style={{ height: "1em", verticalAlign: "-0.15em" }}
              animate={{ opacity: [1, 1, 0, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
            />
          )}
        </p>
      </div>
      <div className="flex items-start justify-between relative shrink-0 w-full">
        <div className="flex gap-[15.426px] items-start relative shrink-0">
          <div className="bg-white flex items-center justify-center overflow-clip p-[9.641px] relative rounded-[23.139px] shrink-0">
            <div className="overflow-clip relative shrink-0 size-[13.498px]">
              <div className="absolute inset-[2.63%_0_2.7%_0]">
                <img
                  alt=""
                  className="absolute block inset-0 max-w-none size-full"
                  src="/assets/icons/clip-lg.svg"
                />
              </div>
            </div>
          </div>
          <div className="bg-white flex gap-[9.641px] items-center justify-center overflow-clip px-[9.641px] py-[6.27px] relative rounded-[23.139px] self-stretch shrink-0">
            <div className="flex items-center relative shrink-0">
              <p className="font-worksans font-semibold leading-[normal] relative shrink-0 text-[11.569px] text-black whitespace-nowrap">
                Channels
              </p>
            </div>
            <svg
              className="shrink-0"
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
            >
              <path
                d="M2 3.5L5 6.5L8 3.5"
                stroke="black"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
        <div className="flex items-start relative shrink-0">
          <motion.div
            className="bg-[#202020] flex items-center justify-center overflow-clip p-[9.641px] relative rounded-[23.139px] shrink-0"
            animate={{ scale: !reduceMotion && phase === "click" ? 0.85 : 1 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
          >
            <div className="relative shrink-0 size-[13.498px]">
              <img
                alt=""
                className="absolute block inset-0 max-w-none size-full"
                src="/assets/icons/arrow-up-lg.svg"
              />
            </div>
          </motion.div>
        </div>
      </div>

      {/* mouse pointer — tip lands on the send button */}
      {!reduceMotion && (
        <motion.div
          aria-hidden
          className="absolute left-[316px] pointer-events-none top-[100px] z-10"
          initial={false}
          animate={
            phase === "cursor"
              ? { x: 0, y: 0, opacity: 1, scale: 1 }
              : phase === "click"
                ? { x: 0, y: 0, opacity: 1, scale: 0.8 }
                : phase === "sent"
                  ? { x: 0, y: 0, opacity: 0, scale: 1 }
                  : { x: 84, y: 74, opacity: 0, scale: 1 }
          }
          transition={
            phase === "click"
              ? { duration: 0.12, ease: "easeOut" }
              : phase === "sent"
                ? { duration: 0.35, ease: "easeOut" }
                : { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
          }
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 3l14 8.5-6.1 1.3 3.4 6.6-2.7 1.4-3.4-6.7L5 18.5V3z"
              fill="#ffffff"
              stroke="#111111"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </motion.div>
      )}
    </div>
  );
}
