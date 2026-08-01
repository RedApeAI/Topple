"use client";

import { motion, useReducedMotion } from "framer-motion";
import Navbar from "@/components/Navbar";
import Reveal from "@/components/Reveal";
import Hero from "@/sections/Hero";
import IntegrationsMarquee from "@/sections/IntegrationsMarquee";
import PlatformSection from "@/sections/PlatformSection";
import AutomationSection from "@/sections/AutomationSection";
import TellPluciaSection from "@/sections/TellPluciaSection";
import CalendarSection from "@/sections/CalendarSection";
import InsightsSection from "@/sections/InsightsSection";
import IntegrationSection from "@/sections/IntegrationSection";
import FeaturesSection from "@/sections/FeaturesSection";
import FaqSection from "@/sections/FaqSection";
import SubscribeSection from "@/sections/SubscribeSection";
import Footer from "@/sections/Footer";

export default function HomePage() {
  const reduceMotion = useReducedMotion();

  return (
    <main className="bg-white min-h-screen overflow-x-clip w-full">
      <header className="sticky top-0 z-50 w-full">
        <motion.div
          className="mx-auto w-full max-w-[1440px] px-[20px] sm:px-[48px] xl:px-[152px] pt-[20px] sm:pt-[28px]"
          initial={
            reduceMotion
              ? false
              : { width: "50vw", opacity: 0, scale: 0.96, y: 16 }
          }
          animate={{ width: "100%", opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 1.42, ease: [0.16, 1, 0.3, 1] }}
        >
          <Navbar />
        </motion.div>
      </header>
      <Hero />
      <IntegrationsMarquee />
      <div className="max-w-[1440px] mx-auto relative w-full space-y-[88px]">
        <Reveal>
          <TellPluciaSection />
        </Reveal>
        <Reveal>
          <CalendarSection />
        </Reveal>
        <Reveal>
          <PlatformSection />
        </Reveal>
        {/* <Reveal><AutomationSection /></Reveal> */}
        <Reveal>
          <InsightsSection />
        </Reveal>
        <Reveal>
          <FeaturesSection />
        </Reveal>
        <Reveal>
          <IntegrationSection />
        </Reveal>
        <Reveal>
          <FaqSection />
        </Reveal>
      </div>
      <div className="mt-[88px]">
        <Reveal>
          <SubscribeSection />
        </Reveal>
      </div>
      <Footer />
    </main>
  );
}
