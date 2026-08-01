import AvatarGroup from "@/components/AvatarGroup";
import DistortText from "@/components/DistortText";

/** "Be The Part of the Future Before Everyone" — Figma 2877:22890 */
export default function SubscribeSection() {
  return (
    <section className="bg-[#202020] flex items-center justify-center mt-[120px] lg:mt-[168px] overflow-clip py-[80px] lg:py-0 lg:h-[525px] relative w-full">
      {/* rotated grid panels */}
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex h-[651.503px] items-center justify-center left-[calc(50%+400.65px)] top-[calc(50%-20.94px)] w-[889.301px]">
        <div className="-rotate-90 flex-none">
          <div className="h-[889.301px] opacity-[0.37] relative w-[651.503px]">
            <div className="absolute bg-[rgba(217,217,217,0.02)] border-[rgba(207,207,207,0)] border-l-[1.086px] border-r-[1.086px] border-solid h-[889.301px] left-0 top-0 w-[217.168px]" />
            <div className="absolute bg-[rgba(217,217,217,0.02)] border-[rgba(207,207,207,0)] border-l-[1.086px] border-r-[1.086px] border-solid h-[889.301px] left-[434.34px] top-0 w-[217.168px]" />
            <div className="absolute flex h-[218.253px] items-center justify-center left-[-190.02px] top-[552.69px] w-[1031.546px]">
              <div className="-rotate-90 flex-none">
                <div className="bg-[rgba(217,217,217,0.02)] border-[rgba(207,207,207,0)] border-l-[1.086px] border-r-[1.086px] border-solid h-[1031.546px] relative w-[218.253px]" />
              </div>
            </div>
            <div className="absolute flex h-[218.253px] items-center justify-center left-[-190.02px] top-[118.36px] w-[1031.546px]">
              <div className="-rotate-90 flex-none">
                <div className="bg-[rgba(217,217,217,0.02)] border-[rgba(207,207,207,0)] border-l-[1.086px] border-r-[1.086px] border-solid h-[1031.546px] relative w-[218.253px]" />
              </div>
            </div>
          </div>
        </div>
        work just like an
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex h-[651.503px] items-center justify-center left-[calc(50%-370.29px)] top-[calc(50%-20.94px)] w-[889.301px]">
        <div className="-rotate-90 flex-none">
          <div className="h-[889.301px] opacity-[0.37] relative w-[651.503px]">
            <div className="absolute bg-[rgba(217,217,217,0.02)] border-[rgba(207,207,207,0)] border-l-[1.086px] border-r-[1.086px] border-solid h-[889.301px] left-0 top-0 w-[217.168px]" />
            <div className="absolute bg-[rgba(217,217,217,0.02)] border-[rgba(207,207,207,0)] border-l-[1.086px] border-r-[1.086px] border-solid h-[889.301px] left-[434.34px] top-0 w-[217.168px]" />
            <div className="absolute flex h-[218.253px] items-center justify-center left-[-190.02px] top-[552.69px] w-[1031.546px]">
              <div className="-rotate-90 flex-none">
                <div className="bg-[rgba(217,217,217,0.02)] border-[rgba(207,207,207,0)] border-l-[1.086px] border-r-[1.086px] border-solid h-[1031.546px] relative w-[218.253px]" />
              </div>
            </div>
            <div className="absolute flex h-[218.253px] items-center justify-center left-[-190.02px] top-[118.36px] w-[1031.546px]">
              <div className="-rotate-90 flex-none">
                <div className="bg-[rgba(217,217,217,0.02)] border-[rgba(207,207,207,0)] border-l-[1.086px] border-r-[1.086px] border-solid h-[1031.546px] relative w-[218.253px]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* content */}
      <div className="relative flex flex-col gap-[50px] items-center px-[20px] w-full max-w-[601px]">
        <div className="flex flex-col gap-[8px] items-start relative shrink-0 text-[#fefefe] text-center w-full">
          <p className="font-manrope font-semibold leading-[0] relative shrink-0 text-[clamp(30px,7vw,48px)] tracking-[-0.02em] w-full">
            <span className="leading-[normal]">
              <DistortText text="Be The Part of the Future Before" />{" "}
            </span>
            <span className="font-msmadi font-normal leading-[normal] not-italic">
              Everyone
            </span>
          </p>
          <p className="font-inter font-normal leading-[normal] relative shrink-0 text-[16px] sm:text-[18px] tracking-[-0.05em] w-full">
            Type a simple instruction in natural language, and Plucia instantly
            understands your intent.
          </p>
        </div>
        <div className="flex flex-col items-start p-[10px] relative shrink-0 w-full max-w-[506px]">
          <div className="flex flex-col gap-[38px] items-center relative shrink-0 w-full">
            {/* email field — links to apps/web */}
            <a
              href="http://localhost:3000/welcome"
              className="bg-[#f4f4f4] border border-[rgba(0,0,0,0.1)] border-solid drop-shadow-[0px_4px_6.5px_rgba(0,0,0,0.15)] flex gap-[4px] h-[62px] items-start p-[6px] relative rounded-[20px] shrink-0 w-full"
            >
              <div className="bg-[rgba(32,32,32,0.08)] flex flex-[1_0_0] h-full items-center min-w-px overflow-clip p-[12px] relative rounded-bl-[14px] rounded-br-[8px] rounded-tl-[14px] rounded-tr-[8px]">
                <span className="font-inter font-medium leading-[1.5] text-[16px] text-[rgba(32,32,32,0.5)] tracking-[-0.8px]">
                  Enter your Email
                </span>
              </div>
              <span className="group flex gap-[10px] h-full items-center justify-center overflow-clip px-[20px] py-[10px] relative rounded-bl-[8px] rounded-br-[14px] rounded-tl-[8px] rounded-tr-[14px] shrink-0 transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0px_0px_0px_0.8px_#161616,0px_10px_10px_-3px_rgba(0,0,0,0.22),0px_18px_18px_-3px_rgba(0,0,0,0.2),0px_36px_34px_-4px_rgba(0,0,0,0.12)]">
                <div
                  aria-hidden
                  className="absolute inset-0 pointer-events-none rounded-bl-[8px] rounded-br-[14px] rounded-tl-[8px] rounded-tr-[14px]"
                  style={{
                    backgroundImage:
                      "linear-gradient(-5.99027deg, rgb(7, 7, 7) 12.103%, rgb(47, 46, 49) 87.897%)",
                  }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 w-[45%] -translate-x-[160%] skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[260%]"
                />
                <span className="relative shrink-0 size-[20px]">
                  <img
                    alt=""
                    className="absolute block inset-0 max-w-none size-full"
                    src="/assets/icons/mail-send-01.svg"
                  />
                </span>
                <span className="font-manrope font-semibold leading-[normal] relative shrink-0 text-[#fefefe] text-[16px] tracking-[-0.8px] whitespace-nowrap">
                  Subscribe
                </span>
                <span className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_4px_7px_0px_rgba(255,255,255,0.2)]" />
              </span>
            </a>
            <AvatarGroup light />
            <br />
          </div>
        </div>
      </div>
    </section>
  );
}
