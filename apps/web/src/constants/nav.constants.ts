import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CalendarMinus2,
  GalleryVerticalEnd,
  Plug,
} from "lucide-react";

// to be restored to one-inbox after demo
// import {
//   CallSparkIcon,
//   CrmIcon,
//   GmailIcon,
//   InstagramIcon,
//   LinkedInIcon,
//   MessageCircleMoreIcon,
//   WhatsAppIcon,
// } from "@/components/shared/icons/brand-icons";

import {
  GmailIcon
} from "@/components/shared/icons/brand-icons";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon | React.ComponentType<{ className?: string }>;
  unreadKey?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const dashboardSection: NavSection = {
  label: "Dashboard",
  items: [
    { label: "Overview", href: "/dashboard/overview", icon: Activity },
    {
      label: "AI Agent Campaigns",
      href: "/dashboard/campaigns",
      icon: GalleryVerticalEnd,
    },
  ],
};

// export const socialsSection: NavSection = {
//   label: "Socials",
//   items: [
//     {
//       label: "One Inbox",
//       href: "/dashboard/inbox",
//       icon: MessageCircleMoreIcon,
//     },
//     {
//       label: "WhatsApp",
//       href: "/dashboard/whatsapp",
//       icon: WhatsAppIcon,
//       unreadKey: "whatsapp",
//     },
//     {
//       label: "Linkedin",
//       href: "/dashboard/linkedin",
//       icon: LinkedInIcon,
//       unreadKey: "linkedin",
//     },
//     {
//       label: "Mail",
//       href: "/dashboard/mail",
//       icon: GmailIcon,
//       unreadKey: "mail",
//     },
//     {
//       label: "AI Cold Calling",
//       href: "/dashboard/ai-calling",
//       icon: CallSparkIcon,
//       unreadKey: "ai-cold-calling",
//     },
//     {
//       label: "Instagram",
//       href: "/dashboard/instagram",
//       icon: InstagramIcon,
//       unreadKey: "instagram",
//     },
//     {
//       label: "CRM",
//       href: "/dashboard/crm",
//       icon: CrmIcon,
//       unreadKey: "crm",
//     },
//   ],
// };

// to be restored to one-inbox after demo
export const socialsSection: NavSection = {
  label: "Socials",
  items: [
    {
      label: "Mail",
      href: "/dashboard/mail",
      icon: GmailIcon,
      unreadKey: "mail",
    },
  ],
};

export const bottomNavItems: NavItem[] = [
  {
    label: "Calendar",
    href: "/dashboard/calendar",
    icon: CalendarMinus2,
  },
  {
    label: "Connectors",
    href: "/dashboard/connectors",
    icon: Plug,
  },
];
