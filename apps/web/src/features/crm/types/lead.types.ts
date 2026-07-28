import type { ChannelKey } from "@/types/channel.types";

export interface LeadChannel {
  channel: ChannelKey;
  externalId: string;
}

export interface Lead {
  id: string;
  name: string;
  channels: LeadChannel[];
  qualificationScore: number;
  createdAt: string;
}
