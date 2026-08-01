"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ReactLenis, useLenis } from "lenis/react";

/**
 * Lenis mounts once at the root layout and keeps running across client-side
 * route changes (App Router reuses the layout). Next.js resets the native
 * scroll position on navigation, but Lenis tracks its own virtual scroll
 * state independently of that — left alone, it stays wherever the previous
 * page scrolled to and the next wheel/touch input snaps back there. This
 * resyncs Lenis to the top the instant the route changes.
 */
function ScrollToTopOnNavigate() {
  const pathname = usePathname();
  const lenis = useLenis();

  useEffect(() => {
    const hash = window.location.hash;
    const target = hash ? document.querySelector<HTMLElement>(hash) : null;

    if (target) {
      requestAnimationFrame(() => lenis?.scrollTo(target, { offset: -100 }));
    } else {
      lenis?.scrollTo(0, { immediate: true });
    }
  }, [pathname, lenis]);

  return null;
}

export default function SmoothScroll({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Remove known extension-injected attributes that can cause hydration
    // mismatches (e.g., `bis_skin_checked` from some browser extensions).
    try {
      const removePrefixed = (el: Element | null, prefix: string) => {
        if (!el) return;
        Array.from(el.attributes).forEach((attr) => {
          if (attr.name.startsWith(prefix)) el.removeAttribute(attr.name);
        });
      };
      removePrefixed(document.documentElement, "bis_");
      removePrefixed(document.body, "bis_");
    } catch (e) {
      // no-op
    }
  }, []);

  return (
    <ReactLenis root options={{ lerp: 0.07, duration: 1.6, smoothWheel: true }}>
      <ScrollToTopOnNavigate />
      {children}
    </ReactLenis>
  );
}
