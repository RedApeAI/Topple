"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useReducedMotion,
} from "framer-motion";
import CtaLink from "@/components/CtaLink";
import DistortText from "@/components/DistortText";

/**
 * "From Conversation to Calendar, Automatically." — Figma 2877:21314.
 * The calendar visual gets a scroll-linked 3D skew: it eases through a gentle
 * perspective tilt (rotateY + skewX) as the section passes the viewport, so it
 * reads with depth. The image aspect matches its container exactly, so plain
 * object-cover fills it with no top/bottom cropping — the tilt only shears the
 * left/right edges, which are off-screen (left bleed) or faded to white (right).
 */
export default function CalendarSection() {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    // whole time the section is on screen
    offset: ["start end", "end start"],
  });

  const spring = { stiffness: 55, damping: 20, mass: 0.6 };
  // front-facing (0°) when centred; tilts as it enters/leaves — a soft 3D sway.
  const rotateY = useSpring(
    useTransform(scrollYProgress, [0, 1], [7, -7]),
    spring,
  );
  const skewX = useSpring(
    useTransform(scrollYProgress, [0, 1], [-2.4, 2.4]),
    spring,
  );

  return (
    <section
      ref={ref}
      className="mt-[100px] lg:mt-[129px] relative w-full lg:h-[703px]"
    >
      {/* calendar visual — stacked on mobile, bleeds off the left edge on desktop */}
      <div className="relative h-[300px] sm:h-[430px] w-full lg:absolute lg:h-[703.312px] lg:left-[-194.5px] lg:top-0 lg:w-[1146.896px]">
        <div
          aria-hidden
          className="absolute inset-0 overflow-clip pointer-events-none"
        >
          <motion.img
            alt="Calendar automation"
            // Only rotateY/skewX (about centre) — no scale/translate — so the
            // full image height is always shown (no top/bottom crop). Perspective
            // gives the tilt real depth.
            style={
              reduceMotion
                ? undefined
                : { rotateY, skewX, transformPerspective: 1200 }
            }
            className="absolute inset-0 max-w-none object-cover origin-center size-full will-change-transform"
            src="/assets/images/calendar-visual.png"
          />
          <div className="absolute bg-gradient-to-b lg:bg-gradient-to-r from-[34.567%] from-[rgba(255,255,255,0)] inset-0 to-white" />
        </div>
      </div>
      <div className="relative flex flex-col gap-[20px] lg:gap-[28px] items-start leading-[normal] mx-auto px-[20px] w-full max-w-[598px] lg:absolute lg:left-[771.05px] lg:top-[215.66px] lg:mx-0 lg:px-0 lg:w-[558px] lg:max-w-none">
        <p className="font-manrope font-semibold relative shrink-0 text-[clamp(32px,5vw,50px)] text-black tracking-[-0.05em] w-full">
          <DistortText text="From Conversation to Calendar, Automatically." />
        </p>
        <p className="font-inter font-normal relative shrink-0 text-[17px] sm:text-[21px] text-[#202020] tracking-[-0.05em] w-full">
          Plucia qualifies leads, handles follow-ups, answers questions, and
          schedules meetings when prospects are ready, keeping your pipeline
          moving while your team focuses on closing deals.
        </p>
        <CtaLink>Get Started</CtaLink>
      </div>
    </section>
  );
}
