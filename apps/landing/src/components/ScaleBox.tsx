"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Scale-to-fit wrapper for the pixel-exact Figma compositions (orbs, wire
 * canvases, card collages). Renders its children on a fixed design-size
 * canvas and uniformly scales the whole canvas down to the available width,
 * so the intricate absolute-positioned artwork keeps its exact proportions
 * on tablets and phones. Never scales above 1 (desktop stays pixel-exact).
 */
export default function ScaleBox({
  designWidth,
  designHeight,
  className = "",
  children,
}: {
  designWidth: number;
  designHeight: number;
  className?: string;
  children: React.ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / designWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designWidth]);

  return (
    <div
      ref={outerRef}
      className={`relative w-full ${className}`}
      style={{ height: designHeight * scale }}
    >
      <div
        className="absolute left-1/2 top-0"
        style={{
          width: designWidth,
          height: designHeight,
          transform: `scale(${scale}) translateX(-50%)`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
