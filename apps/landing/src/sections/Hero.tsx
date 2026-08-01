"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import AvatarGroup from "@/components/AvatarGroup";
import DistortText from "@/components/DistortText";
import HeroComposer from "@/components/HeroComposer";
import TryYourselfLabel from "@/components/TryYourselfLabel";
import DashboardShowcase from "@/components/DashboardShowcase";

type HeroBounds = { height: number; horizontalInset: number; topInset: number };

function getHeroBounds(): HeroBounds {
  const width = window.innerWidth;
  if (width >= 1024) return { height: 942, horizontalInset: 29, topInset: 14 };
  if (width >= 640) return { height: 780, horizontalInset: 29, topInset: 14 };
  return { height: 640, horizontalInset: 16, topInset: 8 };
}

export default function Hero() {
  const reduceMotion = useReducedMotion();
  const [bounds, setBounds] = useState<HeroBounds | null>(null);
  const [hasEntered, setHasEntered] = useState(false);
  const entrance = reduceMotion ? false : { opacity: 0, scale: 0.95, y: 20 };
  const settled = { opacity: 1, scale: 1, y: 0 };
  const reveal = (delay: number, duration: number) => ({
    duration,
    delay,
    ease: [0.16, 1, 0.3, 1] as const,
  });
  const contentAnimation = hasEntered || reduceMotion ? settled : entrance;

  useEffect(() => {
    const updateBounds = () => setBounds(getHeroBounds());
    updateBounds();
    window.addEventListener("resize", updateBounds);
    return () => window.removeEventListener("resize", updateBounds);
  }, []);

  // The background video keeps decoding while scrolled far offscreen —
  // pause it there so the rest of the page scrolls without that cost.
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { rootMargin: "200px" },
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  const backdropInitial = {
    width: "min(300px, calc(100vw - 32px))",
    height: 40,
    borderRadius: 999,
    x: "-50%",
    y: "-50%",
  };

  const backdropFinal = bounds && {
    width: `calc(100% - ${bounds.horizontalInset}px)`,
    height: bounds.height,
    borderRadius: 24,
    x: "-50%",
    y: 0,
    top: bounds.topInset,
  };

  return (
    <section className="relative w-full overflow-clip -mt-[82px] sm:-mt-[94px]">
      <motion.div
        className={`${hasEntered || reduceMotion ? "absolute" : "fixed"} left-1/2 ${hasEntered || reduceMotion ? "" : "top-1/2"} z-0 overflow-clip bg-[#eaeaea] will-change-[transform,width,height,border-radius]`}
        initial={reduceMotion ? false : backdropInitial}
        animate={backdropFinal ?? false}
        transition={{ duration: 1.35, ease: [0.45, 0, 0.15, 1] }}
        onAnimationComplete={() => {
          if (bounds && !reduceMotion) setHasEntered(true);
        }}
      >
        <video
          ref={videoRef}
          data-motion-section="hero"
          className="absolute inset-0 h-full w-full object-cover pointer-events-none"
          src="/assets/video/background video.mp4"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[#fefefe]/60 pointer-events-none"
        />
      </motion.div>

      <div className="relative mx-auto w-full max-w-[1440px] px-[20px] sm:px-[48px] xl:px-[152px] pt-[150px] sm:pt-[178px] lg:pt-[clamp(150px,17vh,218px)]">
        <motion.div
          className="flex flex-col gap-[24px] items-center mx-auto w-full max-w-[725px]"
          initial={entrance}
          animate={contentAnimation}
          transition={reveal(0.06, 1.1)}
        >
          <div className="flex flex-col gap-[4px] items-center relative shrink-0 w-full">
            {/* <AvatarGroup /> */}
            <br />
            <p className="font-manrope font-semibold leading-[normal] relative shrink-0 text-[clamp(34px,6vw,50px)] text-black text-center tracking-[-0.05em] w-full">
              <DistortText text="Meet Your AI Business Operator" />
            </p>
          </div>
          <div className="font-inter font-normal leading-[0] relative shrink-0 text-[#202020] text-[16px] sm:text-[18px] text-center tracking-[-0.05em] w-full max-w-[544px]">
            <p className="leading-[normal] mb-0">
              Understands buyer intent, detects opportunities, engages.
            </p>
            <p className="leading-[normal]">
              and your sales pipeline keeps moving.
            </p>
          </div>
        </motion.div>

        <motion.div
          className="relative z-20 mx-auto mt-[56px] lg:mt-[clamp(48px,7vh,84px)] w-full max-w-[583px]"
          initial={entrance}
          animate={contentAnimation}
          transition={reveal(0.12, 1.05)}
        >
          <HeroComposer />
          <TryYourselfLabel />
        </motion.div>

        <motion.div
          initial={entrance}
          animate={contentAnimation}
          transition={reveal(0.18, 1.15)}
        >
          <DashboardShowcase />
        </motion.div>

        <motion.div
          className="font-inter font-normal leading-[0] mx-auto mt-[40px] lg:mt-[68px] pb-[8px] text-[#202020] text-[16px] sm:text-[18px] text-center tracking-[-0.05em] w-full max-w-[544px]"
          initial={entrance}
          animate={contentAnimation}
          transition={reveal(0.24, 1.0)}
        >
          <p className="leading-[normal] mb-0">
            Our AI Agents do end to end conversations on behalf of you.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
