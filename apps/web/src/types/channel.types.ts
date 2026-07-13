export type ChannelKey =
  | "whatsapp"
  | "linkedin"
  | "mail"
  | "call"
  | "instagram";

export interface ChannelNavItem {
  key: string;
  label: string;
  icon: string;
  unread?: number;
}
