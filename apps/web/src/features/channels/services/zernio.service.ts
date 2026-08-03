import { apiClient } from "@/lib/api/client";
import type {
  ChannelStatus,
  ConnectablePlatform,
  WhatsAppTemplate,
  ZernioRealtimeEvent,
} from "../types/zernio.types";

export async function fetchChannelStatus(): Promise<ChannelStatus> {
  const { data } = await apiClient.get<{ data: ChannelStatus }>(
    "/api/v1/zernio/channels",
  );
  return data.data;
}

export async function fetchConnectUrl(platform: "linkedin"): Promise<string> {
  const { data } = await apiClient.post<{
    data: { authUrl: string; state: string };
  }>(`/api/v1/zernio/channels/${platform}/connect`);
  return data.data.authUrl;
}

export interface WhatsAppCredentialsInput {
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  pin?: string;
}

export async function connectWhatsAppCredentials(
  input: WhatsAppCredentialsInput,
): Promise<void> {
  await apiClient.post("/api/v1/zernio/channels/whatsapp/credentials", input);
}

export async function disconnectChannel(
  platform: ConnectablePlatform,
  accountId: string,
): Promise<void> {
  await apiClient.delete(
    `/api/v1/zernio/channels/${platform}/${encodeURIComponent(accountId)}`,
  );
}

export async function configureZernioWebhook(): Promise<void> {
  await apiClient.post("/api/v1/zernio/webhooks/configure");
}

export async function fetchWhatsAppTemplates(
  accountId: string,
): Promise<WhatsAppTemplate[]> {
  const { data } = await apiClient.get<{ data: WhatsAppTemplate[] }>(
    "/api/v1/zernio/whatsapp/templates",
    { params: { accountId } },
  );
  return data.data;
}

export async function startWhatsAppConversation(input: {
  accountId: string;
  participantId: string;
  templateName: string;
  templateLanguage: string;
  templateParams: string[];
}): Promise<{ conversationId?: string | null }> {
  const { data } = await apiClient.post<{
    data: { data: { conversationId?: string | null } };
  }>("/api/v1/zernio/conversations", input);
  return data.data.data;
}

export async function fetchZernioEvents(after?: string): Promise<{
  cursor: string;
  events: ZernioRealtimeEvent[];
}> {
  const { data } = await apiClient.get<{
    data: { cursor: string; events: ZernioRealtimeEvent[] };
  }>("/api/v1/zernio/events", { params: after ? { after } : undefined });
  return data.data;
}
