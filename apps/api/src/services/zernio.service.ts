import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import {
  getDb,
  zernioAccounts,
  zernioProfiles,
  zernioWebhooks,
} from "@repo/db-sql";
import { and, asc, eq, gt, or } from "drizzle-orm";

import { AppError } from "../lib/errors.js";
import { env } from "../lib/env.js";
import { handleWebhookEvent } from "../events/handlers/webhook.js";
import type { ProcessedEvent } from "../events/router.js";
import type { Tenant } from "./tenant.service.js";

export { resolveTenant } from "./tenant.service.js";
export type { Tenant } from "./tenant.service.js";

export type ZernioPlatform = "whatsapp" | "linkedin";

interface ZernioProfileResponse {
  profile: { _id: string; name: string };
}

interface ZernioAccount {
  _id: string;
  profileId: string | { _id?: string };
  platform: string;
  username?: string;
  displayName?: string;
  profilePicture?: string | null;
  profileUrl?: string;
  isActive: boolean;
  enabled?: boolean;
  needsReconnection?: boolean;
  metadata?: Record<string, unknown>;
}

interface AccountsResponse {
  accounts: ZernioAccount[];
}

interface ConnectResponse {
  authUrl: string;
  state: string;
}

interface WhatsAppConnectResponse {
  message?: string;
  account: {
    accountId?: string;
    _id?: string;
    platform: "whatsapp";
    username?: string;
    displayName?: string;
    isActive?: boolean;
  };
}

export interface WhatsAppCredentialsInput {
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  pin?: string;
}

interface ZernioErrorPayload {
  error?: string;
  code?: string;
  type?: string;
  dashboard_url?: string;
  details?: { existingProfileId?: string } & Record<string, unknown>;
}

interface ConversationRecord {
  id: string;
  platform: string;
  accountId: string;
  accountUsername?: string;
  participantId: string;
  participantName?: string;
  participantPicture?: string | null;
  lastMessage?: string;
  updatedTime?: string;
  status?: "active" | "archived";
  unreadCount?: number | null;
}

interface ConversationsResponse {
  data: ConversationRecord[];
  pagination: { hasMore: boolean; nextCursor: string | null };
  meta?: Record<string, unknown>;
}

interface ConversationDetailResponse {
  data: ConversationRecord;
}

interface MessageRecord {
  id: string;
  conversationId: string;
  accountId: string;
  platform: string;
  message: string;
  senderId?: string;
  senderName?: string | null;
  direction: "incoming" | "outgoing";
  createdAt: string;
  deliveryStatus?: "sent" | "delivered" | "read" | "failed" | "deleted" | null;
  deliveryError?: Record<string, unknown> | null;
}

interface MessagesResponse {
  status: string;
  messages: MessageRecord[];
  pagination: { hasMore: boolean; nextCursor: string | null };
  sortOrderApplied: "asc" | "desc";
  lastUpdated?: string;
}

interface SendMessageResponse {
  success: boolean;
  data: {
    messageId?: string;
    conversationId?: string | null;
    sentAt?: string | null;
    message?: string | null;
  };
}

interface DisconnectAccountResponse {
  message: string;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY";
  language: string;
  components: Array<Record<string, unknown>>;
}

interface WhatsAppTemplatesResponse {
  success: boolean;
  templates: WhatsAppTemplate[];
}

interface WebhookSetting {
  _id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
}

interface WebhookSettingsResponse {
  webhooks: WebhookSetting[];
}

export interface ZernioWebhookPayload {
  id?: string;
  type?: string;
  event?: string;
  eventType?: string;
  accountId?: string;
  profileId?: string;
  platform?: string;
  account?: {
    id?: string;
    accountId?: string;
    profileId?: string;
    platform?: string;
  };
  conversation?: { id?: string; platform?: string };
  message?: { id?: string; conversationId?: string; platform?: string };
  [key: string]: unknown;
}

export interface ZernioRealtimeEvent {
  id: string;
  type: string;
  platform: string | null;
  conversationId: string | null;
  createdAt: string;
  data?: Record<string, unknown>;
}

function toRealtimeEvent(
  eventId: string,
  eventType: string,
  payload: ZernioWebhookPayload,
  createdAt: Date,
): ZernioRealtimeEvent {
  return {
    id: eventId,
    type: eventType,
    platform:
      payload.message?.platform ??
      payload.conversation?.platform ??
      payload.account?.platform ??
      payload.platform ??
      null,
    conversationId:
      payload.message?.conversationId ?? payload.conversation?.id ?? null,
    createdAt: createdAt.toISOString(),
    data: payload as Record<string, unknown>,
  };
}

class ZernioRequestError extends Error {
  constructor(
    readonly status: number,
    readonly payload: ZernioErrorPayload,
  ) {
    super(payload.error ?? `Zernio request failed with status ${status}`);
  }
}

function requireConfiguration(): void {
  if (!env.ZERNIO_API_KEY) {
    throw new AppError(
      503,
      "ZERNIO_NOT_CONFIGURED",
      "Zernio is not configured on this server",
    );
  }
}

function profileIdOf(account: ZernioAccount): string {
  return typeof account.profileId === "string"
    ? account.profileId
    : (account.profileId._id ?? "");
}

function toUpstreamStatus(status: number): AppError["status"] {
  if (
    [400, 401, 402, 403, 404, 409, 422, 429, 500, 502, 503, 504].includes(
      status,
    )
  ) {
    return status as AppError["status"];
  }
  return status >= 500 ? 502 : 400;
}

async function zernioRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    query?: Record<string, string | number | undefined>;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  requireConfiguration();

  const base = env.ZERNIO_BASE_URL.replace(/\/$/, "");
  const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [name, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${env.ZERNIO_API_KEY}`,
        ...(options.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...options.headers,
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => ({}))) as T &
      ZernioErrorPayload;
    if (!response.ok) throw new ZernioRequestError(response.status, payload);
    return payload;
  } catch (error) {
    if (error instanceof ZernioRequestError) throw error;
    if (controller.signal.aborted) {
      throw new AppError(
        504,
        "ZERNIO_TIMEOUT",
        "Zernio did not respond in time",
      );
    }
    throw new AppError(
      502,
      "ZERNIO_UNAVAILABLE",
      "Zernio is currently unavailable",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function throwMappedZernioError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof ZernioRequestError) {
    throw new AppError(
      toUpstreamStatus(error.status),
      error.payload.code ?? "ZERNIO_REQUEST_FAILED",
      error.payload.error ?? "Zernio could not complete the request",
    );
  }
  throw error;
}

async function ensureProfile(tenant: Tenant) {
  const [existing] = await getDb()
    .select()
    .from(zernioProfiles)
    .where(eq(zernioProfiles.organizationId, tenant.id))
    .limit(1);
  if (existing) return existing;

  const profileName = `Plucia · ${tenant.name} · ${tenant.id.slice(0, 8)}`;
  let externalProfile: ZernioProfileResponse["profile"];
  try {
    const response = await zernioRequest<ZernioProfileResponse>("/profiles", {
      method: "POST",
      headers: { "Idempotency-Key": `plucia-profile-${tenant.id}` },
      body: {
        name: profileName,
        description: "Managed by Plucia",
        color: "#111111",
      },
    });
    externalProfile = response.profile;
  } catch (error) {
    if (
      error instanceof ZernioRequestError &&
      error.status === 409 &&
      error.payload.details?.existingProfileId
    ) {
      externalProfile = {
        _id: error.payload.details.existingProfileId,
        name: profileName,
      };
    } else {
      throwMappedZernioError(error);
    }
  }

  await getDb()
    .insert(zernioProfiles)
    .values({
      organizationId: tenant.id,
      zernioProfileId: externalProfile._id,
      name: externalProfile.name,
    })
    .onConflictDoNothing();

  const [profile] = await getDb()
    .select()
    .from(zernioProfiles)
    .where(eq(zernioProfiles.organizationId, tenant.id))
    .limit(1);
  if (!profile) {
    throw new AppError(
      500,
      "PROFILE_MAPPING_FAILED",
      "Could not save the Zernio profile",
    );
  }
  return profile;
}

async function syncAccounts(tenant: Tenant) {
  const profile = await ensureProfile(tenant);
  let response: AccountsResponse;
  try {
    response = await zernioRequest<AccountsResponse>("/accounts", {
      query: { profileId: profile.zernioProfileId },
    });
  } catch (error) {
    throwMappedZernioError(error);
  }

  const supported = response.accounts.filter(
    (account) =>
      profileIdOf(account) === profile.zernioProfileId &&
      (account.platform === "whatsapp" || account.platform === "linkedin"),
  );
  const now = new Date();

  await getDb()
    .update(zernioAccounts)
    .set({ status: "inactive", lastSyncedAt: now, updatedAt: now })
    .where(
      and(
        eq(zernioAccounts.organizationId, tenant.id),
        or(
          eq(zernioAccounts.platform, "whatsapp"),
          eq(zernioAccounts.platform, "linkedin"),
        ),
      ),
    );

  for (const account of supported) {
    const status = account.needsReconnection
      ? "disconnected"
      : account.isActive && account.enabled !== false
        ? "active"
        : "inactive";
    await getDb()
      .insert(zernioAccounts)
      .values({
        organizationId: tenant.id,
        profileId: profile.id,
        zernioAccountId: account._id,
        platform: account.platform,
        platformAccountId: account.username,
        displayName: account.displayName ?? account.username,
        status,
        metadata: account.metadata ?? {},
        connectedAt: now,
        lastSyncedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: zernioAccounts.zernioAccountId,
        set: {
          organizationId: tenant.id,
          profileId: profile.id,
          platform: account.platform,
          platformAccountId: account.username,
          displayName: account.displayName ?? account.username,
          status,
          metadata: account.metadata ?? {},
          lastSyncedAt: now,
          updatedAt: now,
        },
      });
  }

  return {
    profileId: profile.zernioProfileId,
    accounts: supported.map((account) => ({
      id: account._id,
      platform: account.platform as ZernioPlatform,
      username: account.username ?? null,
      displayName: account.displayName ?? account.username ?? null,
      profilePicture: account.profilePicture ?? null,
      profileUrl: account.profileUrl ?? null,
      status: account.needsReconnection
        ? "disconnected"
        : account.isActive && account.enabled !== false
          ? "active"
          : "inactive",
      needsReconnection: account.needsReconnection ?? false,
      metadata: account.metadata ?? {},
    })),
    capabilities: {
      whatsapp: { connect: true, conversations: true, sendMessages: true },
      linkedin: { connect: true, conversations: false, sendMessages: false },
    },
  };
}

export async function getChannelStatus(tenant: Tenant) {
  return syncAccounts(tenant);
}

const WHATSAPP_WEBHOOK_EVENTS = [
  "message.received",
  "message.sent",
  "conversation.started",
  "message.delivered",
  "message.read",
  "message.failed",
  "message.deleted",
  "reaction.received",
  "account.disconnected",
] as const;

export async function configureZernioWebhook(): Promise<{
  configured: true;
  webhookId: string;
  url: string;
}> {
  if (!env.ZERNIO_WEBHOOK_SECRET || !env.ZERNIO_WEBHOOK_PUBLIC_URL) {
    throw new AppError(
      503,
      "ZERNIO_WEBHOOK_NOT_CONFIGURED",
      "Set ZERNIO_WEBHOOK_SECRET and ZERNIO_WEBHOOK_PUBLIC_URL first",
    );
  }

  let settings: WebhookSettingsResponse;
  try {
    settings =
      await zernioRequest<WebhookSettingsResponse>("/webhooks/settings");
  } catch (error) {
    throwMappedZernioError(error);
  }

  const existing = settings.webhooks.find(
    (webhook) =>
      webhook.url === env.ZERNIO_WEBHOOK_PUBLIC_URL ||
      webhook.name === "Plucia WhatsApp Inbox",
  );
  const body = {
    name: "Plucia WhatsApp Inbox",
    url: env.ZERNIO_WEBHOOK_PUBLIC_URL,
    secret: env.ZERNIO_WEBHOOK_SECRET,
    events: [...WHATSAPP_WEBHOOK_EVENTS],
    isActive: true,
  };

  try {
    const response = existing
      ? await zernioRequest<{ success: boolean; webhook: WebhookSetting }>(
          "/webhooks/settings",
          { method: "PUT", body: { _id: existing._id, ...body } },
        )
      : await zernioRequest<{ success: boolean; webhook: WebhookSetting }>(
          "/webhooks/settings",
          { method: "POST", body },
        );
    return {
      configured: true,
      webhookId: response.webhook._id,
      url: response.webhook.url,
    };
  } catch (error) {
    throwMappedZernioError(error);
  }
}

export async function startConnection(
  tenant: Tenant,
  platform: ZernioPlatform,
): Promise<ConnectResponse> {
  const profile = await ensureProfile(tenant);
  const callbackUrl = new URL(
    env.ZERNIO_CONNECT_REDIRECT_URL ??
      `${env.FRONTEND_ORIGINS[0]}/dashboard/zernio/callback`,
  );
  callbackUrl.searchParams.set("platform", platform);

  try {
    return await zernioRequest<ConnectResponse>(`/connect/${platform}`, {
      query: {
        profileId: profile.zernioProfileId,
        redirect_url: callbackUrl.toString(),
        // Headless keeps the user on Plucia: Zernio returns the short-lived
        // tempToken instead of hosting its own account-selection UI.
        ...(platform === "whatsapp" ? { headless: "true" } : {}),
      },
      headers: { "X-Request-Id": randomUUID() },
    });
  } catch (error) {
    throwMappedZernioError(error);
  }
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

interface WhatsAppPhoneNumbersResponse {
  phoneNumbers: WhatsAppPhoneNumber[];
}

/**
 * List the WhatsApp phone numbers available across the user's WABAs after the
 * headless Embedded Signup redirect. Only reached when the callback carries
 * `step=select_phone_number` (a WABA with 2+ numbers). Single-number WABAs
 * auto-complete and never need this call.
 */
export async function listWhatsAppPhoneNumbers(
  tenant: Tenant,
  tempToken: string,
): Promise<WhatsAppPhoneNumber[]> {
  const profile = await ensureProfile(tenant);
  try {
    const response = await zernioRequest<WhatsAppPhoneNumbersResponse>(
      "/connect/whatsapp/select-phone-number",
      {
        query: {
          profileId: profile.zernioProfileId,
          tempToken,
        },
      },
    );
    return response.phoneNumbers;
  } catch (error) {
    throwMappedZernioError(error);
  }
}

export interface SelectWhatsAppPhoneNumberInput {
  tempToken: string;
  phoneNumberId: string;
  wabaId: string;
}

/**
 * Bind a specific WhatsApp phone number after the user picks one. Exchanges
 * the short-lived token for a long-lived one, subscribes the WABA to webhooks,
 * and creates the Zernio SocialAccount, then syncs the local tenant mapping.
 */
export async function selectWhatsAppPhoneNumber(
  tenant: Tenant,
  input: SelectWhatsAppPhoneNumberInput,
): Promise<WhatsAppConnectResponse> {
  const profile = await ensureProfile(tenant);
  let response: WhatsAppConnectResponse;
  try {
    response = await zernioRequest<WhatsAppConnectResponse>(
      "/connect/whatsapp/select-phone-number",
      {
        method: "POST",
        headers: { "X-Request-Id": randomUUID() },
        body: {
          profileId: profile.zernioProfileId,
          tempToken: input.tempToken,
          phoneNumberId: input.phoneNumberId,
          wabaId: input.wabaId,
        },
      },
    );
  } catch (error) {
    throwMappedZernioError(error);
  }

  await syncAccounts(tenant);
  return response;
}

export async function connectWhatsAppCredentials(
  tenant: Tenant,
  input: WhatsAppCredentialsInput,
): Promise<WhatsAppConnectResponse> {
  const profile = await ensureProfile(tenant);
  let response: WhatsAppConnectResponse;
  try {
    response = await zernioRequest<WhatsAppConnectResponse>(
      "/connect/whatsapp/credentials",
      {
        method: "POST",
        headers: { "X-Request-Id": randomUUID() },
        body: {
          profileId: profile.zernioProfileId,
          accessToken: input.accessToken,
          wabaId: input.wabaId,
          phoneNumberId: input.phoneNumberId,
          ...(input.pin ? { pin: input.pin } : {}),
        },
      },
    );
  } catch (error) {
    throwMappedZernioError(error);
  }

  await syncAccounts(tenant);
  return response;
}

export async function disconnectAccount(
  tenant: Tenant,
  platform: ZernioPlatform,
  accountId: string,
): Promise<DisconnectAccountResponse> {
  await syncAccounts(tenant);
  const [account] = await getDb()
    .select()
    .from(zernioAccounts)
    .where(
      and(
        eq(zernioAccounts.organizationId, tenant.id),
        eq(zernioAccounts.zernioAccountId, accountId),
        eq(zernioAccounts.platform, platform),
      ),
    )
    .limit(1);
  if (!account) {
    throw new AppError(
      403,
      "CHANNEL_ACCOUNT_DENIED",
      "Channel account access denied",
    );
  }

  let response: DisconnectAccountResponse = { message: "Account disconnected" };
  try {
    response = await zernioRequest<DisconnectAccountResponse>(
      `/accounts/${encodeURIComponent(accountId)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    // Missing upstream means the desired state is already reached. This is
    // still safe because ownership was established from the local mapping.
    if (!(error instanceof ZernioRequestError && error.status === 404)) {
      throwMappedZernioError(error);
    }
  }

  await getDb()
    .delete(zernioAccounts)
    .where(
      and(
        eq(zernioAccounts.organizationId, tenant.id),
        eq(zernioAccounts.zernioAccountId, accountId),
        eq(zernioAccounts.platform, platform),
      ),
    );
  return response;
}

async function requireOwnedAccount(
  tenant: Tenant,
  accountId: string,
  platform: ZernioPlatform = "whatsapp",
) {
  await syncAccounts(tenant);
  const [account] = await getDb()
    .select()
    .from(zernioAccounts)
    .where(
      and(
        eq(zernioAccounts.organizationId, tenant.id),
        eq(zernioAccounts.zernioAccountId, accountId),
        eq(zernioAccounts.platform, platform),
      ),
    )
    .limit(1);
  if (!account || account.status !== "active") {
    throw new AppError(
      403,
      "CHANNEL_ACCOUNT_DENIED",
      "Channel account access denied",
    );
  }
  return account;
}

export async function listWhatsAppTemplates(
  tenant: Tenant,
  accountId: string,
): Promise<WhatsAppTemplate[]> {
  await requireOwnedAccount(tenant, accountId);
  try {
    const response = await zernioRequest<WhatsAppTemplatesResponse>(
      "/whatsapp/templates",
      { query: { accountId } },
    );
    return response.templates.filter(
      (template) => template.status === "APPROVED",
    );
  } catch (error) {
    throwMappedZernioError(error);
  }
}

export async function createWhatsAppConversation(
  tenant: Tenant,
  input: {
    accountId: string;
    participantId: string;
    templateName: string;
    templateLanguage: string;
    templateParams: string[];
  },
): Promise<SendMessageResponse> {
  await requireOwnedAccount(tenant, input.accountId);
  try {
    return await zernioRequest<SendMessageResponse>("/inbox/conversations", {
      method: "POST",
      headers: { "X-Request-Id": randomUUID() },
      body: {
        accountId: input.accountId,
        participantId: input.participantId.replace(/^\+/, ""),
        templateName: input.templateName,
        templateLanguage: input.templateLanguage,
        templateParams: input.templateParams,
      },
    });
  } catch (error) {
    throwMappedZernioError(error);
  }
}

export async function listWhatsAppConversations(
  tenant: Tenant,
  options: { cursor?: string; limit: number },
): Promise<ConversationsResponse> {
  const status = await syncAccounts(tenant);
  const account = status.accounts.find(
    (candidate) =>
      candidate.platform === "whatsapp" && candidate.status === "active",
  );
  if (!account) {
    throw new AppError(409, "WHATSAPP_NOT_CONNECTED", "Connect WhatsApp first");
  }

  try {
    return await zernioRequest<ConversationsResponse>("/inbox/conversations", {
      query: {
        profileId: status.profileId,
        platform: "whatsapp",
        limit: options.limit,
        cursor: options.cursor,
        sortOrder: "desc",
      },
    });
  } catch (error) {
    throwMappedZernioError(error);
  }
}

export async function markWhatsAppConversationRead(
  tenant: Tenant,
  conversationId: string,
  accountId: string,
): Promise<{ success: boolean }> {
  await verifyConversation(tenant, conversationId, accountId);
  try {
    return await zernioRequest<{ success: boolean }>(
      `/inbox/conversations/${encodeURIComponent(conversationId)}/read`,
      { method: "POST", body: { accountId } },
    );
  } catch (error) {
    throwMappedZernioError(error);
  }
}

async function verifyConversation(
  tenant: Tenant,
  conversationId: string,
  accountId: string,
): Promise<ConversationRecord> {
  await requireOwnedAccount(tenant, accountId);
  try {
    const response = await zernioRequest<ConversationDetailResponse>(
      `/inbox/conversations/${encodeURIComponent(conversationId)}`,
      { query: { accountId } },
    );
    if (
      response.data.accountId !== accountId ||
      response.data.platform !== "whatsapp"
    ) {
      throw new AppError(
        403,
        "CONVERSATION_ACCESS_DENIED",
        "Conversation access denied",
      );
    }
    return response.data;
  } catch (error) {
    throwMappedZernioError(error);
  }
}

export async function listConversationMessages(
  tenant: Tenant,
  conversationId: string,
  accountId: string,
): Promise<{ conversation: ConversationRecord; messages: MessagesResponse }> {
  const conversation = await verifyConversation(
    tenant,
    conversationId,
    accountId,
  );
  try {
    const messages = await zernioRequest<MessagesResponse>(
      `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
      { query: { accountId, limit: 100, sortOrder: "asc" } },
    );
    return { conversation, messages };
  } catch (error) {
    throwMappedZernioError(error);
  }
}

export async function sendConversationMessage(
  tenant: Tenant,
  conversationId: string,
  accountId: string,
  message: string,
): Promise<SendMessageResponse> {
  await verifyConversation(tenant, conversationId, accountId);
  try {
    return await zernioRequest<SendMessageResponse>(
      `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: "POST",
        body: { accountId, message },
        headers: { "X-Request-Id": randomUUID() },
      },
    );
  } catch (error) {
    throwMappedZernioError(error);
  }
}

/** Verify Zernio's signature against the exact bytes received over HTTP. */
export function verifyZernioWebhookSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  if (!env.ZERNIO_WEBHOOK_SECRET || !signature) return false;
  const expected = createHmac("sha256", env.ZERNIO_WEBHOOK_SECRET)
    .update(rawBody, "utf8")
    .digest();
  const received = Buffer.from(signature.trim(), "hex");
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

/** Persist a webhook before acknowledging it. The unique event ID makes retries idempotent. */
export async function ingestZernioWebhook(
  payload: ZernioWebhookPayload,
  eventId: string,
): Promise<{ duplicate: boolean }> {
  const accountId =
    payload.accountId ?? payload.account?.accountId ?? payload.account?.id;
  const profileId = payload.profileId ?? payload.account?.profileId;
  let organizationId: string | null = null;
  if (accountId) {
    const [account] = await getDb()
      .select({ organizationId: zernioAccounts.organizationId })
      .from(zernioAccounts)
      .where(eq(zernioAccounts.zernioAccountId, accountId))
      .limit(1);
    organizationId = account?.organizationId ?? null;
  }
  if (!organizationId && profileId) {
    const [profile] = await getDb()
      .select({ organizationId: zernioProfiles.organizationId })
      .from(zernioProfiles)
      .where(eq(zernioProfiles.zernioProfileId, profileId))
      .limit(1);
    organizationId = profile?.organizationId ?? null;
  }

  const eventType =
    payload.type ?? payload.eventType ?? payload.event ?? "unknown";

  const processedAt = new Date();

  const inserted = await getDb()
    .insert(zernioWebhooks)
    .values({
      eventId,
      eventType,
      organizationId,
      payload,
      processed: true,
      processedAt,
    })
    .onConflictDoNothing({ target: zernioWebhooks.eventId })
    .returning({ id: zernioWebhooks.id });

  if (inserted.length > 0) {
    console.info(
      JSON.stringify({
        level: "info",
        event: "zernio.webhook.received",
        eventId,
        eventType,
        organizationId: organizationId ?? null,
      }),
    );
  }

  if (inserted.length > 0 && organizationId) {
    const processedEvent: ProcessedEvent = {
      id: eventId,
      type: eventType,
      tenant: { id: organizationId, name: "" },
      payload,
      timestamp: processedAt.toISOString(),
    };
    void handleWebhookEvent(processedEvent).catch((error) => {
      console.error(`Failed to process webhook event ${eventId}:`, error);
    });
  }

  if (
    inserted.length > 0 &&
    eventType === "account.disconnected" &&
    organizationId &&
    accountId
  ) {
    await getDb()
      .update(zernioAccounts)
      .set({ status: "disconnected", updatedAt: new Date() })
      .where(
        and(
          eq(zernioAccounts.organizationId, organizationId),
          eq(zernioAccounts.zernioAccountId, accountId),
        ),
      );
  }

  return { duplicate: inserted.length === 0 };
}

export async function listZernioWebhookEvents(
  tenant: Tenant,
  after?: Date,
): Promise<{
  cursor: string;
  events: ZernioRealtimeEvent[];
}> {
  if (!after) return { cursor: new Date().toISOString(), events: [] };

  const rows = await getDb()
    .select({
      eventId: zernioWebhooks.eventId,
      eventType: zernioWebhooks.eventType,
      payload: zernioWebhooks.payload,
      createdAt: zernioWebhooks.createdAt,
    })
    .from(zernioWebhooks)
    .where(
      and(
        eq(zernioWebhooks.organizationId, tenant.id),
        gt(zernioWebhooks.createdAt, after),
      ),
    )
    .orderBy(asc(zernioWebhooks.createdAt))
    .limit(100);

  const events = rows.map((row) =>
    toRealtimeEvent(
      row.eventId,
      row.eventType,
      row.payload as ZernioWebhookPayload,
      row.createdAt,
    ),
  );
  return {
    cursor: events.at(-1)?.createdAt ?? after.toISOString(),
    events,
  };
}
