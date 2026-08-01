"use client";

import { motion, useReducedMotion } from "framer-motion";

const LOGOS = [
  { src: "/assets/logos/SqPCqCNL9YH3omjXTnjnmd5Emk 1.png", alt: "WhatsApp" },
  { src: "/assets/logos/uNmONaREYlYcGTHkolb0P1HWtFY 1.png", alt: "Instagram" },
  { src: "/assets/logos/ASbZmPUBgqaTTkMOVTlhEL3o 1.png", alt: "Gmail" },
  { src: "/assets/logos/wj656m0ijEArJOI6YPfUPL7TfA 1.png", alt: "Slack" },
  { src: "/assets/logos/tVOJXwo3brxnzoEV7pidoTpYBek 1.png", alt: "LinkedIn" },
];

/**
 * "INTEGRATIONS" logo strip under the hero's dashboard showcase: brand
 * wordmarks scrolling right→left in an infinite CSS marquee (two copies of
 * the row, track slides −50%), with soft fade-out masks at both edges. The
 * whole section scales up + fades in once when scrolled into view.
 */
export default function IntegrationsMarquee() {
  const reduceMotion = useReducedMotion();

  const row = (ariaHidden: boolean) => (
    <div
      aria-hidden={ariaHidden || undefined}
      className="flex shrink-0 items-center gap-[110px] pr-[110px]"
    >
      {LOGOS.map((logo) => (
        <img
          key={`${logo.alt}${ariaHidden ? "-dup" : ""}`}
          src={logo.src}
          alt={ariaHidden ? "" : logo.alt}
          className="h-[34px] sm:h-[40px] w-auto max-w-none object-contain"
        />
      ))}
    </div>
  );

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 1.2, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto mt-[80px] lg:mt-[120px] w-full max-w-[1440px] px-[20px]"
    >
      {/* divider lines + pill */}
      <div className="flex items-center justify-center gap-[16px]">
        <div className="h-px w-full max-w-[225px] bg-[#e5e5e5]" />
        <div className="flex items-center justify-center rounded-full border border-[#e5e5e5] bg-white px-[20px] py-[9px]">
          <p className="font-inter font-medium text-[13px] tracking-[0.08em] text-[#202020] whitespace-nowrap">
            INTEGRATIONS
          </p>
        </div>
        <div className="h-px w-full max-w-[225px] bg-[#e5e5e5]" />
      </div>

      {/* marquee */}
      <div
        className="mt-[64px] overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
        }}
      >
        <div className="marquee-track flex w-max items-center">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </motion.section>
  );
}
