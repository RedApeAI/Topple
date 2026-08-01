"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CHANNELS, ChannelIcon, type ChannelId } from "./ChannelIcons";

/**
 * Interactive "Ask anything...." composer from the hero.
 * - Text input is real (typeable).
 * - The active channel chip shows a close (×) on hover; clicking it removes
 *   the channel.
 * - The "..." button opens a picker to switch the active channel to any of
 *   WhatsApp / Instagram / LinkedIn / Meta / X / Email / Outlook / Telegram /
 *   Slack / CRM.
 */
export default function HeroComposer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<ChannelId | null>("whatsapp");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const activeChannel = CHANNELS.find((c) => c.id === channel);

  return (
    <div className="bg-[rgba(250,248,246,0.4)] border-2 border-solid border-white flex flex-col h-[158px] items-start justify-between overflow-visible p-[20px] rounded-[24px] shadow-[0px_32px_32px_-20px_rgba(51,51,51,0.16),0px_16px_16px_-8px_rgba(51,51,51,0.08),0px_8px_8px_-4px_rgba(51,51,51,0.04)] w-full max-w-[553px] mx-auto origin-center scale-[0.98] opacity-90 transition-[max-width,box-shadow,transform,opacity] duration-300 ease-out hover:max-w-[593px] hover:scale-[1.01] hover:opacity-100 hover:ring-2 hover:ring-white hover:shadow-[0px_32px_32px_-20px_rgba(51,51,51,0.22),0px_16px_16px_-8px_rgba(51,51,51,0.12),0px_8px_8px_-4px_rgba(51,51,51,0.07)]">
      <div className="flex h-[59px] items-center justify-center relative shrink-0 w-full">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") router.push("http://localhost:3000/welcome");
          }}
          type="text"
          placeholder="Ask anything...."
          className="flex-[1_0_0] bg-transparent font-urbanist font-medium h-full leading-[24px] min-w-px relative text-[#2e2e2e] text-[18px] outline-none placeholder:text-[#9a9a9a]"
        />
      </div>
      <div className="flex items-center justify-between relative shrink-0 w-full">
        <div className="flex gap-[6px] items-center relative shrink-0">
          {/* attach */}
          <button
            type="button"
            aria-label="Attach file"
            className="flex flex-col items-center justify-center overflow-clip p-[12px] relative rounded-[12px] shrink-0 size-[40px] cursor-pointer"
          >
            <div
              aria-hidden
              className="absolute bg-white inset-0 pointer-events-none rounded-[12px]"
            />
            <div className="flex items-center relative shrink-0 size-[20px]">
              <div className="relative shrink-0 size-[20px]">
                <img
                  alt=""
                  className="absolute block inset-0 max-w-none size-full"
                  src="/assets/icons/attachment-02.svg"
                />
              </div>
            </div>
            <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0.6px_0.6px_0px_white]" />
          </button>

          {/* active channel chip */}
          {activeChannel && (
            <div className="group flex gap-[8px] h-[40px] items-center overflow-visible pl-[12px] pr-[16px] py-[12px] relative rounded-[12px] shrink-0">
              <div
                aria-hidden
                className="absolute bg-white inset-0 pointer-events-none rounded-[12px]"
              />
              <div className="relative shrink-0 size-[20px]">
                <ChannelIcon id={activeChannel.id} />
              </div>
              <div className="flex items-center relative shrink-0">
                <p className="font-urbanist font-medium leading-[18px] relative shrink-0 text-[#404040] text-[15px] tracking-[-0.15px] whitespace-nowrap">
                  {activeChannel.label}
                </p>
              </div>
              <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0.6px_0.6px_0px_white]" />

              {/* hover-revealed remove button */}
              <button
                type="button"
                aria-label={`Remove ${activeChannel.label}`}
                onClick={() => setChannel(null)}
                className="absolute -right-1.5 -top-1.5 flex items-center justify-center rounded-full bg-[#202020] size-[18px] opacity-0 scale-90 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100 cursor-pointer shadow-[0px_2px_6px_rgba(0,0,0,0.25)]"
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M1.5 1.5l7 7M8.5 1.5l-7 7"
                    stroke="white"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          )}

          {/* channel picker */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="Choose channel"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex flex-col items-center justify-center overflow-clip p-[12px] relative rounded-[12px] shrink-0 size-[40px] cursor-pointer"
            >
              <div
                aria-hidden
                className="absolute bg-white inset-0 pointer-events-none rounded-[12px]"
              />
              <div className="flex items-center relative shrink-0 size-[20px]">
                <div className="relative shrink-0 size-[20px]">
                  <img
                    alt=""
                    className="absolute block inset-0 max-w-none size-full"
                    src="/assets/icons/more-horizontal.svg"
                  />
                </div>
              </div>
              <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0.837px_0.837px_0px_white]" />
            </button>

            {menuOpen && (
              <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-[192px] overflow-hidden rounded-[14px] bg-white p-[6px] shadow-[0px_16px_32px_-8px_rgba(0,0,0,0.25),0px_4px_10px_-2px_rgba(0,0,0,0.1)] border border-black/5">
                <p className="px-[10px] pt-[6px] pb-[8px] font-inter font-medium text-[11px] uppercase tracking-[0.4px] text-[#9a9a9a]">
                  Switch channel
                </p>
                <div
                  data-lenis-prevent
                  className="no-scrollbar flex flex-col gap-[2px] max-h-[133px] overflow-y-auto overflow-x-hidden"
                >
                  {CHANNELS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setChannel(c.id);
                        setMenuOpen(false);
                      }}
                      className={`flex items-center gap-[10px] rounded-[10px] px-[10px] py-[8px] text-left cursor-pointer transition-colors ${
                        c.id === channel ? "bg-[#f1f1f1]" : "hover:bg-[#f6f6f6]"
                      }`}
                    >
                      <span className="relative shrink-0 size-[20px]">
                        <ChannelIcon id={c.id} />
                      </span>
                      <span className="font-urbanist font-medium text-[14px] text-[#2e2e2e]">
                        {c.label}
                      </span>
                      {c.id === channel && (
                        <svg
                          className="ml-auto"
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M3.5 8.5l3 3 6-6.5"
                            stroke="#34a853"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          aria-label="Send"
          onClick={() => router.push("http://localhost:3000/welcome")}
          className="flex flex-col items-center justify-center overflow-clip p-[12px] relative rounded-[12px] shadow-[0px_6.866px_6.866px_-2.333px_rgba(0,0,0,0.16),0px_13.647px_13.647px_-2.917px_rgba(0,0,0,0.16),0px_30px_30px_-3.5px_rgba(0,0,0,0.08)] shrink-0 size-[40px] cursor-pointer"
        >
          <div
            aria-hidden
            className="absolute bg-[#202020] inset-0 pointer-events-none rounded-[12px]"
          />
          <div className="flex items-center relative shrink-0 size-[20px]">
            <div className="relative shrink-0 size-[20px]">
              <img
                alt=""
                className="absolute block inset-0 max-w-none size-full"
                src="/assets/icons/arrow-up-02.svg"
              />
            </div>
          </div>
          <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0.837px_0.837px_0px_white]" />
        </button>
      </div>
    </div>
  );
}
