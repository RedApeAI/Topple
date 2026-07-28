import { ChannelBadge } from "@/components/shared/ChannelBadge";
import { cn } from "@/lib/utils";
import type { LeadChannel } from "../types/lead.types";

/** Channels the orchestrator can actually run a turn on — see `toApiChannel`. */
const CONTACTABLE = new Set(["whatsapp", "mail", "call", "instagram"]);

interface ContactChannelBadgesProps {
  channels: LeadChannel[];
  onSelect?: (channel: LeadChannel) => void;
}

/** One clickable badge per channel a lead was imported with — click to
 * open the "message this lead" flow on that channel. */
export function ContactChannelBadges({
  channels,
  onSelect,
}: ContactChannelBadgesProps) {
  if (channels.length === 0) {
    return (
      <span className="text-[13px] text-muted-foreground">No channel</span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {channels.map((leadChannel) => {
        const contactable = CONTACTABLE.has(leadChannel.channel);
        return (
          <button
            key={leadChannel.channel}
            type="button"
            disabled={!contactable}
            onClick={() => onSelect?.(leadChannel)}
            title={
              contactable
                ? `Message on ${leadChannel.channel} — ${leadChannel.externalId}`
                : `${leadChannel.channel} isn't connected yet`
            }
            className={cn(
              "rounded-full transition-transform",
              contactable ? "hover:scale-110" : "cursor-not-allowed opacity-40",
            )}
          >
            <ChannelBadge channel={leadChannel.channel} size={22} />
          </button>
        );
      })}
    </div>
  );
}
