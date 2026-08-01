import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Blog — Plucia",
  description: "Our blog is coming soon.",
};

export default function Page() {
  return (
    <main className="bg-white min-h-screen overflow-clip relative w-full">
      <div className="absolute inset-[8px] sm:inset-x-[29px] sm:inset-y-[14px] overflow-clip rounded-[24px]">
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
      </div>

      <Link
        href="/"
        className="absolute flex gap-[7px] items-center left-[28px] sm:left-[52px] top-[32px] sm:top-[38px]"
      >
        <img
          alt="Plucia logo"
          className="size-[23px]"
          src="/assets/icons/plucia-logo.svg"
        />
        <span className="font-geist font-medium text-[#202020] text-[23px] tracking-[-0.58px]">
          Plucia
        </span>
      </Link>

      <div className="flex items-center justify-center min-h-screen px-[28px] relative w-full">
        <div className="flex flex-col items-center max-w-[560px] text-center">
          <div className="bg-[#f4f4f4] border border-[rgba(0,0,0,0.1)] border-solid flex items-center justify-center rounded-full size-[72px]">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="#202020"
                strokeWidth="1.8"
              />
              <path
                d="M12 7.5V12l3 2"
                stroke="#202020"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="font-inter font-medium mt-[24px] text-[#606060] text-[13px] tracking-[0.08em] uppercase">
            Blog
          </p>
          <h1 className="font-manrope font-semibold mt-[8px] text-[clamp(32px,6vw,48px)] text-black tracking-[-0.05em]">
            Coming soon.
          </h1>
          <p className="font-inter mt-[12px] text-[16px] sm:text-[18px] text-[#606060] tracking-[-0.02em]">
            We&apos;re still writing this one. In the meantime, reach out and
            we&apos;ll answer any questions directly.
          </p>
          <Link
            href="/"
            className="font-manrope font-medium mt-[32px] inline-flex items-center px-[24px] py-[12px] rounded-[8px] text-[#202020] text-[16px] transition-[transform,border-color] duration-300 ease-out hover:-translate-y-0.5 border border-[rgba(0,0,0,0.12)] hover:border-[#202020]"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
