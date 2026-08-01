"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useLenis } from "lenis/react";

const logoMark = (
  <>
    <div className="relative shrink-0 size-[23.211px]">
      <img
        alt="Plucia logo"
        className="absolute block inset-0 max-w-none size-full"
        src="/assets/icons/plucia-logo.svg"
      />
    </div>
    <div className="flex flex-col items-start relative shrink-0">
      <div className="flex flex-col font-geist font-medium justify-center leading-[0] relative shrink-0 text-[#202020] text-[23.211px] tracking-[-0.5803px] whitespace-nowrap">
        <p className="leading-[32.495px]">Plucia</p>
      </div>
    </div>
  </>
);

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const lenis = useLenis();
  const isHome = pathname === "/";

  return (
    <div className="bg-white border border-[rgba(0,0,0,0.05)] border-solid drop-shadow-[0px_4px_11px_rgba(0,0,0,0.15)] flex items-center justify-between p-[10px] relative rounded-[12px] w-full">
      {isHome ? (
        // Already on the homepage: a Link to "/" would just snap-jump (Next
        // doesn't re-navigate to the same URL, and the browser's own
        // scroll-to-top bypasses Lenis). Drive Lenis directly instead so the
        // logo smooth-scrolls back up to the hero like any other scroll.
        <button
          type="button"
          onClick={() => lenis?.scrollTo(0)}
          className="flex gap-[6.963px] items-center px-[8px] sm:px-[15px] relative shrink-0 cursor-pointer"
        >
          {logoMark}
        </button>
      ) : (
        <Link
          href="/"
          className="flex gap-[6.963px] items-center px-[8px] sm:px-[15px] relative shrink-0"
        >
          {logoMark}
        </Link>
      )}
      <div className="flex gap-[4px] items-center relative shrink-0">
        <button
          type="button"
          onClick={() => router.push("http://localhost:3000/dashboard")}
          className="hidden sm:flex items-center justify-center px-[20px] py-[10px] relative rounded-[8px] shrink-0 cursor-pointer"
        >
          <p className="font-manrope font-semibold leading-[normal] relative shrink-0 text-[#202020] text-[16px] whitespace-nowrap">
            Sign In
          </p>
        </button>
        <button
          type="button"
          onClick={() => router.push("http://localhost:3000/dashboard")}
          className="group flex items-center overflow-clip px-[16px] sm:px-[24px] py-[10px] sm:py-[12px] relative rounded-[8px] shadow-[0px_0px_0px_0.8px_#161616,0px_6.866px_6.866px_-2.333px_rgba(0,0,0,0.16),0px_13.647px_13.647px_-2.917px_rgba(0,0,0,0.16),0px_30px_30px_-3.5px_rgba(0,0,0,0.08)] shrink-0 cursor-pointer transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0px_0px_0px_0.8px_#161616,0px_10px_10px_-3px_rgba(0,0,0,0.22),0px_18px_18px_-3px_rgba(0,0,0,0.2),0px_36px_34px_-4px_rgba(0,0,0,0.12)]"
        >
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none rounded-[8px]"
            style={{
              backgroundImage:
                "linear-gradient(-5.99027deg, rgb(7, 7, 7) 12.103%, rgb(47, 46, 49) 87.897%)",
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-[45%] -translate-x-[160%] skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[260%]"
          />
          <div className="flex flex-col font-manrope font-medium justify-center leading-[0] relative shrink-0 text-[16px] text-white whitespace-nowrap">
            <p className="leading-[normal]">Get Started</p>
          </div>
          <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0.8px_0px_0px_rgba(255,255,255,0.16)]" />
        </button>
      </div>
    </div>
  );
}
