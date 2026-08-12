export type ChannelKey =
  | "whatsapp"
  | "linkedin"
  | "telegram"
  | "mail"
  | "call"
  | "instagram";

export interface ChannelNavItem {
  key: string;
  label: string;
  icon: string;
  unread?: number;
}
