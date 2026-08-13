import { cn } from "@/lib/utils";
import { Send } from "lucide-react";
import type { ChannelKey } from "@/types/channel.types";
import {
  CallBadgeGlyph,
  GmailBadgeGlyph,
  InstagramBadgeGlyph,
  LinkedInBadgeGlyph,
  WhatsAppBadgeGlyph,
} from "./icons/brand-icons";

const CHANNEL_CONFIG: Record<
  ChannelKey,
  { icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  whatsapp: { icon: WhatsAppBadgeGlyph, className: "bg-channel-whatsapp" },
  linkedin: { icon: LinkedInBadgeGlyph, className: "bg-channel-linkedin" },
  mail: { icon: GmailBadgeGlyph, className: "bg-channel-mail" },
  call: { icon: CallBadgeGlyph, className: "bg-channel-call" },
  instagram: {
    icon: InstagramBadgeGlyph,
    className: "surface-instagram-gradient",
  },
  telegram: { icon: Send, className: "bg-[#229ed9]" },
};

interface ChannelBadgeProps {
  channel: ChannelKey;
  size?: number;
  className?: string;
}

/** Small colored circular identity mark — overlaps an avatar's bottom-right corner. */
export function ChannelBadge({
  channel,
  size = 18,
  className,
}: ChannelBadgeProps) {
  const config = CHANNEL_CONFIG[channel];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full border-[1.5px] border-card",
        config.className,
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon className="h-[64%] w-[64%]" />
    </span>
  );
}
