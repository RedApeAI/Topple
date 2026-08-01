import { cn } from "@/lib/utils";

import callBadgeSvg from "@/assets/icons/call-badge.svg";
import callSparkSvg from "@/assets/icons/call-spark.svg";
import crmSvg from "@/assets/icons/crm.svg";
import customerSupportSvg from "@/assets/icons/customer-support.svg";
import gmailBadgeSvg from "@/assets/icons/gmail-badge.svg";
import gmailSvg from "@/assets/icons/gmail.svg";
import instagramBadgeSvg from "@/assets/icons/instagram-badge.svg";
import instagramSvg from "@/assets/icons/instagram.svg";
import linkedinBadgeSvg from "@/assets/icons/linkedin-badge.svg";
import linkedinOutlineSvg from "@/assets/icons/linkedin-outline.svg";
import linkedinSvg from "@/assets/icons/linkedin.svg";
import mailOutlineSvg from "@/assets/icons/mail-outline.svg";
import messageCircleMoreSvg from "@/assets/icons/message-circle-more.svg";
import pluciaLogoSvg from "@/assets/icons/plucia-logo.svg";
import taskListSvg from "@/assets/icons/task-list.svg";
import whatsappBadgeSvg from "@/assets/icons/whatsapp-badge.svg";
import whatsappOutlineSvg from "@/assets/icons/whatsapp-outline.svg";
import whatsappSvg from "@/assets/icons/whatsapp.svg";

export interface FigmaIconProps {
  className?: string;
}

function createIcon(
  asset: string,
  displayName: string,
  options?: { darkInvert?: boolean },
) {
  function Icon({ className }: FigmaIconProps) {
    return (
      <img
        src={asset}
        alt=""
        aria-hidden
        draggable={false}
        className={cn(
          "select-none object-contain",
          options?.darkInvert && "dark:invert",
          className,
        )}
      />
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

/* Full-color channel marks (sidebar, composer channel chip, empty states) */
export const WhatsAppIcon = createIcon(whatsappSvg, "WhatsAppIcon");
export const LinkedInIcon = createIcon(linkedinSvg, "LinkedInIcon");
export const GmailIcon = createIcon(gmailSvg, "GmailIcon");
export const InstagramIcon = createIcon(instagramSvg, "InstagramIcon");
export const CallSparkIcon = createIcon(callSparkSvg, "CallSparkIcon");

/* Monochrome marks — inverted in dark mode to stay legible */
export const CrmIcon = createIcon(crmSvg, "CrmIcon", { darkInvert: true });
export const MessageCircleMoreIcon = createIcon(
  messageCircleMoreSvg,
  "MessageCircleMoreIcon",
  { darkInvert: true },
);
export const WhatsAppOutlineIcon = createIcon(
  whatsappOutlineSvg,
  "WhatsAppOutlineIcon",
  { darkInvert: true },
);
export const LinkedInOutlineIcon = createIcon(
  linkedinOutlineSvg,
  "LinkedInOutlineIcon",
  { darkInvert: true },
);
export const MailOutlineIcon = createIcon(mailOutlineSvg, "MailOutlineIcon", {
  darkInvert: true,
});
export const CustomerSupportIcon = createIcon(
  customerSupportSvg,
  "CustomerSupportIcon",
  { darkInvert: true },
);

/* Brand marks on dark surfaces — already light, never inverted */
export const PluciaLogoIcon = createIcon(pluciaLogoSvg, "PluciaLogoIcon");
export const TaskListIcon = createIcon(taskListSvg, "TaskListIcon");

/* Channel-badge glyphs — sized for the small colored circle over avatars */
export const WhatsAppBadgeGlyph = createIcon(
  whatsappBadgeSvg,
  "WhatsAppBadgeGlyph",
);
export const LinkedInBadgeGlyph = createIcon(
  linkedinBadgeSvg,
  "LinkedInBadgeGlyph",
);
export const GmailBadgeGlyph = createIcon(gmailBadgeSvg, "GmailBadgeGlyph");
export const InstagramBadgeGlyph = createIcon(
  instagramBadgeSvg,
  "InstagramBadgeGlyph",
);
export const CallBadgeGlyph = createIcon(callBadgeSvg, "CallBadgeGlyph");
