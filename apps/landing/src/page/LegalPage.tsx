import Navbar from "@/components/Navbar";
import Footer from "@/sections/Footer";

type LegalSection = {
  title: string;
  paragraphs: string[];
};

export default function LegalPage({
  eyebrow,
  title,
  introduction,
  sections,
}: {
  eyebrow: string;
  title: string;
  introduction: string;
  sections: LegalSection[];
}) {
  return (
    <main className="bg-white min-h-screen w-full">
      <header className="w-full">
        <div className="mx-auto w-full max-w-[1440px] px-[20px] sm:px-[48px] xl:px-[152px] pt-[20px] sm:pt-[28px]">
          <Navbar />
        </div>
      </header>

      <article className="mx-auto mb-[120px] mt-[64px] lg:mt-[96px] px-[20px] w-full max-w-[840px]">
        <p className="font-inter font-medium text-[#606060] text-[13px] tracking-[0.08em] uppercase">
          {eyebrow}
        </p>
        <h1 className="font-manrope font-semibold mt-[16px] text-[clamp(34px,6vw,52px)] text-black tracking-[-0.05em]">
          {title}
        </h1>
        <p className="font-inter mt-[16px] text-[17px] text-[#606060] tracking-[-0.02em]">
          {introduction}
        </p>
        <p className="font-inter mt-[16px] text-[13px] text-[#838383]">
          Last updated: July 26, 2026
        </p>

        <div className="flex flex-col gap-[40px] mt-[56px]">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-manrope font-semibold text-[24px] text-black tracking-[-0.04em]">
                {section.title}
              </h2>
              <div className="flex flex-col gap-[14px] mt-[12px]">
                {section.paragraphs.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="font-inter leading-[1.7] text-[16px] text-[#606060] tracking-[-0.01em]"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>

      <Footer />
    </main>
  );
}
