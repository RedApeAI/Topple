import { sha256Hex } from "./crypto.js";
import type {
  MessagingProvider,
  NormalizedAccount,
  NormalizedAttachment,
  NormalizedMessage,
  NormalizedParticipant,
  NormalizedThread,
} from "./contracts.js";
import { accountStatusFromUnipile, providerFromUnipile } from "./contracts.js";
import { normalizeText, previewText, safeFilename } from "./content.js";
import { parseProviderRecord } from "./unipile-schemas.js";

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (
      typeof value === "string" &&
      value.trim() &&
      Number.isFinite(Number(value))
    )
      return Number(value);
  }
  return null;
}

function asDate(...values: unknown[]): Date | null {
  const value = firstNumber(...values);
  if (value !== null) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const stringValue = firstString(...values);
  if (!stringValue) return null;
  const date = new Date(stringValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

function record(value: unknown): Record<string, unknown> {
  return parseProviderRecord(value);
}

function nestedRecord(value: unknown, key: string): Record<string, unknown> {
  return record(record(value)[key]);
}

function participantId(value: Record<string, unknown>): string | null {
  return firstString(
    value.id,
    value.provider_id,
    value.providerId,
    value.attendee_provider_id,
    value.attendee_id,
    value.public_identifier,
    value.username,
    value.email,
    value.phone,
  );
}

function participantFromRaw(
  value: unknown,
  provider: MessagingProvider,
  isSelf = false,
): NormalizedParticipant | null {
  const item = record(value);
  const id = participantId(item);
  if (!id) return null;
  const identifiers = record(item.identifiers);
  const name = firstString(
    item.name,
    item.display_name,
    item.full_name,
    item.title,
  );
  return {
    providerParticipantId: id,
    normalizedName: name,
    avatarUrl: firstString(
      item.picture_url,
      item.avatar_url,
      item.avatar,
      item.photo,
    ),
    profileUrl: firstString(item.profile_url, item.url),
    emailAddress: firstString(item.email, identifiers.email),
    phoneNumber: firstString(item.phone, item.phone_number, identifiers.phone),
    linkedinPublicIdentifier:
      provider === "linkedin"
        ? firstString(item.public_identifier, item.username, id)
        : null,
    instagramIdentifier:
      provider === "instagram"
        ? firstString(item.username, item.public_identifier, id)
        : null,
    telegramIdentifier:
      provider === "telegram"
        ? firstString(item.username, item.public_identifier, id)
        : null,
    role: firstString(item.role, item.type),
    isSelf: isSelf || item.is_self === true || item.is_sender === true,
    providerMetadata: item,
  };
}

function participantArray(raw: Record<string, unknown>): unknown[] {
  for (const value of [
    raw.participants,
    raw.attendees,
    raw.users,
    raw.members,
  ]) {
    if (Array.isArray(value)) return value;
  }
  const participants = record(raw.participants);
  if (Object.keys(participants).length > 0) return Object.values(participants);
  return [];
}

/** Normalize a provider reaction without treating it as a new message. */
export function normalizeMessageReaction(
  raw: unknown,
): Record<string, unknown> | null {
  const item = record(raw);
  const reaction = record(item.reaction);
  const sender = record(reaction.sender);
  const value = firstString(reaction.value, reaction.emoji, reaction.type);
  if (!value) return null;
  return {
    value,
    attendeeId: firstString(
      sender.id,
      reaction.sender_id,
      reaction.attendee_id,
    ),
    attendeeDisplayName: firstString(
      sender.display_name,
      sender.name,
      reaction.sender_name,
    ),
    isSelf:
      reaction.is_sender === true ||
      reaction.is_from_me === true ||
      sender.is_self === true,
  };
}

export function normalizeAccount(
  raw: unknown,
  fallbackAccountId?: string,
): NormalizedAccount {
  const item = record(raw);
  const unipileAccountId = firstString(
    item.id,
    item.account_id,
    fallbackAccountId,
  );
  const providerValue = record(item.provider);
  const provider = providerFromUnipile(
    typeof item.provider === "string"
      ? item.provider
      : (providerValue.name ??
          providerValue.type ??
          item.type ??
          nestedRecord(item.user, "provider").name),
  );
  if (!unipileAccountId || !provider)
    throw new Error("Malformed Unipile account payload");
  const user = record(item.user);
  return {
    unipileAccountId,
    provider,
    providerAccountType: firstString(
      item.type,
      item.account_type,
      item.product,
      item.subtype,
    ),
    displayName: firstString(item.name, item.display_name, user.name),
    username: firstString(item.username, user.username, user.public_identifier),
    emailAddress: firstString(item.email, item.email_address, user.email),
    phoneNumber: firstString(item.phone, item.phone_number, user.phone),
    status: accountStatusFromUnipile(item.status),
    providerMetadata: item,
  };
}

export function normalizeThread(
  raw: unknown,
  provider: MessagingProvider,
): NormalizedThread {
  const item = record(raw);
  const externalThreadId = firstString(
    item.id,
    item.chat_id,
    item.thread_id,
    item.conversation_id,
  );
  if (!externalThreadId)
    throw new Error("Malformed Unipile chat payload: missing id");
  const messages = Array.isArray(item.messages) ? item.messages : [];
  const lastMessage = record(item.last_message);
  const participants = participantArray(item)
    .map((participant) => participantFromRaw(participant, provider))
    .filter(
      (participant): participant is NormalizedParticipant =>
        participant !== null,
    );
  return {
    externalThreadId,
    externalThreadAltId: firstString(
      item.thread_id,
      item.conversation_id,
      item.chat_id,
    ),
    subject: firstString(item.subject),
    title: firstString(item.name, item.title, item.display_name),
    preview: previewText(
      firstString(
        item.last_message_text,
        item.preview,
        lastMessage.text,
        lastMessage.body,
        record(messages.at(-1)).text,
        record(messages.at(-1)).body,
      ),
    ),
    latestActivityAt: asDate(
      item.updated_at,
      item.last_message_at,
      lastMessage.timestamp,
      lastMessage.sent_at,
      lastMessage.created_at,
      item.timestamp,
      item.date,
    ),
    lastMessageAt: asDate(
      item.last_message_at,
      lastMessage.timestamp,
      lastMessage.sent_at,
      lastMessage.created_at,
      item.updated_at,
      item.timestamp,
      item.date,
    ),
    unreadCount: Math.max(
      0,
      Math.floor(
        firstNumber(item.unread_count, item.unread, item.unread_messages) ?? 0,
      ),
    ),
    state:
      item.is_archived === true || item.archived === true
        ? "archived"
        : item.is_spam === true
          ? "spam"
          : item.is_trash === true
            ? "trash"
            : "open",
    providerMetadata: item,
    participants,
  };
}

function attachmentsFromRaw(
  raw: Record<string, unknown>,
): NormalizedAttachment[] {
  const values = [raw.attachments, raw.media, raw.files].find(Array.isArray);
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    const item = record(value);
    const id = firstString(item.id, item.attachment_id, item.provider_id);
    const filename = safeFilename(
      firstString(item.name, item.filename, item.file_name) ?? "attachment",
    );
    const sizeBytes = Math.max(
      0,
      Math.floor(firstNumber(item.size, item.size_bytes, item.file_size) ?? 0),
    );
    return [
      {
        providerAttachmentId: id,
        filename,
        mimeType:
          firstString(item.mime_type, item.mimetype, item.type) ??
          "application/octet-stream",
        sizeBytes,
        providerUrl: firstString(item.url, item.download_url, item.file_url),
        thumbnailMetadata: record(item.thumbnail),
        safeDisplayMetadata: {
          width: firstNumber(item.width),
          height: firstNumber(item.height),
        },
      } satisfies NormalizedAttachment,
    ];
  });
}

export async function messageFingerprint(
  accountId: string,
  raw: Record<string, unknown>,
): Promise<string> {
  const stable = firstString(raw.id, raw.message_id, raw.provider_message_id);
  if (stable) return sha256Hex(`${accountId}:message:${stable}`);
  return sha256Hex(
    JSON.stringify({
      accountId,
      chatId: firstString(raw.chat_id, raw.thread_id, raw.conversation_id),
      sender: firstString(
        raw.sender_id,
        raw.sender_provider_id,
        record(raw.sender).id,
      ),
      sentAt: firstString(raw.timestamp, raw.sent_at, raw.created_at, raw.date),
      text: firstString(raw.text, raw.body, record(raw.body).text),
    }),
  );
}

export async function normalizeMessage(
  accountId: string,
  raw: unknown,
  provider: MessagingProvider,
  providerEventType?: string | null,
): Promise<NormalizedMessage> {
  const item = record(raw);
  const sender = record(item.sender);
  const externalMessageId = firstString(
    item.id,
    item.message_id,
    item.provider_message_id,
  );
  const sentAt =
    asDate(item.timestamp, item.sent_at, item.created_at, item.date) ??
    new Date();
  const isSender =
    item.is_sender === true ||
    item.is_from_me === true ||
    item.direction === "outbound";
  const body = record(item.body);
  const bodyText = normalizeText(
    firstString(
      item.text,
      item.body_text,
      body.text,
      typeof item.body === "string" ? item.body : null,
    ),
  );
  const bodyHtml = normalizeText(
    firstString(item.html, item.body_html, body.html),
  );
  const deleted =
    item.is_deleted === true ||
    item.deleted === true ||
    providerEventType?.endsWith("deleted") === true ||
    providerEventType?.endsWith("delete") === true;
  const edited = item.is_edited === true || item.edited === true;
  const deliveryStatus = deleted
    ? "deleted"
    : isSender && (item.is_seen === true || item.is_read === true)
      ? "read"
      : isSender && item.is_delivered === true
        ? "delivered"
        : isSender
          ? "sent"
          : "delivered";
  return {
    externalMessageId,
    externalMessageFingerprint: await messageFingerprint(accountId, item),
    providerEventType: providerEventType ?? null,
    direction: isSender ? "outbound" : "inbound",
    senderParticipantId: firstString(
      item.sender_id,
      item.sender_provider_id,
      sender.id,
      sender.provider_id,
    ),
    recipients: {
      to: item.to ?? item.recipients ?? item.attendees ?? null,
      cc: item.cc ?? null,
      bcc: item.bcc ?? null,
    },
    bodyText,
    bodyHtml,
    preview: previewText(bodyText ?? bodyHtml),
    sentAt,
    deliveryStatus,
    failureCode: firstString(item.failure_code, item.error_code),
    failureMessage: firstString(item.failure_message, item.error_message),
    replyToExternalId: firstString(
      item.reply_to_id,
      item.reply_to_message_id,
      item.in_reply_to,
    ),
    editedAt: edited
      ? (asDate(item.updated_at, item.edited_at) ?? new Date())
      : null,
    deletedAt: deleted ? (asDate(item.deleted_at) ?? new Date()) : null,
    providerMetadata: { ...item, provider },
    attachments: attachmentsFromRaw(item),
  };
}

export function participantFromMessage(
  raw: unknown,
  provider: MessagingProvider,
): NormalizedParticipant | null {
  const item = record(raw);
  return participantFromRaw(
    item.sender ?? item.from ?? item,
    provider,
    item.is_sender === true,
  );
}

export function threadIdFromProviderPayload(raw: unknown): string | null {
  const item = record(raw);
  return firstString(
    item.chat_id,
    item.thread_id,
    item.conversation_id,
    record(item.chat).id,
  );
}
