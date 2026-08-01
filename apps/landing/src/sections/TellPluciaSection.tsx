import ScaleBox from "@/components/ScaleBox";
import CtaLink from "@/components/CtaLink";
import DistortText from "@/components/DistortText";
import NotificationCarousel from "@/components/NotificationCarousel";
import PromptCardAnimated from "@/components/PromptCardAnimated";
import PulseGlow from "@/components/PulseGlow";

/**
 * "Just Tell Plucia What You Need." — Figma 2877:21319.
 * Right side is a dark card holding a "svg motion section": chat notifications,
 * an AI orb, connected lines and channel icons. All connector pulses share
 * delay 0 so the three lines fire in perfect sync.
 */

function ChannelBubble({
  left,
  icon,
  inset = false,
}: {
  left: string;
  icon: string;
  inset?: boolean;
}) {
  return (
    <div
      className="absolute bg-[#f4f4f4] border-[2.508px] border-solid border-white drop-shadow-[0px_2.508px_7.525px_rgba(0,0,0,0.1)] flex items-center justify-center p-[2.508px] rounded-full size-[60.197px] top-[366.47px]"
      style={{ left }}
    >
      <div className="relative shrink-0 size-[30.098px]">
        {inset ? (
          <div className="overflow-clip relative rounded-[inherit] size-full">
            <div className="absolute inset-[15.02%_0.05%_15.05%_0]">
              <img
                alt=""
                className="absolute block inset-0 max-w-none size-full"
                src={icon}
              />
            </div>
          </div>
        ) : (
          <img
            alt=""
            className="absolute block inset-0 max-w-none size-full"
            src={icon}
          />
        )}
      </div>
    </div>
  );
}

export default function TellPluciaSection() {
  return (
    <section className="flex flex-col lg:flex-row gap-[105px] lg:gap-[60px] xl:gap-[117px] items-center mt-[165px] lg:mt-[174px] mx-auto px-[20px] sm:px-[40px] relative w-full max-w-[1272px]">
      <div className="order-2 lg:order-none flex flex-col gap-[20px] lg:gap-[28px] items-start leading-[normal] relative w-full lg:min-w-0 max-w-[558px]">
        <p className="font-manrope font-semibold relative shrink-0 text-[clamp(32px,5vw,50px)] text-black tracking-[-0.05em] w-full">
          <DistortText text="Just Tell Plucia What You Need." />
        </p>
        <p className="font-inter font-normal relative shrink-0 text-[17px] sm:text-[21px] text-[#202020] tracking-[-0.05em] w-full">
          Type a simple instruction in natural language, and Plucia instantly
          understands your intent, connects every relevant channel, gathers
          customer context, and begins executing the work just like an
          experienced business operator.
        </p>
        <CtaLink>Improve your productivity now</CtaLink>
      </div>

      {/* dark motion card — pixel-exact canvas, scaled to fit on small screens.
          Comes first in document order on mobile/tablet (order-1) so the
          animation leads and the copy/CTA follows below it; desktop keeps
          its original text-then-card left-to-right order (order-none). */}
      <ScaleBox
        designWidth={517}
        designHeight={499}
        className="order-1 lg:order-none shrink-0 max-w-[517px]"
      >
        <div className="bg-[#333] h-[499px] relative rounded-[24px] shrink-0 w-[517px] overflow-visible">
          <div
            data-motion-section="tell-plucia"
            className="-translate-x-1/2 absolute h-[609.184px] left-1/2 top-[-55.28px] w-[469.613px]"
          >
            {/* connected lines — pulse travels up through each toward the orb/notification */}
            <div className="absolute h-[97.675px] left-[30.91px] top-[282.53px] w-[201.669px]">
              <div className="absolute inset-[0_-0.39%]">
                <img
                  alt=""
                  className="block max-w-none size-full"
                  src="/assets/icons/tell-lines-left.svg"
                />
                <PulseGlow src="/assets/icons/tell-lines-left.svg" delay={0} />
              </div>
            </div>
            <div className="absolute flex h-[97.675px] items-center justify-center left-[240.34px] top-[282.53px] w-[201.669px]">
              <div className="-scale-y-100 flex-none rotate-180">
                <div className="h-[97.675px] relative w-[201.669px]">
                  <div className="absolute inset-[0_-0.39%]">
                    <img
                      alt=""
                      className="block max-w-none size-full"
                      src="/assets/icons/tell-lines-right.svg"
                    />
                    <PulseGlow
                      src="/assets/icons/tell-lines-right.svg"
                      delay={0}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div
              className="absolute flex inset-[19.41%_50.22%_13.68%_49.52%] items-center justify-center"
              style={{ containerType: "size" }}
            >
              <div className="-rotate-90 flex-none h-[99.9986cqw] w-[100cqh]">
                <div className="relative size-full">
                  <div className="absolute inset-[-62.51%_0]">
                    <img
                      alt=""
                      className="block max-w-none size-full"
                      src="/assets/icons/tell-line-vertical.svg"
                    />
                    <PulseGlow
                      src="/assets/icons/tell-line-vertical.svg"
                      delay={0}
                      horizontal
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* prompt card — typing + cursor-click loop */}
            <PromptCardAnimated />

            {/* chat notifications — infinite 3-card carousel (front swipes right + toast) */}
            <NotificationCarousel />

            {/* AI orb */}
            <div className="-translate-x-1/2 absolute flex items-center left-[calc(50%+2.81px)] top-[241.06px]">
              <div className="relative shrink-0 size-[115.575px]">
                <div className="orb-cloud-rotate absolute blur-[2.279px] left-0 mix-blend-luminosity size-[115.575px] top-0">
                  <div className="absolute inset-[-4.74%]">
                    <img
                      alt=""
                      className="block max-w-none size-full"
                      src="/assets/icons/orb-dash-1.svg"
                    />
                  </div>
                  <div className="absolute inset-[-1.34%]">
                    <img
                      alt=""
                      className="block max-w-none size-full"
                      src="/assets/icons/orb-dash-2.svg"
                    />
                  </div>
                  <div className="absolute inset-[-3.13%]">
                    <img
                      alt=""
                      className="block max-w-none size-full"
                      src="/assets/icons/orb-dash-3.svg"
                    />
                  </div>
                  <div
                    className="absolute flex inset-[54.31%_81.99%_16.93%_1.47%] items-center justify-center"
                    style={{ containerType: "size" }}
                  >
                    <div className="flex-none h-[hypot(-83.4046cqw,4.80764cqh)] rotate-[84.28deg] w-[hypot(16.5954cqw,95.1924cqh)]">
                      <div className="blur-[2.042px] relative size-full">
                        <div className="absolute h-[16.024px] left-0 top-0 w-[31.806px]">
                          <div className="absolute inset-[-27.3%_-13.76%]">
                            <img
                              alt=""
                              className="block max-w-none size-full"
                              src="/assets/icons/orb-spark-1.svg"
                            />
                          </div>
                        </div>
                        <div className="absolute h-[16.024px] left-0 top-0 w-[31.806px]">
                          <div className="absolute inset-[-16.38%_-13.76%_-54.61%_-13.76%]">
                            <img
                              alt=""
                              className="block max-w-none size-full"
                              src="/assets/icons/orb-spark-2.svg"
                            />
                          </div>
                        </div>
                        <div className="absolute h-[16.024px] left-[2.79px] top-[0.28px] w-[31.806px]">
                          <div className="absolute inset-[-16.38%_-13.76%_-54.61%_-13.76%]">
                            <img
                              alt=""
                              className="block max-w-none size-full"
                              src="/assets/icons/orb-spark-3.svg"
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
                        src="/assets/icons/orb-ring-a.svg"
                      />
                    </div>
                  </div>
                  <div className="absolute inset-[17.56%_17.6%_17.57%_17.59%]">
                    <div className="absolute inset-[-4.88%]">
                      <img
                        alt=""
                        className="block max-w-none size-full"
                        src="/assets/icons/orb-ring-b.svg"
                      />
                    </div>
                    <div className="absolute inset-[-2.06%_-2.07%]">
                      <img
                        alt=""
                        className="block max-w-none size-full"
                        src="/assets/icons/orb-ring-c.svg"
                      />
                    </div>
                    <div className="absolute inset-[-4.82%_-4.83%]">
                      <img
                        alt=""
                        className="block max-w-none size-full"
                        src="/assets/icons/orb-ring-d.svg"
                      />
                    </div>
                    <div
                      className="absolute flex inset-[-11.67%_-16.79%_67.1%_71.16%] items-center justify-center"
                      style={{ containerType: "size" }}
                    >
                      <div className="flex-none h-[hypot(31.9971cqw,-35.0417cqh)] rotate-[-136.96deg] w-[hypot(-68.0029cqw,-64.9583cqh)]">
                        <div className="blur-[0.875px] relative size-full">
                          <div className="absolute h-[16.024px] left-0 top-0 w-[31.806px]">
                            <div className="absolute inset-[-27.3%_-13.76%]">
                              <img
                                alt=""
                                className="block max-w-none size-full"
                                src="/assets/icons/orb-spark-1.svg"
                              />
                            </div>
                          </div>
                          <div className="absolute h-[16.024px] left-0 top-0 w-[31.806px]">
                            <div className="absolute inset-[-16.38%_-13.76%_-54.61%_-13.76%]">
                              <img
                                alt=""
                                className="block max-w-none size-full"
                                src="/assets/icons/orb-spark-4.svg"
                              />
                            </div>
                          </div>
                          <div className="absolute h-[16.024px] left-0 top-0 w-[31.806px]">
                            <div className="absolute inset-[-16.38%_-13.76%_-54.61%_-13.76%]">
                              <img
                                alt=""
                                className="block max-w-none size-full"
                                src="/assets/icons/orb-spark-3.svg"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute inset-[24.77%_24.8%_24.78%_24.79%]">
                    <div className="absolute inset-[-9.4%_-9.41%]">
                      <img
                        alt=""
                        className="block max-w-none size-full"
                        src="/assets/icons/orb-ring-e.svg"
                      />
                    </div>
                  </div>
                  <div className="absolute inset-[31.98%_32%_31.98%_31.99%]">
                    <div className="absolute inset-[-8.78%]">
                      <img
                        alt=""
                        className="block max-w-none size-full"
                        src="/assets/icons/orb-ring-f.svg"
                      />
                    </div>
                  </div>
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-0.04px)] size-[61.834px] top-[calc(50%-0.03px)]">
                  <div className="absolute inset-[-2.36%]">
                    <img
                      alt=""
                      className="block max-w-none size-full"
                      height={64.751}
                      src="/assets/images/orb-ellipse-1.png"
                      width={64.751}
                    />
                  </div>
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-0.04px)] size-[60.668px] top-[calc(50%-0.04px)]">
                  <div className="absolute inset-[-1.92%]">
                    <img
                      alt=""
                      className="block max-w-none size-full"
                      height={63.001}
                      src="/assets/images/orb-ellipse-2.png"
                      width={63.001}
                    />
                  </div>
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-0.04px)] size-[115.502px] top-[calc(50%-0.04px)]">
                  <div className="absolute inset-[-1.01%]">
                    <img
                      alt=""
                      className="block max-w-none size-full"
                      height={117.835}
                      src="/assets/images/orb-ellipse-3.png"
                      width={117.835}
                    />
                  </div>
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-0.04px)] size-[83.418px] top-[calc(50%-0.04px)]">
                  <div className="absolute inset-[-1.4%]">
                    <img
                      alt=""
                      className="block max-w-none size-full"
                      height={85.751}
                      src="/assets/images/orb-ellipse-4.png"
                      width={85.751}
                    />
                  </div>
                </div>
                <div className="absolute contents left-[12.83px] top-[18.66px]">
                  <div
                    className="absolute h-[78.459px] left-[12.83px] mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-size-[89.803px_78.461px] mix-blend-plus-lighter top-[18.66px] w-[89.803px]"
                    style={{ maskImage: 'url("/assets/icons/orb-mask.svg")' }}
                  >
                    <div
                      aria-hidden
                      className="absolute bg-size-[115.7934256196022px_93.91809332370758px] bg-top-left inset-0 mix-blend-difference opacity-30 pointer-events-none"
                      style={{
                        backgroundImage: 'url("/assets/images/orb-noise.png")',
                      }}
                    />
                  </div>
                </div>
                <div
                  className="-translate-x-1/2 -translate-y-1/2 absolute flex items-center left-[calc(50%-0.04px)] overflow-clip p-[2.654px] rounded-[268.313px] top-[calc(50%-0.04px)]"
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, rgb(255, 47, 47) 0%, rgb(239, 123, 22) 36.277%, rgb(138, 67, 225) 69.752%, rgb(213, 17, 253) 100%)",
                  }}
                >
                  <div className="flex items-center p-[7.961px] relative rounded-[13415.626px] shrink-0">
                    <div
                      aria-hidden
                      className="absolute bg-gradient-to-b from-[#333] inset-0 pointer-events-none rounded-[13415.626px] to-[#111]"
                    />
                    <div className="overflow-clip relative shrink-0 size-[37.153px]">
                      <div className="absolute inset-[3.85%_4.04%]">
                        <div className="absolute inset-[13.97%_13.82%] overflow-clip">
                          <div className="absolute bottom-[0.71%] left-0 right-[34.2%] top-1/2">
                            <img
                              alt=""
                              className="absolute block inset-0 max-w-none size-full"
                              src="/assets/icons/orb-logo-vector.svg"
                            />
                          </div>
                          <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%+6.79px)] size-[9.154px] top-[calc(50%+5.03px)]">
                            <img
                              alt=""
                              className="absolute block inset-0 max-w-none size-full"
                              src="/assets/icons/orb-sparkles.svg"
                            />
                          </div>
                          <div className="absolute inset-[0.7%_-0.05%_50.01%_1.83%]">
                            <img
                              alt=""
                              className="absolute block inset-0 max-w-none size-full"
                              src="/assets/icons/orb-subtract.svg"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_5.308px_10.615px_0px_rgba(255,255,255,0.2),inset_0px_1.327px_1.327px_0px_rgba(255,255,255,0.25)]" />
                  </div>
                </div>
                <div className="absolute h-[16.024px] left-[53.51px] top-[90.99px] w-[33.396px]">
                  <div className="absolute h-[16.024px] left-[1.59px] top-0 w-[31.806px]">
                    <div className="absolute inset-[-27.3%_-13.76%_-54.61%_-13.76%]">
                      <img
                        alt=""
                        className="block max-w-none size-full"
                        src="/assets/icons/int-spark-5.svg"
                      />
                    </div>
                  </div>
                </div>
                <div className="absolute flex h-[33.467px] items-center justify-center left-[2.02px] top-[6.74px] w-[34.143px]">
                  <div className="flex-none rotate-[136.73deg]">
                    <div className="h-[16.024px] relative w-[31.806px]">
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
                <div className="absolute flex h-[10.208px] items-center justify-center left-[-14.88px] top-[35.29px] w-[46.376px]">
                  <div className="-scale-y-100 flex-none rotate-180">
                    <div className="h-[10.208px] relative w-[46.376px]">
                      <div className="absolute inset-[-28.76%_-6.61%_-28.57%_-6.29%]">
                        <img
                          alt=""
                          className="block max-w-none size-full"
                          src="/assets/icons/int-spark-7.svg"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%+0.09px)] size-[81.085px] top-[calc(50%+0.67px)]">
                  <div className="absolute inset-[-7.19%]">
                    <img
                      alt=""
                      className="block max-w-none size-full"
                      src="/assets/icons/orb-circle-1.svg"
                    />
                  </div>
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute flex items-center justify-center left-[calc(50%-0.12px)] size-[144.502px] top-[calc(50%+0.46px)]">
                  <div className="flex-none rotate-[-133.01deg]">
                    <div className="relative size-[102.24px]">
                      <div className="absolute inset-[-5.71%]">
                        <img
                          alt=""
                          className="block max-w-none size-full"
                          src="/assets/icons/orb-circle-2.svg"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute flex items-center justify-center left-[calc(50%-1.15px)] size-[179.504px] top-[calc(50%+0.46px)]">
                  <div className="flex-none rotate-[-133.01deg]">
                    <div className="relative size-[127.005px]">
                      <div className="absolute inset-[-2.6%]">
                        <img
                          alt=""
                          className="block max-w-none size-full"
                          src="/assets/icons/orb-circle-3.svg"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* channel bubbles */}
            <ChannelBubble
              left="0px"
              icon="/assets/icons/channel-lg-slack.svg"
              inset
            />
            {/* real Slack mark — channel-lg-slack.svg above is mislabeled (it's
              actually Salesforce artwork), so the genuine Slack logo lives here */}
            <ChannelBubble
              left="77.53px"
              icon="/assets/logocom/slack-new-logo-logo.svg"
            />
            <ChannelBubble
              left="155.06px"
              icon="/assets/icons/channel-lg-whatsapp.svg"
            />
            {/* channel-lg-gmail.svg is also mislabeled — it's a square LinkedIn
              mark, so it renders full-bleed (no inset crop) instead of the
              off-center inset meant for a wide icon, which was squashing it */}
            <ChannelBubble
              left="254.43px"
              icon="/assets/icons/channel-lg-gmail.svg"
            />
            <ChannelBubble
              left="331.96px"
              icon="/assets/icons/channel-lg-messenger.svg"
            />
            <ChannelBubble
              left="409.49px"
              icon="/assets/icons/channel-lg-instagram.svg"
            />

            {/* AI-Copilot chip */}
            <div className="absolute bg-[#f4f4f4] border-[2.328px] border-solid border-white drop-shadow-[0px_0px_9.895px_rgba(0,0,0,0.1)] flex gap-[6.174px] items-center left-[168.78px] pl-[5.145px] pr-[11.612px] py-[5.145px] rounded-[12.349px] top-[163.44px]">
              <div className="flex items-center overflow-clip p-[5.145px] relative rounded-[9.262px] shadow-[0px_9.262px_15.436px_0px_rgba(0,0,0,0.08),0px_4.116px_4.116px_0px_rgba(0,0,0,0.12),0px_4.116px_4.116px_0px_rgba(0,0,0,0.02),0px_4.116px_8.233px_0px_rgba(0,0,0,0.05)] shrink-0">
                <div
                  aria-hidden
                  className="absolute bg-gradient-to-b from-[#292929] inset-0 pointer-events-none rounded-[9.262px] to-[#111]"
                />
                <div className="relative shrink-0 size-[18.523px]">
                  <img
                    alt=""
                    className="absolute block inset-0 max-w-none size-full"
                    src="/assets/icons/ai-magic.svg"
                  />
                </div>
                <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_2.058px_3.808px_0px_rgba(255,255,255,0.2),inset_0px_4.116px_8.233px_0px_rgba(0,0,0,0.3),inset_0px_2.058px_2.058px_0px_rgba(0,0,0,0.5)]" />
              </div>
              <p className="font-inter font-medium leading-[1.5] relative shrink-0 text-[#3d3d3d] text-[16.465px] tracking-[-0.8233px] whitespace-nowrap">
                AI-Copilot
              </p>
            </div>
          </div>
        </div>
      </ScaleBox>
    </section>
  );
}
