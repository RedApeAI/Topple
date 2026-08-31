import ScaleBox from "@/components/ScaleBox";
import DistortText from "@/components/DistortText";
import PulseGlow from "@/components/PulseGlow";

/**
 * Integration — "Everything Your Team Needs in One Platform" — Figma 2877:22158.
 * A "svg motion section": eight curved wires converge from the app icons into
 * the central AI button. Every wire carries a light pulse sweeping local
 * left→right with delay 0 — the right-side wires are horizontally mirrored,
 * so on screen the pulses enter from both edges and meet at the center in
 * perfect sync.
 */

const WIRES = [
  {
    h: "h-[110.57px]",
    w: "w-[607.241px]",
    left: "left-[17.25px]",
    top: "top-[529.78px]",
    inset: "inset-[-1.25%_0_-0.95%_-0.15%]",
    src: "/assets/icons/int-wire-1.svg",
    mirror: false,
  },
  {
    h: "h-[110.57px]",
    w: "w-[607.241px]",
    left: "left-[624.5px]",
    top: "top-[529.78px]",
    inset: "inset-[-1.25%_0_-0.95%_-0.15%]",
    src: "/assets/icons/int-wire-1r.svg",
    mirror: true,
  },
  {
    h: "h-[445.778px]",
    w: "w-[603.733px]",
    left: "left-[3.21px]",
    top: "top-[84px]",
    inset: "inset-[-0.23%_0_-0.31%_-0.15%]",
    src: "/assets/icons/int-wire-2.svg",
    mirror: false,
  },
  {
    h: "h-[445.778px]",
    w: "w-[603.733px]",
    left: "left-[642.05px]",
    top: "top-[84px]",
    inset: "inset-[-0.23%_0_-0.31%_-0.15%]",
    src: "/assets/icons/int-wire-2r.svg",
    mirror: true,
  },
  {
    h: "h-[308.888px]",
    w: "w-[642.345px]",
    left: "left-[-17.84px]",
    top: "top-[221.14px]",
    inset: "inset-[-0.3%_0_-0.45%_-0.16%]",
    src: "/assets/icons/int-wire-3.svg",
    mirror: false,
  },
  {
    h: "h-[308.888px]",
    w: "w-[642.345px]",
    left: "left-[624.5px]",
    top: "top-[221.14px]",
    inset: "inset-[-0.3%_0_-0.45%_-0.16%]",
    src: "/assets/icons/int-wire-3r.svg",
    mirror: true,
  },
  {
    h: "h-[119.344px]",
    w: "w-[608.998px]",
    left: "left-[10.23px]",
    top: "top-[410.44px]",
    inset: "inset-[-0.81%_0_-1.16%_-0.16%]",
    src: "/assets/icons/int-wire-4.svg",
    mirror: false,
  },
  {
    h: "h-[119.344px]",
    w: "w-[608.998px]",
    left: "left-[629.77px]",
    top: "top-[410.44px]",
    inset: "inset-[-0.81%_0_-1.16%_-0.16%]",
    src: "/assets/icons/int-wire-4r.svg",
    mirror: true,
  },
];

const APP_ICONS = [
  {
    left: "left-[65.13px]",
    top: "top-[554.63px]",
    icon: "/assets/icons/instagram.svg",
    size: "size-[31.875px]",
    inset: false,
  },
  {
    left: "left-[177.13px]",
    top: "top-[438.23px]",
    icon: "/assets/icons/int-icon-1.svg",
    size: "size-[31.875px]",
    inset: false,
  },
  {
    left: "left-[53.8px]",
    top: "top-[291.3px]",
    icon: "/assets/logocom/slack-new-logo-logo.svg",
    size: "size-[31.875px]",
    inset: false,
  },
  // WhatsApp sits right on its wire's next vertex (verified against int-wire-2's
  // path data) on mobile only — the default position crowds Slack/Teams once
  // the counter-scale (scale-[1.8]) is applied at that breakpoint.
  {
    left: "left-[330.3px] lg:left-[239.57px]",
    top: "top-[432.24px] lg:top-[339.11px]",
    icon: "/assets/icons/int-icon-2.svg",
    size: "size-[31.875px]",
    inset: false,
  },
  {
    left: "left-[1066.13px]",
    top: "top-[551.27px]",
    icon: "/assets/icons/int-icon-3.svg",
    size: "size-[31.875px]",
    inset: false,
  },
  {
    left: "left-[1098.68px]",
    top: "top-[427.09px]",
    icon: "/assets/icons/int-icon-slack.svg",
    size: "size-[31.876px]",
    inset: true,
  },
  {
    left: "left-[1002.38px]",
    top: "top-[232.34px]",
    icon: "/assets/icons/int-icon-4.svg",
    size: "size-[31.875px]",
    inset: false,
  },
  // Gmail: same deal, moved to its wire's (int-wire-3r) next vertex on mobile
  // only — it was crowding Salesforce/LinkedIn there.
  {
    left: "left-[855.66px] lg:left-[971.17px]",
    top: "top-[496.77px] lg:top-[397.27px]",
    icon: "/assets/icons/int-icon-5.svg",
    size: "size-[31.875px]",
    inset: false,
  },
];

export default function IntegrationSection() {
  return (
    <section
      data-motion-section="integration"
      className="bg-[#f6f6f6] mt-[100px] lg:mt-[114px] mx-[16px] lg:mx-auto overflow-clip relative rounded-[24px] lg:w-full max-w-[1249px]"
    >
      {/* readable header on small screens (the in-canvas copy is desktop-only) */}
      <div className="flex lg:hidden flex-col gap-[16px] items-center px-[20px] pt-[44px] relative z-10 w-full">
        <div className="bg-gradient-to-r border border-[#34a853] border-solid flex from-[rgba(244,244,244,0)] gap-[10px] items-center justify-center px-[20px] py-[7px] relative rounded-[38px] shrink-0 to-[rgba(244,244,244,0)] via-[#e7ffe5] via-[50.481%]">
          <div className="relative shrink-0 size-[24px]">
            <img
              alt=""
              className="absolute block inset-0 max-w-none size-full"
              src="/assets/icons/bot-message-square.svg"
            />
          </div>
          <p className="font-manrope font-medium leading-[normal] relative shrink-0 text-[#34a853] text-[16px] tracking-[-0.05em] whitespace-nowrap">
            Integration
          </p>
        </div>
        <p className="font-manrope font-semibold leading-[0] relative shrink-0 text-[clamp(28px,7vw,48px)] text-black text-center tracking-[-0.05em] w-full">
          <span className="leading-[normal]">
            <DistortText text="Everything Your Team Needs in" />{" "}
          </span>
          <span className="font-msmadi font-normal leading-[normal] not-italic">
            One Inbox
          </span>
        </p>
        <p className="font-inter font-normal leading-[normal] not-italic relative shrink-0 text-[#202020] text-[16px] text-center tracking-[-0.05em] w-full max-w-[558px]">
          Type a simple instruction in natural language, and RedApeAI instantly
          understands your intent.
        </p>
      </div>

      {/* pixel-exact canvas — scaled to fit below 1249px */}
      <ScaleBox designWidth={1249} designHeight={699}>
        {/* rotated color blob */}
        <div className="absolute flex items-center justify-center left-[297.53px] size-[923.489px] top-[-392.74px]">
          <div className="flex-none rotate-[-8.5deg]">
            <div className="relative size-[812.379px]">
              <img
                alt=""
                className="absolute inset-0 max-w-none object-cover pointer-events-none size-full"
                src="/assets/images/blob-color-2.png"
              />
            </div>
          </div>
        </div>

        {/* wires — pulses sweep local left→right on every wire; mirrored right
          wires flip that to right→left on screen, so both sides converge on
          the center simultaneously (shared duration, delay 0) */}
        {WIRES.map((wire, i) =>
          wire.mirror ? (
            <div
              key={i}
              className={`absolute flex ${wire.h} items-center justify-center ${wire.left} ${wire.top} ${wire.w}`}
            >
              <div className="-scale-y-100 flex-none rotate-180">
                <div className={`${wire.h} relative ${wire.w}`}>
                  <div className={`absolute ${wire.inset}`}>
                    {/* wires bake a very pale gray gradient into the SVG itself,
                      which nearly disappears once the whole canvas shrinks
                      on phones — darken them there via filter since an <img>
                      can't be restyled internally. */}
                    <img
                      alt=""
                      className="block max-w-none size-full contrast-150 brightness-75 lg:contrast-100 lg:brightness-100"
                      src={wire.src}
                    />
                    <PulseGlow src={wire.src} horizontal />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              key={i}
              className={`absolute ${wire.h} ${wire.left} ${wire.top} ${wire.w}`}
            >
              <div className={`absolute ${wire.inset}`}>
                <img
                  alt=""
                  className="block max-w-none size-full contrast-150 brightness-75 lg:contrast-100 lg:brightness-100"
                  src={wire.src}
                />
                <PulseGlow src={wire.src} horizontal />
              </div>
            </div>
          ),
        )}

        {/* header */}
        <div className="-translate-x-1/2 absolute hidden lg:flex flex-col gap-[16px] items-center left-[calc(50%-15.76px)] top-[50px] w-[561.15px]">
          <div className="bg-gradient-to-r border border-[#34a853] border-solid flex from-[rgba(244,244,244,0)] gap-[10px] items-center justify-center px-[20px] py-[7px] relative rounded-[38px] shrink-0 to-[rgba(244,244,244,0)] via-[#e7ffe5] via-[50.481%]">
            <div className="relative shrink-0 size-[24px]">
              <img
                alt=""
                className="absolute block inset-0 max-w-none size-full"
                src="/assets/icons/bot-message-square.svg"
              />
            </div>
            <p className="font-manrope font-medium leading-[normal] relative shrink-0 text-[#34a853] text-[20px] tracking-[-1px] whitespace-nowrap">
              Integration
            </p>
          </div>
          <p className="font-manrope font-semibold leading-[0] min-w-full relative shrink-0 text-[48px] text-black text-center tracking-[-2.4px] w-[min-content]">
            <span className="leading-[normal]">
              Everything Your Team Needs in{" "}
            </span>
            <span className="font-msmadi font-normal leading-[normal] not-italic">
              One Inbox
            </span>
          </p>
          <p className="font-inter font-normal leading-[normal] not-italic relative shrink-0 text-[#202020] text-[21px] text-center tracking-[-1.05px] w-[558px]">
            Type a simple instruction in natural language, and RedApeAI instantly
            understands your intent.
          </p>
        </div>

        {/* app icon bubbles — the whole canvas shrinks a lot on phones (~0.27x
          at 335px wide), so these render as near-invisible dots there.
          Counter-scale them up on mobile only; the default center transform
          origin keeps each bubble anchored on its wire endpoint. */}
        {APP_ICONS.map((b, i) => (
          <div
            key={i}
            className={`absolute bg-[#f4f4f4] border-[2.656px] border-solid border-white drop-shadow-[0px_2.656px_7.969px_rgba(0,0,0,0.1)] flex items-center justify-center ${b.left} p-[2.656px] rounded-full size-[63.75px] ${b.top} scale-[1.8] lg:scale-100`}
          >
            <div className={`relative shrink-0 ${b.size}`}>
              {b.inset ? (
                <div className="overflow-clip relative rounded-[inherit] size-full">
                  <div className="absolute inset-[15.02%_0.05%_15.05%_0]">
                    <img
                      alt=""
                      className="absolute block inset-0 max-w-none size-full"
                      src={b.icon}
                    />
                  </div>
                </div>
              ) : (
                <img
                  alt=""
                  className="absolute block inset-0 max-w-none size-full"
                  src={b.icon}
                />
              )}
            </div>
          </div>
        ))}

        {/* central AI orb */}
        <div className="-translate-x-1/2 absolute left-[calc(50%+5.27px)] size-[207.5px] top-[418px]">
          <div className="absolute blur-[4.092px] left-0 mix-blend-luminosity size-[207.5px] top-0">
            <div className="absolute inset-[-4.74%]">
              <img
                alt=""
                className="block max-w-none size-full"
                src="/assets/icons/int-orb-dash-1.svg"
              />
            </div>
            <div className="absolute inset-[-1.34%]">
              <img
                alt=""
                className="block max-w-none size-full"
                src="/assets/icons/int-orb-dash-2.svg"
              />
            </div>
            <div className="absolute inset-[-3.13%]">
              <img
                alt=""
                className="block max-w-none size-full"
                src="/assets/icons/int-orb-dash-3.svg"
              />
            </div>
            <div
              className="absolute flex inset-[54.31%_81.99%_16.93%_1.47%] items-center justify-center"
              style={{ containerType: "size" }}
            >
              <div className="flex-none h-[hypot(-83.4046cqw,4.80764cqh)] rotate-[84.28deg] w-[hypot(16.5954cqw,95.1924cqh)]">
                <div className="blur-[3.666px] relative size-full">
                  <div className="absolute h-[28.769px] left-0 top-0 w-[57.102px]">
                    <div className="absolute inset-[-27.3%_-13.76%]">
                      <img
                        alt=""
                        className="block max-w-none size-full"
                        src="/assets/icons/int-spark-1.svg"
                      />
                    </div>
                  </div>
                  <div className="absolute h-[28.769px] left-0 top-0 w-[57.102px]">
                    <div className="absolute inset-[-16.38%_-13.76%_-54.61%_-13.76%]">
                      <img
                        alt=""
                        className="block max-w-none size-full"
                        src="/assets/icons/int-spark-2.svg"
                      />
                    </div>
                  </div>
                  <div className="absolute h-[28.769px] left-[5.02px] top-[0.5px] w-[57.102px]">
                    <div className="absolute inset-[-16.38%_-13.76%_-54.61%_-13.76%]">
                      <img
                        alt=""
                        className="block max-w-none size-full"
                        src="/assets/icons/int-spark-3.svg"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute inset-[10.36%_10.4%_10.36%_10.38%]">
              <div className="absolute inset-[-5.98%_-14.94%_-18.42%_-5.99%]">
                <img
                  alt=""
                  className="block max-w-none size-full"
                  src="/assets/icons/int-ring-a.svg"
                />
              </div>
            </div>
            <div className="absolute inset-[17.56%_17.6%_17.57%_17.59%]">
              <div className="absolute inset-[-4.88%]">
                <img
                  alt=""
                  className="block max-w-none size-full"
                  src="/assets/icons/int-ring-b.svg"
                />
              </div>
              <div className="absolute inset-[-2.06%_-2.07%]">
                <img
                  alt=""
                  className="block max-w-none size-full"
                  src="/assets/icons/int-ring-c.svg"
                />
              </div>
              <div className="absolute inset-[-4.82%_-4.83%]">
                <img
                  alt=""
                  className="block max-w-none size-full"
                  src="/assets/icons/int-ring-d.svg"
                />
              </div>
              <div
                className="absolute flex inset-[-11.67%_-16.78%_67.1%_71.15%] items-center justify-center"
                style={{ containerType: "size" }}
              >
                <div className="flex-none h-[hypot(31.9971cqw,-35.0417cqh)] rotate-[-136.96deg] w-[hypot(-68.0029cqw,-64.9583cqh)]">
                  <div className="blur-[1.571px] relative size-full">
                    <div className="absolute h-[28.769px] left-0 top-0 w-[57.102px]">
                      <div className="absolute inset-[-27.3%_-13.76%]">
                        <img
                          alt=""
                          className="block max-w-none size-full"
                          src="/assets/icons/int-spark-1.svg"
                        />
                      </div>
                    </div>
                    <div className="absolute h-[28.769px] left-0 top-0 w-[57.102px]">
                      <div className="absolute inset-[-16.38%_-13.76%_-54.61%_-13.76%]">
                        <img
                          alt=""
                          className="block max-w-none size-full"
                          src="/assets/icons/int-spark-4.svg"
                        />
                      </div>
                    </div>
                    <div className="absolute h-[28.769px] left-0 top-0 w-[57.102px]">
                      <div className="absolute inset-[-16.38%_-13.76%_-54.61%_-13.76%]">
                        <img
                          alt=""
                          className="block max-w-none size-full"
                          src="/assets/icons/int-spark-3.svg"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute inset-[24.77%_24.8%_24.77%_24.79%]">
              <div className="absolute inset-[-9.4%_-9.41%]">
                <img
                  alt=""
                  className="block max-w-none size-full"
                  src="/assets/icons/int-ring-e.svg"
                />
              </div>
            </div>
            <div className="absolute inset-[31.98%_32%_31.98%_31.99%]">
              <div className="absolute inset-[-8.78%]">
                <img
                  alt=""
                  className="block max-w-none size-full"
                  src="/assets/icons/int-ring-f.svg"
                />
              </div>
            </div>
          </div>
          <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-0.07px)] size-[111.015px] top-[calc(50%-0.07px)]">
            <div className="absolute inset-[-2.36%]">
              <img
                alt=""
                className="block max-w-none size-full"
                height={116.252}
                src="/assets/images/int-orb-ellipse-1.png"
                width={116.252}
              />
            </div>
          </div>
          <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-0.07px)] size-[108.92px] top-[calc(50%-0.07px)]">
            <div className="absolute inset-[-1.92%]">
              <img
                alt=""
                className="block max-w-none size-full"
                height={113.11}
                src="/assets/images/int-orb-ellipse-2.png"
                width={113.11}
              />
            </div>
          </div>
          <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-0.07px)] size-[207.368px] top-[calc(50%-0.07px)]">
            <div className="absolute inset-[-1.01%]">
              <img
                alt=""
                className="block max-w-none size-full"
                height={211.557}
                src="/assets/images/int-orb-ellipse-3.png"
                width={211.557}
              />
            </div>
          </div>
          <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-0.07px)] size-[149.766px] top-[calc(50%-0.07px)]">
            <div className="absolute inset-[-1.4%]">
              <img
                alt=""
                className="block max-w-none size-full"
                height={153.955}
                src="/assets/images/int-orb-ellipse-4.png"
                width={153.955}
              />
            </div>
          </div>
          <div className="absolute contents left-[23.04px] top-[33.52px]">
            <div
              className="absolute h-[140.863px] left-[23.04px] mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-size-[161.229px_140.859px] mix-blend-plus-lighter top-[33.52px] w-[161.229px]"
              style={{ maskImage: 'url("/assets/icons/int-orb-mask.svg")' }}
            >
              <div
                aria-hidden
                className="absolute bg-size-[207.8913179039955px_168.6171394586563px] bg-top-left inset-0 mix-blend-difference opacity-30 pointer-events-none"
                style={{
                  backgroundImage: 'url("/assets/images/orb-noise.png")',
                }}
              />
            </div>
          </div>
          {/* central button */}
          <div className="-translate-x-1/2 -translate-y-1/2 absolute flex items-center justify-center left-[calc(50%-0.07px)] overflow-clip p-[18.632px] rounded-[103.513px] shadow-[0px_4.141px_7.971px_0px_rgba(0,0,0,0.05),0px_24.843px_42.233px_0px_rgba(0,0,0,0.15),0px_10.351px_24.843px_0px_rgba(0,0,0,0.05),0px_53.827px_42.855px_0px_rgba(0,0,0,0.05),0px_25.878px_19.357px_0px_rgba(0,0,0,0.05)] top-[calc(50%-0.07px)]">
            <div
              aria-hidden
              className="absolute bg-gradient-to-b from-[#292929] inset-0 pointer-events-none rounded-[103.513px] to-[#111]"
            />
            <div className="overflow-clip relative shrink-0 size-[51.757px]">
              <div className="absolute inset-[7.5%_7.5%_7.51%_7.51%]">
                <div className="absolute inset-[8.24%_8.25%_8.2%_8.2%]">
                  <img
                    alt=""
                    className="absolute block inset-0 max-w-none size-full"
                    src="/assets/icons/task-list.svg"
                  />
                </div>
              </div>
            </div>
            <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[82.738px] top-1/2">
              <img
                alt=""
                className="absolute block inset-0 max-w-none size-full"
                height={82.738}
                src="/assets/images/int-orb-ellipse-5.png"
                width={82.738}
              />
            </div>
            <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[77.501px] top-1/2">
              <img
                alt=""
                className="absolute block inset-0 max-w-none size-full"
                src="/assets/icons/int-center-ring-1.svg"
              />
            </div>
            <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[85.88px] top-1/2">
              <img
                alt=""
                className="absolute block inset-0 max-w-none size-full"
                src="/assets/icons/int-center-ring-2.svg"
              />
            </div>
            <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_5.176px_8.281px_0px_rgba(255,255,255,0.05),inset_0px_1.035px_1.035px_0px_rgba(255,255,255,0.25)]" />
          </div>
          {/* orbiting sparks */}
          <div className="absolute h-[28.769px] left-[96.08px] top-[163.36px] w-[59.959px]">
            <div className="absolute h-[28.769px] left-[2.86px] top-0 w-[57.102px]">
              <div className="absolute inset-[-27.3%_-13.76%_-54.61%_-13.76%]">
                <img
                  alt=""
                  className="block max-w-none size-full"
                  src="/assets/icons/int-spark-5.svg"
                />
              </div>
            </div>
          </div>
          <div className="absolute flex h-[60.086px] items-center justify-center left-[3.63px] top-[12.1px] w-[61.298px]">
            <div className="flex-none rotate-[136.73deg]">
              <div className="h-[28.769px] relative w-[57.102px]">
                <div className="absolute inset-[-27.3%_-13.76%_-54.61%_-13.76%]">
                  <img
                    alt=""
                    className="block max-w-none size-full"
                    src="/assets/icons/int-spark-6.svg"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="absolute flex h-[18.328px] items-center justify-center left-[-26.71px] top-[63.36px] w-[83.261px]">
            <div className="-scale-y-100 flex-none rotate-180">
              <div className="h-[18.328px] relative w-[83.261px]">
                <div className="absolute inset-[-28.76%_-6.6%_-28.57%_-6.29%]">
                  <img
                    alt=""
                    className="block max-w-none size-full"
                    src="/assets/icons/int-spark-7.svg"
                  />
                </div>
              </div>
            </div>
          </div>
          {/* outer rings */}
          <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%+0.16px)] size-[145.576px] top-[calc(50%+1.21px)]">
            <div className="absolute inset-[-7.19%]">
              <img
                alt=""
                className="block max-w-none size-full"
                src="/assets/icons/int-circle-1.svg"
              />
            </div>
          </div>
          <div className="-translate-x-1/2 -translate-y-1/2 absolute flex items-center justify-center left-[calc(50%-0.22px)] size-[259.434px] top-[calc(50%+0.83px)]">
            <div className="flex-none rotate-[-133.01deg]">
              <div className="relative size-[183.559px]">
                <div className="absolute inset-[-5.71%]">
                  <img
                    alt=""
                    className="block max-w-none size-full"
                    src="/assets/icons/int-circle-2.svg"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="-translate-x-1/2 -translate-y-1/2 absolute flex items-center justify-center left-[calc(50%-2.07px)] size-[322.275px] top-[calc(50%+0.83px)]">
            <div className="flex-none rotate-[-133.01deg]">
              <div className="relative size-[228.021px]">
                <div className="absolute inset-[-2.6%]">
                  <img
                    alt=""
                    className="block max-w-none size-full"
                    src="/assets/icons/int-circle-3.svg"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScaleBox>
    </section>
  );
}
