"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/** Centre-out opening animation using the hero's live video gradient. */
export default function SiteIntro({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const [finished, setFinished] = useState(false);

  if (reduceMotion) return <>{children}</>;

  return (
    <>
      <AnimatePresence>
        {!finished && (
          <motion.div
            className="fixed inset-0 z-[200] overflow-hidden bg-white"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.24, delay: 1.52 }}
            onAnimationComplete={() => setFinished(true)}
          >
            <motion.div
              className="fixed left-1/2 top-1/2 overflow-hidden bg-[#eaeaea] shadow-[0_18px_50px_rgba(47,117,93,0.18)]"
              initial={{
                width: "min(300px, calc(100vw - 32px))",
                height: 40,
                borderRadius: 999,
                x: "-50%",
                y: "-50%",
              }}
              animate={{
                width: "100vw",
                height: "100svh",
                borderRadius: 0,
                x: "-50%",
                y: "-50%",
              }}
              transition={{ duration: 1.05, ease: [0.76, 0, 0.24, 1] }}
            >
              <video
                className="absolute inset-0 h-full w-full scale-110 object-cover"
                src="/assets/video/background video.mp4"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
              />
              <div aria-hidden className="absolute inset-0 bg-[#fefefe]/60" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </>
  );
}
