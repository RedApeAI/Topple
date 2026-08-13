import type { AppBindings } from "../types.js";
import { env } from "../lib/env.js";
import { AppError } from "../lib/errors.js";
import {
  assertActiveMessagingAccount,
  canUseAccount,
  isOrganizationManager,
  type MessagingAuthContext,
} from "./authorization.js";
import { capabilityErrorMessage, supportsCapability } from "./capabilities.js";
import {
  assertMessageContent,
  redactProviderPayload,
  safeFilename,
} from "./content.js";
import {
  createHostedState,
  isSafeReturnPath,
  sha256Hex,
  verifyHostedState,
} from "./crypto.js";
import type {
  MessagingConnectChannel,
  NormalizedAccount,
  NormalizedMessage,
  NormalizedThread,
  UnipileWebhookEnvelope,
} from "./contracts.js";
import {
  messagingConnectChannels,
  providerForConnectChannel,
} from "./contracts.js";
import { enqueueMessagingJob } from "./jobs.js";
import {
  consumeConnectionState,
  countMessagingThreadsForAccount,
  createConnectionState,
  createInboundEvent,
  createMessagingAuditEvent,
  createOutboxEvent,
  findMessagingAccount,
  findMessagingAccountByUnipileId,
  findPendingConnectionState,
  findMessagingThread,
  findThreadByExternalId,
  findContactIdentifier,
  findMessageByExternalId,
  getInboundEvent,
  claimInboundEvent,
  getAttachmentWithMessage,
  getAttachmentForCreator,
  getMessageInOrganization,
  getThreadWithRelated,
  insertAttachment,
  insertInboundAttachment,
  insertOrUpdateInboundMessage,
  insertOrUpdateMessagingAccount,
  insertPendingOutboundMessage,
  listThreadMessages,
  listMessageAttachments,
  setThreadReadState,
  setThreadState,
  updateInboundEvent,
  updateAttachment,
  updateMessage,
  updateMessagingAccount,
  updateThreadExternalId,
  updateThreadForMessage,
  associateThreadToContact,
  attachAttachmentsToMessage,
  upsertContactIdentifier,
  upsertParticipant,
  upsertThread,
} from "./repository.js";
import {
  normalizeAccount,
  normalizeMessage,
  normalizeMessageReaction,
  normalizeThread,
  participantFromMessage,
  threadIdFromProviderPayload,
} from "./normalizer.js";
import { createUnipileClient, UnipileProviderError } from "./unipile-client.js";
import { validateUnipilePage } from "./unipile-schemas.js";
import { participantIdentifiers } from "./identity.js";

const EMAIL_PROVIDERS = new Set(["google", "outlook", "imap"]);
const LINKEDIN_PRIMARY_INBOXES = {
  classic: "CLASSIC_PRIMARY",
  sales_navigator: "SALES_NAVIGATOR_PRIMARY",
  recruiter: "RECRUITER_PRIMARY",
} as const;
type LinkedinProduct = keyof typeof LINKEDIN_PRIMARY_INBOXES;
type MessagingAccountRow =
  typeof import("@repo/db-sql").messagingConnectedAccounts.$inferSelect;
type MessagingThreadWithRelated = NonNullable<
  Awaited<ReturnType<typeof getThreadWithRelated>>
>;
type MessagingDeliveryClient = Pick<
  ReturnType<typeof createUnipileClient>,
  "getChat" | "sendChatMessage" | "startChat"
>;

const RECOVERABLE_ACCOUNT_STATUSES = new Set([
  "failed",
  "expired",
  "revoked",
  // A local development process can stop while a history backfill is running.
  // Provider health is authoritative on the next poll/send, so do not leave
  // an otherwise running account permanently stuck in the syncing state.
  "syncing",
]);

function stateSecret(): string {
  // Better Auth already requires a high-entropy secret. Deriving the state
  // signing key avoids introducing a second secret while keeping the state
  // purpose-separated from session signing.
  return `${env.BETTER_AUTH_SECRET}:messaging-hosted-auth`;
}

function configValue(
  bindings: AppBindings | undefined,
  key: "callback" | "webhookSecret",
): string | undefined {
  if (key === "callback")
    return bindings?.MESSAGING_CALLBACK_URL ?? env.MESSAGING_CALLBACK_URL;
  return bindings?.UNIPILE_WEBHOOK_SECRET ?? env.UNIPILE_WEBHOOK_SECRET;
}

function providerError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof UnipileProviderError) {
    if (error.status === 401 || error.status === 403)
      return new AppError(
        502,
        "PROVIDER_AUTHENTICATION_FAILED",
        "The messaging provider rejected the connected account",
      );
    if (error.status === 404)
      return new AppError(
        404,
        "PROVIDER_RESOURCE_NOT_FOUND",
        "The messaging provider resource was not found",
      );
    if (error.status === 429)
      return new AppError(
        429,
        "PROVIDER_RATE_LIMIT",
        "The messaging provider rate limit was reached",
      );
    if (error.status >= 500 || error.status === 504)
      return new AppError(
        502,
        "PROVIDER_TEMPORARY_FAILURE",
        "The messaging provider is temporarily unavailable",
      );
    return new AppError(
      502,
      "PROVIDER_REQUEST_FAILED",
      "The messaging provider rejected the request",
    );
  }
  return new AppError(
    502,
    "PROVIDER_REQUEST_FAILED",
    "The messaging provider request failed",
  );
}

function hostedAuthProviderError(error: unknown): AppError {
  if (
    error instanceof UnipileProviderError &&
    error.status === 401 &&
    error.providerCode === "api/invalid_credentials"
  ) {
    return new AppError(
      503,
      "UNIPILE_CREDENTIALS_INVALID",
      "Messaging connections are unavailable because the configured Unipile v2 API key is invalid. Update UNIPILE_API_KEY in apps/api/.env and restart the API.",
    );
  }
  return providerError(error);
}

function assertNonEmailProvider(provider: string): void {
  if (EMAIL_PROVIDERS.has(provider)) {
    throw new AppError(
      409,
      "EMAIL_INTEGRATION_OWNED_BY_MAIL",
      "Email messaging uses Plucia's existing mail integration",
    );
  }
}

function inferLinkedinProduct(
  providerAccountType: string | null,
  providerMetadata: Record<string, unknown> = {},
): LinkedinProduct {
  const normalized = providerAccountType?.toLowerCase() ?? "";
  if (normalized.includes("recruiter")) return "recruiter";
  if (normalized.includes("sales")) return "sales_navigator";
  const metadata = providerRecord(providerMetadata.metadata);
  const productStatuses = providerRecord(metadata.products_connection_status);
  const activeProduct = Object.entries(productStatuses).find(([, status]) =>
    ["running", "connected", "ready"].includes(String(status)),
  )?.[0];
  if (activeProduct?.includes("recruiter")) return "recruiter";
  if (activeProduct?.includes("sales")) return "sales_navigator";
  return "classic";
}

function providerRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

async function resolveLinkedinSyncInbox(input: {
  account: typeof import("@repo/db-sql").messagingConnectedAccounts.$inferSelect;
  bindings?: AppBindings;
}): Promise<string> {
  const page = normalizePageItems(
    await createUnipileClient(input.bindings).listInboxes({
      accountId: input.account.unipileAccountId,
    }),
  );
  const product = inferLinkedinProduct(
    input.account.providerAccountType,
    input.account.providerMetadata,
  );
  const preferredId = LINKEDIN_PRIMARY_INBOXES[product];
  const inboxes = page.items.map(providerRecord);
  const preferred = inboxes.find(
    (inbox) => inbox.id === preferredId && inbox.disabled !== true,
  );
  if (typeof preferred?.id === "string") return preferred.id;
  const fallback = inboxes.find(
    (inbox) => typeof inbox.id === "string" && inbox.disabled !== true,
  );
  if (typeof fallback?.id === "string") return fallback.id;
  throw new AppError(
    502,
    "LINKEDIN_INBOX_UNAVAILABLE",
    "The connected LinkedIn account does not expose an available messaging inbox",
  );
}

async function resolveLinkedinStartOptions(input: {
  account: typeof import("@repo/db-sql").messagingConnectedAccounts.$inferSelect;
  bindings?: AppBindings;
  linkedinProduct?: LinkedinProduct;
  inmail?: boolean;
  inmailSubject?: string | null;
  inmailSignature?: string | null;
}) {
  const hasLinkedinOptions =
    input.linkedinProduct ||
    input.inmail ||
    input.inmailSubject ||
    input.inmailSignature;
  if (input.account.provider !== "linkedin" && hasLinkedinOptions)
    throw new AppError(
      422,
      "LINKEDIN_PRODUCT_REQUIRES_LINKEDIN",
      "LinkedIn product options can only be used with a LinkedIn account",
    );
  if (input.account.provider !== "linkedin") return {};

  const product =
    input.linkedinProduct ??
    inferLinkedinProduct(
      input.account.providerAccountType,
      input.account.providerMetadata,
    );
  if (
    (product === "sales_navigator" || product === "recruiter") &&
    !input.inmailSubject?.trim()
  )
    throw new AppError(
      422,
      "INMAIL_SUBJECT_REQUIRED",
      "Sales Navigator and Recruiter starts require an InMail subject",
    );
  if (product === "recruiter" && !input.inmailSignature?.trim())
    throw new AppError(
      422,
      "INMAIL_SIGNATURE_REQUIRED",
      "Recruiter starts require an InMail signature",
    );

  // LinkedIn uses product-specific inboxes for both history and new chats.
  // The v2 account-wide Start a Chat endpoint is not implemented for this
  // provider, including Classic.
  const page = normalizePageItems(
    await createUnipileClient(input.bindings).listInboxes({
      accountId: input.account.unipileAccountId,
    }),
  );
  const expectedInbox = LINKEDIN_PRIMARY_INBOXES[product];
  const inboxId = page.items
    .map(providerRecord)
    .find((inbox) => inbox.id === expectedInbox && inbox.disabled !== true)
    ?.id as string | undefined;
  if (!inboxId)
    throw new AppError(
      422,
      "LINKEDIN_PRODUCT_UNAVAILABLE",
      `The connected account does not provide the ${product === "classic" ? "Classic" : product === "sales_navigator" ? "Sales Navigator" : "Recruiter"} inbox`,
    );

  const specifics =
    product === "sales_navigator" && input.inmailSubject
      ? { linkedin: { sales_navigator: { subject: input.inmailSubject } } }
      : product === "recruiter" && input.inmailSubject && input.inmailSignature
        ? {
            linkedin: {
              recruiter: {
                subject: input.inmailSubject,
                signature: input.inmailSignature,
              },
            },
          }
        : input.inmail
          ? { linkedin: { classic: { inmail: true } } }
          : undefined;
  return { inboxId, specifics };
}

function safeMetadata(value: Record<string, unknown>): Record<string, unknown> {
  return redactProviderPayload(value) as Record<string, unknown>;
}

function safeThread(normalized: NormalizedThread): NormalizedThread {
  return {
    ...normalized,
    providerMetadata: safeMetadata(normalized.providerMetadata),
    participants: normalized.participants.map((participant) => ({
      ...participant,
      providerMetadata: safeMetadata(participant.providerMetadata),
    })),
  };
}

function safeMessage(normalized: NormalizedMessage): NormalizedMessage {
  return {
    ...normalized,
    providerMetadata: safeMetadata(normalized.providerMetadata),
  };
}

async function persistParticipantIdentities(input: {
  organizationId: string;
  threadId: string;
  provider: import("./contracts.js").MessagingProvider;
  participant: import("./contracts.js").NormalizedParticipant;
}) {
  for (const identifier of participantIdentifiers(
    input.provider,
    input.participant,
  )) {
    const existing = await findContactIdentifier({
      organizationId: input.organizationId,
      provider: identifier.provider,
      identifierType: identifier.identifierType,
      normalizedValue: identifier.normalizedValue,
    });
    await upsertContactIdentifier({
      organizationId: input.organizationId,
      provider: identifier.provider,
      identifierType: identifier.identifierType,
      normalizedValue: identifier.normalizedValue,
      providerParticipantId: input.participant.providerParticipantId,
      displayName: input.participant.normalizedName,
      profileUrl: input.participant.profileUrl,
    });
    // A provider identity is only allowed to associate after an explicit CRM
    // confirmation. An inferred email/phone collision remains reviewable.
    if (
      existing?.matchStatus === "confirmed" &&
      (existing.contactId || existing.leadId)
    ) {
      await associateThreadToContact({
        organizationId: input.organizationId,
        threadId: input.threadId,
        contactId: existing.contactId,
        leadId: existing.leadId,
      });
      break;
    }
  }
}

async function persistProviderThread(input: {
  organizationId: string;
  account: MessagingAccountRow;
  raw: unknown;
}) {
  const normalized = safeThread(
    normalizeThread(input.raw, input.account.provider),
  );
  const thread = await upsertThread(
    input.organizationId,
    input.account.id,
    input.account.provider,
    normalized,
  );
  for (const participant of normalized.participants) {
    await upsertParticipant(
      input.organizationId,
      thread.id,
      input.account.provider,
      participant,
    );
    await persistParticipantIdentities({
      organizationId: input.organizationId,
      threadId: thread.id,
      provider: input.account.provider,
      participant,
    });
  }
  return { normalized, thread };
}

function bytesToBase64(bytes: Uint8Array): string {
  let output = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    output += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)),
    );
  }
  return btoa(output);
}

async function providerAttachments(input: {
  auth: MessagingAuthContext;
  organizationId: string;
  threadId: string;
  attachmentIds: string[] | undefined;
  bindings?: AppBindings;
}) {
  if (!input.attachmentIds?.length) return undefined;
  const bucket = input.bindings?.MESSAGING_ATTACHMENTS_BUCKET;
  if (!bucket)
    throw new AppError(
      503,
      "ATTACHMENT_STORAGE_NOT_CONFIGURED",
      "Attachment storage is not configured",
    );
  const result: Array<Record<string, unknown>> = [];
  for (const attachmentId of input.attachmentIds) {
    const joined = await authorizedMessagingAttachment(
      input.auth,
      attachmentId,
    );
    const attachment = joined.attachment;
    if (
      (attachment.threadId && attachment.threadId !== input.threadId) ||
      (joined.message && joined.message.threadId !== input.threadId)
    )
      throw new AppError(
        403,
        "ATTACHMENT_FORBIDDEN",
        "Attachment does not belong to this thread",
      );
    if (!attachment.storageKey || attachment.downloadStatus !== "uploaded")
      throw new AppError(
        409,
        "ATTACHMENT_NOT_READY",
        "Attachment upload is not complete",
      );
    const object = await bucket.get(attachment.storageKey);
    if (!object)
      throw new AppError(
        404,
        "ATTACHMENT_CONTENT_NOT_FOUND",
        "Attachment content is not available",
      );
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.byteLength > env.MESSAGING_MAX_ATTACHMENT_BYTES)
      throw new AppError(
        413,
        "ATTACHMENT_TOO_LARGE",
        "Attachment exceeds the configured size limit",
      );
    result.push({
      filename: attachment.filename,
      content_type: attachment.mimeType,
      // Unipile Messaging API v2 expects base64 file content in `content`.
      content: bytesToBase64(bytes),
    });
  }
  return result;
}

async function authorizedMessagingAttachment(
  auth: MessagingAuthContext,
  attachmentId: string,
) {
  const joined = await getAttachmentWithMessage(
    auth.organizationId,
    attachmentId,
  );
  if (!joined)
    throw new AppError(404, "ATTACHMENT_NOT_FOUND", "Attachment not found");
  const threadId =
    joined.attachment.threadId ?? joined.message?.threadId ?? joined.thread?.id;
  if (!threadId) {
    const owned = await getAttachmentForCreator(
      auth.organizationId,
      auth.userId,
      attachmentId,
    );
    if (!owned)
      throw new AppError(404, "ATTACHMENT_NOT_FOUND", "Attachment not found");
    return { ...joined, attachment: owned, thread: null, account: null };
  }
  const visibleThread = await getThreadWithRelated(auth, threadId);
  if (!visibleThread)
    throw new AppError(404, "ATTACHMENT_NOT_FOUND", "Attachment not found");
  return {
    ...joined,
    thread: visibleThread.thread,
    account: visibleThread.account,
  };
}

type ProviderPagePosition = { cursor?: string; offset?: number };

function normalizePageItems(
  value: unknown,
  pagination?: { position: ProviderPagePosition; limit: number },
): {
  items: unknown[];
  nextCursor: string | null;
  nextOffset: number | null;
} {
  const page = validateUnipilePage(value);
  const raw = providerRecord(value);
  const items = page.data.length > 0 ? page.data : (page.items ?? []);
  const usesCursor =
    Object.hasOwn(raw, "next_cursor") || Object.hasOwn(raw, "cursor");
  const nextCursor = page.next_cursor ?? page.cursor ?? null;
  const hasAnotherOffsetPage =
    pagination &&
    !usesCursor &&
    items.length > 0 &&
    (page.has_more === true || items.length >= pagination.limit);
  return {
    items,
    nextCursor,
    nextOffset: hasAnotherOffsetPage
      ? (pagination.position.offset ?? 0) + items.length
      : null,
  };
}

function parseBackfillPosition(value: string | null): ProviderPagePosition {
  if (!value) return {};
  if (value.startsWith("offset:")) {
    const offset = Number(value.slice("offset:".length));
    return Number.isSafeInteger(offset) && offset >= 0 ? { offset } : {};
  }
  if (value.startsWith("cursor:"))
    return { cursor: value.slice("cursor:".length) };
  // Compatibility with cursor values persisted before positions were tagged.
  return { cursor: value };
}

function nextPagePosition(page: {
  nextCursor: string | null;
  nextOffset: number | null;
}): ProviderPagePosition | null {
  if (page.nextCursor) return { cursor: page.nextCursor };
  if (page.nextOffset !== null) return { offset: page.nextOffset };
  return null;
}

function serializeBackfillPosition(
  position: ProviderPagePosition | null,
): string | null {
  if (position?.cursor) return `cursor:${position.cursor}`;
  if (position?.offset !== undefined) return `offset:${position.offset}`;
  return null;
}

export async function createMessagingConnectionLink(input: {
  auth: MessagingAuthContext;
  bindings?: AppBindings;
  channel: MessagingConnectChannel;
  requestOrigin: string;
  returnPath: string;
}) {
  if (EMAIL_PROVIDERS.has(providerForConnectChannel(input.channel))) {
    throw new AppError(
      409,
      "EMAIL_INTEGRATION_OWNED_BY_MAIL",
      "Email messaging uses Plucia's existing mail integration",
    );
  }
  if (!isSafeReturnPath(input.returnPath)) {
    throw new AppError(
      400,
      "INVALID_RETURN_PATH",
      "Return path must be a local application path",
    );
  }
  const state = await createHostedState(
    {
      organizationId: input.auth.organizationId,
      userId: input.auth.userId,
      channel: input.channel,
      returnPath: input.returnPath,
    },
    stateSecret(),
  );
  await createConnectionState({
    nonceHash: state.nonceHash,
    organizationId: input.auth.organizationId,
    userId: input.auth.userId,
    requestedChannel: input.channel,
    returnPath: input.returnPath,
    expiresAt: new Date(state.payload.expiresAt),
  });
  const callbackUrl =
    configValue(input.bindings, "callback") ??
    `${input.requestOrigin.replace(/\/$/, "")}/api/v1/messaging/accounts/connect/callback`;
  const client = createUnipileClient(input.bindings);
  const config = {
    ...(input.channel === "linkedin_sales_navigator"
      ? { linkedin: { products: ["classic", "sales_navigator"] } }
      : input.channel === "linkedin_recruiter"
        ? { linkedin: { products: ["classic", "recruiter"] } }
        : {}),
    // WhatsApp history is decentralized. Ask Hosted Auth to wait for
    // Unipile's mandatory initial sync before returning to this callback, so
    // Plucia can backfill the complete conversation history immediately.
    ...(input.channel === "whatsapp"
      ? { global: { wait_initial_sync: true } }
      : {}),
  };
  try {
    return await client.createAuthLink({
      providers: providerForConnectChannel(input.channel),
      redirectUri: callbackUrl,
      expiresOn: new Date(state.payload.expiresAt).toISOString(),
      state: state.state,
      ...(Object.keys(config).length > 0 ? { config } : {}),
    });
  } catch (error) {
    if (error instanceof UnipileProviderError) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "messaging.hosted_auth_failed",
          providerStatus: error.status,
          providerCode: error.providerCode ?? "unknown",
          correlationId: error.correlationId ?? "unknown",
        }),
      );
    }
    throw hostedAuthProviderError(error);
  }
}

const BLOCKED_ATTACHMENT_TYPES = new Set([
  "application/x-dosexec",
  "application/x-executable",
  "application/x-sh",
  "application/x-shellscript",
  "text/html",
  "image/svg+xml",
]);

function assertAttachmentMetadata(input: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const filename = safeFilename(input.filename);
  const mimeType = input.mimeType.trim().toLowerCase().slice(0, 120);
  if (!mimeType || BLOCKED_ATTACHMENT_TYPES.has(mimeType))
    throw new AppError(
      422,
      "ATTACHMENT_TYPE_NOT_ALLOWED",
      "This attachment type is not allowed",
    );
  if (
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes < 1 ||
    input.sizeBytes > env.MESSAGING_MAX_ATTACHMENT_BYTES
  )
    throw new AppError(
      413,
      "ATTACHMENT_TOO_LARGE",
      "Attachment exceeds the configured size limit",
    );
  return { filename, mimeType };
}

export async function presignMessagingAttachment(input: {
  auth: MessagingAuthContext;
  threadId?: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}) {
  if (input.sizeBytes > env.MESSAGING_MAX_ATTACHMENT_BYTES)
    throw new AppError(
      413,
      "ATTACHMENT_TOO_LARGE",
      "Attachment exceeds the configured size limit",
    );
  const metadata = assertAttachmentMetadata(input);
  const id = crypto.randomUUID();
  const uploadToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const storageKey = `messaging/${input.auth.organizationId}/${id}/${metadata.filename}`;
  const attachment = await insertAttachment({
    id,
    organizationId: input.auth.organizationId,
    createdByUserId: input.auth.userId,
    messageId: null,
    threadId: input.threadId ?? null,
    providerAttachmentId: null,
    filename: metadata.filename,
    mimeType: metadata.mimeType,
    sizeBytes: input.sizeBytes,
    storageKey,
    uploadTokenHash: await sha256Hex(uploadToken),
    uploadExpiresAt: expiresAt,
    downloadStatus: "pending",
    safeDisplayMetadata: {
      filename: metadata.filename,
      mimeType: metadata.mimeType,
      sizeBytes: input.sizeBytes,
    },
  });
  if (!attachment)
    throw new AppError(
      500,
      "ATTACHMENT_PERSIST_FAILED",
      "Attachment could not be created",
    );
  return {
    attachment,
    uploadToken,
    uploadUrl: `/api/v1/messaging/attachments/${attachment.id}/upload`,
    expiresAt,
  };
}

export async function uploadMessagingAttachment(input: {
  auth: MessagingAuthContext;
  bindings?: AppBindings;
  attachmentId: string;
  uploadToken: string;
  body: ArrayBuffer;
  contentType?: string | null;
}) {
  const { attachment } = await authorizedMessagingAttachment(
    input.auth,
    input.attachmentId,
  );
  if (
    !attachment.uploadTokenHash ||
    !attachment.uploadExpiresAt ||
    attachment.uploadExpiresAt.getTime() <= Date.now() ||
    (await sha256Hex(input.uploadToken)) !== attachment.uploadTokenHash
  )
    throw new AppError(
      403,
      "ATTACHMENT_UPLOAD_TOKEN_INVALID",
      "Attachment upload token is invalid or expired",
    );
  if (input.body.byteLength !== attachment.sizeBytes)
    throw new AppError(
      422,
      "ATTACHMENT_SIZE_MISMATCH",
      "Uploaded attachment size does not match the declared size",
    );
  const bucket = input.bindings?.MESSAGING_ATTACHMENTS_BUCKET;
  if (!bucket || !attachment.storageKey)
    throw new AppError(
      503,
      "ATTACHMENT_STORAGE_NOT_CONFIGURED",
      "Attachment storage is not configured",
    );
  await bucket.put(attachment.storageKey, input.body, {
    httpMetadata: {
      contentType:
        attachment.mimeType || input.contentType || "application/octet-stream",
    },
  });
  const updated = await updateAttachment(
    input.auth.organizationId,
    attachment.id,
    { downloadStatus: "uploaded", uploadTokenHash: null },
  );
  await createOutboxEvent({
    organizationId: input.auth.organizationId,
    eventType: "attachment.updated",
    aggregateType: "attachment",
    aggregateId: attachment.id,
    payload: {
      attachmentId: attachment.id,
      threadId: attachment.threadId,
      status: "uploaded",
    },
  });
  return updated ?? attachment;
}

export async function completeMessagingAttachment(input: {
  auth: MessagingAuthContext;
  attachmentId: string;
  messageId?: string | null;
  threadId?: string | null;
}) {
  const { attachment, thread } = await authorizedMessagingAttachment(
    input.auth,
    input.attachmentId,
  );
  if (input.threadId && attachment.threadId !== input.threadId)
    throw new AppError(
      403,
      "ATTACHMENT_FORBIDDEN",
      "Attachment does not belong to this thread",
    );
  if (input.messageId) {
    const message = await getMessageInOrganization(
      input.auth.organizationId,
      input.messageId,
    );
    if (!message)
      throw new AppError(
        404,
        "MESSAGING_MESSAGE_NOT_FOUND",
        "Message not found",
      );
    if (!thread || message.threadId !== thread.id)
      throw new AppError(
        403,
        "ATTACHMENT_FORBIDDEN",
        "Attachment does not belong to this thread",
      );
  }
  const updated = await updateAttachment(
    input.auth.organizationId,
    attachment.id,
    {
      messageId: input.messageId ?? attachment.messageId,
      downloadStatus:
        attachment.downloadStatus === "uploaded" ? "uploaded" : "pending",
    },
  );
  return updated ?? attachment;
}

export async function getMessagingAttachment(input: {
  auth: MessagingAuthContext;
  bindings?: AppBindings;
  attachmentId: string;
}) {
  const joined = await authorizedMessagingAttachment(
    input.auth,
    input.attachmentId,
  );
  const bucket = input.bindings?.MESSAGING_ATTACHMENTS_BUCKET;
  if (bucket && joined.attachment.storageKey) {
    const object = await bucket.get(joined.attachment.storageKey);
    if (object)
      return {
        response: new Response(object.body, {
          headers: {
            "Content-Type": joined.attachment.mimeType,
            "Content-Disposition": `attachment; filename="${joined.attachment.filename.replace(/"/g, "_")}"`,
          },
        }),
        attachment: joined.attachment,
      };
  }
  if (
    joined.message &&
    joined.thread &&
    joined.account &&
    joined.attachment.providerAttachmentId
  ) {
    const response = await createUnipileClient(
      input.bindings,
    ).downloadAttachment({
      accountId: joined.account.unipileAccountId,
      chatId: joined.thread.externalThreadId,
      messageId: joined.message.externalMessageId ?? joined.message.id,
      attachmentId: joined.attachment.providerAttachmentId,
    });
    return { response, attachment: joined.attachment };
  }
  throw new AppError(
    404,
    "ATTACHMENT_CONTENT_NOT_FOUND",
    "Attachment content is not available",
  );
}

export async function completeMessagingConnection(input: {
  auth: MessagingAuthContext;
  bindings?: AppBindings;
  state: string;
  accountId: string;
  provider?: string | null;
}) {
  const payload = await verifyHostedState(input.state, stateSecret());
  if (
    !payload ||
    payload.organizationId !== input.auth.organizationId ||
    payload.userId !== input.auth.userId
  ) {
    throw new AppError(
      400,
      "INVALID_CONNECTION_STATE",
      "The messaging connection state is invalid or expired",
    );
  }
  const nonceHash = await sha256Hex(payload.nonce);
  const client = createUnipileClient(input.bindings);
  let normalized;
  try {
    normalized = normalizeAccount(
      await client.getAccount(input.accountId),
      input.accountId,
    );
  } catch (error) {
    throw providerError(error);
  }
  assertNonEmailProvider(normalized.provider);
  const existing = await findMessagingAccountByUnipileId(
    normalized.unipileAccountId,
  );
  if (existing && existing.organizationId !== input.auth.organizationId) {
    throw new AppError(
      409,
      "MESSAGING_ACCOUNT_ALREADY_CONNECTED",
      "This provider account is already connected to another organization",
    );
  }
  // Consume only after the provider account has been fetched and validated.
  // A transient Unipile failure can therefore retry the callback, while the
  // conditional database update still makes successful completion one-shot.
  const consumed = await consumeConnectionState({
    organizationId: payload.organizationId,
    userId: payload.userId,
    nonceHash,
  });
  if (!consumed)
    throw new AppError(
      409,
      "CONNECTION_STATE_REPLAYED",
      "This messaging connection has already been completed",
    );
  const account = await insertOrUpdateMessagingAccount({
    organizationId: input.auth.organizationId,
    createdByUserId: existing?.createdByUserId ?? input.auth.userId,
    normalized: { ...normalized, status: "syncing" },
  });
  await createOutboxEvent({
    organizationId: input.auth.organizationId,
    eventType: "connected_account.updated",
    aggregateType: "connected_account",
    aggregateId: account.id,
    payload: {
      accountId: account.id,
      status: account.status,
      provider: account.provider,
    },
  });
  await createMessagingAuditEvent({
    organizationId: input.auth.organizationId,
    userId: input.auth.userId,
    action: "messaging.account.connected",
    aggregateType: "connected_account",
    aggregateId: account.id,
    metadata: { provider: account.provider },
  });
  await enqueueMessagingJob({
    jobKey: `messaging:backfill:${account.id}`,
    organizationId: input.auth.organizationId,
    kind: "account_backfill",
    payload: { accountId: account.id },
  });
  return { account, returnPath: payload.returnPath };
}

/**
 * Complete a hosted-auth callback when Unipile reports api/already_exists.
 *
 * Per Unipile's v2 contract, the callback detail is the existing Account ID
 * and the provider authentication has succeeded. Error callbacks omit state,
 * so this path additionally requires and consumes the latest unexpired
 * connection attempt for the authenticated user and checks its provider.
 */
export async function completeExistingMessagingConnection(input: {
  auth: MessagingAuthContext;
  bindings?: AppBindings;
  accountId: string;
}) {
  const pending = await findPendingConnectionState({
    organizationId: input.auth.organizationId,
    userId: input.auth.userId,
  });
  const existing = await findMessagingAccountByUnipileId(input.accountId);

  // A browser refresh after an already-completed callback is safe and should
  // still return to the app rather than exposing a raw API error page.
  if (!pending && existing?.organizationId === input.auth.organizationId) {
    return {
      account: existing,
      returnPath: `/dashboard/${existing.provider}`,
    };
  }
  if (!pending) {
    throw new AppError(
      400,
      "INVALID_CONNECTION_STATE",
      "No active messaging connection attempt matches this callback",
    );
  }

  let normalized: NormalizedAccount;
  try {
    normalized = normalizeAccount(
      await createUnipileClient(input.bindings).getAccount(input.accountId),
      input.accountId,
    );
  } catch (error) {
    throw providerError(error);
  }
  assertNonEmailProvider(normalized.provider);

  const requestedChannel = messagingConnectChannels.find(
    (channel) => channel === pending.requestedChannel,
  );
  if (
    !requestedChannel ||
    providerForConnectChannel(requestedChannel) !== normalized.provider
  ) {
    throw new AppError(
      400,
      "MESSAGING_PROVIDER_MISMATCH",
      "The connected account does not match the requested messaging channel",
    );
  }
  if (existing && existing.organizationId !== input.auth.organizationId) {
    throw new AppError(
      409,
      "MESSAGING_ACCOUNT_ALREADY_CONNECTED",
      "This provider account is already connected to another organization",
    );
  }

  const consumed = await consumeConnectionState({
    organizationId: input.auth.organizationId,
    userId: input.auth.userId,
    nonceHash: pending.nonceHash,
  });
  if (!consumed) {
    throw new AppError(
      409,
      "CONNECTION_STATE_REPLAYED",
      "This messaging connection has already been completed",
    );
  }

  const account = await insertOrUpdateMessagingAccount({
    organizationId: input.auth.organizationId,
    createdByUserId: existing?.createdByUserId ?? input.auth.userId,
    normalized: { ...normalized, status: "syncing" },
  });
  await createOutboxEvent({
    organizationId: input.auth.organizationId,
    eventType: "connected_account.updated",
    aggregateType: "connected_account",
    aggregateId: account.id,
    payload: {
      accountId: account.id,
      status: account.status,
      provider: account.provider,
    },
  });
  await createMessagingAuditEvent({
    organizationId: input.auth.organizationId,
    userId: input.auth.userId,
    action: "messaging.account.connected",
    aggregateType: "connected_account",
    aggregateId: account.id,
    metadata: {
      provider: account.provider,
      reusedExistingUnipileAccount: true,
    },
  });
  await enqueueMessagingJob({
    jobKey: `messaging:backfill:${account.id}`,
    organizationId: input.auth.organizationId,
    kind: "account_backfill",
    payload: { accountId: account.id },
  });
  return { account, returnPath: pending.returnPath };
}

export async function refreshMessagingAccount(input: {
  auth: MessagingAuthContext;
  bindings?: AppBindings;
  accountId: string;
}) {
  const account = await findMessagingAccount(
    input.auth.organizationId,
    input.accountId,
  );
  if (!account || !canUseAccount(account, input.auth))
    throw new AppError(
      404,
      "MESSAGING_ACCOUNT_NOT_FOUND",
      "Messaging account not found",
    );
  assertNonEmailProvider(account.provider);
  try {
    const normalized = normalizeAccount(
      await createUnipileClient(input.bindings).getAccount(
        account.unipileAccountId,
      ),
      account.unipileAccountId,
    );
    const updated = await updateMessagingAccount(
      input.auth.organizationId,
      account.id,
      {
        provider: normalized.provider,
        providerAccountType: normalized.providerAccountType,
        displayName: normalized.displayName,
        username: normalized.username,
        emailAddress: normalized.emailAddress,
        phoneNumber: normalized.phoneNumber,
        status: normalized.status,
        providerMetadata: safeMetadata(normalized.providerMetadata),
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    );
    return updated ?? account;
  } catch (error) {
    throw providerError(error);
  }
}

/**
 * Reconcile a stale local failure with Unipile without forcing the user
 * through hosted auth again. Conversation backfill and provider connection
 * health are separate concerns, so a temporary sync failure must not make a
 * still-running account unusable for outbound messages.
 */
export async function restoreMessagingAccountIfHealthy(input: {
  account: MessagingAccountRow;
  bindings?: AppBindings;
}): Promise<MessagingAccountRow> {
  if (
    !input.account.enabled ||
    !RECOVERABLE_ACCOUNT_STATUSES.has(input.account.status)
  )
    return input.account;

  try {
    const normalized = normalizeAccount(
      await createUnipileClient(input.bindings).getAccount(
        input.account.unipileAccountId,
      ),
      input.account.unipileAccountId,
    );
    if (normalized.status !== "connected") return input.account;

    const updated = await updateMessagingAccount(
      input.account.organizationId,
      input.account.id,
      {
        provider: normalized.provider,
        providerAccountType: normalized.providerAccountType,
        displayName: normalized.displayName,
        username: normalized.username,
        emailAddress: normalized.emailAddress,
        phoneNumber: normalized.phoneNumber,
        providerMetadata: safeMetadata(normalized.providerMetadata),
        status: "connected",
        enabled: true,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    );
    if (!updated) return input.account;

    await createOutboxEvent({
      organizationId: input.account.organizationId,
      eventType: "connected_account.updated",
      aggregateType: "connected_account",
      aggregateId: input.account.id,
      payload: { accountId: input.account.id, status: "connected" },
    });
    return updated;
  } catch {
    // Keep the stored status when the health check itself is unavailable. The
    // caller can then return the existing actionable reconnect error.
    return input.account;
  }
}

export async function disconnectMessagingAccount(input: {
  auth: MessagingAuthContext;
  bindings?: AppBindings;
  accountId: string;
}) {
  const account = await findMessagingAccount(
    input.auth.organizationId,
    input.accountId,
  );
  if (!account || !canUseAccount(account, input.auth))
    throw new AppError(
      404,
      "MESSAGING_ACCOUNT_NOT_FOUND",
      "Messaging account not found",
    );
  if (
    !isOrganizationManager(input.auth) &&
    account.createdByUserId !== input.auth.userId
  ) {
    throw new AppError(
      403,
      "MESSAGING_ACCOUNT_OWNER_REQUIRED",
      "Only the account owner or an organization manager can disconnect this account",
    );
  }
  try {
    await createUnipileClient(input.bindings).disconnectAccount(
      account.unipileAccountId,
    );
  } catch (error) {
    const mapped = providerError(error);
    if (mapped.status !== 404) throw mapped;
  }
  const updated = await updateMessagingAccount(
    input.auth.organizationId,
    account.id,
    { status: "disconnected", enabled: false },
  );
  await createOutboxEvent({
    organizationId: input.auth.organizationId,
    eventType: "connected_account.updated",
    aggregateType: "connected_account",
    aggregateId: account.id,
    payload: { accountId: account.id, status: "disconnected" },
  });
  await createMessagingAuditEvent({
    organizationId: input.auth.organizationId,
    userId: input.auth.userId,
    action: "messaging.account.disconnected",
    aggregateType: "connected_account",
    aggregateId: account.id,
  });
  return updated ?? account;
}

export async function syncMessagingAccount(input: {
  organizationId: string;
  accountId: string;
  bindings?: AppBindings;
  maxChatPages?: number;
}) {
  const account = await findMessagingAccount(
    input.organizationId,
    input.accountId,
  );
  if (!account)
    throw new AppError(
      404,
      "MESSAGING_ACCOUNT_NOT_FOUND",
      "Messaging account not found",
    );
  assertNonEmailProvider(account.provider);
  const client = createUnipileClient(input.bindings);
  await updateMessagingAccount(input.organizationId, account.id, {
    status: "syncing",
    lastErrorCode: null,
    lastErrorMessage: null,
  });
  let position = parseBackfillPosition(account.backfillCursor);
  let pages = 0;
  let chatCount = account.backfillProgress ?? 0;
  let historyWarning: string | null = null;
  try {
    // Refresh the provider account before reading cached chat shells. Unipile
    // can still return a stale chat list while the underlying account is in
    // an errored state, which otherwise looks like a successful empty inbox.
    const providerAccount = normalizeAccount(
      await client.getAccount(account.unipileAccountId),
      account.unipileAccountId,
    );
    await updateMessagingAccount(input.organizationId, account.id, {
      providerAccountType: providerAccount.providerAccountType,
      displayName: providerAccount.displayName,
      username: providerAccount.username,
      emailAddress: providerAccount.emailAddress,
      phoneNumber: providerAccount.phoneNumber,
      providerMetadata: safeMetadata(providerAccount.providerMetadata),
    });
    if (providerAccount.status !== "connected") {
      throw new AppError(
        502,
        "PROVIDER_ACCOUNT_NOT_READY",
        `The connected ${account.provider} account is ${providerAccount.status} in Unipile. Reconnect it before syncing messages.`,
      );
    }
    // LinkedIn exposes product-specific inboxes in API v2. Calling the
    // account-wide /chats endpoint for LinkedIn returns api/not_implemented;
    // use the account's primary product inbox instead.
    const linkedinInboxId =
      account.provider === "linkedin"
        ? await resolveLinkedinSyncInbox({ account, bindings: input.bindings })
        : undefined;
    // LinkedIn's v2 provider caps inbox chat pages at 25 items. Other
    // messaging providers accept the larger page used by the generic path.
    const chatPageLimit = linkedinInboxId ? 25 : 50;
    do {
      const page = normalizePageItems(
        linkedinInboxId
          ? await client.listInboxChats({
              accountId: account.unipileAccountId,
              inboxId: linkedinInboxId,
              ...position,
              limit: chatPageLimit,
            })
          : await client.listChats({
              accountId: account.unipileAccountId,
              ...position,
              limit: chatPageLimit,
            }),
        { position, limit: chatPageLimit },
      );
      const preparedThreads: Array<{
        normalized: NormalizedThread;
        thread: Awaited<ReturnType<typeof upsertThread>>;
      }> = [];

      // Persist every chat shell first. Provider histories can contain
      // thousands of messages; users should see the complete conversation
      // list immediately instead of waiting for chat #1 to finish backfilling.
      for (const rawChat of page.items) {
        const prepared = await persistProviderThread({
          organizationId: input.organizationId,
          account,
          raw: rawChat,
        });
        preparedThreads.push(prepared);
      }
      chatCount = await countMessagingThreadsForAccount(
        input.organizationId,
        account.id,
      );
      await updateMessagingAccount(input.organizationId, account.id, {
        backfillProgress: chatCount,
        backfillCursor: serializeBackfillPosition(position),
      });
      if (preparedThreads.length > 0) {
        await createOutboxEvent({
          organizationId: input.organizationId,
          eventType: "connected_account.updated",
          aggregateType: "connected_account",
          aggregateId: account.id,
          payload: {
            accountId: account.id,
            status: "syncing",
            progress: chatCount,
          },
        });
      }

      // Once the page's conversation list is visible, fill each thread's
      // message history. This remains idempotent and can safely resume/retry.
      for (const prepared of preparedThreads) {
        const { normalized: normalizedThread, thread } = prepared;
        let messagePosition: ProviderPagePosition = {};
        let messagePages = 0;
        try {
          do {
            const messagePage = normalizePageItems(
              await client.listMessages({
                accountId: account.unipileAccountId,
                chatId: normalizedThread.externalThreadId,
                ...messagePosition,
                limit: 100,
              }),
              { position: messagePosition, limit: 100 },
            );
            for (const rawMessage of messagePage.items) {
              const normalizedMessage = safeMessage(
                await normalizeMessage(
                  account.unipileAccountId,
                  rawMessage,
                  account.provider,
                  "sync.message",
                ),
              );
              const persisted = await insertOrUpdateInboundMessage({
                organizationId: input.organizationId,
                threadId: thread.id,
                connectedAccountId: account.id,
                normalized: normalizedMessage,
              });
              await updateThreadForMessage({
                organizationId: input.organizationId,
                threadId: thread.id,
                messageId: persisted.row?.id ?? "",
                preview: normalizedMessage.preview,
                sentAt: normalizedMessage.sentAt,
                inbound: normalizedMessage.direction === "inbound",
                unread: false,
              });
              for (const attachment of normalizedMessage.attachments) {
                const storedAttachment = await insertInboundAttachment({
                  id: crypto.randomUUID(),
                  organizationId: input.organizationId,
                  createdByUserId: account.createdByUserId,
                  messageId: persisted.row?.id ?? null,
                  threadId: thread.id,
                  providerAttachmentId: attachment.providerAttachmentId,
                  filename: attachment.filename,
                  mimeType: attachment.mimeType,
                  sizeBytes: attachment.sizeBytes,
                  providerUrl: attachment.providerUrl,
                  thumbnailMetadata: attachment.thumbnailMetadata,
                  safeDisplayMetadata: attachment.safeDisplayMetadata,
                  downloadStatus: "pending",
                  storageKey: `messaging/${input.organizationId}/${thread.id}/${crypto.randomUUID()}/${safeFilename(attachment.filename)}`,
                });
                if (storedAttachment.inserted && storedAttachment.attachment) {
                  await enqueueMessagingJob({
                    jobKey: `messaging:attachment:${storedAttachment.attachment.id}`,
                    organizationId: input.organizationId,
                    kind: "attachment_process",
                    payload: {
                      attachmentId: storedAttachment.attachment.id,
                      threadId: thread.id,
                    },
                  });
                }
              }
            }
            messagePosition = nextPagePosition(messagePage) ?? {};
            messagePages += 1;
          } while (
            (messagePosition.cursor !== undefined ||
              messagePosition.offset !== undefined) &&
            messagePages < 100
          );
        } catch (error) {
          // Unipile can return a stale Instagram chat shell that appears in
          // the account-wide list but is no longer addressable by the detail
          // endpoint. Keep the conversation visible and continue syncing the
          // remaining chats instead of failing the entire account.
          const providerHistoryUnavailable =
            error instanceof UnipileProviderError &&
            (error.status === 404 ||
              (account.provider === "instagram" && error.status === 504));
          if (!providerHistoryUnavailable) throw error;
          historyWarning ??=
            account.provider === "instagram"
              ? "Some Instagram conversations were returned by the provider without accessible message history. Retry sync to try again."
              : "Some conversations were returned by the provider without accessible message history. Retry sync to try again.";
        }
        await createOutboxEvent({
          organizationId: input.organizationId,
          eventType: "thread.updated",
          aggregateType: "thread",
          aggregateId: thread.id,
          payload: {
            threadId: thread.id,
            accountId: account.id,
            ...(historyWarning ? { historyWarning: true } : {}),
          },
        });
      }
      position = nextPagePosition(page) ?? {};
      await updateMessagingAccount(input.organizationId, account.id, {
        backfillProgress: chatCount,
        backfillCursor: serializeBackfillPosition(position),
      });
      pages += 1;
      if (pages >= (input.maxChatPages ?? 20)) break;
    } while (position.cursor !== undefined || position.offset !== undefined);
    const complete =
      position.cursor === undefined && position.offset === undefined;
    const updated = await updateMessagingAccount(
      input.organizationId,
      account.id,
      {
        status: complete ? "connected" : "syncing",
        lastSuccessfulSyncAt: complete ? new Date() : null,
        backfillCursor: serializeBackfillPosition(complete ? null : position),
        backfillProgress: chatCount,
        lastErrorCode: historyWarning ? "PROVIDER_RESOURCE_NOT_FOUND" : null,
        lastErrorMessage: historyWarning,
      },
    );
    await createOutboxEvent({
      organizationId: input.organizationId,
      eventType: "connected_account.updated",
      aggregateType: "connected_account",
      aggregateId: account.id,
      payload: {
        accountId: account.id,
        status: updated?.status ?? "syncing",
        progress: chatCount,
        complete,
      },
    });
    const serializedPosition = serializeBackfillPosition(position);
    if (!complete && serializedPosition)
      await enqueueMessagingJob({
        jobKey: `messaging:backfill:${account.id}:${serializedPosition}`,
        organizationId: input.organizationId,
        kind: "account_backfill",
        payload: { accountId: account.id },
      });
    return updated;
  } catch (error) {
    const mapped = providerError(error);
    const status =
      mapped.code === "PROVIDER_AUTHENTICATION_FAILED"
        ? "expired"
        : mapped.code === "PROVIDER_ACCOUNT_NOT_READY"
          ? "failed"
          : "connected";
    await updateMessagingAccount(input.organizationId, account.id, {
      // A chat-history/backfill failure does not disconnect the provider
      // account. Keep its sync error separately while allowing messaging.
      status,
      lastErrorCode: mapped.code,
      lastErrorMessage: mapped.message,
    });
    await createOutboxEvent({
      organizationId: input.organizationId,
      eventType: "connected_account.updated",
      aggregateType: "connected_account",
      aggregateId: account.id,
      payload: {
        accountId: account.id,
        status,
        errorCode: mapped.code,
      },
    });
    throw mapped;
  }
}

/**
 * Lightweight inbox reconciliation used only while no Unipile webhook is
 * configured. It reads the most recent provider chat page and fetches message
 * pages only for conversations whose provider timestamp moved forward.
 *
 * This is intentionally bounded. Full history remains the responsibility of
 * syncMessagingAccount; production realtime should use signed webhooks.
 */
export async function syncRecentMessagingAccount(input: {
  auth: MessagingAuthContext;
  bindings?: AppBindings;
  accountId: string;
}) {
  let account = await findMessagingAccount(
    input.auth.organizationId,
    input.accountId,
  );
  if (!account || !canUseAccount(account, input.auth))
    throw new AppError(
      404,
      "MESSAGING_ACCOUNT_NOT_FOUND",
      "Messaging account not found",
    );
  assertNonEmailProvider(account.provider);
  account = await restoreMessagingAccountIfHealthy({
    account,
    bindings: input.bindings,
  });
  assertActiveMessagingAccount(account);

  const client = createUnipileClient(input.bindings);
  const linkedinInboxId =
    account.provider === "linkedin"
      ? await resolveLinkedinSyncInbox({ account, bindings: input.bindings })
      : undefined;
  const chatLimit = 10;
  const recentMessageLimit = 10;
  const chatPage = normalizePageItems(
    linkedinInboxId
      ? await client.listInboxChats({
          accountId: account.unipileAccountId,
          inboxId: linkedinInboxId,
          limit: chatLimit,
        })
      : await client.listChats({
          accountId: account.unipileAccountId,
          limit: chatLimit,
        }),
  );

  let changedThreads = 0;
  let insertedMessages = 0;
  const recentChats = await Promise.all(
    chatPage.items.map(async (rawChat) => {
      const normalized = safeThread(normalizeThread(rawChat, account.provider));
      const existing = await findThreadByExternalId(
        input.auth.organizationId,
        account.id,
        normalized.externalThreadId,
      );
      return { rawChat, normalized, existing };
    }),
  );
  for (const { rawChat, normalized, existing } of recentChats) {
    const providerMovedForward =
      !existing ||
      (normalized.lastMessageAt !== null &&
        (!existing.lastMessageAt ||
          normalized.lastMessageAt.getTime() >
            existing.lastMessageAt.getTime()));
    if (!providerMovedForward) continue;

    changedThreads += 1;
    const prepared = await persistProviderThread({
      organizationId: input.auth.organizationId,
      account,
      raw: rawChat,
    });
    const after = existing?.lastMessageAt
      ? new Date(existing.lastMessageAt.getTime() - 60_000).toISOString()
      : undefined;
    try {
      // One recent page is sufficient for a frequent fallback. Full history
      // uses the durable paginated backfill and is intentionally kept out of
      // the browser request path.
      const messagePage = normalizePageItems(
        await client.listMessages({
          accountId: account.unipileAccountId,
          chatId: normalized.externalThreadId,
          after,
          limit: recentMessageLimit,
        }),
      );
      for (const rawMessage of messagePage.items) {
        const rawMessageRecord = rawRecordOf(rawMessage);
        const persisted = await persistNormalizedMessage({
          organizationId: input.auth.organizationId,
          account,
          bindings: input.bindings,
          thread: prepared.thread,
          raw: rawMessage,
          eventType: "poll.message",
          threadId: normalized.externalThreadId,
          unread:
            rawMessageRecord.is_seen !== true &&
            rawMessageRecord.read_status !== "read",
        });
        if (persisted.inserted) insertedMessages += 1;
      }
    } catch (error) {
      const staleProviderChat =
        error instanceof UnipileProviderError &&
        (error.status === 404 ||
          error.providerCode === "provider/resource_not_found");
      if (!staleProviderChat) throw error;
    }
    await createOutboxEvent({
      organizationId: input.auth.organizationId,
      eventType: "thread.updated",
      aggregateType: "thread",
      aggregateId: prepared.thread.id,
      payload: { threadId: prepared.thread.id, accountId: account.id },
    });
  }

  return {
    accountId: account.id,
    checkedThreads: chatPage.items.length,
    changedThreads,
    insertedMessages,
  };
}

async function persistNormalizedMessage(input: {
  organizationId: string;
  account: typeof import("@repo/db-sql").messagingConnectedAccounts.$inferSelect;
  bindings?: AppBindings;
  thread?: typeof import("@repo/db-sql").messagingThreads.$inferSelect;
  raw: unknown;
  eventType: string;
  threadId?: string | null;
  unread: boolean;
}) {
  const rawRecord = rawRecordOf(input.raw);
  const externalThreadId =
    input.threadId ?? threadIdFromProviderPayload(rawRecord);
  if (!externalThreadId)
    throw new AppError(
      422,
      "PROVIDER_PAYLOAD_MISSING_THREAD",
      "Provider message payload is missing its conversation id",
    );
  const message = safeMessage(
    await normalizeMessage(
      input.account.unipileAccountId,
      rawRecord,
      input.account.provider,
      input.eventType,
    ),
  );
  let thread =
    input.thread ??
    (await findThreadByExternalId(
      input.organizationId,
      input.account.id,
      externalThreadId,
    ));

  // A message webhook can be the first event Plucia sees for a newly-created
  // conversation. Hydrate the full v2 Chat object so the inbox immediately
  // has its title, user and avatar. Existing chats are never overwritten by a
  // synthetic shell, which previously erased participant-facing metadata on
  // every message.new event.
  if (!thread) {
    try {
      const hydrated = await persistProviderThread({
        organizationId: input.organizationId,
        account: input.account,
        raw: await createUnipileClient(input.bindings).getChat({
          accountId: input.account.unipileAccountId,
          chatId: externalThreadId,
        }),
      });
      thread = hydrated.thread;
    } catch {
      const syntheticThread: NormalizedThread = safeThread(
        normalizeThread(
          {
            id: externalThreadId,
            chat_id: externalThreadId,
            last_message_at: message.sentAt.toISOString(),
            last_message_text: message.preview,
          },
          input.account.provider,
        ),
      );
      thread = await upsertThread(
        input.organizationId,
        input.account.id,
        input.account.provider,
        syntheticThread,
      );
    }
  }
  const messageParticipant = participantFromMessage(
    rawRecord,
    input.account.provider,
  );
  if (messageParticipant) {
    await upsertParticipant(
      input.organizationId,
      thread.id,
      input.account.provider,
      messageParticipant,
    );
    await persistParticipantIdentities({
      organizationId: input.organizationId,
      threadId: thread.id,
      provider: input.account.provider,
      participant: messageParticipant,
    });
  }
  const persisted = await insertOrUpdateInboundMessage({
    organizationId: input.organizationId,
    threadId: thread.id,
    connectedAccountId: input.account.id,
    normalized: message,
  });
  if (persisted.row) {
    await updateThreadForMessage({
      organizationId: input.organizationId,
      threadId: thread.id,
      messageId: persisted.row.id,
      preview: message.preview,
      sentAt: message.sentAt,
      inbound: message.direction === "inbound",
      unread:
        input.unread && persisted.inserted && message.direction === "inbound",
    });
    for (const attachment of message.attachments) {
      const storedAttachment = await insertInboundAttachment({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        createdByUserId: input.account.createdByUserId,
        messageId: persisted.row.id,
        threadId: thread.id,
        providerAttachmentId: attachment.providerAttachmentId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        providerUrl: attachment.providerUrl,
        thumbnailMetadata: attachment.thumbnailMetadata,
        safeDisplayMetadata: attachment.safeDisplayMetadata,
        downloadStatus: "pending",
        storageKey: `messaging/${input.organizationId}/${thread.id}/${crypto.randomUUID()}/${safeFilename(attachment.filename)}`,
      });
      if (storedAttachment.inserted && storedAttachment.attachment) {
        await enqueueMessagingJob({
          jobKey: `messaging:attachment:${storedAttachment.attachment.id}`,
          organizationId: input.organizationId,
          kind: "attachment_process",
          payload: {
            attachmentId: storedAttachment.attachment.id,
            threadId: thread.id,
          },
        });
      }
    }
    await createOutboxEvent({
      organizationId: input.organizationId,
      eventType: persisted.inserted ? "message.created" : "message.updated",
      aggregateType: "message",
      aggregateId: persisted.row.id,
      payload: {
        threadId: thread.id,
        messageId: persisted.row.id,
        unread:
          input.unread && persisted.inserted && message.direction === "inbound",
      },
    });
  }
  return { thread, message: persisted.row, inserted: persisted.inserted };
}

function rawRecordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function firstProviderString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function webhookPayloadOf(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const nested = rawRecordOf(
    value.payload ?? value.data ?? value.message ?? value.chat,
  );
  return Object.keys(nested).length > 0 ? nested : value;
}

function providerMessageIdOf(value: Record<string, unknown>): string | null {
  return firstProviderString(
    value.id,
    value.message_id,
    value.provider_message_id,
  );
}

export async function sendChatMessageWithRecovery(input: {
  bindings?: AppBindings;
  client?: MessagingDeliveryClient;
  thread: MessagingThreadWithRelated;
  text: string;
  attachments?: Array<Record<string, unknown>>;
}): Promise<{
  raw: Record<string, unknown>;
  recoveredExternalThreadId: string | null;
}> {
  const client = input.client ?? createUnipileClient(input.bindings);
  try {
    return {
      raw: await client.sendChatMessage({
        accountId: input.thread.account.unipileAccountId,
        chatId: input.thread.thread.externalThreadId,
        text: input.text,
        ...(input.attachments ? { attachments: input.attachments } : {}),
      }),
      recoveredExternalThreadId: null,
    };
  } catch (sendError) {
    // Instagram can return stale chat shells from list/sync. Before treating a
    // 5xx send as transient, verify the cached chat id. If it no longer exists,
    // restart the individual chat with the recipient's messaging identifier;
    // Unipile sends the message as part of this request.
    if (
      input.thread.account.provider !== "instagram" ||
      !(sendError instanceof UnipileProviderError) ||
      ![404, 500, 502, 503, 504].includes(sendError.status)
    )
      throw sendError;

    let staleChat = false;
    try {
      await client.getChat({
        accountId: input.thread.account.unipileAccountId,
        chatId: input.thread.thread.externalThreadId,
      });
    } catch (probeError) {
      staleChat =
        probeError instanceof UnipileProviderError &&
        (probeError.status === 404 ||
          probeError.providerCode === "provider/resource_not_found");
    }
    if (!staleChat) throw sendError;

    const recipientIds = [
      ...new Set(
        input.thread.participants
          .filter((participant) => !participant.isSelf)
          .map((participant) => participant.providerParticipantId)
          .filter(Boolean),
      ),
    ];
    if (recipientIds.length !== 1)
      throw new AppError(
        409,
        "STALE_INSTAGRAM_CONVERSATION",
        "This Instagram conversation is no longer available and its recipient could not be resolved",
      );

    const raw = await client.startChat({
      accountId: input.thread.account.unipileAccountId,
      participantIds: recipientIds,
      text: input.text,
      ...(input.attachments ? { attachments: input.attachments } : {}),
    });
    return {
      raw,
      // Instagram individual chat ids are the recipient's messaging
      // identifier. Prefer the explicit provider response when present.
      recoveredExternalThreadId:
        firstProviderString(raw.chat_id, raw.id) ?? recipientIds[0]!,
    };
  }
}

export async function processMessagingInboundEvent(input: {
  eventId: string;
  bindings?: AppBindings;
}) {
  const existing = await getInboundEvent(input.eventId);
  if (!existing)
    throw new AppError(
      404,
      "INBOUND_EVENT_NOT_FOUND",
      "Inbound event not found",
    );
  if (existing.status === "processed") return existing;
  if (existing.status === "dead_letter") return existing;
  const event = await claimInboundEvent(existing.id);
  if (!event) return existing;
  try {
    const payload = rawRecordOf(event.payload);
    const webhookPayload = webhookPayloadOf(payload);
    const account = event.connectedAccountId
      ? await findMessagingAccount(
          event.organizationId ?? "",
          event.connectedAccountId,
        )
      : typeof (payload.account_id ?? webhookPayload.account_id) === "string"
        ? await findMessagingAccountByUnipileId(
            (payload.account_id ?? webhookPayload.account_id) as string,
          )
        : null;
    const type = event.eventType.toLowerCase();
    if (account)
      await updateMessagingAccount(account.organizationId, account.id, {
        lastWebhookAt: new Date(),
      });
    if (type.startsWith("account.")) {
      if (account) {
        const statusValue =
          typeof webhookPayload.status === "string"
            ? webhookPayload.status
            : type.split(".").at(-1);
        const status =
          type === "account.initial_sync.running"
            ? "syncing"
            : type === "account.initial_sync.completed"
              ? "syncing"
              : type === "account.initial_sync.failed"
                ? "connected"
                : statusValue === "running" ||
                    statusValue === "ready" ||
                    statusValue === "reconnect" ||
                    statusValue === "add" ||
                    statusValue === "unlocked" ||
                    statusValue === "partial" ||
                    statusValue === "degraded"
                  ? "connected"
                  : statusValue === "paused"
                    ? "paused"
                    : statusValue === "disconnected" || statusValue === "remove"
                      ? "disconnected"
                      : statusValue === "expired" || statusValue === "revoked"
                        ? statusValue
                        : statusValue === "locked" ||
                            statusValue === "errored" ||
                            statusValue === "error" ||
                            statusValue === "failed"
                          ? "failed"
                          : undefined;
        if (status) {
          const lifecycleError =
            type === "account.initial_sync.failed"
              ? {
                  code: "PROVIDER_INITIAL_SYNC_FAILED",
                  message:
                    "Unipile is retrying the initial history sync. Messaging remains available, but older conversations may be incomplete.",
                }
              : statusValue === "partial"
                ? {
                    code: "PROVIDER_ACCOUNT_PARTIAL",
                    message:
                      "Some products on this connected account require authentication; available messaging products remain usable.",
                  }
                : statusValue === "degraded"
                  ? {
                      code: "PROVIDER_ACCOUNT_DEGRADED",
                      message:
                        "Some products on this connected account are temporarily unavailable.",
                    }
                  : statusValue === "locked"
                    ? {
                        code: "PROVIDER_ACCOUNT_LOCKED",
                        message:
                          "Unipile has temporarily locked API access to this connected account.",
                      }
                    : statusValue === "errored" || statusValue === "error"
                      ? {
                          code: "PROVIDER_ACCOUNT_INTERRUPTED",
                          message:
                            "The provider connection is temporarily interrupted. Unipile will retry it automatically.",
                        }
                      : null;
          await updateMessagingAccount(account.organizationId, account.id, {
            status,
            enabled: status !== "disconnected",
            lastErrorCode: lifecycleError?.code ?? null,
            lastErrorMessage: lifecycleError?.message ?? null,
          });
          await createOutboxEvent({
            organizationId: account.organizationId,
            eventType: "connected_account.updated",
            aggregateType: "connected_account",
            aggregateId: account.id,
            payload: { accountId: account.id, status },
          });
          if (type === "account.initial_sync.completed") {
            await enqueueMessagingJob({
              jobKey: `messaging:initial-sync-completed:${account.id}:${event.id}`,
              organizationId: account.organizationId,
              kind: "account_backfill",
              payload: { accountId: account.id },
            });
          }
        }
      }
    } else if (account && type.startsWith("message.receipt.")) {
      const body = webhookPayloadOf(webhookPayload);
      const externalMessageId =
        typeof body.message_id === "string"
          ? body.message_id
          : typeof body.id === "string"
            ? body.id
            : null;
      if (externalMessageId) {
        const message = await findMessageByExternalId(
          account.id,
          externalMessageId,
        );
        if (message) {
          const deliveryStatus = type.endsWith("read") ? "read" : "delivered";
          const updated = await updateMessage(
            account.organizationId,
            message.id,
            { deliveryStatus, providerEventType: event.eventType },
          );
          await createOutboxEvent({
            organizationId: account.organizationId,
            eventType: "message.delivery_updated",
            aggregateType: "message",
            aggregateId: message.id,
            payload: {
              threadId: message.threadId,
              messageId: message.id,
              deliveryStatus,
            },
          });
          if (!updated)
            throw new AppError(
              500,
              "MESSAGING_MESSAGE_PERSIST_FAILED",
              "Message delivery state could not be updated",
            );
        }
      }
    } else if (account && type === "message.reaction.new") {
      assertNonEmailProvider(account.provider);
      const body = webhookPayloadOf(webhookPayload);
      const externalMessageId = firstProviderString(
        body.message_id,
        body.messageId,
      );
      const reaction = normalizeMessageReaction(body);
      if (externalMessageId && reaction) {
        const message = await findMessageByExternalId(
          account.id,
          externalMessageId,
        );
        if (message) {
          const updated = await updateMessage(
            account.organizationId,
            message.id,
            {
              providerEventType: event.eventType,
              providerMetadata: {
                ...message.providerMetadata,
                reactions: [reaction],
              },
            },
          );
          if (!updated)
            throw new AppError(
              500,
              "MESSAGING_MESSAGE_PERSIST_FAILED",
              "Message reaction could not be persisted",
            );
          await createOutboxEvent({
            organizationId: account.organizationId,
            eventType: "message.reaction",
            aggregateType: "message",
            aggregateId: message.id,
            payload: {
              threadId: message.threadId,
              messageId: message.id,
              reactions: [reaction],
            },
          });
        }
      }
    } else if (
      account &&
      (type === "message.new" ||
        type === "message.update" ||
        type === "message.delete" ||
        type === "message.deleted" ||
        type === "chat.update" ||
        type === "chat.delete" ||
        type === "chat.deleted")
    ) {
      assertNonEmailProvider(account.provider);
      const body = webhookPayloadOf(webhookPayload);
      if (type.startsWith("message.")) {
        const externalMessageId = providerMessageIdOf(body);
        const existingMessage = externalMessageId
          ? await findMessageByExternalId(account.id, externalMessageId)
          : null;
        const existingThread = existingMessage
          ? await findMessagingThread(
              account.organizationId,
              existingMessage.threadId,
            )
          : null;
        const externalThreadId =
          threadIdFromProviderPayload(body) ?? existingThread?.externalThreadId;
        const normalizedRaw = existingMessage
          ? {
              ...body,
              ...(externalThreadId ? { chat_id: externalThreadId } : {}),
              ...(firstProviderString(
                body.timestamp,
                body.sent_at,
                body.created_at,
                body.date,
              )
                ? {}
                : { timestamp: existingMessage.sentAt.toISOString() }),
              ...(providerMessageIdOf(body)
                ? {}
                : { id: existingMessage.externalMessageId }),
              ...(firstProviderString(
                body.text,
                body.body_text,
                typeof body.body === "string" ? body.body : null,
              ) || !existingMessage.bodyText
                ? {}
                : { text: existingMessage.bodyText }),
              ...(firstProviderString(body.html, body.body_html) ||
              !existingMessage.bodyHtml
                ? {}
                : { html: existingMessage.bodyHtml }),
              ...(body.direction || body.is_sender || body.is_from_me
                ? {}
                : existingMessage.direction === "outbound"
                  ? { direction: "outbound" }
                  : {}),
              ...(firstProviderString(
                body.sender_id,
                body.sender_provider_id,
                rawRecordOf(body.sender).id,
              ) || !existingMessage.senderParticipantId
                ? {}
                : { sender_id: existingMessage.senderParticipantId }),
            }
          : body;
        await persistNormalizedMessage({
          organizationId: account.organizationId,
          account,
          bindings: input.bindings,
          raw: normalizedRaw,
          eventType: event.eventType,
          threadId: externalThreadId,
          unread: type === "message.new",
        });
      } else {
        const externalThreadId = firstProviderString(
          body.id,
          threadIdFromProviderPayload(body),
        );
        if (externalThreadId) {
          const thread =
            type === "chat.delete" || type === "chat.deleted"
              ? await findThreadByExternalId(
                  account.organizationId,
                  account.id,
                  externalThreadId,
                )
              : await upsertThread(
                  account.organizationId,
                  account.id,
                  account.provider,
                  safeThread(normalizeThread(body, account.provider)),
                );
          if (thread && (type === "chat.delete" || type === "chat.deleted"))
            await setThreadState(account.organizationId, thread.id, "trash");
          if (thread)
            await createOutboxEvent({
              organizationId: account.organizationId,
              eventType: "thread.updated",
              aggregateType: "thread",
              aggregateId: thread.id,
              payload: { threadId: thread.id },
            });
        }
      }
    }
    return await updateInboundEvent(event.id, {
      status: "processed",
      processedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    });
  } catch (error) {
    const mapped = providerError(error);
    const attempts = event.attempts ?? 1;
    const deadLetter =
      attempts >= 8 ||
      (mapped.status >= 400 && mapped.status < 500 && mapped.status !== 429);
    await updateInboundEvent(event.id, {
      status: deadLetter ? "dead_letter" : "failed",
      attempts,
      errorCode: mapped.code,
      errorMessage: mapped.message,
      nextAttemptAt: deadLetter
        ? null
        : new Date(
            Date.now() +
              Math.min(60 * 60_000, 2 ** Math.min(attempts, 10) * 1000),
          ),
    });
    if (!deadLetter)
      await enqueueMessagingJob({
        jobKey: `messaging:webhook-retry:${event.id}:${attempts}`,
        organizationId: event.organizationId,
        kind: "webhook_retry",
        payload: { eventId: event.id },
      });
    throw mapped;
  }
}

export async function processMessagingAttachmentJob(input: {
  organizationId: string;
  attachmentId: string;
  bindings?: AppBindings;
}) {
  const joined = await getAttachmentWithMessage(
    input.organizationId,
    input.attachmentId,
  );
  if (!joined || joined.attachment.downloadStatus !== "pending")
    return joined?.attachment ?? null;
  const bucket = input.bindings?.MESSAGING_ATTACHMENTS_BUCKET;
  if (
    !bucket ||
    !joined.account ||
    !joined.thread ||
    !joined.message ||
    !joined.attachment.providerAttachmentId
  )
    return joined.attachment;
  const response = await createUnipileClient(input.bindings).downloadAttachment(
    {
      accountId: joined.account.unipileAccountId,
      chatId: joined.thread.externalThreadId,
      messageId: joined.message.externalMessageId ?? joined.message.id,
      attachmentId: joined.attachment.providerAttachmentId,
    },
  );
  const body = await response.arrayBuffer();
  if (body.byteLength > env.MESSAGING_MAX_ATTACHMENT_BYTES)
    throw new AppError(
      413,
      "ATTACHMENT_TOO_LARGE",
      "Provider attachment exceeds the configured size limit",
    );
  const storageKey =
    joined.attachment.storageKey ??
    `messaging/${input.organizationId}/${joined.attachment.id}/${safeFilename(joined.attachment.filename)}`;
  await bucket.put(storageKey, body, {
    httpMetadata: { contentType: joined.attachment.mimeType },
  });
  const updated = await updateAttachment(
    input.organizationId,
    joined.attachment.id,
    { storageKey, downloadStatus: "downloaded" },
  );
  await createOutboxEvent({
    organizationId: input.organizationId,
    eventType: "attachment.updated",
    aggregateType: "attachment",
    aggregateId: joined.attachment.id,
    payload: {
      attachmentId: joined.attachment.id,
      threadId: joined.thread.id,
      status: "downloaded",
    },
  });
  return updated ?? joined.attachment;
}

export async function ingestMessagingWebhook(input: {
  envelope: UnipileWebhookEnvelope;
  rawPayload: Record<string, unknown>;
}) {
  const eventFingerprint = await sha256Hex(
    JSON.stringify({
      type: input.envelope.type,
      id: input.envelope.providerEventId,
      payload: input.rawPayload,
    }),
  );
  const account = input.envelope.accountId
    ? await findMessagingAccountByUnipileId(input.envelope.accountId)
    : null;
  // The ledger is private database state and is the replay source for the
  // asynchronous normalizer, so retain the provider payload here. Logs and
  // API responses use redactedProviderPayload; this value never reaches the
  // browser.
  return createInboundEvent({
    provider: "unipile",
    eventType: input.envelope.type,
    providerEventId: input.envelope.providerEventId,
    eventFingerprint,
    connectedAccountId: account?.id ?? null,
    organizationId: account?.organizationId ?? null,
    payload: input.rawPayload,
  });
}

export async function sendMessagingReply(input: {
  auth: MessagingAuthContext;
  bindings?: AppBindings;
  threadId: string;
  text?: string | null;
  html?: string | null;
  attachmentIds?: string[];
  idempotencyKey: string;
}) {
  let thread = await getThreadWithRelated(input.auth, input.threadId);
  if (!thread || !canUseAccount(thread.account, input.auth))
    throw new AppError(
      404,
      "MESSAGING_THREAD_NOT_FOUND",
      "Messaging thread not found",
    );
  assertNonEmailProvider(thread.account.provider);
  const restoredAccount = await restoreMessagingAccountIfHealthy({
    account: thread.account,
    bindings: input.bindings,
  });
  if (restoredAccount !== thread.account)
    thread = { ...thread, account: restoredAccount };
  assertActiveMessagingAccount(thread.account);
  if (!supportsCapability(thread.account.provider, "reply"))
    throw new AppError(
      422,
      "UNSUPPORTED_CHANNEL_CAPABILITY",
      capabilityErrorMessage("reply"),
    );
  if (
    input.attachmentIds?.length &&
    !supportsCapability(thread.account.provider, "attachments")
  )
    throw new AppError(
      422,
      "UNSUPPORTED_CHANNEL_CAPABILITY",
      capabilityErrorMessage("attachments"),
    );
  const content = assertMessageContent({ text: input.text, html: input.html });
  if (content.html && !supportsCapability(thread.account.provider, "htmlEmail"))
    throw new AppError(
      422,
      "UNSUPPORTED_CHANNEL_CAPABILITY",
      capabilityErrorMessage("htmlEmail"),
    );
  const attachments = await providerAttachments({
    auth: input.auth,
    organizationId: input.auth.organizationId,
    threadId: input.threadId,
    attachmentIds: input.attachmentIds,
    bindings: input.bindings,
  });
  const existing = await import("./repository.js").then((repository) =>
    repository.findMessageByIdempotencyKey(
      input.auth.organizationId,
      input.idempotencyKey,
    ),
  );
  if (existing) return { message: existing, idempotent: true };
  const pending = await insertPendingOutboundMessage({
    organizationId: input.auth.organizationId,
    threadId: input.threadId,
    connectedAccountId: thread.account.id,
    idempotencyKey: input.idempotencyKey,
    text: content.text,
    html: content.html,
  });
  if (!pending)
    throw new AppError(
      500,
      "OUTBOUND_MESSAGE_PERSIST_FAILED",
      "Outbound message could not be created",
    );
  await attachAttachmentsToMessage({
    organizationId: input.auth.organizationId,
    threadId: input.threadId,
    messageId: pending.id,
    attachmentIds: input.attachmentIds ?? [],
  });
  try {
    const delivery = await sendChatMessageWithRecovery({
      bindings: input.bindings,
      thread,
      text: content.text ?? content.html ?? "",
      ...(attachments ? { attachments } : {}),
    });
    const { raw } = delivery;
    if (delivery.recoveredExternalThreadId)
      await updateThreadExternalId(
        input.auth.organizationId,
        input.threadId,
        delivery.recoveredExternalThreadId,
      );
    const providerMessageId =
      typeof raw.message_id === "string"
        ? raw.message_id
        : Array.isArray(raw.message_id) && typeof raw.message_id[0] === "string"
          ? raw.message_id[0]
          : !delivery.recoveredExternalThreadId && typeof raw.id === "string"
            ? raw.id
            : null;
    const sent = await updateMessage(input.auth.organizationId, pending.id, {
      externalMessageId: providerMessageId,
      providerEventType: "outbound.sent",
      deliveryStatus: "sent",
      failureCode: null,
      failureMessage: null,
    });
    await updateThreadForMessage({
      organizationId: input.auth.organizationId,
      threadId: input.threadId,
      messageId: pending.id,
      preview: pending.preview,
      sentAt: pending.sentAt,
      inbound: false,
      unread: false,
    });
    await createOutboxEvent({
      organizationId: input.auth.organizationId,
      eventType: "message.delivery_updated",
      aggregateType: "message",
      aggregateId: pending.id,
      payload: {
        threadId: input.threadId,
        messageId: pending.id,
        deliveryStatus: "sent",
      },
    });
    await createMessagingAuditEvent({
      organizationId: input.auth.organizationId,
      userId: input.auth.userId,
      action: "messaging.message.sent",
      aggregateType: "message",
      aggregateId: pending.id,
      metadata: {
        threadId: input.threadId,
        provider: thread.account.provider,
        recoveredStaleConversation: Boolean(delivery.recoveredExternalThreadId),
      },
    });
    return { message: sent ?? pending, idempotent: false };
  } catch (error) {
    const mapped = providerError(error);
    const failed = await updateMessage(input.auth.organizationId, pending.id, {
      providerEventType: "outbound.failed",
      deliveryStatus: "failed",
      failureCode: mapped.code,
      failureMessage: mapped.message,
    });
    await createOutboxEvent({
      organizationId: input.auth.organizationId,
      eventType: "message.delivery_updated",
      aggregateType: "message",
      aggregateId: pending.id,
      payload: {
        threadId: input.threadId,
        messageId: pending.id,
        deliveryStatus: "failed",
        failureCode: mapped.code,
      },
    });
    if (
      ["PROVIDER_TEMPORARY_FAILURE", "PROVIDER_RATE_LIMIT"].includes(
        mapped.code,
      )
    ) {
      await enqueueMessagingJob({
        jobKey: `messaging:outbound-reconcile:${pending.id}`,
        organizationId: input.auth.organizationId,
        kind: "outbound_reconcile",
        payload: { messageId: pending.id, threadId: input.threadId },
      });
    }
    return { message: failed ?? pending, idempotent: false, error: mapped };
  }
}

/** Reconcile a failed outbound attempt without issuing another provider send. */
export async function reconcileMessagingMessage(input: {
  auth: MessagingAuthContext;
  bindings?: AppBindings;
  messageId: string;
}) {
  const failed = await getMessageInOrganization(
    input.auth.organizationId,
    input.messageId,
  );
  if (!failed || failed.direction !== "outbound")
    throw new AppError(
      404,
      "MESSAGING_MESSAGE_NOT_FOUND",
      "Messaging message not found",
    );
  if (failed.deliveryStatus !== "failed")
    throw new AppError(
      409,
      "MESSAGE_NOT_RETRYABLE",
      "Only failed outbound messages can be retried",
    );
  const thread = await getThreadWithRelated(input.auth, failed.threadId);
  if (!thread || !canUseAccount(thread.account, input.auth))
    throw new AppError(
      404,
      "MESSAGING_MESSAGE_NOT_FOUND",
      "Messaging message not found",
    );
  assertNonEmailProvider(thread.account.provider);
  assertActiveMessagingAccount(thread.account);

  const page = normalizePageItems(
    await createUnipileClient(input.bindings).listMessages({
      accountId: thread.account.unipileAccountId,
      chatId: thread.thread.externalThreadId,
      limit: 100,
    }),
  );
  const targetTime = failed.sentAt.getTime();
  for (const raw of page.items) {
    const normalized = await normalizeMessage(
      thread.account.unipileAccountId,
      raw,
      thread.account.provider,
      "outbound.reconcile",
    );
    const sameText =
      (normalized.bodyText ?? normalized.bodyHtml ?? "") ===
      (failed.bodyText ?? failed.bodyHtml ?? "");
    if (
      normalized.direction === "outbound" &&
      sameText &&
      Math.abs(normalized.sentAt.getTime() - targetTime) <= 10 * 60_000
    ) {
      const externalMessageId = normalized.externalMessageId;
      const reconciled = await updateMessage(
        input.auth.organizationId,
        failed.id,
        {
          externalMessageId,
          deliveryStatus:
            normalized.deliveryStatus === "failed"
              ? "sent"
              : normalized.deliveryStatus,
          providerEventType: "outbound.reconciled",
          failureCode: null,
          failureMessage: null,
        },
      );
      await updateThreadForMessage({
        organizationId: input.auth.organizationId,
        threadId: failed.threadId,
        messageId: failed.id,
        preview: failed.preview,
        sentAt: normalized.sentAt,
        inbound: false,
        unread: false,
      });
      await createOutboxEvent({
        organizationId: input.auth.organizationId,
        eventType: "message.delivery_updated",
        aggregateType: "message",
        aggregateId: failed.id,
        payload: {
          threadId: failed.threadId,
          messageId: failed.id,
          deliveryStatus: reconciled?.deliveryStatus ?? "sent",
          reconciled: true,
        },
      });
      return { message: reconciled ?? failed, reconciled: true };
    }
  }

  return { message: null, reconciled: false };
}

/**
 * Reconcile a failed outbound attempt before creating another provider send.
 * Unipile does not expose a portable idempotency header for every channel, so
 * a retry first searches the provider's recent messages for the same content
 * and timestamp. A new send is attempted only after that read succeeds and
 * no matching provider message exists.
 */
export async function retryMessagingMessage(input: {
  auth: MessagingAuthContext;
  bindings?: AppBindings;
  messageId: string;
}) {
  let reconciled: Awaited<ReturnType<typeof reconcileMessagingMessage>>;
  try {
    reconciled = await reconcileMessagingMessage(input);
  } catch (error) {
    // A stale Instagram chat cannot be searched for reconciliation. The
    // recovery send below is safe because the provider confirms that the old
    // conversation resource no longer exists.
    if (
      !(error instanceof UnipileProviderError) ||
      (error.status !== 404 &&
        error.providerCode !== "provider/resource_not_found")
    )
      throw error;
    reconciled = { message: null, reconciled: false };
  }
  if (reconciled.message)
    return { message: reconciled.message, reconciled: true, idempotent: true };
  const failed = await getMessageInOrganization(
    input.auth.organizationId,
    input.messageId,
  );
  if (!failed)
    throw new AppError(
      404,
      "MESSAGING_MESSAGE_NOT_FOUND",
      "Messaging message not found",
    );

  const attachments = await listMessageAttachments(
    input.auth.organizationId,
    failed.id,
  );
  const result = await sendMessagingReply({
    auth: input.auth,
    bindings: input.bindings,
    threadId: failed.threadId,
    text: failed.bodyText,
    html: failed.bodyHtml,
    attachmentIds: attachments.map((attachment) => attachment.id),
    idempotencyKey: `retry:${failed.id}:${failed.updatedAt.getTime()}`,
  });
  return { ...result, reconciled: false };
}

export async function startMessagingConversation(input: {
  auth: MessagingAuthContext;
  bindings?: AppBindings;
  accountId: string;
  participantIds: string[];
  text?: string | null;
  html?: string | null;
  attachmentIds?: string[];
  title?: string | null;
  linkedinProduct?: LinkedinProduct;
  inmail?: boolean;
  inmailSubject?: string | null;
  inmailSignature?: string | null;
  idempotencyKey: string;
}) {
  let account = await findMessagingAccount(
    input.auth.organizationId,
    input.accountId,
  );
  if (!account || !canUseAccount(account, input.auth))
    throw new AppError(
      404,
      "MESSAGING_ACCOUNT_NOT_FOUND",
      "Messaging account not found",
    );
  assertNonEmailProvider(account.provider);
  account = await restoreMessagingAccountIfHealthy({
    account,
    bindings: input.bindings,
  });
  assertActiveMessagingAccount(account);
  if (!supportsCapability(account.provider, "startConversation"))
    throw new AppError(
      422,
      "UNSUPPORTED_CHANNEL_CAPABILITY",
      capabilityErrorMessage("startConversation"),
    );
  if (
    input.attachmentIds?.length &&
    !supportsCapability(account.provider, "attachments")
  )
    throw new AppError(
      422,
      "UNSUPPORTED_CHANNEL_CAPABILITY",
      capabilityErrorMessage("attachments"),
    );
  if (input.participantIds.length === 0 || input.participantIds.length > 50)
    throw new AppError(
      422,
      "PARTICIPANTS_REQUIRED",
      "At least one valid participant is required",
    );
  const content = assertMessageContent({ text: input.text, html: input.html });
  if (content.html && !supportsCapability(account.provider, "htmlEmail"))
    throw new AppError(
      422,
      "UNSUPPORTED_CHANNEL_CAPABILITY",
      capabilityErrorMessage("htmlEmail"),
    );
  const existing = await import("./repository.js").then((repository) =>
    repository.findMessageByIdempotencyKey(
      input.auth.organizationId,
      input.idempotencyKey,
    ),
  );
  if (existing)
    return { message: existing, threadId: existing.threadId, idempotent: true };

  let linkedinStartOptions: Awaited<
    ReturnType<typeof resolveLinkedinStartOptions>
  > = {};
  try {
    linkedinStartOptions = await resolveLinkedinStartOptions({
      account,
      bindings: input.bindings,
      linkedinProduct: input.linkedinProduct,
      inmail: input.inmail,
      inmailSubject: input.inmailSubject,
      inmailSignature: input.inmailSignature,
    });
  } catch (error) {
    throw providerError(error);
  }

  const temporaryThread = await upsertThread(
    input.auth.organizationId,
    account.id,
    account.provider,
    safeThread(
      normalizeThread(
        {
          id: `pending:${input.idempotencyKey}`,
          title: input.title,
          last_message_at: new Date().toISOString(),
          last_message_text: content.text ?? content.html,
        },
        account.provider,
      ),
    ),
  );
  const attachments = await providerAttachments({
    auth: input.auth,
    organizationId: input.auth.organizationId,
    threadId: temporaryThread.id,
    attachmentIds: input.attachmentIds,
    bindings: input.bindings,
  });
  const pending = await insertPendingOutboundMessage({
    organizationId: input.auth.organizationId,
    threadId: temporaryThread.id,
    connectedAccountId: account.id,
    idempotencyKey: input.idempotencyKey,
    text: content.text,
    html: content.html,
  });
  if (!pending)
    throw new AppError(
      500,
      "OUTBOUND_MESSAGE_PERSIST_FAILED",
      "Outbound message could not be created",
    );
  await attachAttachmentsToMessage({
    organizationId: input.auth.organizationId,
    threadId: temporaryThread.id,
    messageId: pending.id,
    attachmentIds: input.attachmentIds ?? [],
  });
  try {
    const raw = await createUnipileClient(input.bindings).startChat({
      accountId: account.unipileAccountId,
      participantIds: input.participantIds,
      text: content.text ?? content.html ?? "",
      title: input.title ?? undefined,
      ...(attachments ? { attachments } : {}),
      ...(linkedinStartOptions.inboxId
        ? { inboxId: linkedinStartOptions.inboxId }
        : {}),
      ...(linkedinStartOptions.specifics
        ? { specifics: linkedinStartOptions.specifics }
        : {}),
    });
    const externalThreadId =
      typeof raw.chat_id === "string"
        ? raw.chat_id
        : typeof raw.id === "string"
          ? raw.id
          : null;
    const externalMessageId =
      typeof raw.message_id === "string"
        ? raw.message_id
        : Array.isArray(raw.message_id) && typeof raw.message_id[0] === "string"
          ? raw.message_id[0]
          : null;
    if (!externalThreadId)
      throw new AppError(
        502,
        "PROVIDER_RESPONSE_MISSING_THREAD",
        "The provider did not return a conversation id",
      );
    await updateThreadExternalId(
      input.auth.organizationId,
      temporaryThread.id,
      externalThreadId,
    );
    const sent = await updateMessage(input.auth.organizationId, pending.id, {
      externalMessageId,
      providerEventType: "outbound.sent",
      deliveryStatus: "sent",
      failureCode: null,
      failureMessage: null,
    });
    await updateThreadForMessage({
      organizationId: input.auth.organizationId,
      threadId: temporaryThread.id,
      messageId: pending.id,
      preview: pending.preview,
      sentAt: pending.sentAt,
      inbound: false,
      unread: false,
    });
    await createOutboxEvent({
      organizationId: input.auth.organizationId,
      eventType: "thread.created",
      aggregateType: "thread",
      aggregateId: temporaryThread.id,
      payload: { threadId: temporaryThread.id },
    });
    await createOutboxEvent({
      organizationId: input.auth.organizationId,
      eventType: "message.delivery_updated",
      aggregateType: "message",
      aggregateId: pending.id,
      payload: {
        threadId: temporaryThread.id,
        messageId: pending.id,
        deliveryStatus: "sent",
      },
    });
    return {
      threadId: temporaryThread.id,
      message: sent ?? pending,
      idempotent: false,
    };
  } catch (error) {
    const mapped = error instanceof AppError ? error : providerError(error);
    const failed = await updateMessage(input.auth.organizationId, pending.id, {
      providerEventType: "outbound.failed",
      deliveryStatus: "failed",
      failureCode: mapped.code,
      failureMessage: mapped.message,
    });
    await createOutboxEvent({
      organizationId: input.auth.organizationId,
      eventType: "message.delivery_updated",
      aggregateType: "message",
      aggregateId: pending.id,
      payload: {
        threadId: temporaryThread.id,
        messageId: pending.id,
        deliveryStatus: "failed",
        failureCode: mapped.code,
      },
    });
    if (
      ["PROVIDER_TEMPORARY_FAILURE", "PROVIDER_RATE_LIMIT"].includes(
        mapped.code,
      )
    ) {
      await enqueueMessagingJob({
        jobKey: `messaging:outbound-reconcile:${pending.id}`,
        organizationId: input.auth.organizationId,
        kind: "outbound_reconcile",
        payload: { messageId: pending.id, threadId: temporaryThread.id },
      });
    }
    return {
      threadId: temporaryThread.id,
      message: failed ?? pending,
      idempotent: false,
      error: mapped,
    };
  }
}

export async function markMessagingThreadRead(input: {
  auth: MessagingAuthContext;
  bindings?: AppBindings;
  threadId: string;
  isRead: boolean;
  lastMessageId?: string | null;
}) {
  const thread = await getThreadWithRelated(input.auth, input.threadId);
  if (!thread)
    throw new AppError(
      404,
      "MESSAGING_THREAD_NOT_FOUND",
      "Messaging thread not found",
    );
  assertNonEmailProvider(thread.account.provider);

  // The inbox read state belongs to Plucia and must not depend on an optional
  // provider-side read receipt. Recovered/imported chats can legitimately have
  // an external chat id that Unipile no longer accepts for update operations.
  // Persist locally first so opening the conversation still clears its unread
  // state even when the provider receipt cannot be synchronized.
  await setThreadReadState({
    organizationId: input.auth.organizationId,
    threadId: input.threadId,
    userId: input.auth.userId,
    isRead: input.isRead,
    lastReadMessageId: input.lastMessageId,
  });

  try {
    const providerStateAlreadyMatches =
      input.isRead && thread.thread.unreadCount === 0;
    if (
      !providerStateAlreadyMatches &&
      supportsCapability(thread.account.provider, "readReceipts")
    )
      await createUnipileClient(input.bindings).updateChat({
        accountId: thread.account.unipileAccountId,
        chatId: thread.thread.externalThreadId,
        read: input.isRead,
      });
  } catch (error) {
    const mapped = providerError(error);
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "messaging.read_receipt_sync_failed",
        provider: thread.account.provider,
        accountId: thread.account.id,
        threadId: input.threadId,
        isRead: input.isRead,
        providerErrorCode: mapped.code,
      }),
    );
  }
  await Promise.all([
    createOutboxEvent({
      organizationId: input.auth.organizationId,
      eventType: "thread.read_changed",
      aggregateType: "thread",
      aggregateId: input.threadId,
      payload: { threadId: input.threadId, isRead: input.isRead },
    }),
    createMessagingAuditEvent({
      organizationId: input.auth.organizationId,
      userId: input.auth.userId,
      action: input.isRead
        ? "messaging.thread.marked_read"
        : "messaging.thread.marked_unread",
      aggregateType: "thread",
      aggregateId: input.threadId,
    }),
  ]);
}

export async function archiveMessagingThread(input: {
  auth: MessagingAuthContext;
  bindings?: AppBindings;
  threadId: string;
  archived: boolean;
}) {
  const thread = await getThreadWithRelated(input.auth, input.threadId);
  if (!thread)
    throw new AppError(
      404,
      "MESSAGING_THREAD_NOT_FOUND",
      "Messaging thread not found",
    );
  assertNonEmailProvider(thread.account.provider);
  if (!supportsCapability(thread.account.provider, "archive"))
    throw new AppError(
      422,
      "UNSUPPORTED_CHANNEL_CAPABILITY",
      capabilityErrorMessage("archive"),
    );
  try {
    await createUnipileClient(input.bindings).updateChat({
      accountId: thread.account.unipileAccountId,
      chatId: thread.thread.externalThreadId,
      archived: input.archived,
    });
  } catch (error) {
    throw providerError(error);
  }
  const updated = await setThreadState(
    input.auth.organizationId,
    input.threadId,
    input.archived ? "archived" : "open",
  );
  await createOutboxEvent({
    organizationId: input.auth.organizationId,
    eventType: "thread.archived",
    aggregateType: "thread",
    aggregateId: input.threadId,
    payload: { threadId: input.threadId, archived: input.archived },
  });
  await createMessagingAuditEvent({
    organizationId: input.auth.organizationId,
    userId: input.auth.userId,
    action: input.archived
      ? "messaging.thread.archived"
      : "messaging.thread.unarchived",
    aggregateType: "thread",
    aggregateId: input.threadId,
  });
  return updated;
}

export async function listMessagingThreadMessages(input: {
  auth: MessagingAuthContext;
  threadId: string;
  cursor?: { sentAt: Date; id: string };
  limit: number;
}) {
  return listThreadMessages(input.auth, input.threadId, input);
}
