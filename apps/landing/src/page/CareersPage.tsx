"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/sections/Footer";

/**
 * Careers page — search + location/department filters over the open-roles
 * list. There are no roles yet, so ROLES stays empty and the board always
 * renders its empty state; the filter UI is fully wired for when real
 * postings are added later.
 */

type Role = {
  title: string;
  location: string;
  department: string;
  type: string;
};

const ROLES: Role[] = [];

const LOCATIONS = [
  "All locations",
  "Remote",
  "San Francisco, CA",
  "New York, NY",
  "London, UK",
];
const DEPARTMENTS = [
  "All departments",
  "Engineering",
  "Sales",
  "Design",
  "Marketing",
  "Operations",
];

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="relative w-full sm:w-auto">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-white border border-[rgba(0,0,0,0.12)] border-solid cursor-pointer font-inter outline-none pl-[16px] pr-[38px] py-[12px] rounded-[10px] text-[#202020] text-[15px] focus:border-[#202020] focus:ring-2 focus:ring-[#202020]/10 transition-colors w-full sm:w-[190px]"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        className="absolute right-[14px] top-1/2 -translate-y-1/2 pointer-events-none"
        width="12"
        height="12"
        viewBox="0 0 10 10"
        fill="none"
      >
        <path
          d="M2 3.5L5 6.5L8 3.5"
          stroke="#606060"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export default function CareersPage() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [department, setDepartment] = useState(DEPARTMENTS[0]);

  const filtered = useMemo(
    () =>
      ROLES.filter(
        (r) =>
          (location === LOCATIONS[0] || r.location === location) &&
          (department === DEPARTMENTS[0] || r.department === department) &&
          r.title.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [query, location, department],
  );

  const filtersActive =
    query.trim() !== "" ||
    location !== LOCATIONS[0] ||
    department !== DEPARTMENTS[0];

  return (
    <main className="bg-white min-h-screen w-full">
      <header className="w-full">
        <div className="mx-auto w-full max-w-[1440px] px-[20px] sm:px-[48px] xl:px-[152px] pt-[20px] sm:pt-[28px]">
          <Navbar />
        </div>
      </header>

      <section className="flex flex-col items-center mx-auto mt-[64px] lg:mt-[96px] px-[20px] text-center w-full max-w-[720px]">
        <div className="flex gap-[8px] items-center">
          <span className="bg-[#ff5b5b] inline-block rounded-full size-[6px]" />
          <p className="font-inter font-medium text-[#606060] text-[13px] tracking-[0.08em] uppercase">
            Careers
          </p>
        </div>
        <h1 className="font-manrope font-semibold mt-[16px] text-[clamp(32px,5vw,48px)] text-black tracking-[-0.05em] w-full">
          Build the future of sales with us.
        </h1>
        <p className="font-inter font-normal mt-[12px] text-[16px] sm:text-[17px] text-[#606060] tracking-[-0.02em] w-full">
          We&apos;re a small team building the AI operator that runs a sales
          team&apos;s busywork, so people can focus on closing.
        </p>
      </section>

      {/* filter bar */}
      <div className="mx-auto mt-[40px] px-[20px] w-full max-w-[860px]">
        <div className="flex flex-col sm:flex-row gap-[10px] items-stretch sm:items-center w-full">
          <div className="relative flex-1">
            <svg
              aria-hidden
              className="absolute left-[16px] top-1/2 -translate-y-1/2 pointer-events-none"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <circle
                cx="7"
                cy="7"
                r="5.2"
                stroke="#a0a0a0"
                strokeWidth="1.4"
              />
              <path
                d="M11 11L14.2 14.2"
                stroke="#a0a0a0"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search roles…"
              className="bg-white border border-[rgba(0,0,0,0.12)] border-solid font-inter outline-none pl-[42px] pr-[16px] py-[12px] placeholder:text-[#a0a0a0] rounded-[10px] text-[#202020] text-[15px] focus:border-[#202020] focus:ring-2 focus:ring-[#202020]/10 transition-colors w-full"
            />
          </div>
          <FilterSelect
            value={location}
            onChange={setLocation}
            options={LOCATIONS}
          />
          <FilterSelect
            value={department}
            onChange={setDepartment}
            options={DEPARTMENTS}
          />
        </div>
      </div>

      {/* results */}
      <div className="mx-auto mt-[24px] mb-[120px] lg:mb-[160px] px-[20px] w-full max-w-[860px]">
        {filtered.length > 0 ? (
          <div className="flex flex-col gap-[12px] w-full">
            {filtered.map((r) => (
              <div
                key={r.title}
                className="bg-white border border-[rgba(0,0,0,0.08)] border-solid flex flex-col sm:flex-row gap-[8px] sm:items-center sm:justify-between p-[20px] rounded-[14px] w-full"
              >
                <div>
                  <p className="font-manrope font-semibold text-[17px] text-black">
                    {r.title}
                  </p>
                  <p className="font-inter text-[#606060] text-[14px] mt-[4px]">
                    {r.department} · {r.location} · {r.type}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#f7f7f7] border border-[rgba(0,0,0,0.06)] border-solid flex flex-col items-center gap-[14px] px-[24px] py-[56px] rounded-[20px] text-center w-full">
            <div className="bg-white border border-[rgba(0,0,0,0.1)] border-solid flex items-center justify-center rounded-full size-[56px]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect
                  x="4"
                  y="8"
                  width="16"
                  height="11"
                  rx="2"
                  stroke="#606060"
                  strokeWidth="1.6"
                />
                <path
                  d="M9 8V6.5C9 5.67157 9.67157 5 10.5 5H13.5C14.3284 5 15 5.67157 15 6.5V8"
                  stroke="#606060"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className="font-manrope font-semibold text-[18px] text-black">
              {filtersActive
                ? "No roles match your filters."
                : "No open roles right now."}
            </p>
            <p className="font-inter text-[#606060] text-[15px] max-w-[380px]">
              {filtersActive
                ? "Try clearing a filter, or check back — we post new roles here as soon as they open."
                : "We're not hiring at the moment, but we're always happy to hear from people who care about AI, sales tooling, and building products customers love."}
            </p>
            <Link
              href="/contact"
              className="font-inter font-semibold text-[#202020] underline underline-offset-4 mt-[4px]"
            >
              Get in touch anyway
            </Link>
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
