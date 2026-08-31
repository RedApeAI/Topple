"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import Navbar from "@/components/Navbar";
import FaqSection from "@/sections/FaqSection";
import Footer from "@/sections/Footer";
import { DarkButton, TextField, TextAreaField } from "@/components/AuthUI";

/**
 * Contact page — reached from the FAQ section's "Contact Sales" CTA and the
 * footer's "Request a call" CTA. Heading + form card side by side over the
 * hero's video backdrop (same rounded card + white overlay treatment as the
 * hero and congratulations page), with the left column carrying contact
 * details (email/phone/address/socials). FAQ and Footer below are the site's
 * real sections, reused as-is.
 */
export default function ContactPage() {
  const reduceMotion = useReducedMotion();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    message: "",
  });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const update =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
      setError("");
    };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return;
    // UI-only — no backend
    setSent(true);
  };

  return (
    <main className="bg-white min-h-screen w-full">
      {/* video card — same framing/backdrop as the hero and congratulations
          page: rounded card inset from the viewport edges, video softened by
          a white overlay. Height follows its content (header + contact
          block) rather than the full viewport, since FAQ/Footer follow below. */}
      <div className="relative mx-[8px] sm:mx-[29px] mt-[8px] sm:mt-[14px] overflow-clip rounded-[24px]">
        <video
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

        {/* blue noised blob — same asset as the Insights section, sitting
            behind the left column's copy */}
        <div className="absolute hidden lg:block left-[-160px] pointer-events-none size-[520px] top-[-40px]">
          <img
            alt=""
            className="absolute inset-0 max-w-none object-cover pointer-events-none size-full"
            src="/assets/images/blob-color-1.png"
          />
        </div>

        <div className="relative z-10">
          <header className="w-full">
            <div className="mx-auto w-full max-w-[1440px] px-[20px] sm:px-[48px] xl:px-[152px] pt-[20px] sm:pt-[28px]">
              <Navbar />
            </div>
          </header>

          <section className="flex flex-col lg:flex-row gap-[56px] lg:gap-[64px] items-start mx-auto mt-[56px] lg:mt-[88px] pb-[56px] lg:pb-[88px] px-[20px] sm:px-[48px] xl:px-[152px] w-full max-w-[1440px]">
            {/* left — heading + contact details */}
            <motion.div
              className="flex flex-col gap-[24px] items-start w-full lg:max-w-[460px]"
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1 className="font-manrope font-semibold relative text-[clamp(32px,5vw,48px)] text-black tracking-[-0.05em] w-full">
                We&apos;re here to help you sell smarter.
              </h1>

              <p className="font-inter font-normal text-[16px] sm:text-[17px] text-[#606060] tracking-[-0.02em] w-full">
                Have questions or need a personalized walkthrough? We&apos;d
                love to hear from you whether it&apos;s onboarding,
                integrations, or how RedApeAI fits into your sales process, our
                team is ready to help.
              </p>

              <div className="flex flex-col gap-[20px] mt-[16px] w-full">
                <div className="flex flex-col gap-[12px]">
                  <p className="font-inter font-medium text-[#606060] text-[13px]">
                    Follow us
                  </p>
                  <div className="flex gap-[10px] items-center">
                    <a
                      href="https://www.linkedin.com/company/redape/"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="LinkedIn"
                      className="bg-[#1b1819] flex items-center justify-center relative rounded-[40px] shrink-0 size-[40px] transition-transform duration-200 hover:-translate-y-0.5"
                    >
                      <div className="relative shrink-0 size-[16px]">
                        <img
                          alt="LinkedIn"
                          className="absolute block inset-0 max-w-none size-full"
                          src="/assets/icons/linkedin-02.svg"
                        />
                      </div>
                    </a>
                    <a
                      href="https://www.instagram.com/_redape_/"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Instagram"
                      className="bg-[#1b1819] flex items-center justify-center relative rounded-[40px] shrink-0 size-[40px] transition-transform duration-200 hover:-translate-y-0.5"
                    >
                      <div className="relative shrink-0 size-[16px]">
                        <img
                          alt="Instagram"
                          className="absolute block inset-0 max-w-none size-full"
                          src="/assets/icons/instagram-footer.svg"
                        />
                      </div>
                    </a>
                    <a
                      href="https://x.com/redape_ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="X"
                      className="bg-[#1b1819] flex items-center justify-center relative rounded-[40px] shrink-0 size-[40px] transition-transform duration-200 hover:-translate-y-0.5"
                    >
                      <div className="relative shrink-0 size-[16px]">
                        <img
                          alt="X"
                          className="absolute block inset-0 max-w-none size-full"
                          src="/assets/icons/new-twitter.svg"
                        />
                      </div>
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* right — form card */}
            <motion.div
              className="bg-white border border-[rgba(0,0,0,0.08)] border-solid rounded-[20px] shadow-[0px_16px_48px_-12px_rgba(0,0,0,0.12)] p-[24px] sm:p-[32px] w-full lg:flex-1"
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.7,
                delay: 0.1,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {sent ? (
                <div className="flex flex-col items-center justify-center gap-[16px] py-[48px] text-center">
                  <div className="bg-[#e7ffe5] border border-[#34a853] border-solid flex items-center justify-center rounded-full size-[56px]">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M5 12.5L10 17.5L19 7.5"
                        stroke="#34a853"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <p className="font-manrope font-semibold text-[22px] text-black tracking-[-0.03em]">
                    Message sent!
                  </p>
                  <p className="font-inter text-[15px] text-[#606060] max-w-[340px]">
                    Thanks for reaching out — our team will get back to you
                    within one business day.
                  </p>
                </div>
              ) : (
                <form
                  className="flex flex-col gap-[18px] w-full"
                  onSubmit={submit}
                >
                  <TextField
                    label="Name"
                    placeholder="Your name"
                    value={form.name}
                    onChange={update("name")}
                    required
                  />
                  <TextField
                    label="Phone Number"
                    type="tel"
                    placeholder="Your phone number"
                    value={form.phone}
                    onChange={update("phone")}
                  />
                  <TextField
                    label="Email address"
                    type="email"
                    placeholder="you@company.com"
                    value={form.email}
                    onChange={update("email")}
                    required
                  />
                  <TextAreaField
                    label="Message"
                    placeholder="Type something here."
                    rows={5}
                    value={form.message}
                    onChange={update("message")}
                    required
                  />
                  {error && (
                    <p className="font-inter text-[#d03030] text-[13px]">
                      {error}
                    </p>
                  )}
                  <DarkButton type="submit" className="w-full">
                    Send a message
                  </DarkButton>
                </form>
              )}
            </motion.div>
          </section>
        </div>
      </div>

      <div className="mt-[100px] lg:mt-[150px]">
        <FaqSection />
      </div>

      <div className="mt-[88px]">
        <Footer />
      </div>
    </main>
  );
}
