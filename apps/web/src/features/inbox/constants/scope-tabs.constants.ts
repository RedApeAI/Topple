import {
  CustomerSupportIcon,
  LinkedInOutlineIcon,
  MailOutlineIcon,
  MessageCircleMoreIcon,
  WhatsAppOutlineIcon,
} from "@/components/shared/icons/brand-icons";
import type { InboxScope } from "../types/conversation.types";

export interface ScopeTab {
  value: InboxScope;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const scopeTabs: ScopeTab[] = [
  { value: "all", label: "All", icon: MessageCircleMoreIcon },
  { value: "whatsapp", label: "WhatsApp", icon: WhatsAppOutlineIcon },
  { value: "linkedin", label: "Linkedin", icon: LinkedInOutlineIcon },
  { value: "mail", label: "Mail", icon: MailOutlineIcon },
  { value: "call", label: "Calls", icon: CustomerSupportIcon },
];
