"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLenis } from "lenis/react";

export default function FooterFaqLink({ className }: { className: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const lenis = useLenis();

  return (
    <a
      href="/#faq"
      className={className}
      onClick={(event) => {
        event.preventDefault();

        if (pathname !== "/") {
          router.push("/#faq");
          return;
        }

        const faq = document.getElementById("faq");
        if (!faq) return;

        if (lenis) {
          lenis.scrollTo(faq, { offset: -100 });
        } else {
          faq.scrollIntoView({ behavior: "smooth" });
        }
        window.history.replaceState(null, "", "#faq");
      }}
    >
      FAQ
    </a>
  );
}
