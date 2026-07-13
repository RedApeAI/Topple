import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CalendarMinus2,
  GalleryVerticalEnd,
  Route,
} from "lucide-react";
import {
  CallSparkIcon,
  CrmIcon,
  GmailIcon,
  InstagramIcon,
  LinkedInIcon,
  MessageCircleMoreIcon,
  WhatsAppIcon,
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
    { label: "Overview", href: "/overview", icon: Activity },
    {
      label: "AI Agent Campaigns",
      href: "/campaigns",
      icon: GalleryVerticalEnd,
    },
  ],
};

export const socialsSection: NavSection = {
  label: "Socials",
  items: [
    { label: "One Inbox", href: "/inbox", icon: MessageCircleMoreIcon },
    {
      label: "WhatsApp",
      href: "/whatsapp",
      icon: WhatsAppIcon,
      unreadKey: "whatsapp",
    },
    {
      label: "Linkedin",
      href: "/linkedin",
      icon: LinkedInIcon,
      unreadKey: "linkedin",
    },
    { label: "Mail", href: "/mail", icon: GmailIcon, unreadKey: "mail" },
    {
      label: "AI Cold Calling",
      href: "/ai-calling",
      icon: CallSparkIcon,
      unreadKey: "ai-cold-calling",
    },
    {
      label: "Instagram",
      href: "/instagram",
      icon: InstagramIcon,
      unreadKey: "instagram",
    },
    { label: "CRM", href: "/crm", icon: CrmIcon, unreadKey: "crm" },
  ],
};

export const bottomNavItems: NavItem[] = [
  { label: "Calendar", href: "/calendar", icon: CalendarMinus2 },
  { label: "Integrations", href: "/integrations", icon: Route },
];
