"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

interface Task {
  id: string;
  icon: string;
  title: string;
  sub: string;
}

const TASKS: Task[] = [
  {
    id: "leads",
    icon: "/assets/icons/add-team-02.svg",
    title: "Find Potential Leads",
    sub: "Connect with your Existing sales channels",
  },
  {
    id: "insights",
    icon: "/assets/icons/calling.svg",
    title: "Cold Call Insights taken",
    sub: "Next actions from call with TOM R.",
  },
  {
    id: "deals",
    icon: "/assets/icons/invoice-02.svg",
    title: "Deals are closed",
    sub: "£2,603 to Greenfield LTD",
  },
  {
    id: "notes",
    icon: "/assets/icons/calling-2.svg",
    title: "Meeting notes taken",
    sub: "Next actions from call with TOM R.",
  },
];

// Vertical distance between stacked notification slots (card height + 8px gap).
const STEP = 54.6;
const CYCLE_MS = 2600;
const SWIPE_MS = 600;
const TOAST_MS = 2000;

/**
 * The "Cross-Platform Automation" notification stack as an infinite loop:
 * the top task turns green and swipes out to the right (task completed),
 * the rest slide up one slot, and the finished task rejoins at the bottom.
 * A "Task Completed" toast pops at the bottom-center on every cycle.
 */
export default function TaskCarousel() {
  // order[0] = task currently in the top slot.
  const [order, setOrder] = useState(TASKS.map((t) => t.id));
  const [swiping, setSwiping] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const cycle = setInterval(() => {
      setSwiping(true);
      setShowToast(true);
      timeouts.push(
        setTimeout(() => {
          setOrder((prev) => [...prev.slice(1), prev[0]]);
          setSwiping(false);
        }, SWIPE_MS),
        setTimeout(() => setShowToast(false), TOAST_MS),
      );
    }, CYCLE_MS);
    return () => {
      clearInterval(cycle);
      timeouts.forEach(clearTimeout);
    };
  }, [reduceMotion]);

  return (
    <>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[217px] left-1/2 top-[calc(50%+34.5px)] w-[322px]">
        {TASKS.map((task) => {
          const slot = order.indexOf(task.id);
          const exiting = slot === 0 && swiping;
          // The bottom slot is always the task that just wrapped around, so it
          // snaps into place (out of frame) instead of animating there.
          const isLast = slot === TASKS.length - 1;
          const colorTransition = isLast
            ? ""
            : "transition-colors duration-500";

          return (
            <motion.div
              key={task.id}
              className={`absolute left-0 top-0 w-full content-stretch flex items-center overflow-clip px-[12.598px] py-[10.079px] rounded-[7.559px] shadow-[0px_10.079px_15.118px_-7.559px_rgba(51,51,51,0.04),0px_2.381px_2.778px_-1.191px_rgba(51,51,51,0.02),0px_0.397px_0.397px_0.198px_rgba(51,51,51,0.03)] ${exiting ? "bg-[#34b95c]" : "bg-white"} ${colorTransition}`}
              style={{ zIndex: exiting ? 10 : 1 }}
              initial={false}
              animate={{ x: exiting ? 400 : 0, y: slot * STEP }}
              transition={
                isLast
                  ? { duration: 0 }
                  : exiting
                    ? {
                        x: {
                          duration: SWIPE_MS / 1000,
                          ease: [0.5, 0, 0.85, 1],
                        },
                      }
                    : { type: "spring", stiffness: 170, damping: 23 }
              }
            >
              <div className="content-stretch flex gap-[7.559px] items-center relative shrink-0">
                <div className="bg-[#daf157] overflow-clip relative rounded-[3.78px] shrink-0 size-[26.457px]">
                  <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%+0.66px)] size-[15.118px] top-[calc(50%+0.03px)]">
                    <img
                      alt=""
                      className="absolute block inset-0 max-w-none size-full"
                      src={task.icon}
                    />
                  </div>
                </div>
                <div className="[word-break:break-word] content-stretch flex flex-col font-urbanist font-medium gap-[2.52px] items-start leading-[11.339px] relative shrink-0 whitespace-nowrap">
                  <p
                    className={`font-medium relative shrink-0 text-[10.709px] ${exiting ? "text-white" : "text-black"} ${colorTransition}`}
                  >
                    {task.title}
                  </p>
                  <p
                    className={`font-[450] relative shrink-0 text-[8.189px] ${exiting ? "text-white/85" : "text-[#838383]"} ${colorTransition}`}
                  >
                    {task.sub}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="absolute bottom-[14px] flex justify-center left-0 pointer-events-none right-0 z-20">
        <AnimatePresence>
          {showToast && !reduceMotion && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="flex gap-[8px] items-center rounded-full bg-[#1c1c1c] px-[16px] py-[9px] shadow-[0px_10px_24px_-6px_rgba(0,0,0,0.35)]"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle
                  cx="8"
                  cy="8"
                  r="7.3"
                  stroke="white"
                  strokeWidth="1.4"
                />
                <path
                  d="M4.9 8.2l2.1 2.1 4.1-4.4"
                  stroke="white"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="font-urbanist font-medium text-[12px] text-white">
                Task Completed
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
