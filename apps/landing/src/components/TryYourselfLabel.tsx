"use client";

import { motion, useReducedMotion } from "framer-motion";

/** "Try Yourself" handwriting + arrow — floats up/down infinitely, ease in/out. */
export default function TryYourselfLabel() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="absolute hidden lg:flex flex-col gap-[4.514px] items-start left-[calc(100%+16px)] top-[-30px] w-[132.041px]"
      animate={reduceMotion ? undefined : { y: [0, -12, 0] }}
      transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
    >
      <div className="flex flex-col font-hand justify-center leading-[0] min-w-full not-italic relative shrink-0 text-[20.314px] text-black tracking-[-0.2031px] w-[min-content]">
        <p className="leading-[normal]">Try Yourself</p>
      </div>
      <div className="overflow-clip relative shrink-0 size-[53.047px]">
        <div className="absolute inset-[3.31%_0.4%_3.35%_0.04%]">
          <img
            alt=""
            className="absolute block inset-0 max-w-none size-full"
            src="/assets/icons/arrow-try-yourself.svg"
          />
        </div>
      </div>
    </motion.div>
  );
}
