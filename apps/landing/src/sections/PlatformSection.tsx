"use client";

import { motion, useReducedMotion } from "framer-motion";
import DistortText from "@/components/DistortText";

/**
 * "The AI Copilot Built for Modern Sales Teams." — benchmark section.
 * Aside-style horizontal bar chart: one row per product (logo, name,
 * animated score bar, value), hairline separators, RedApeAI's bar highlighted
 * in brand blue. Logos live in /assets/logocom/.
 */

// logoClass heights are tuned per SVG: the wordmarks have very different
// viewBox padding (Claude's glyphs fill its box, RedApeAI's sit in a tall one,
// the CRM badges tower over their text), so equal heights render unequal.
const BENCHMARKS = [
  {
    name: "RedApeAI",
    logo: "/assets/logocom/bench-redape.svg",
    logoClass: "h-[25px] sm:h-[30px]",
    value: 98,
    highlight: true,
  },
  {
    name: "SendSeven",
    logo: "/assets/logocom/bench-sendseven.svg",
    logoClass: "h-[26px] sm:h-[32px]",
    value: 87,
  },
  {
    name: "Claude",
    logo: "/assets/logocom/bench-claude.svg",
    logoClass: "h-[18px] sm:h-[22px]",
    value: 82,
  },
  {
    name: "OpenAI",
    logo: "/assets/logocom/bench-chatgpt.svg",
    logoClass: "h-[20px] sm:h-[24px]",
    value: 77,
  },
  {
    name: "CRM",
    logo: "/assets/logocom/bench-crms.svg",
    logoClass: "h-[33px] sm:h-[40px]",
    value: 59,
  },
];

export default function PlatformSection() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="flex flex-col items-start mt-[120px] lg:mt-[175px] mx-auto px-[20px] xl:px-0 relative w-full max-w-[1093px] xl:max-w-[1053px]">
      <div className="flex flex-col gap-[20px] items-start leading-[normal] relative w-full max-w-[720px]">
        <p className="font-manrope font-semibold relative shrink-0 text-[clamp(32px,5vw,50px)] text-black tracking-[-0.05em] w-full">
          <DistortText text="The AI Copilot Built for Modern Sales Teams." />
        </p>
        <p className="font-inter font-normal relative shrink-0 text-[17px] sm:text-[21px] text-[#606060] tracking-[-0.02em] w-full">
          Centralize every customer conversation in one inbox while AI drafts
          responses, surfaces insights, updates CRM, and books meetings.
        </p>
      </div>

      {/* benchmark chart */}
      <div className="mt-[56px] lg:mt-[72px] w-full">
        {BENCHMARKS.map((row, i) => (
          <div
            key={row.name}
            className="border-b border-[#ececec] first:border-t flex gap-[16px] sm:gap-[24px] items-center py-[18px] sm:py-[22px] w-full"
          >
            <div className="flex items-center shrink-0 w-[110px] sm:w-[170px]">
              <img
                alt={row.name}
                className={`${row.logoClass} w-auto object-contain shrink-0`}
                src={row.logo}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <motion.div
                className={`h-[26px] sm:h-[32px] rounded-[8px] ${row.highlight ? "bg-[#0062ff]" : "bg-[#e2e2ea]"}`}
                initial={reduceMotion ? false : { width: 0 }}
                whileInView={{ width: `${row.value}%` }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{
                  duration: 1,
                  delay: 0.15 + i * 0.08,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            </div>
            <p className="font-inter font-semibold shrink-0 text-[15px] sm:text-[18px] text-black text-right w-[52px] sm:w-[64px]">
              {row.value}%
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
