"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";

interface CardData {
  id: string;
  avatar: string;
  badge: string;
  badgeBg: string;
  count: number;
  name: string;
  time: string;
  message: React.ReactNode;
}

const CARDS: CardData[] = [
  {
    id: "john",
    avatar: "/assets/images/chat-avatar-3.png",
    badge: "/assets/icons/whatsapp-badge-3.svg",
    badgeBg: "#34a853",
    count: 74,
    name: "John",
    time: "15m ago",
    message: (
      <>
        <p className="leading-[1.3] mb-0">Yes! The community includes:</p>
        <p className="leading-[1.3]">• Clubhouse</p>
      </>
    ),
  },
  {
    id: "vasu",
    avatar: "/assets/images/chat-avatar-2.png",
    // int-icon-5.svg is the genuine multicolor Gmail/Google mark — unlike
    // channel-gmail.svg, which is mislabeled in this asset set and actually
    // contains LinkedIn artwork.
    badge: "/assets/icons/int-icon-5.svg",
    badgeBg: "#f4f4f4",
    count: 35,
    name: "Vasu",
    time: "Yesterday",
    message: (
      <p>
        Would you send the sales contract from Brightstone Realty with all
        relevant details?
      </p>
    ),
  },
  {
    id: "anas",
    avatar: "/assets/images/chat-avatar-1.png",
    badge: "/assets/icons/linkedin-02.svg",
    badgeBg: "#0A66C2",
    count: 14,
    name: "Anas",
    time: "3m ago",
    message: (
      <p className="whitespace-pre-wrap">
        Wants you to share a sales contract with all key details included
      </p>
    ),
  },
];

// front/middle/back — position, scale and opacity for each depth slot.
const SLOTS = [
  { x: 0, y: 0, scale: 1, opacity: 1, z: 30 },
  { x: 14, y: 20, scale: 0.914, opacity: 1, z: 20 },
  { x: 29, y: 43, scale: 0.821, opacity: 0.4, z: 10 },
];

const CYCLE_MS = 4600;
const SWIPE_MS = 550;
const TOAST_MS = 1700;

/**
 * The "Just Tell Plucia" chat-notification stack, animated as an infinite
 * 3-card carousel: the front card swipes away to the right (with a
 * "Plucia replied to the message" toast), and the other two cards advance
 * forward one slot. All three cards keep cycling through front/middle/back
 * forever — needs real state/timers, hence a client component.
 */
export default function NotificationCarousel() {
  // order[0] = card id currently in the front slot, order[1] = middle, order[2] = back.
  const [order, setOrder] = useState(CARDS.map((c) => c.id));
  const [swiping, setSwiping] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const cycle = setInterval(() => {
      setSwiping(true);
      setShowToast(true);
      const advance = setTimeout(() => {
        setOrder((prev) => [prev[1], prev[2], prev[0]]);
        setSwiping(false);
      }, SWIPE_MS);
      const hideToast = setTimeout(() => setShowToast(false), TOAST_MS);
      return () => {
        clearTimeout(advance);
        clearTimeout(hideToast);
      };
    }, CYCLE_MS);
    return () => clearInterval(cycle);
  }, [reduceMotion]);

  return (
    <div className="-translate-x-1/2 absolute h-[105.22px] left-[calc(50%+0.04px)] top-[10.31px] w-[324.909px]">
      {CARDS.map((card) => {
        const slotIndex = order.indexOf(card.id);
        const isFront = slotIndex === 0;
        const slot = SLOTS[slotIndex];
        const target =
          isFront && swiping
            ? { x: 300, y: -8, rotate: 6, scale: slot.scale, opacity: 0 }
            : {
                x: slot.x,
                y: slot.y,
                rotate: 0,
                scale: slot.scale,
                opacity: slot.opacity,
              };

        return (
          <motion.div
            key={card.id}
            className="absolute bg-white border-[1.254px] border-[rgba(0,0,0,0.1)] border-solid flex items-center px-[10.013px] py-[10.943px] rounded-[16.303px] w-[324.909px] origin-top-left"
            style={{ zIndex: isFront && swiping ? 40 : slot.z }}
            animate={reduceMotion ? undefined : target}
            transition={
              isFront && swiping
                ? { duration: SWIPE_MS / 1000, ease: "easeIn" }
                : { type: "spring", stiffness: 170, damping: 22 }
            }
          >
            <div className="flex flex-[1_0_0] gap-[14.188px] items-center min-w-px relative">
              <div className="relative shrink-0 size-[33.536px]">
                <div className="absolute border-[0.838px] border-[rgba(32,32,32,0.01)] border-solid flex items-center left-0 overflow-clip p-[8.384px] rounded-full shadow-[0px_0px_0px_1.677px_rgba(255,255,255,0.8),0px_11.738px_6.707px_0px_rgba(0,0,0,0.05),0px_5.03px_5.03px_0px_rgba(0,0,0,0.09),0px_1.677px_2.515px_0px_rgba(0,0,0,0.1)] size-[33.536px] top-0">
                  <img
                    alt=""
                    className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-full size-full"
                    src={card.avatar}
                  />
                </div>
                <div
                  className="absolute border-[1.032px] border-solid border-white flex items-center justify-center rounded-full left-[22.22px] top-[-3.32px] size-[18.145px] p-[3.233px]"
                  style={{ backgroundColor: card.badgeBg }}
                >
                  <div className="relative shrink-0 h-[11.569px] w-[11.48px]">
                    <img
                      alt=""
                      className="absolute block inset-0 max-w-none size-full"
                      src={card.badge}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-[1_0_0] flex-col gap-[2.643px] items-start justify-center min-w-px not-italic relative">
                <div className="flex items-center justify-between relative shrink-0 w-full whitespace-nowrap">
                  <p className="flex-[1_0_0] font-poppins leading-none min-w-px overflow-hidden relative text-black text-ellipsis text-[15.426px] tracking-[-0.1543px]">
                    {card.name}
                  </p>
                  <p className="font-inter font-medium leading-[1.5] relative shrink-0 text-[rgba(96,96,96,0.6)] text-[11.569px] tracking-[-0.5785px]">
                    {card.time}
                  </p>
                </div>
                <div className="font-inter font-medium leading-[1.3] overflow-hidden relative shrink-0 text-[rgba(96,96,96,0.6)] text-ellipsis w-full text-[13.498px] tracking-[-0.6749px]">
                  {card.message}
                </div>
              </div>
            </div>

            {/* unread badge — travels with whichever card is currently front */}
            {isFront && (
              <div className="absolute bg-[#ff2f2f] flex flex-col items-center justify-center rounded-[3.984px] p-[4.979px] right-[-14px] top-[-14px] w-[27.959px]">
                <p className="font-inter font-semibold leading-[1.5] text-[14.562px] text-center text-white w-full whitespace-nowrap">
                  {card.count}
                </p>
              </div>
            )}
          </motion.div>
        );
      })}

      <AnimatePresence>
        {showToast && !reduceMotion && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="absolute -top-[46px] left-1/2 -translate-x-1/2 z-50 flex items-center gap-[8px] whitespace-nowrap rounded-full bg-[#202020] px-[16px] py-[9px] shadow-[0px_10px_24px_-6px_rgba(0,0,0,0.35)]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="8" fill="#34a853" />
              <path
                d="M4.5 8.2l2.2 2.2L11.5 5.6"
                stroke="white"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="font-inter font-medium text-[12.5px] text-white">
              Plucia replied to the message
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
