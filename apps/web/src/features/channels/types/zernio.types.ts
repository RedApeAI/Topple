export type ConnectablePlatform = "whatsapp" | "linkedin";

export interface ConnectedChannelAccount {
  id: string;
  platform: ConnectablePlatform;
  username: string | null;
  displayName: string | null;
  profilePicture: string | null;
  profileUrl: string | null;
  status: "active" | "inactive" | "disconnected";
  needsReconnection: boolean;
  metadata: Record<string, unknown>;
}

export interface ChannelStatus {
  profileId: string;
  accounts: ConnectedChannelAccount[];
  capabilities: Record<
    ConnectablePlatform,
    { connect: boolean; conversations: boolean; sendMessages: boolean }
  >;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY";
  language: string;
  components: Array<Record<string, unknown>>;
}

export interface WhatsAppPhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
  name_status: string;
  messaging_limit_tier: string;
  wabaId: string;
  wabaName: string;
}

export interface ZernioRealtimeEvent {
  id: string;
  type: string;
  platform: string | null;
  conversationId: string | null;
  createdAt: string;
  data?: Record<string, unknown>;
}
