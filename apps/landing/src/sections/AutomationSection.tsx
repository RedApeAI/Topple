import ScaleBox from "@/components/ScaleBox";
import CtaLink from "@/components/CtaLink";
import DistortText from "@/components/DistortText";

/**
 * "Turn Manual Sales into Automations" — animated isometric scene:
 * app tiles travel along a dotted path (CSS motion path, globals.css
 * `.auto-flow-icon`) into a central hub disc whose dashed rings spin in
 * opposite directions; on the other side a rising chain of isometric cards
 * (each tagged with a blue action pill) bobs gently. Everything is original
 * CSS/SVG built from the site's own icon assets and palette, pixel-placed on
 * a 1100x540 ScaleBox canvas so it scales down responsively.
 */

// Path the app tiles travel (also drawn as the dotted line in the SVG).
const FLOW_PATH =
  "M -30 150 C 120 150, 80 305, 215 305 C 310 305, 330 330, 415 332";

const FLOW_ICONS = [
  { icon: "/assets/icons/channel-slack.svg", delay: 0 },
  { icon: "/assets/icons/channel-gmail.svg", delay: 1.6 },
  { icon: "/assets/icons/channel-whatsapp.svg", delay: 3.2 },
  { icon: "/assets/icons/int-icon-4.svg", delay: 4.8 },
  { icon: "/assets/icons/int-icon-3.svg", delay: 6.4 },
];

const CARDS = [
  { left: 545, top: 268, label: "Automation Action", delay: 0, checks: false },
  { left: 700, top: 190, label: "Smart Follow-up", delay: 1.4, checks: false },
  { left: 848, top: 112, label: "Meeting Booked", delay: 2.8, checks: true },
];

const GHOST_TILES = [
  { left: 130, top: 100, delay: 0.6, size: 40 },
  { left: 70, top: 400, delay: 2.2, size: 34 },
  { left: 990, top: 380, delay: 1.2, size: 44 },
];

function IsoTile({
  size,
  children,
}: {
  size: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="bg-white border border-[#e3e9f7] border-solid flex items-center justify-center rounded-[10px] shadow-[0px_10px_18px_rgba(23,42,94,0.12)]"
      style={{
        width: size,
        height: size,
        transform: "rotate(45deg) scaleY(0.6)",
      }}
    >
      {children && (
        <div
          style={{ transform: "scaleY(1.6667) rotate(-45deg)" }}
          className="flex items-center justify-center size-[55%]"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export default function AutomationSection() {
  return (
    <section className="flex flex-col items-center mt-[120px] lg:mt-[175px] overflow-hidden px-[20px] relative w-full">
      {/* header */}
      <div className="flex flex-col gap-[16px] items-center relative text-center w-full max-w-[760px]">
        <p className="font-manrope font-semibold leading-[1.08] relative text-[clamp(32px,5.5vw,52px)] text-black tracking-[-0.05em] w-full">
          <DistortText text="Turn Manual Sales into Automations" />
        </p>
        <p className="font-inter font-normal leading-[normal] relative text-[#606060] text-[16px] sm:text-[18px] tracking-[-0.02em] w-full max-w-[520px]">
          Automate outreach, follow-ups, meeting notes, and CRM updates — with
          expert help and enterprise-grade AI integrations.
        </p>
        <div className="flex gap-[12px] items-center justify-center mt-[8px] relative">
          <CtaLink>Get Started</CtaLink>
          <a
            href="#"
            className="bg-white border border-[rgba(0,0,0,0.12)] border-solid font-manrope font-medium inline-flex items-center px-[24px] py-[12px] rounded-[8px] text-[#202020] text-[16px] transition-[transform,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-[#202020] whitespace-nowrap"
          >
            Case Studies
          </a>
        </div>
      </div>

      {/* animated scene */}
      <ScaleBox
        designWidth={1100}
        designHeight={540}
        className="mt-[8px] max-w-[1100px]"
      >
        {/* dotted paths — inbound flow line and outbound connector */}
        <svg
          className="absolute inset-0"
          width="1100"
          height="540"
          viewBox="0 0 1100 540"
          fill="none"
        >
          <path
            d={FLOW_PATH}
            stroke="#c9d6f2"
            strokeWidth="2"
            strokeDasharray="1 8"
            strokeLinecap="round"
          />
          <path
            d="M 475 318 L 610 288 L 760 210 L 900 132"
            stroke="#c9d6f2"
            strokeWidth="2"
            strokeDasharray="1 8"
            strokeLinecap="round"
          />
        </svg>

        {/* faint ghost tiles */}
        {GHOST_TILES.map((g, i) => (
          <div
            key={i}
            className="absolute auto-bob opacity-50"
            style={
              {
                left: g.left,
                top: g.top,
                ["--bob-delay" as string]: `${g.delay}s`,
              } as React.CSSProperties
            }
          >
            <IsoTile size={g.size} />
          </div>
        ))}

        {/* app tiles traveling the path into the hub */}
        {FLOW_ICONS.map((f) => (
          <div
            key={f.icon}
            className="absolute auto-flow-icon left-0 top-0"
            style={
              {
                offsetPath: `path("${FLOW_PATH}")`,
                ["--flow-delay" as string]: `${f.delay}s`,
              } as React.CSSProperties
            }
          >
            <IsoTile size={48}>
              <img
                alt=""
                className="block max-w-none size-full object-contain"
                src={f.icon}
              />
            </IsoTile>
          </div>
        ))}

        {/* hub — isometric disc with spinning dashed rings */}
        <div
          className="absolute left-[330px] top-[225px] size-[200px]"
          style={{ transform: "scaleY(0.55)" }}
        >
          {/* glow */}
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[420px] rounded-full"
            style={{
              background:
                "radial-gradient(closest-side, rgba(0,98,255,0.16), rgba(0,98,255,0))",
            }}
          />
          {/* depth / side wall */}
          <div className="absolute inset-[4px] rounded-full bg-[#131c33] translate-y-[22px]" />
          {/* top disc */}
          <div className="absolute inset-0 rounded-full bg-[#eef3ff] shadow-[0px_6px_24px_rgba(23,42,94,0.18)]" />
          {/* maze rings */}
          <div className="absolute auto-spin border-[11px] border-[#0062ff] border-dashed inset-[16px] rounded-full" />
          <div className="absolute auto-spin-reverse border-[11px] border-[#0062ff] border-dashed inset-[46px] rounded-full opacity-80" />
          {/* core */}
          <div className="absolute bg-[#0062ff] inset-[74px] rounded-full" />
          <div className="absolute bg-white inset-[84px] rounded-full" />
          <div className="absolute bg-[#0062ff] inset-[91px] rounded-full" />
        </div>

        {/* output cards — rising isometric chain */}
        {CARDS.map((c) => (
          <div
            key={c.label}
            className="absolute auto-bob"
            style={
              {
                left: c.left,
                top: c.top,
                ["--bob-delay" as string]: `${c.delay}s`,
              } as React.CSSProperties
            }
          >
            <div
              className="bg-white border border-[#e3e9f7] border-solid h-[112px] rounded-[14px] shadow-[0px_16px_30px_rgba(23,42,94,0.14)] w-[196px]"
              style={{ transform: "rotate(-20deg) skewX(20deg) scaleY(0.9)" }}
            >
              <div className="flex flex-col gap-[10px] p-[16px]">
                {c.checks ? (
                  <div className="flex gap-[6px]">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className="bg-[#34a853]/70 inline-block rounded-[3px] size-[10px]"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="bg-[#eef1f8] h-[10px] rounded-full w-[70%]" />
                )}
                <div className="bg-[#eef1f8] h-[10px] rounded-full w-full" />
                <div className="bg-[#eef1f8] h-[10px] rounded-full w-[55%]" />
              </div>
              {/* action pill — counter-transformed so it reads upright */}
              <div
                className="absolute left-[24px] top-[74px]"
                style={{
                  transform: "scaleY(1.1111) skewX(-20deg) rotate(20deg)",
                }}
              >
                <span className="bg-[#0062ff] font-inter font-semibold inline-block px-[14px] py-[6px] rounded-full shadow-[0px_8px_16px_rgba(0,98,255,0.35)] text-[12px] text-white whitespace-nowrap">
                  {c.label}
                </span>
              </div>
            </div>
          </div>
        ))}
      </ScaleBox>
    </section>
  );
}
