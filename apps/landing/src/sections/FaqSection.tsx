"use client";

import { useState } from "react";
import Link from "next/link";
import DistortText from "@/components/DistortText";

/** "General Question asked by Everyone" — Figma 2877:22869 */

const FAQS = [
  {
    q: "How is Plucia different from a normal inbox?",
    a: "Regular inboxes show you messages ordered by your latest notifications, on a singular platform. Plucia combines multiple inboxes, learns what matters to you and automatically ranks messages according to their priority.",
  },
  {
    q: "How do Auto-Drafted Replies work?",
    a: "Plucia automatically drafts replies that sound like you. It learns your tone, language, and context across platforms, then writes responses based on your past conversations and priorities. When a new message arrives, you'll see a ready-to-send reply that you can edit, approve, or ignore. It's the fastest way to stay personal without wasting time typing.",
  },
  {
    q: "Can you still message outside of Plucia on connected accounts?",
    a: "Yes. Any messages sent on Plucia are received natively by your contacts on the platforms you're communicating with them on. You can send a message on Plucia to a contact on WhatsApp, and continue that conversation on WhatsApp, and vice versa. Your message chain will be linked so the messaging experience of all your recipients remains unchanged.",
  },
  {
    q: "How does Plucia learn my goals and priorities?",
    a: "When you connect your accounts, Plucia analyses message patterns and relationships to understand who and what matters most. You can adjust priorities anytime. Plucia keeps learning from your activity so its ranking stays accurate.",
  },
  {
    q: "Is my data private and secure?",
    a: "Yes. Your data never leaves your account without encryption. Plucia uses secure, enterprise-grade protocols and does not sell or share your information. AI models only process context to serve your messages, not to train external systems.",
  },
  {
    q: "How does Gmail connect with Plucia?",
    a: "Plucia brings your emails, messages, contacts, and calendars into one smart workspace. To deliver this experience, Plucia connects to your Google account with your explicit permission.",
  },
];

export default function FaqSection() {
  // Which item is open (single-open accordion). Click an open item to close it.
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section
      id="faq"
      className="flex flex-col lg:flex-row gap-[48px] lg:gap-[32px] items-start lg:justify-between mt-[120px] lg:mt-[212px] mx-auto px-[20px] xl:px-0 relative scroll-mt-[120px] w-full max-w-[1283px] xl:max-w-[1243px]"
    >
      <div className="flex flex-col gap-[40px] lg:gap-0 lg:h-[609px] items-start lg:justify-between lg:sticky lg:top-[112px] relative w-full lg:flex-1 lg:max-w-[580px]">
        <div className="flex flex-col gap-[32px] items-start relative shrink-0 w-full">
          <div className="flex items-center relative shrink-0">
            <div className="flex flex-col font-urbanist font-semibold justify-center leading-[0] relative shrink-0 text-[#626262] text-[20px] whitespace-nowrap">
              <p className="leading-[24px]">FAQs</p>
            </div>
          </div>
          <div className="flex flex-col items-start justify-center relative shrink-0 w-full">
            <div className="flex flex-col font-manrope font-semibold justify-center leading-[0] relative shrink-0 text-[#1d1d1d] text-[clamp(30px,5vw,48px)] tracking-[-0.031em] w-full">
              <p className="leading-[1]">
                <DistortText text="General Question asked by Everyone" />
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-[15px] items-start relative shrink-0 w-full max-w-[454.691px]">
          <div className="flex flex-col font-manrope font-medium justify-center leading-[0] min-w-full relative shrink-0 text-[#5c5c5c] text-[18px] tracking-[-0.6px] w-[min-content]">
            <p className="leading-[24px]">
              Our team is always here to help you with quick, clear, and
              reliable answers wherever needed
            </p>
          </div>
          <Link
            href="/contact"
            className="group flex items-center overflow-clip px-[24px] py-[12px] relative rounded-[8px] shadow-[0px_0px_0px_0.8px_#161616,0px_6.866px_6.866px_-2.333px_rgba(0,0,0,0.16),0px_13.647px_13.647px_-2.917px_rgba(0,0,0,0.16),0px_30px_30px_-3.5px_rgba(0,0,0,0.08)] shrink-0 cursor-pointer transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0px_0px_0px_0.8px_#161616,0px_10px_10px_-3px_rgba(0,0,0,0.22),0px_18px_18px_-3px_rgba(0,0,0,0.2),0px_36px_34px_-4px_rgba(0,0,0,0.12)]"
          >
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none rounded-[8px]"
              style={{
                backgroundImage:
                  "linear-gradient(-5.41419deg, rgb(7, 7, 7) 12.103%, rgb(47, 46, 49) 87.897%)",
              }}
            />
            {/* light sweep — glides left→right across the button on hover */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-[45%] -translate-x-[160%] skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[260%]"
            />
            <div className="flex flex-col font-manrope font-medium justify-center leading-[0] relative shrink-0 text-[16px] text-white whitespace-nowrap">
              <p className="leading-[normal]">Contact Sales</p>
            </div>
            <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0.8px_0px_0px_rgba(255,255,255,0.16)]" />
          </Link>
        </div>
      </div>

      {/* Accordion — one answer open at a time; click an open item to close it. */}
      <div className="flex flex-col gap-[21px] items-start relative w-full lg:flex-1 lg:max-w-[590px]">
        {FAQS.map((faq, i) => {
          const open = openIndex === i;
          return (
            <div
              key={i}
              className="bg-[#f2f2f2] overflow-clip relative rounded-[16px] shrink-0 w-full"
            >
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenIndex(open ? null : i)}
                className={`flex items-start px-[32px] pt-[32px] text-left w-full cursor-pointer transition-[padding] duration-300 ease-out ${open ? "pb-[13px]" : "pb-[32px]"}`}
              >
                <p className="font-manrope font-bold leading-[normal] text-[#202020] text-[20px] tracking-[-0.6px] w-full">
                  {faq.q}
                </p>
              </button>
              <div
                className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
              >
                <div className="overflow-hidden">
                  <p className="font-manrope font-medium leading-[24px] px-[32px] pb-[32px] text-[#5c5c5c] text-[16px] w-full">
                    {faq.a}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
