import { useRouter } from "next/navigation";

/**
 * Dark gradient CTA link (same look as the navbar "Get Started" button —
 * gradient fill, hover lift, shine sweep) for use inside landing sections.
 */
export default function CtaLink({
  href,
  children,
  className = "",
}: {
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(href ?? "http://localhost:3000/dashboard")}
      className={`group inline-flex items-center overflow-clip px-[24px] py-[12px] relative rounded-[8px] shadow-[0px_0px_0px_0.8px_#161616,0px_6.866px_6.866px_-2.333px_rgba(0,0,0,0.16),0px_13.647px_13.647px_-2.917px_rgba(0,0,0,0.16),0px_30px_30px_-3.5px_rgba(0,0,0,0.08)] cursor-pointer transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0px_0px_0px_0.8px_#161616,0px_10px_10px_-3px_rgba(0,0,0,0.22),0px_18px_18px_-3px_rgba(0,0,0,0.2),0px_36px_34px_-4px_rgba(0,0,0,0.12)] ${className}`}
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
