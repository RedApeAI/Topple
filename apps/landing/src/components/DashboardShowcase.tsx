"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";

/**
 * Dashboard screenshot below the hero — scroll-linked scale-up, similar to
 * the settle-into-frame effect on antigravity.google's video section: the
 * framed container starts slightly scaled down and offset, then smoothly grows
 * to its resting scale/position as it scrolls into view. Driven by scroll
 * progress (not a timer) and run through a soft spring so it tracks Lenis's
 * smooth scroll without feeling mechanical.
 *
 * Floating app tiles (LinkedIn, WhatsApp, Gmail, Salesforce) sit fully outside
 * the dashboard's edges, each joined to it by a thin connector line that runs
 * under the dashboard, so the line reads as plugging into it. Tiles and lines
 * live on one layer behind the dashboard sharing its entrance transform; each
 * tile then adds its own scroll parallax with a distinct travel distance,
 * direction and spring stiffness so they move independently. xl+ only — below
 * that the side padding is too tight to fit the tiles without clipping.
 */

const GAP = 46; // clearance between a tile and the dashboard edge
const REACH = 110; // how far the connector line continues under the dashboard

type TileSpec = {
  icon: string;
  alt: string;
  side: "left" | "right";
  top: string;
  size: number;
  rotate: number;
  depth: number; // parallax travel in px (sign = direction)
  drift: number; // vertical offset of the line's far end under the dashboard
  stiffness: number; // per-tile spring — lower lags more behind the scroll
};

const TILES: TileSpec[] = [
  {
    icon: "/assets/icons/int-icon-4.svg",
    alt: "LinkedIn",
    side: "left",
    top: "12%",
    size: 66,
    rotate: -8,
    depth: 72,
    drift: 30,
    stiffness: 70,
  },
  {
    icon: "/assets/icons/int-icon-2.svg",
    alt: "WhatsApp",
    side: "left",
    top: "60%",
    size: 72,
    rotate: 7,
    depth: -46,
    drift: -26,
    stiffness: 110,
  },
  {
    icon: "/assets/icons/int-icon-5.svg",
    alt: "Gmail",
    side: "right",
    top: "8%",
    size: 62,
    rotate: 9,
    depth: 56,
    drift: 34,
    stiffness: 90,
  },
  {
    icon: "",
    alt: "Salesforce",
    side: "right",
    top: "52%",
    size: 70,
    rotate: -6,
    depth: -86,
    drift: -20,
    stiffness: 60,
  },
];

function SalesforceMark() {
  return (
    <svg viewBox="0 0 48 34" className="size-full" aria-hidden>
      <g fill="#00A1E0">
        <circle cx="13" cy="21" r="9" />
        <circle cx="21" cy="13" r="10" />
        <circle cx="33" cy="16" r="11" />
        <circle cx="39" cy="23" r="8" />
        <rect x="8" y="19" width="33" height="11" rx="5.5" />
      </g>
    </svg>
  );
}

function Tile({
  spec,
  parallax,
  still,
}: {
  spec: TileSpec;
  parallax: MotionValue<number>;
  still: boolean;
}) {
  const { icon, alt, side, top, size, rotate, depth, drift, stiffness } = spec;
  const rawY = useTransform(parallax, [0, 1], [depth, -depth]);
  const y = useSpring(rawY, { stiffness, damping: 22, mass: 0.6 });

  // wrapper origin = tile's top-left; line starts at the tile's center and
  // runs REACH px past the dashboard edge, where the dashboard hides it
  const lineW = GAP + size / 2 + REACH;
  const d =
    side === "left"
      ? `M0 0 Q ${lineW * 0.55} ${drift * 0.2}, ${lineW} ${drift}`
      : `M${lineW} 0 Q ${lineW * 0.45} ${drift * 0.2}, 0 ${drift}`;

  return (
    <motion.div
      className="absolute"
      style={{
        ...(side === "left"
          ? { left: -(size + GAP) }
          : { right: -(size + GAP) }),
        top,
        ...(still ? {} : { y }),
      }}
    >
      <svg
        aria-hidden
        className="absolute overflow-visible"
        width={lineW}
        height={2}
        style={{
          top: size / 2,
          ...(side === "left" ? { left: size / 2 } : { right: size / 2 }),
        }}
      >
        <path
          d={d}
          fill="none"
          stroke="#cfcfcf"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <div
        className="relative bg-[#f6f6f6] border-[2.5px] border-solid border-white drop-shadow-[0px_8px_18px_rgba(0,0,0,0.12)] flex items-center justify-center"
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.28,
          transform: `rotate(${rotate}deg)`,
        }}
      >
        <div className="relative" style={{ width: size / 2, height: size / 2 }}>
          {icon ? (
            <img
              alt={alt}
              className="absolute block inset-0 max-w-none size-full object-contain"
              src={icon}
            />
          ) : (
            <SalesforceMark />
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function DashboardShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.90", "start 0.3"],
  });

  // startScale = size before scrolling in, endScale = max size it grows to
  const startScale = 0.88;
  const endScale = 1.08;
  const rawScale = useTransform(
    scrollYProgress,
    [0, 1],
    [startScale, endScale],
  );
  const rawY = useTransform(scrollYProgress, [0, 1], [64, 0]);
  const spring = { stiffness: 87, damping: 24, mass: 0.8 };
  const scale = useSpring(rawScale, spring);
  const y = useSpring(rawY, spring);
  const entrance = reduceMotion ? undefined : { scale, y };

  // separate, longer-running progress for the tiles' parallax drift
  const { scrollYProgress: parallax } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  return (
    <div
      ref={ref}
      className="relative mx-auto mt-[44px] sm:mt-[70px] lg:mt-[clamp(50px,7vh,104px)] w-full max-w-[1300.5px]"
    >
      {/* floating app tiles + connector lines — behind the dashboard so the
          lines vanish under its edge; shares the entrance transform */}
      <motion.div
        aria-hidden
        className="absolute hidden inset-0 pointer-events-none xl:block z-0"
        style={entrance}
      >
        {TILES.map((t) => (
          <Tile
            key={t.alt}
            spec={t}
            parallax={parallax}
            still={!!reduceMotion}
          />
        ))}
      </motion.div>

      <motion.div
        style={entrance}
        className="relative z-[1] border border-solid border-white aspect-[1107.5/787.5] overflow-clip rounded-[12px] lg:rounded-[18px] shadow-[0px_4px_30px_-13px_rgba(0,0,0,0.15)] w-full"
      >
        <img
          alt="RedApeAI dashboard"
          className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[inherit] size-full"
          src="/assets/images/hero-dashboard.png"
        />
      </motion.div>
    </div>
  );
}
