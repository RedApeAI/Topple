/**
 * Channel badges for the hero composer's channel picker, using each brand's
 * real logo artwork instead of hand-drawn placeholders. Several of the
 * "channel-*" assets in /public/assets/icons are mislabeled (e.g.
 * channel-whatsapp.svg is actually a Gmail glyph, channel-gmail.svg is
 * actually LinkedIn) — the sources below were picked by inspecting each
 * file's actual markup, not its filename, and match the ones already used
 * correctly elsewhere (DashboardShowcase's floating app tiles).
 */
export type ChannelId =
  | "whatsapp"
  | "instagram"
  | "linkedin"
  | "gmail"
  | "slack";

export const CHANNELS: { id: ChannelId; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "gmail", label: "Gmail" },
  { id: "slack", label: "Slack" },
];

const LOGO_SRC: Record<ChannelId, string> = {
  whatsapp: "/assets/icons/int-icon-2.svg",
  instagram: "/assets/icons/instagram.svg",
  linkedin: "/assets/icons/int-icon-4.svg",
  gmail: "/assets/icons/int-icon-5.svg",
  slack: "/assets/logocom/slack-new-logo-logo.svg",
};

// Gmail and Slack's artwork is drawn on a transparent canvas (no background
// tile baked in like the others), so they get a white tile behind them to
// read consistently as app icons next to WhatsApp/Instagram/LinkedIn.
const NEEDS_TILE: Partial<Record<ChannelId, true>> = {
  gmail: true,
  slack: true,
};

export function ChannelIcon({ id }: { id: ChannelId }) {
  const src = LOGO_SRC[id];

  if (NEEDS_TILE[id]) {
    return (
      <span className="flex size-full items-center justify-center overflow-hidden rounded-[6px] bg-white ring-1 ring-black/[0.07]">
        <img src={src} alt="" className="h-[68%] w-[68%] object-contain" />
      </span>
    );
  }

  return (
    <img src={src} alt="" className="size-full rounded-[6px] object-contain" />
  );
}
