"use client";

import Link from "next/link";

/**
 * Shared building blocks for the /signup and /login pages, styled to match
 * the landing page (Manrope/Inter, #202020 dark CTA with gradient + shine,
 * soft hairline borders).
 */

export function AuthHeader({
  prompt,
  linkText,
  linkHref,
}: {
  prompt: string;
  linkText: string;
  linkHref: string;
}) {
  return (
    <header className="flex items-center justify-between mx-auto max-w-[1440px] px-[20px] sm:px-[48px] py-[24px] w-full">
      <Link href="/" className="flex gap-[7px] items-center">
        <img
          alt="Plucia logo"
          className="size-[23px]"
          src="/assets/icons/plucia-logo.svg"
        />
        <span className="font-geist font-medium text-[#202020] text-[23px] tracking-[-0.58px]">
          Plucia
        </span>
      </Link>
      <p className="font-inter text-[14px] text-[#606060]">
        <span className="hidden sm:inline">{prompt} </span>
        <Link
          className="font-semibold text-[#202020] underline underline-offset-4"
          href={linkHref}
        >
          {linkText}
        </Link>
      </p>
    </header>
  );
}

export function DarkButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`group flex items-center justify-center overflow-clip px-[24px] py-[12px] relative rounded-[8px] shadow-[0px_0px_0px_0.8px_#161616,0px_6.866px_6.866px_-2.333px_rgba(0,0,0,0.16),0px_13.647px_13.647px_-2.917px_rgba(0,0,0,0.16),0px_30px_30px_-3.5px_rgba(0,0,0,0.08)] cursor-pointer transition-[transform,box-shadow,opacity] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0px_0px_0px_0.8px_#161616,0px_10px_10px_-3px_rgba(0,0,0,0.22),0px_18px_18px_-3px_rgba(0,0,0,0.2),0px_36px_34px_-4px_rgba(0,0,0,0.12)] disabled:opacity-40 disabled:pointer-events-none ${className}`}
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
      <span className="font-manrope font-medium leading-[normal] relative text-[16px] text-white whitespace-nowrap">
        {children}
      </span>
      <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0.8px_0px_0px_rgba(255,255,255,0.16)]" />
    </button>
  );
}

export function TextField({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-[8px] w-full">
      <span className="font-inter font-medium text-[14px] text-[#202020]">
        {label}
      </span>
      <input
        {...props}
        className="bg-white border border-[rgba(0,0,0,0.12)] border-solid font-inter outline-none px-[16px] py-[12px] placeholder:text-[#a0a0a0] rounded-[10px] text-[#202020] text-[16px] focus:border-[#202020] focus:ring-2 focus:ring-[#202020]/10 transition-colors w-full"
      />
    </label>
  );
}

export function TextAreaField({
  label,
  ...props
}: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="flex flex-col gap-[8px] w-full">
      <span className="font-inter font-medium text-[14px] text-[#202020]">
        {label}
      </span>
      <textarea
        {...props}
        className="bg-white border border-[rgba(0,0,0,0.12)] border-solid font-inter outline-none px-[16px] py-[12px] placeholder:text-[#a0a0a0] resize-none rounded-[10px] text-[#202020] text-[16px] focus:border-[#202020] focus:ring-2 focus:ring-[#202020]/10 transition-colors w-full"
      />
    </label>
  );
}
