import Link from "next/link";
import FooterFaqLink from "@/components/FooterFaqLink";

/**
 * Footer — Figma 2877:22925.
 * The pastel gradient background is a full-bleed layer that stretches to the
 * actual viewport width; foreground content stays pixel-exact inside a
 * centered 1440px canvas on top of it (same pattern as Hero).
 */
export default function Footer() {
  return (
    <footer className="bg-white relative w-full overflow-hidden">
      <img
        alt=""
        className="absolute inset-0 h-full w-full object-cover pointer-events-none"
        src="/assets/images/footer-gradient-bg.png"
      />

      <div className="relative mx-auto flex gap-[40px] max-w-[1440px] flex-col items-center justify-between pb-[24px] pt-[40px] px-[16px] sm:px-[40px]">
        {/* top card */}
        <div className="bg-white flex flex-col gap-[48px] lg:gap-[96px] items-start overflow-clip px-[20px] sm:px-[40px] py-[32px] relative rounded-[16px] shrink-0 w-full">
          <div className="flex flex-col md:flex-row gap-[32px] md:gap-[16px] items-start relative shrink-0 w-full">
            <div className="flex flex-col items-start relative shrink-0 w-full md:flex-1 md:max-w-[403px]">
              <div className="flex gap-[11.822px] items-center relative shrink-0">
                <div className="relative shrink-0 size-[39.408px]">
                  <img
                    alt="RedApeAI"
                    className="absolute block inset-0 max-w-none size-full"
                    src="/assets/icons/redape-logo-lg.svg"
                  />
                </div>
                <div className="flex flex-col items-start relative shrink-0">
                  <div className="flex flex-col font-geist font-medium justify-center leading-[0] relative shrink-0 text-[#202020] text-[39.408px] tracking-[-0.9852px] whitespace-nowrap">
                    <p className="leading-[55.171px]">RedApeAI</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-[16px] items-start leading-[1.4] not-italic relative shrink-0 text-[#1b1819] w-full md:w-[442px]">
              <div className="flex flex-[1_0_0] flex-col gap-[24px] items-start min-w-px relative">
                <p className="font-inter font-medium opacity-60 relative shrink-0 text-[10px] tracking-[0.4px] uppercase w-full">
                  Company
                </p>
                <div className="flex flex-col font-inter font-normal gap-[4px] items-start relative shrink-0 text-[16px] w-full">
                  <Link
                    href="/"
                    className="relative shrink-0 w-full transition-opacity duration-200 hover:opacity-60"
                  >
                    Home
                  </Link>
                  <Link
                    href="/contact"
                    className="relative shrink-0 w-full transition-opacity duration-200 hover:opacity-60"
                  >
                    Contact Us
                  </Link>
                  <Link
                    href="/careers"
                    className="relative shrink-0 w-full transition-opacity duration-200 hover:opacity-60"
                  >
                    Careers
                  </Link>
                  <FooterFaqLink className="relative shrink-0 w-full transition-opacity duration-200 hover:opacity-60" />
                </div>
              </div>
              <div className="flex flex-[1_0_0] flex-col gap-[24px] items-start min-w-px relative">
                <p className="font-inter font-medium opacity-60 relative shrink-0 text-[10px] tracking-[0.4px] uppercase w-full">
                  Resources
                </p>
                <div className="flex flex-col font-inter font-normal gap-[4px] items-start relative shrink-0 text-[16px] w-full">
                  <Link
                    href="/blog"
                    className="relative shrink-0 w-full transition-opacity duration-200 hover:opacity-60"
                  >
                    Blog
                  </Link>
                  <Link
                    href="/privacy"
                    className="relative shrink-0 w-full transition-opacity duration-200 hover:opacity-60"
                  >
                    Privacy Policy
                  </Link>
                  <Link
                    href="/terms"
                    className="relative shrink-0 w-full transition-opacity duration-200 hover:opacity-60"
                  >
                    Terms of Service
                  </Link>
                </div>
              </div>
            </div>
            <div className="flex w-full md:w-auto md:flex-[1_0_0] flex-col gap-[16px] items-start md:items-end md:min-w-px relative">
              <Link
                href="/contact"
                className="group flex items-center overflow-clip px-[16px] py-[10px] relative rounded-[8px] shadow-[0px_0px_0px_0.8px_#161616,0px_6.866px_6.866px_-2.333px_rgba(0,0,0,0.16),0px_13.647px_13.647px_-2.917px_rgba(0,0,0,0.16),0px_30px_30px_-3.5px_rgba(0,0,0,0.08)] shrink-0 cursor-pointer transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0px_0px_0px_0.8px_#161616,0px_10px_10px_-3px_rgba(0,0,0,0.22),0px_18px_18px_-3px_rgba(0,0,0,0.2),0px_36px_34px_-4px_rgba(0,0,0,0.12)]"
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
                <div className="flex flex-col font-inter font-semibold justify-center leading-[1.4] not-italic relative shrink-0 text-[14px] text-white whitespace-nowrap">
                  <p className="relative shrink-0">Request a call</p>
                </div>
                <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0.8px_0px_0px_rgba(255,255,255,0.16)]" />
              </Link>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-[24px] sm:gap-[16px] items-start sm:items-center relative shrink-0 w-full">
            <div className="flex w-full sm:w-auto sm:flex-[1_0_0] gap-[8px] items-center sm:min-w-px relative">
              <a
                href="https://www.linkedin.com/company/redape/"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#1b1819] flex items-center justify-center relative rounded-[40px] shrink-0 size-[40px]"
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
                className="bg-[#1b1819] flex items-center justify-center relative rounded-[40px] shrink-0 size-[40px]"
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
                className="bg-[#1b1819] flex items-center justify-center relative rounded-[40px] shrink-0 size-[40px]"
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

        {/* bottom bar */}
        <div className="flex font-inter font-normal items-start justify-between leading-[1.4] not-italic relative shrink-0 text-[#202020] text-[10px] w-full whitespace-nowrap">
          <p className="relative shrink-0">© 2026 — Copyright</p>
          <Link
            href="/privacy"
            className="relative shrink-0 text-right transition-opacity duration-200 hover:opacity-60"
          >
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
}
