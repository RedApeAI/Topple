/**
 * Light pulse that travels along a connector-line image, masked to the line's
 * exact shape (the line SVG doubles as the mask). Styles live in globals.css:
 * `.pulse-glow` sweeps bottom→top; `horizontal` switches to `.pulse-glow-h`,
 * which sweeps local left→right — inside a -rotate-90 wrapper that reads as
 * bottom→top, and on a horizontally mirrored wire it reads right→left, so
 * mirrored wire pairs converge on the center in sync.
 *
 * All pulses share one duration/easing (globals.css), so items with equal
 * `delay` stay perfectly in phase.
 */
export default function PulseGlow({
  src,
  delay = 0,
  horizontal = false,
}: {
  src: string;
  delay?: number;
  horizontal?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={`pulse-glow ${horizontal ? "pulse-glow-h" : ""} absolute inset-0 pointer-events-none`}
      style={{
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
        animationDelay: `${delay}s`,
      }}
    />
  );
}
