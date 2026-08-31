import ScaleBox from "@/components/ScaleBox";
import DistortText from "@/components/DistortText";
import { ParallaxGroup, ParallaxItem } from "@/components/CursorParallax";

/**
 * "Dominate Every sales meeting with Important leads insights" — Figma 2877:21504.
 * A 1445x1568 canvas: header, color blob, and a collage of product cards
 * (map analytics, Sophie contact card, RedApeAI AI profile summary, LinkedIn
 * company card, call-rating card) joined by dashed lines. Every collage
 * element drifts a few px toward the cursor, each with its own strength and
 * spring speed (CursorParallax), and floats up/down on scroll at its own
 * rate and direction (scrollDepth) for a layered depth effect.
 */

function MapCard() {
  return (
    <div className="absolute h-[384.938px] left-[110.24px] top-0 w-[266.701px]">
      <div className="absolute bg-white inset-0 rounded-[17.78px]" />
      {/* world map */}
      <div className="absolute inset-[4.66%_1.78%_62.4%_1.67%]">
        <div className="absolute inset-[-0.18%_0]">
          <img
            alt=""
            className="block max-w-none size-full"
            src="/assets/icons/map.svg"
          />
        </div>
      </div>
      {/* tooltip */}
      <div className="absolute inset-[12.93%_69.33%_83.37%_10%] overflow-clip">
        <div className="absolute bg-[#171725] inset-[0_0.13%_1%_0] rounded-[4.481px] shadow-[0px_3.556px_9.779px_0px_rgba(68,68,79,0.1)]" />
        <p className="absolute font-inter font-normal leading-[14.082px] left-[8.13%] not-italic right-[1.16%] text-[7.681px] text-white top-[calc(50%-7.11px)] whitespace-nowrap">
          United States
        </p>
      </div>
      {/* legend rows */}
      {[
        {
          inset: "inset-[67.44%_5%_27.02%_5%]",
          color: "bg-[#0062ff]",
          label: "Massive",
          labelRight: "right-[72.18%]",
          value: "15.7k",
          valueLeft: "left-[86.67%] right-0",
        },
        {
          inset: "inset-[75.29%_5%_19.17%_5%]",
          color: "bg-[#ff974a]",
          label: "Large",
          labelRight: "right-[78.43%]",
          value: "4.9k",
          valueLeft: "left-[88.52%] right-[-0.18%]",
        },
        {
          inset: "inset-[83.14%_5%_11.32%_5%]",
          color: "bg-[#ffc542]",
          label: "Medium",
          labelRight: "right-[72.59%]",
          value: "2.4k",
          valueLeft: "left-[88.52%] right-[-0.18%]",
        },
        {
          inset: "inset-[90.99%_5%_3.46%_5%]",
          color: "bg-[#e2e2ea]",
          label: "Small",
          labelRight: "right-[78.84%]",
          value: "980",
          valueLeft: "left-[89.26%] right-[-0.09%]",
        },
      ].map((row) => (
        <div key={row.label} className={`absolute ${row.inset} overflow-clip`}>
          <div
            className={`absolute ${row.color} inset-[25.01%_96.3%_24.99%_0] rounded-[5.334px]`}
          />
          <p
            className={`absolute font-inter font-normal leading-[21.336px] left-[7.41%] not-italic ${row.labelRight} text-[#44444f] text-[12.446px] top-[calc(50%-10.67px)] tracking-[0.0889px] whitespace-nowrap`}
          >
            {row.label}
          </p>
          <p
            className={`absolute font-inter font-bold leading-[21.336px] ${row.valueLeft} not-italic text-[#44444f] text-[12.446px] text-right top-[calc(50%-10.67px)] whitespace-nowrap`}
          >
            {row.value}
          </p>
        </div>
      ))}
      {/* most customers */}
      <div className="absolute inset-[50.12%_39.67%_36.03%_5%] overflow-clip">
        <div className="absolute inset-[16.68%_26.51%_49.98%_56.63%]">
          <img
            alt="US flag"
            className="absolute block inset-0 max-w-none size-full"
            src="/assets/icons/us-flag.svg"
          />
        </div>
        <p className="absolute font-inter font-semibold leading-[normal] left-0 not-italic right-[44.43%] text-[#171725] text-[24.892px] top-[calc(50%-26.67px)] tracking-[0.1037px] whitespace-nowrap">
          19.870
        </p>
        <p className="absolute font-inter font-normal leading-[normal] left-0 not-italic right-[-5.71%] text-[#696974] text-[12.446px] top-[calc(50%+12.45px)] tracking-[0.0889px] whitespace-nowrap">
          Most of our customers are in the US
        </p>
      </div>
      {/* zoom buttons */}
      <div className="absolute contents inset-[55.2%_5%_39.26%_87%]">
        <div className="absolute inset-[56.12%_6.33%_40.18%_88.33%]">
          <div className="absolute inset-[45.83%_12.5%]">
            <img
              alt=""
              className="absolute block inset-0 max-w-none size-full"
              src="/assets/icons/ic-minus.svg"
            />
          </div>
        </div>
        <div className="absolute inset-[55.2%_5%_39.26%_87%]">
          <img
            alt=""
            className="absolute block inset-0 max-w-none size-full"
            src="/assets/icons/zoom-btn.svg"
          />
        </div>
      </div>
      <div className="absolute contents inset-[48.5%_5%_45.96%_87%]">
        <div className="absolute inset-[48.5%_5%_45.96%_87%]">
          <img
            alt=""
            className="absolute block inset-0 max-w-none size-full"
            src="/assets/icons/zoom-btn.svg"
          />
        </div>
        <div className="absolute inset-[49.42%_6.33%_46.88%_88.33%]">
          <div className="absolute inset-[12.5%]">
            <img
              alt=""
              className="absolute block inset-0 max-w-none size-full"
              src="/assets/icons/ic-plus.svg"
            />
          </div>
        </div>
      </div>
      <p className="absolute font-inter font-semibold leading-[21.336px] left-[5%] not-italic right-[42.51%] text-[#171725] text-[14.224px] top-[calc(50%-34.23px)] tracking-[0.0889px] whitespace-nowrap">
        Top Sales Locations
      </p>
    </div>
  );
}

function SophieCard() {
  return (
    // Sophie's card is the centerpiece of the mobile collage, so it gets a
    // boost there instead of the 0.85 shrink that keeps it clear of the call
    // rating card's overlap on larger screens (see CallRatingCard).
    <div className="absolute flex flex-col gap-[10.668px] items-center left-[331.5px] origin-top-left scale-[1.15] lg:scale-[0.85] top-[128px] w-[315.49px]">
      <div className="bg-[#f8f8f8] flex flex-col gap-[10.668px] items-start p-[10.668px] relative rounded-[23.114px] shrink-0 w-full">
        <div className="h-[300.629px] relative rounded-[14.224px] shrink-0 w-[294.154px]">
          <img
            alt="Sophie Bennett"
            className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[14.224px] size-full"
            src="/assets/images/sophie-photo.png"
          />
        </div>
        <div className="flex flex-col gap-[8.89px] h-[181.388px] items-start px-[8.89px] relative shrink-0 w-full">
          <p className="font-manrope font-normal leading-[normal] relative shrink-0 text-[33.716px] text-black tracking-[-1.6858px] w-full">
            Sophie Bennett
          </p>
          <div className="flex flex-col gap-[5.334px] items-start relative shrink-0 w-full">
            <p className="font-manrope font-medium leading-[normal] relative shrink-0 text-[#808080] text-[12.446px] tracking-[-0.6223px] w-full">
              Interests
            </p>
            <div className="flex gap-[5.334px] items-center relative shrink-0 w-full">
              <div className="bg-[#fbdfdf] flex h-[27.559px] items-center justify-center p-[8.89px] relative rounded-[5.334px] shrink-0">
                <p className="font-manrope font-medium leading-[normal] relative shrink-0 text-[#f03] text-[14.224px] tracking-[-0.7112px] whitespace-nowrap">
                  Real estate
                </p>
              </div>
              <div className="bg-[#cbffd9] flex h-[27.559px] items-center justify-center p-[8.89px] relative rounded-[5.334px] shrink-0">
                <p className="font-manrope font-medium leading-[normal] relative shrink-0 text-[#34a853] text-[14.224px] tracking-[-0.7112px] whitespace-nowrap">
                  Dealer
                </p>
              </div>
              <div className="bg-[#f0e4ff] flex h-[27.559px] items-center justify-center p-[8.89px] relative rounded-[5.334px] shrink-0">
                <p className="font-manrope font-medium leading-[normal] relative shrink-0 text-[#8a43e1] text-[14.224px] tracking-[-0.7112px] whitespace-nowrap">
                  tags
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col font-manrope font-medium items-start leading-[normal] relative shrink-0 w-full">
            <p className="relative shrink-0 text-[#808080] text-[12.446px] tracking-[-0.6223px] w-full">
              Confidence Score
            </p>
            <p className="relative shrink-0 text-[#34a853] text-[34.34px] tracking-[-1.717px] w-full">
              96%
            </p>
          </div>
        </div>
      </div>
      {/* channel icons row */}
      <div className="flex gap-[8.89px] items-center relative shrink-0">
        {[
          { icon: "/assets/icons/contact-icon-1.svg", size: "size-[24.892px]" },
          { icon: "/assets/icons/contact-icon-2.svg", size: "size-[24.892px]" },
          { icon: "/assets/icons/contact-icon-3.svg", size: "size-[29.551px]" },
          { icon: "/assets/icons/contact-icon-4.svg", size: "size-[24.892px]" },
          { icon: "/assets/icons/call-02.svg", size: "size-[24.892px]" },
        ].map((b, i) => (
          <div
            key={i}
            className="bg-[#f6f6f6] border-[2.074px] border-solid border-white drop-shadow-[0px_2.074px_6.223px_rgba(0,0,0,0.1)] flex items-center justify-center p-[2.074px] relative rounded-[12.446px] shrink-0 size-[49.784px]"
          >
            <div className={`relative shrink-0 ${b.size}`}>
              <img
                alt=""
                className="absolute block inset-0 max-w-none size-full"
                src={b.icon}
              />
            </div>
          </div>
        ))}
      </div>
      {/* lead tag — CRM-style status pills: light tint bg, dot + label in the
          same solid color (bg-current on the dot locks it to the label's
          text color so they can never drift apart) */}
      <div className="bg-white border-[1.984px] border-solid border-white drop-shadow-[0px_0px_8.43px_rgba(0,0,0,0.1)] flex flex-col gap-[10.521px] items-center px-[14.027px] py-[12.274px] relative rounded-[14.027px] shrink-0">
        <p className="font-inter font-medium text-[#a0a0a0] text-[10.521px] tracking-[0.842px] uppercase">
          Lead Tag
        </p>
        <div className="flex gap-[8.017px] items-center relative shrink-0">
          {[
            { label: "Hot", bg: "bg-[#fbdfdf]", color: "text-[#f03]" },
            { label: "Cold", bg: "bg-[#dbe9ff]", color: "text-[#0062ff]" },
            { label: "Neutral", bg: "bg-[#ececec]", color: "text-[#808080]" },
          ].map((tag) => (
            <div
              key={tag.label}
              className={`${tag.bg} flex gap-[6.313px] h-[33.315px] items-center justify-center px-[15.781px] relative rounded-[10.521px] shrink-0`}
            >
              <span
                aria-hidden
                className={`${tag.color} bg-current rounded-full shrink-0 size-[6.313px]`}
              />
              <p
                className={`font-inter font-medium text-[14.027px] ${tag.color} tracking-[-0.7014px] whitespace-nowrap`}
              >
                {tag.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileSummaryCard() {
  return (
    <div className="absolute bg-[#f1f0ee] border-[#34a853] border-[2.425px] border-solid drop-shadow-[0px_16.945px_31.771px_rgba(0,0,0,0.12)] flex flex-col gap-[23.299px] h-[316.92px] items-start left-[678.31px] origin-top-left p-[25.417px] rounded-bl-[27.535px] rounded-br-[27.535px] rounded-tr-[27.535px] scale-[0.75] lg:scale-100 top-[176.91px] w-[354.09px]">
      <div className="flex gap-[6.354px] items-center leading-[normal] relative shrink-0 w-full whitespace-nowrap">
        <p className="font-dmsans font-bold relative shrink-0 text-[25.417px] text-black tracking-[-1.2709px]">
          RedApeAI AI{" "}
        </p>
        <span
          aria-hidden
          className="bg-black inline-block rounded-full shrink-0 size-[6px]"
        />
        <p className="font-dmsans font-normal relative shrink-0 text-[#808080] text-[21.181px] tracking-[-1.059px]">
          Profile Summary
        </p>
      </div>
      <div className="flex flex-col gap-[10.59px] items-start relative shrink-0 w-full">
        <div className="bg-[#d5d5d5] h-[16.945px] relative rounded-[8.472px] shrink-0 w-full" />
        <div className="bg-[#d5d5d5] h-[16.977px] relative rounded-[8.472px] shrink-0 w-[234.041px]" />
        <div className="bg-[#d5d5d5] h-[16.977px] relative rounded-[8.472px] shrink-0 w-[283.759px]" />
        <div className="bg-[#d5d5d5] h-[16.945px] relative rounded-[8.472px] shrink-0 w-full" />
        <div className="bg-[#d5d5d5] h-[16.977px] relative rounded-[8.472px] shrink-0 w-[149.156px]" />
      </div>
      <div className="bg-[#202020] flex gap-[21.181px] h-[59.306px] items-center justify-center p-[21.181px] relative rounded-[25.417px] shrink-0 w-[283.824px]">
        <div className="overflow-clip relative shrink-0 size-[29.434px]">
          <div className="absolute inset-[8.81%_0_8.9%_0]">
            <img
              alt=""
              className="absolute block inset-0 max-w-none size-full"
              src="/assets/icons/google-meet.svg"
            />
          </div>
        </div>
        <p className="font-dmsans font-normal leading-[normal] relative shrink-0 text-[#fefefe] text-[25.417px] text-center tracking-[-1.2709px] whitespace-nowrap">
          schedule a Meet{" "}
        </p>
      </div>
    </div>
  );
}

function LinkedInCard() {
  return (
    // Company-info card is dropped from the mobile collage entirely (the
    // whole canvas is already crowded there) and only reappears at sm+.
    <div className="hidden lg:contents">
      <div className="absolute h-[233.808px] left-0 top-[516.52px] w-[284.481px]">
        <div className="absolute contents left-0 top-[29.34px]">
          <div className="absolute bg-white h-[204.471px] left-0 rounded-[21.336px] top-[29.34px] w-[284.481px]" />
          <div className="absolute bg-[#0062ff] flex items-center justify-center left-[173.36px] overflow-clip px-[30.226px] py-[7.112px] rounded-[21.336px] top-[40.89px]">
            <div className="flex flex-col font-inter font-semibold justify-center leading-[0] not-italic relative shrink-0 text-[10.668px] text-center text-white whitespace-nowrap">
              <p className="leading-[14.224px]">Follow</p>
            </div>
          </div>
        </div>
        <div className="absolute flex flex-col gap-[14.224px] items-start left-[17.78px] top-[74.68px]">
          <div className="flex flex-col gap-[7.112px] items-start relative shrink-0">
            <div className="h-[72.898px] overflow-clip relative shrink-0 w-[244.476px]">
              <div className="absolute flex flex-col gap-[10.668px] items-start left-0 not-italic top-0">
                <p className="font-inter font-semibold leading-[normal] relative shrink-0 text-[#171725] text-[16.002px] whitespace-nowrap">
                  Blue Vision, Inc.
                </p>
                <div className="font-inter font-normal h-[42.672px] leading-[0] relative shrink-0 text-[#92929d] text-[12.446px] tracking-[0.0889px] w-[241.809px] whitespace-pre-wrap">
                  <p className="leading-[21.336px] mb-0">
                    Information Technology and Services{" "}
                  </p>
                  <p className="leading-[21.336px]">
                    San Francisco, California{" "}
                  </p>
                </div>
              </div>
              <div className="absolute inset-[84.15%_40.36%_12.19%_58.55%]">
                <img
                  alt=""
                  className="absolute block inset-0 max-w-none size-full"
                  src="/assets/icons/oval-dot.svg"
                />
              </div>
            </div>
            <p className="font-inter font-normal leading-[normal] not-italic relative shrink-0 text-[#92929d] text-[12.446px] tracking-[0.0889px] whitespace-nowrap">
              42,835 followers
            </p>
          </div>
          <div className="flex flex-col gap-[13.335px] items-start relative shrink-0">
            <div className="flex gap-[17.78px] items-start relative shrink-0">
              <div className="h-[14.224px] relative shrink-0 w-[98.679px]">
                <p className="absolute font-inter font-normal leading-[normal] left-[23.42%] not-italic right-[-4.49%] text-[#44444f] text-[12.446px] top-[calc(50%-7.11px)] whitespace-nowrap">
                  California, US
                </p>
                <div className="absolute inset-[0_85.59%_0_0]">
                  <img
                    alt=""
                    className="absolute block inset-0 max-w-none size-full"
                    src="/assets/icons/ic-headquarters.svg"
                  />
                </div>
              </div>
              <div className="h-[14.224px] overflow-clip relative shrink-0 w-[122.683px]">
                <p className="absolute font-inter font-normal leading-[normal] left-[18.84%] not-italic right-[-6.06%] text-[#44444f] text-[12.446px] top-[calc(50%-7.11px)] whitespace-nowrap">
                  5000+ Employees
                </p>
                <div className="absolute inset-[0_88.41%_0_0]">
                  <div className="absolute inset-[4.17%]">
                    <img
                      alt=""
                      className="absolute block inset-0 max-w-none size-full"
                      src="/assets/icons/ic-working-shape.svg"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-[17.78px] items-start relative shrink-0">
              <div className="h-[14.224px] relative shrink-0 w-[113.792px]">
                <p className="absolute font-inter font-normal leading-[normal] left-[20.31%] not-italic right-[-4.68%] text-[#44444f] text-[12.446px] top-[calc(50%-7.11px)] whitespace-nowrap">
                  Public Company
                </p>
                <div className="absolute inset-[0_87.5%_0_0]">
                  <img
                    alt=""
                    className="absolute block inset-0 max-w-none size-full"
                    src="/assets/icons/ic-working.svg"
                  />
                </div>
              </div>
              <div className="h-[14.224px] relative shrink-0 w-[66.675px]">
                <p className="absolute font-inter font-normal leading-[normal] left-[34.67%] not-italic right-[-3.66%] text-[#44444f] text-[12.446px] top-[calc(50%-7.11px)] whitespace-nowrap">
                  Internet
                </p>
                <div className="absolute inset-[0_78.67%_0_0]">
                  <img
                    alt=""
                    className="absolute block inset-0 max-w-none size-full"
                    src="/assets/icons/ic-card-view.svg"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute contents left-[17.78px] top-0">
          <div className="absolute left-[17.78px] rounded-[8.89px] size-[65.786px] top-0">
            <img
              alt="Company logo"
              className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[8.89px] size-full"
              src="/assets/images/company-logo.png"
            />
          </div>
          <div className="absolute border-[#fafafb] border-[4.445px] border-solid left-[18.67px] rounded-[8.89px] size-[64.008px] top-[0.89px]" />
        </div>
      </div>
      {/* LinkedIn badge */}
      <div className="absolute left-[7.11px] overflow-clip rounded-[20.715px] size-[29.592px] top-[501.72px]">
        <div className="absolute bg-white inset-0 rounded-[2.536px] shadow-[0px_2.536px_8.455px_0px_rgba(28,36,105,0.05)]" />
        <div className="absolute inset-[31.26%_31.26%_31.24%_31.24%] overflow-clip">
          <div className="absolute inset-[0_-0.01%_0.01%_0]">
            <img
              alt="LinkedIn"
              className="absolute block inset-0 max-w-none size-full"
              src="/assets/icons/linkedin-badge.svg"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function CallRatingCard() {
  return (
    <div className="absolute bg-white border-[1.134px] border-[rgba(0,0,0,0.1)] border-solid flex flex-col gap-[6.802px] h-[81.63px] items-center justify-center left-[565.41px] overflow-clip px-[10.204px] py-[6.802px] rounded-[13.605px] top-[542.3px] w-[202.94px]">
      {[
        {
          icon: "call-done",
          label: "Call rating",
          bar: "bg-[#e1f50b]",
          barW: "w-full",
          pad: "pr-[27.21px]",
        },
        {
          icon: "happy-01",
          label: "Mood",
          bar: "bg-[#34a853]",
          barW: "w-full",
          pad: "pr-[11.337px]",
        },
        {
          icon: "shopping-basket-03",
          label: "Intent of purchase",
          bar: "bg-[#f59e0b]",
          barW: "w-[100.905px]",
          pad: "pr-[27.21px]",
        },
      ].map((row) => (
        <div
          key={row.label}
          className="flex gap-[7.936px] items-center relative shrink-0 w-full"
        >
          <div className="relative shrink-0 size-[15.811px]">
            <img
              alt=""
              className="absolute block inset-0 max-w-none size-full"
              src={`/assets/icons/${row.icon}.svg`}
            />
          </div>
          <div className="flex flex-[1_0_0] flex-col gap-[4.535px] items-start min-w-px relative">
            <p className="font-manrope font-medium leading-[normal] relative shrink-0 text-[#808080] text-[9.07px] tracking-[-0.4535px] w-full">
              {row.label}
            </p>
            <div
              className={`bg-[#d9d9d9] flex flex-col h-[2.825px] items-start ${row.pad} relative rounded-[113.374px] shrink-0 w-full`}
            >
              <div
                className={`${row.bar} h-[2.825px] relative rounded-[113.374px] shrink-0 ${row.barW}`}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function InsightsSection() {
  return (
    <section className="flex flex-col items-center pt-[45px] lg:pt-[124px] relative w-full">
      {/* color blob — sits behind the left half of the collage (Figma 2877:21505).
          Anchored to the centered 1445px canvas: left = 50% − 722px ≈ canvas x 0. */}
      <div className="absolute pointer-events-none left-[-240px] size-[560px] top-[220px] lg:left-[calc(50%-722px)] lg:size-[1079.215px] lg:top-[410px]">
        <img
          alt=""
          className="absolute inset-0 max-w-none object-cover pointer-events-none size-full"
          src="/assets/images/blob-color-1.png"
        />
      </div>

      {/* header */}
      <div className="flex flex-col gap-[16px] items-center px-[20px] relative w-full max-w-[847px]">
        <div className="bg-gradient-to-r border border-[#34a853] border-solid flex from-[rgba(244,244,244,0)] gap-[10px] items-center justify-center px-[20px] py-[7px] relative rounded-[38px] shrink-0 to-[rgba(244,244,244,0)] via-[#e7ffe5] via-[50.481%]">
          <div className="relative shrink-0 size-[24px]">
            <img
              alt=""
              className="absolute block inset-0 max-w-none size-full"
              src="/assets/icons/bot-message-square.svg"
            />
          </div>
          <p className="font-manrope font-medium leading-[normal] relative shrink-0 text-[#34a853] text-[16px] sm:text-[20px] tracking-[-0.05em] whitespace-pre">
            Business Insights by RedApeAI AI
          </p>
        </div>
        <p className="font-manrope leading-[0] not-italic relative shrink-0 text-[clamp(25px,5vw,43px)] text-black text-center tracking-[-0.0133em] w-full">
          <span className="font-normal leading-[normal]">
            <DistortText
              text="Dominate Every sales meeting with"
              baseWeight={400}
              weightShift={250}
            />{" "}
          </span>
          <span className="font-bold leading-[normal]">
            <DistortText
              text="Important leads insights"
              baseWeight={700}
              weightShift={100}
            />
          </span>
        </p>
        <p className="font-inter font-normal leading-[normal] not-italic relative shrink-0 text-[#606060] text-[12px] sm:text-[16px] text-center tracking-[-0.05em] w-full">
          Before every meeting, RedApeAI builds a complete intelligence brief by
          combining conversations, CRM activity, LinkedIn profiles, company
          data, buying signals, recent news, and behavioral insights so your
          team walks in prepared to close.
        </p>
      </div>

      {/* collage — pixel-exact canvas, scaled to fit on small screens.
          Each element sits in a ParallaxItem with its own strength/speed so
          the group drifts toward the cursor at individual rates. */}
      <ScaleBox
        designWidth={1032.4}
        designHeight={855.885}
        className="mt-[54px] max-w-[1032.4px]"
      >
        <ParallaxGroup className="absolute inset-0">
          {/* dashed connector lines */}
          <ParallaxItem strength={8} speed={0.8} scrollDepth={20}>
            <div className="absolute h-[142px] left-[617.41px] top-[623.92px] w-[142.25px]">
              <div className="absolute inset-[-2.28%_0_-2.3%_0]">
                <img
                  alt=""
                  className="block max-w-none size-full"
                  src="/assets/icons/insight-line-1.svg"
                />
              </div>
            </div>
          </ParallaxItem>
          <ParallaxItem strength={8} speed={1.1} scrollDepth={-20}>
            <div className="absolute h-[142px] left-[338.3px] top-[428.48px] w-[142.25px]">
              <div className="absolute inset-[-2.28%_0_-2.3%_0]">
                <img
                  alt=""
                  className="block max-w-none size-full"
                  src="/assets/icons/insight-line-2.svg"
                />
              </div>
            </div>
          </ParallaxItem>

          {/* up-selling pill — z-10 so it stacks over the chat screenshot below it
            when the two overlap at narrower widths */}
          <ParallaxItem
            strength={22}
            speed={1.4}
            scrollDepth={55}
            className="relative z-10"
          >
            <div className="absolute bg-[#f4f4f4] border-[1.984px] border-solid border-white drop-shadow-[0px_0px_8.43px_rgba(0,0,0,0.1)] flex gap-[5.26px] h-[33.315px] items-center left-[661.42px] pl-[4.384px] pr-[12.274px] py-[4.384px] rounded-[10.521px] top-[670.91px] w-[296.466px]">
              <div className="flex items-center overflow-clip p-[4.384px] relative rounded-[7.89px] shadow-[0px_7.89px_13.151px_0px_rgba(0,0,0,0.08),0px_3.507px_3.507px_0px_rgba(0,0,0,0.12),0px_3.507px_3.507px_0px_rgba(0,0,0,0.02),0px_3.507px_7.014px_0px_rgba(0,0,0,0.05)] shrink-0">
                <div
                  aria-hidden
                  className="absolute bg-gradient-to-b from-[#292929] inset-0 pointer-events-none rounded-[7.89px] to-[#111]"
                />
                <div className="relative shrink-0 size-[15.781px]">
                  <img
                    alt=""
                    className="absolute block inset-0 max-w-none size-full"
                    src="/assets/icons/basket-check.svg"
                  />
                </div>
                <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_1.753px_3.244px_0px_rgba(255,255,255,0.2),inset_0px_3.507px_7.014px_0px_rgba(0,0,0,0.3),inset_0px_1.753px_1.753px_0px_rgba(0,0,0,0.5)]" />
              </div>
              <p className="font-inter font-medium leading-[1.5] relative shrink-0 text-[#3d3d3d] text-[14.027px] tracking-[-0.7014px] whitespace-nowrap">
                Up Selling product based on conversation
              </p>
            </div>
          </ParallaxItem>

          {/* linked companies pill */}
          <ParallaxItem strength={20} speed={0.9} scrollDepth={-40}>
            <div className="absolute bg-[#f4f4f4] border-[1.984px] border-solid border-white drop-shadow-[0px_0px_8.43px_rgba(0,0,0,0.1)] flex h-[50.89px] items-center left-[160.91px] px-[12.446px] py-[4.445px] rounded-[10.521px] top-[471.17px] w-[142.24px]">
              <p className="flex-[1_0_0] font-inter font-medium leading-[1.5] min-w-px relative text-[#3d3d3d] text-[14.027px] text-center tracking-[-0.7014px]">
                Linked Companies for more leads
              </p>
            </div>
          </ParallaxItem>

          <ParallaxItem strength={14} speed={1.1} scrollDepth={45}>
            <ProfileSummaryCard />
          </ParallaxItem>
          <ParallaxItem strength={10} speed={0.7} scrollDepth={-30}>
            <SophieCard />
          </ParallaxItem>
          <ParallaxItem strength={26} speed={1.6} scrollDepth={70}>
            <CallRatingCard />
          </ParallaxItem>
          <ParallaxItem strength={12} speed={0.85} scrollDepth={-50}>
            <MapCard />
          </ParallaxItem>
          <ParallaxItem strength={16} speed={1.0} scrollDepth={35}>
            <LinkedInCard />
          </ParallaxItem>

          {/* chat screenshot */}
          <ParallaxItem strength={18} speed={1.25} scrollDepth={60}>
            <div className="absolute border-[2.159px] border-solid border-white h-[122.93px] left-[596.62px] overflow-clip rounded-[8.637px] shadow-[0px_2.879px_14.395px_0px_rgba(0,0,0,0.12)] top-[732.95px] w-[395.279px]">
              <img
                alt=""
                className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[8.637px] size-full"
                src="/assets/images/insights-chat.png"
              />
            </div>
          </ParallaxItem>

          {/* annotations */}
          <ParallaxItem strength={12} speed={1.0} scrollDepth={-45}>
            <p className="absolute font-inter font-medium leading-[0] left-[689.34px] not-italic text-[21px] text-black top-[26.8px] tracking-[-1.05px] w-[233.09px]">
              <span className="font-bold leading-[normal]">Know </span>
              <span className="leading-[normal]">
                who you&apos;re speaking to{" "}
              </span>
              <span className="font-bold leading-[normal]">before</span>
              <span className="leading-[normal]"> the meeting begins</span>
            </p>
          </ParallaxItem>
          <ParallaxItem strength={14} speed={1.2} scrollDepth={50}>
            <p className="absolute font-inter font-normal leading-[0] left-[108.56px] not-italic text-[21px] text-black top-[794.42px] tracking-[-1.05px] w-[272.59px]">
              <span className="leading-[normal]">Giving your team the </span>
              <span className="font-bold leading-[normal]">confidence</span>
              <span className="leading-[normal]"> to </span>
              <span className="font-bold leading-[normal]">sell smarter</span>
              <span className="leading-[normal]">.</span>
            </p>
          </ParallaxItem>
        </ParallaxGroup>
      </ScaleBox>

      {/* handwriting sign-off */}
      <p className="font-hand leading-[normal] mt-[60px] lg:mt-[100px] not-italic relative text-[21px] text-black text-center tracking-[-1.05px] whitespace-nowrap">
        Sell with RedApeAI.
      </p>
    </section>
  );
}
