import {
  getDb,
  messagingAttachments,
  messagingAiArtifacts,
  messagingAuditEvents,
  messagingConnectedAccounts,
  messagingConnectionStates,
  messagingContactIdentifiers,
  messagingInboundEvents,
  messagingLabels,
  messagingMessages,
  messagingOutboxEvents,
  messagingParticipants,
  messagingThreadAssignments,
  messagingThreadLabels,
  messagingThreadReadStates,
  messagingThreads,
} from "@repo/db-sql";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { AppError } from "../lib/errors.js";
import {
  accountVisibilityPredicate,
  canReadAssignedThread,
  isOrganizationManager,
  type MessagingAuthContext,
} from "./authorization.js";
import type {
  NormalizedAccount,
  NormalizedMessage,
  NormalizedParticipant,
  NormalizedThread,
  MessagingProvider,
} from "./contracts.js";

export type ThreadListFilters = {
  accountId?: string;
  provider?: MessagingProvider;
  state?: "all" | "inbox" | "archive" | "spam" | "trash";
  unread?: boolean;
  assignedUserId?: string;
  labelId?: string;
  contactId?: string;
  leadId?: string;
  search?: string;
  cursor?: { activityAt: Date; id: string };
  limit: number;
};

const activityAt = sql<Date>`coalesce(${messagingThreads.latestActivityAt}, ${messagingThreads.createdAt})`;

function accountAccessWhere(auth: MessagingAuthContext) {
  return accountVisibilityPredicate(auth);
}

export async function findMessagingAccount(
  organizationId: string,
  accountId: string,
) {
  const [account] = await getDb()
    .select()
    .from(messagingConnectedAccounts)
    .where(
      and(
        eq(messagingConnectedAccounts.organizationId, organizationId),
        eq(messagingConnectedAccounts.id, accountId),
      ),
    )
    .limit(1);
  return account ?? null;
}

export async function findMessagingAccountByUnipileId(
  unipileAccountId: string,
) {
  const [account] = await getDb()
    .select()
    .from(messagingConnectedAccounts)
    .where(eq(messagingConnectedAccounts.unipileAccountId, unipileAccountId))
    .limit(1);
  return account ?? null;
}

export async function listMessagingAccounts(auth: MessagingAuthContext) {
  return getDb()
    .select()
    .from(messagingConnectedAccounts)
    .where(accountAccessWhere(auth))
    .orderBy(
      desc(messagingConnectedAccounts.updatedAt),
      desc(messagingConnectedAccounts.id),
    );
}

export async function countMessagingThreadsForAccount(
  organizationId: string,
  accountId: string,
): Promise<number> {
  const [result] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(messagingThreads)
    .where(
      and(
        eq(messagingThreads.organizationId, organizationId),
        eq(messagingThreads.connectedAccountId, accountId),
      ),
    );
  return result?.count ?? 0;
}

export async function insertOrUpdateMessagingAccount(input: {
  organizationId: string;
  createdByUserId: string;
  normalized: NormalizedAccount;
  existingId?: string;
}) {
  const values = {
    organizationId: input.organizationId,
    createdByUserId: input.createdByUserId,
    unipileAccountId: input.normalized.unipileAccountId,
    provider: input.normalized.provider,
    providerAccountType: input.normalized.providerAccountType,
    displayName: input.normalized.displayName,
    username: input.normalized.username,
    emailAddress: input.normalized.emailAddress,
    phoneNumber: input.normalized.phoneNumber,
    status: input.normalized.status,
    enabled: true,
    providerMetadata: input.normalized.providerMetadata,
    updatedAt: new Date(),
  };
  const [row] = await getDb()
    .insert(messagingConnectedAccounts)
    .values(values)
    .onConflictDoUpdate({
      target: messagingConnectedAccounts.unipileAccountId,
      set: {
        provider: values.provider,
        providerAccountType: values.providerAccountType,
        displayName: values.displayName,
        username: values.username,
        emailAddress: values.emailAddress,
        phoneNumber: values.phoneNumber,
        status: values.status,
        enabled: true,
        providerMetadata: values.providerMetadata,
        updatedAt: values.updatedAt,
      },
    })
    .returning();
  if (!row)
    throw new AppError(
      500,
      "MESSAGING_ACCOUNT_PERSIST_FAILED",
      "Messaging account could not be persisted",
    );
  return row;
}

export async function updateMessagingAccount(
  organizationId: string,
  accountId: string,
  patch: Partial<typeof messagingConnectedAccounts.$inferInsert>,
) {
  const [row] = await getDb()
    .update(messagingConnectedAccounts)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(messagingConnectedAccounts.organizationId, organizationId),
        eq(messagingConnectedAccounts.id, accountId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function createConnectionState(input: {
  nonceHash: string;
  organizationId: string;
  userId: string;
  requestedChannel: string;
  returnPath: string;
  expiresAt: Date;
}) {
  const [row] = await getDb()
    .insert(messagingConnectionStates)
    .values(input)
    .returning();
  if (!row)
    throw new AppError(
      500,
      "MESSAGING_CONNECTION_STATE_FAILED",
      "Connection state could not be persisted",
    );
  return row;
}

/**
 * Unipile error callbacks do not include the hosted-auth state. Correlate
 * those callbacks with the most recent live connection attempt for this
 * authenticated user instead of accepting an arbitrary account id.
 */
export async function findPendingConnectionState(input: {
  organizationId: string;
  userId: string;
}) {
  const [row] = await getDb()
    .select()
    .from(messagingConnectionStates)
    .where(
      and(
        eq(messagingConnectionStates.organizationId, input.organizationId),
        eq(messagingConnectionStates.userId, input.userId),
        isNull(messagingConnectionStates.consumedAt),
        gt(messagingConnectionStates.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(messagingConnectionStates.createdAt))
    .limit(1);
  return row ?? null;
}

export async function consumeConnectionState(input: {
  organizationId: string;
  userId: string;
  nonceHash: string;
}) {
  const [row] = await getDb()
    .update(messagingConnectionStates)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(messagingConnectionStates.organizationId, input.organizationId),
        eq(messagingConnectionStates.userId, input.userId),
        eq(messagingConnectionStates.nonceHash, input.nonceHash),
        isNull(messagingConnectionStates.consumedAt),
        gt(messagingConnectionStates.expiresAt, new Date()),
      ),
    )
    .returning();
  return row ?? null;
}

export async function upsertThread(
  organizationId: string,
  connectedAccountId: string,
  provider: MessagingProvider,
  normalized: NormalizedThread,
) {
  const activity = normalized.latestActivityAt;
  const lastMessage = normalized.lastMessageAt;
  const isNewerActivity = activity
    ? sql`(${messagingThreads.latestActivityAt} is null or ${messagingThreads.latestActivityAt} <= ${activity})`
    : undefined;
  const [row] = await getDb()
    .insert(messagingThreads)
    .values({
      organizationId,
      connectedAccountId,
      provider,
      externalThreadId: normalized.externalThreadId,
      externalThreadAltId: normalized.externalThreadAltId,
      subject: normalized.subject,
      title: normalized.title,
      preview: normalized.preview,
      latestActivityAt: activity,
      lastMessageAt: lastMessage,
      unreadCount: normalized.unreadCount,
      state: normalized.state,
      providerMetadata: normalized.providerMetadata,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        messagingThreads.connectedAccountId,
        messagingThreads.externalThreadId,
      ],
      set: {
        externalThreadAltId: normalized.externalThreadAltId,
        subject: normalized.subject,
        title: normalized.title,
        preview: isNewerActivity
          ? sql`case when ${isNewerActivity} then ${normalized.preview} else ${messagingThreads.preview} end`
          : undefined,
        latestActivityAt: activity
          ? sql`greatest(coalesce(${messagingThreads.latestActivityAt}, to_timestamp(0)), ${activity})`
          : undefined,
        lastMessageAt: lastMessage
          ? sql`greatest(coalesce(${messagingThreads.lastMessageAt}, to_timestamp(0)), ${lastMessage})`
          : undefined,
        providerMetadata: normalized.providerMetadata,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row)
    throw new AppError(
      500,
      "MESSAGING_THREAD_PERSIST_FAILED",
      "Messaging thread could not be persisted",
    );
  return row;
}

export async function findThreadByExternalId(
  organizationId: string,
  connectedAccountId: string,
  externalThreadId: string,
) {
  const [row] = await getDb()
    .select()
    .from(messagingThreads)
    .where(
      and(
        eq(messagingThreads.organizationId, organizationId),
        eq(messagingThreads.connectedAccountId, connectedAccountId),
        eq(messagingThreads.externalThreadId, externalThreadId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findMessagingThread(
  organizationId: string,
  threadId: string,
) {
  const [row] = await getDb()
    .select()
    .from(messagingThreads)
    .where(
      and(
        eq(messagingThreads.organizationId, organizationId),
        eq(messagingThreads.id, threadId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function updateThreadExternalId(
  organizationId: string,
  threadId: string,
  externalThreadId: string,
) {
  const [row] = await getDb()
    .update(messagingThreads)
    .set({ externalThreadId, updatedAt: new Date() })
    .where(
      and(
        eq(messagingThreads.organizationId, organizationId),
        eq(messagingThreads.id, threadId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function upsertParticipant(
  organizationId: string,
  threadId: string,
  provider: MessagingProvider,
  participant: NormalizedParticipant,
) {
  const [row] = await getDb()
    .insert(messagingParticipants)
    .values({
      organizationId,
      threadId,
      provider,
      providerParticipantId: participant.providerParticipantId,
      normalizedName: participant.normalizedName,
      avatarUrl: participant.avatarUrl,
      profileUrl: participant.profileUrl,
      emailAddress: participant.emailAddress,
      phoneNumber: participant.phoneNumber,
      linkedinPublicIdentifier: participant.linkedinPublicIdentifier,
      instagramIdentifier: participant.instagramIdentifier,
      telegramIdentifier: participant.telegramIdentifier,
      role: participant.role,
      isSelf: participant.isSelf,
      providerMetadata: participant.providerMetadata,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        messagingParticipants.threadId,
        messagingParticipants.providerParticipantId,
      ],
      set: {
        normalizedName: participant.normalizedName,
        avatarUrl: participant.avatarUrl,
        profileUrl: participant.profileUrl,
        emailAddress: participant.emailAddress,
        phoneNumber: participant.phoneNumber,
        linkedinPublicIdentifier: participant.linkedinPublicIdentifier,
        instagramIdentifier: participant.instagramIdentifier,
        telegramIdentifier: participant.telegramIdentifier,
        role: participant.role,
        isSelf: participant.isSelf,
        providerMetadata: participant.providerMetadata,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function upsertContactIdentifier(input: {
  organizationId: string;
  contactId?: string | null;
  leadId?: string | null;
  provider: MessagingProvider;
  identifierType: string;
  normalizedValue: string;
  providerParticipantId?: string | null;
  displayName?: string | null;
  profileUrl?: string | null;
}) {
  const [row] = await getDb()
    .insert(messagingContactIdentifiers)
    .values(input)
    .onConflictDoUpdate({
      target: [
        messagingContactIdentifiers.organizationId,
        messagingContactIdentifiers.provider,
        messagingContactIdentifiers.identifierType,
        messagingContactIdentifiers.normalizedValue,
      ],
      set: {
        providerParticipantId: input.providerParticipantId ?? null,
        displayName: input.displayName ?? null,
        profileUrl: input.profileUrl ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row ?? null;
}

export async function findContactIdentifier(input: {
  organizationId: string;
  provider: MessagingProvider;
  identifierType: string;
  normalizedValue: string;
}) {
  const [row] = await getDb()
    .select()
    .from(messagingContactIdentifiers)
    .where(
      and(
        eq(messagingContactIdentifiers.organizationId, input.organizationId),
        eq(messagingContactIdentifiers.provider, input.provider),
        eq(messagingContactIdentifiers.identifierType, input.identifierType),
        eq(messagingContactIdentifiers.normalizedValue, input.normalizedValue),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function associateThreadToContact(input: {
  organizationId: string;
  threadId: string;
  contactId?: string | null;
  leadId?: string | null;
}) {
  const [row] = await getDb()
    .update(messagingThreads)
    .set({
      contactId: input.contactId ?? null,
      leadId: input.leadId ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(messagingThreads.organizationId, input.organizationId),
        eq(messagingThreads.id, input.threadId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function findMessageByExternalId(
  connectedAccountId: string,
  externalMessageId: string,
) {
  const [row] = await getDb()
    .select()
    .from(messagingMessages)
    .where(
      and(
        eq(messagingMessages.connectedAccountId, connectedAccountId),
        eq(messagingMessages.externalMessageId, externalMessageId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findMessageByIdempotencyKey(
  organizationId: string,
  key: string,
) {
  const [row] = await getDb()
    .select()
    .from(messagingMessages)
    .where(
      and(
        eq(messagingMessages.organizationId, organizationId),
        eq(messagingMessages.clientIdempotencyKey, key),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertPendingOutboundMessage(input: {
  organizationId: string;
  threadId: string;
  connectedAccountId: string;
  idempotencyKey: string;
  text: string | null;
  html: string | null;
  recipients?: Record<string, unknown>;
  replyToExternalId?: string | null;
  sentAt?: Date;
}) {
  const [row] = await getDb()
    .insert(messagingMessages)
    .values({
      organizationId: input.organizationId,
      threadId: input.threadId,
      connectedAccountId: input.connectedAccountId,
      externalMessageFingerprint: `client:${input.idempotencyKey}`,
      providerEventType: "outbound.pending",
      direction: "outbound",
      recipients: input.recipients ?? {},
      bodyText: input.text,
      bodyHtml: input.html,
      preview:
        input.text ??
        input.html
          ?.replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 280) ??
        null,
      sentAt: input.sentAt ?? new Date(),
      deliveryStatus: "pending",
      replyToExternalId: input.replyToExternalId ?? null,
      clientIdempotencyKey: input.idempotencyKey,
      updatedAt: new Date(),
    })
    // The organization/idempotency index is partial (`WHERE ... IS NOT
    // NULL`). PostgreSQL cannot infer that index from a bare column target and
    // rejects the insert with 42P10 before a message can be sent. Omitting the
    // target lets PostgreSQL use either idempotency unique index safely; the
    // lookup below still returns the original row for an idempotent retry.
    .onConflictDoNothing()
    .returning();
  return (
    row ??
    findMessageByIdempotencyKey(input.organizationId, input.idempotencyKey)
  );
}

export async function updateMessage(
  organizationId: string,
  messageId: string,
  patch: Partial<typeof messagingMessages.$inferInsert>,
) {
  const [row] = await getDb()
    .update(messagingMessages)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(messagingMessages.organizationId, organizationId),
        eq(messagingMessages.id, messageId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function insertOrUpdateInboundMessage(input: {
  organizationId: string;
  threadId: string;
  connectedAccountId: string;
  normalized: NormalizedMessage;
}) {
  const existingByExternal = input.normalized.externalMessageId
    ? await findMessageByExternalId(
        input.connectedAccountId,
        input.normalized.externalMessageId,
      )
    : null;
  if (existingByExternal) {
    const preserveDeletedContent =
      input.normalized.deliveryStatus === "deleted" &&
      !input.normalized.bodyText &&
      !input.normalized.bodyHtml;
    const updatePatch: Partial<typeof messagingMessages.$inferInsert> = {
      threadId: input.threadId,
      externalMessageId: input.normalized.externalMessageId,
      providerEventType: input.normalized.providerEventType,
      direction: input.normalized.direction,
      senderParticipantId: input.normalized.senderParticipantId,
      recipients: input.normalized.recipients,
      bodyText: input.normalized.bodyText,
      bodyHtml: input.normalized.bodyHtml,
      preview: input.normalized.preview,
      sentAt: input.normalized.sentAt,
      deliveryStatus: input.normalized.deliveryStatus,
      failureCode: input.normalized.failureCode,
      failureMessage: input.normalized.failureMessage,
      replyToExternalId: input.normalized.replyToExternalId,
      editedAt: input.normalized.editedAt,
      deletedAt: input.normalized.deletedAt,
      providerMetadata: input.normalized.providerMetadata,
    };
    if (preserveDeletedContent) {
      delete updatePatch.bodyText;
      delete updatePatch.bodyHtml;
      delete updatePatch.preview;
      delete updatePatch.sentAt;
    }
    return {
      row: await updateMessage(
        input.organizationId,
        existingByExternal.id,
        updatePatch,
      ),
      inserted: false,
    };
  }
  const [existingFingerprint] = await getDb()
    .select()
    .from(messagingMessages)
    .where(
      and(
        eq(messagingMessages.connectedAccountId, input.connectedAccountId),
        eq(
          messagingMessages.externalMessageFingerprint,
          input.normalized.externalMessageFingerprint,
        ),
      ),
    )
    .limit(1);
  if (existingFingerprint) return { row: existingFingerprint, inserted: false };
  const [row] = await getDb()
    .insert(messagingMessages)
    .values({
      organizationId: input.organizationId,
      threadId: input.threadId,
      connectedAccountId: input.connectedAccountId,
      externalMessageId: input.normalized.externalMessageId,
      externalMessageFingerprint: input.normalized.externalMessageFingerprint,
      providerEventType: input.normalized.providerEventType,
      direction: input.normalized.direction,
      senderParticipantId: input.normalized.senderParticipantId,
      recipients: input.normalized.recipients,
      bodyText: input.normalized.bodyText,
      bodyHtml: input.normalized.bodyHtml,
      preview: input.normalized.preview,
      sentAt: input.normalized.sentAt,
      deliveryStatus: input.normalized.deliveryStatus,
      failureCode: input.normalized.failureCode,
      failureMessage: input.normalized.failureMessage,
      replyToExternalId: input.normalized.replyToExternalId,
      editedAt: input.normalized.editedAt,
      deletedAt: input.normalized.deletedAt,
      providerMetadata: input.normalized.providerMetadata,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [
        messagingMessages.connectedAccountId,
        messagingMessages.externalMessageFingerprint,
      ],
    })
    .returning();
  if (row) return { row, inserted: true };
  const [raced] = await getDb()
    .select()
    .from(messagingMessages)
    .where(
      and(
        eq(messagingMessages.connectedAccountId, input.connectedAccountId),
        eq(
          messagingMessages.externalMessageFingerprint,
          input.normalized.externalMessageFingerprint,
        ),
      ),
    )
    .limit(1);
  if (!raced)
    throw new AppError(
      500,
      "MESSAGING_MESSAGE_PERSIST_FAILED",
      "Messaging message could not be persisted",
    );
  return { row: raced, inserted: false };
}

export async function updateThreadForMessage(input: {
  organizationId: string;
  threadId: string;
  messageId: string;
  preview: string | null;
  sentAt: Date;
  inbound: boolean;
  unread: boolean;
}) {
  const thread = messagingThreads;
  const isLatest = sql`(
    ${thread.latestActivityAt} is null
    or ${thread.latestActivityAt} < ${input.sentAt}
    or (
      ${thread.latestActivityAt} = ${input.sentAt}
      and (${thread.latestMessageId} is null or ${thread.latestMessageId} < ${input.messageId})
    )
  )`;
  await getDb()
    .update(thread)
    .set({
      latestMessageId: sql`case when ${isLatest} then ${input.messageId} else ${thread.latestMessageId} end`,
      preview: sql`case when ${isLatest} then ${input.preview} else ${thread.preview} end`,
      latestActivityAt: sql`greatest(coalesce(${thread.latestActivityAt}, to_timestamp(0)), ${input.sentAt})`,
      lastMessageAt: sql`greatest(coalesce(${thread.lastMessageAt}, to_timestamp(0)), ${input.sentAt})`,
      unreadCount: input.unread ? sql`${thread.unreadCount} + 1` : undefined,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(thread.organizationId, input.organizationId),
        eq(thread.id, input.threadId),
      ),
    );
}

export async function listThreads(
  auth: MessagingAuthContext,
  filters: ThreadListFilters,
) {
  const conditions = [accountAccessWhere(auth)];
  if (!isOrganizationManager(auth)) {
    conditions.push(
      or(
        and(
          isNull(messagingThreads.assignedUserId),
          isNull(messagingThreads.assignedTeamId),
        ),
        eq(messagingThreads.assignedUserId, auth.userId),
      )!,
    );
  }
  if (filters.accountId)
    conditions.push(eq(messagingThreads.connectedAccountId, filters.accountId));
  if (filters.provider)
    conditions.push(eq(messagingThreads.provider, filters.provider));
  if (filters.state === "inbox")
    conditions.push(eq(messagingThreads.state, "open"));
  if (filters.state === "archive")
    conditions.push(eq(messagingThreads.state, "archived"));
  if (filters.state === "spam")
    conditions.push(eq(messagingThreads.state, "spam"));
  if (filters.state === "trash")
    conditions.push(eq(messagingThreads.state, "trash"));
  if (filters.unread === true)
    conditions.push(gt(messagingThreads.unreadCount, 0));
  if (filters.unread === false)
    conditions.push(eq(messagingThreads.unreadCount, 0));
  if (filters.assignedUserId)
    conditions.push(
      eq(messagingThreads.assignedUserId, filters.assignedUserId),
    );
  if (filters.contactId)
    conditions.push(eq(messagingThreads.contactId, filters.contactId));
  if (filters.leadId)
    conditions.push(eq(messagingThreads.leadId, filters.leadId));
  if (filters.search) {
    const query = `%${filters.search.replace(/[\\%_]/g, "\\$&").slice(0, 120)}%`;
    conditions.push(
      or(
        ilike(messagingThreads.title, query),
        ilike(messagingThreads.subject, query),
        ilike(messagingThreads.preview, query),
      )!,
    );
  }
  if (filters.labelId) {
    conditions.push(
      exists(
        getDb()
          .select({ id: messagingThreadLabels.id })
          .from(messagingThreadLabels)
          .where(
            and(
              eq(messagingThreadLabels.threadId, messagingThreads.id),
              eq(messagingThreadLabels.labelId, filters.labelId),
              eq(messagingThreadLabels.organizationId, auth.organizationId),
            ),
          ),
      ),
    );
  }
  if (filters.cursor) {
    conditions.push(
      sql`(${activityAt} < ${filters.cursor.activityAt} or (${activityAt} = ${filters.cursor.activityAt} and ${messagingThreads.id} < ${filters.cursor.id}))`,
    );
  }
  const rows = await getDb()
    .select({
      thread: messagingThreads,
      account: {
        id: messagingConnectedAccounts.id,
        provider: messagingConnectedAccounts.provider,
        displayName: messagingConnectedAccounts.displayName,
        providerAccountType: messagingConnectedAccounts.providerAccountType,
        status: messagingConnectedAccounts.status,
      },
    })
    .from(messagingThreads)
    .innerJoin(
      messagingConnectedAccounts,
      eq(messagingConnectedAccounts.id, messagingThreads.connectedAccountId),
    )
    .where(and(...conditions))
    .orderBy(desc(activityAt), desc(messagingThreads.id))
    .limit(filters.limit + 1);
  return rows;
}

export async function getThreadWithRelated(
  auth: MessagingAuthContext,
  threadId: string,
) {
  const [row] = await getDb()
    .select({ thread: messagingThreads, account: messagingConnectedAccounts })
    .from(messagingThreads)
    .innerJoin(
      messagingConnectedAccounts,
      eq(messagingConnectedAccounts.id, messagingThreads.connectedAccountId),
    )
    .where(and(eq(messagingThreads.id, threadId), accountAccessWhere(auth)))
    .limit(1);
  if (!row) return null;
  if (!canReadAssignedThread(row.thread, auth)) return null;
  const [participants, labels, assignment, readState] = await Promise.all([
    getDb()
      .select()
      .from(messagingParticipants)
      .where(
        and(
          eq(messagingParticipants.organizationId, auth.organizationId),
          eq(messagingParticipants.threadId, threadId),
        ),
      )
      .orderBy(asc(messagingParticipants.id)),
    getDb()
      .select({ label: messagingLabels })
      .from(messagingThreadLabels)
      .innerJoin(
        messagingLabels,
        eq(messagingLabels.id, messagingThreadLabels.labelId),
      )
      .where(
        and(
          eq(messagingThreadLabels.organizationId, auth.organizationId),
          eq(messagingThreadLabels.threadId, threadId),
        ),
      ),
    getDb()
      .select()
      .from(messagingThreadAssignments)
      .where(
        and(
          eq(messagingThreadAssignments.organizationId, auth.organizationId),
          eq(messagingThreadAssignments.threadId, threadId),
        ),
      )
      .limit(1),
    getDb()
      .select()
      .from(messagingThreadReadStates)
      .where(
        and(
          eq(messagingThreadReadStates.organizationId, auth.organizationId),
          eq(messagingThreadReadStates.threadId, threadId),
          eq(messagingThreadReadStates.userId, auth.userId),
        ),
      )
      .limit(1),
  ]);
  return {
    ...row,
    participants,
    labels: labels.map((item) => item.label),
    assignment: assignment[0] ?? null,
    readState: readState[0] ?? null,
  };
}

export async function listThreadMessages(
  auth: MessagingAuthContext,
  threadId: string,
  options: { cursor?: { sentAt: Date; id: string }; limit: number },
) {
  const thread = await getThreadWithRelated(auth, threadId);
  if (!thread) return null;
  const conditions = [
    eq(messagingMessages.organizationId, auth.organizationId),
    eq(messagingMessages.threadId, threadId),
  ];
  if (options.cursor) {
    conditions.push(
      sql`(${messagingMessages.sentAt} < ${options.cursor.sentAt} or (${messagingMessages.sentAt} = ${options.cursor.sentAt} and ${messagingMessages.id} < ${options.cursor.id}))`,
    );
  }
  const rows = await getDb()
    .select()
    .from(messagingMessages)
    .where(and(...conditions))
    .orderBy(desc(messagingMessages.sentAt), desc(messagingMessages.id))
    .limit(options.limit + 1);
  const attachments = await getDb()
    .select()
    .from(messagingAttachments)
    .where(
      and(
        eq(messagingAttachments.organizationId, auth.organizationId),
        eq(messagingAttachments.threadId, threadId),
        sql`${messagingAttachments.messageId} is not null`,
      ),
    )
    .orderBy(asc(messagingAttachments.createdAt), asc(messagingAttachments.id));
  const attachmentsByMessage = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    if (!attachment.messageId) continue;
    const current = attachmentsByMessage.get(attachment.messageId) ?? [];
    current.push(attachment);
    attachmentsByMessage.set(attachment.messageId, current);
  }
  return {
    thread,
    messages: rows.map((message) => ({
      ...message,
      attachments: attachmentsByMessage.get(message.id) ?? [],
    })),
  };
}

export async function setThreadReadState(input: {
  organizationId: string;
  threadId: string;
  userId: string;
  isRead: boolean;
  lastReadMessageId?: string | null;
}) {
  const now = new Date();
  await getDb()
    .insert(messagingThreadReadStates)
    .values({
      organizationId: input.organizationId,
      threadId: input.threadId,
      userId: input.userId,
      isRead: input.isRead,
      lastReadMessageId: input.lastReadMessageId ?? null,
      readAt: input.isRead ? now : null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        messagingThreadReadStates.threadId,
        messagingThreadReadStates.userId,
      ],
      set: {
        isRead: input.isRead,
        lastReadMessageId: input.lastReadMessageId ?? null,
        readAt: input.isRead ? now : null,
        updatedAt: now,
      },
    });
  await getDb()
    .update(messagingThreads)
    .set({
      unreadCount: input.isRead
        ? 0
        : sql`greatest(${messagingThreads.unreadCount}, 1)`,
      updatedAt: now,
    })
    .where(
      and(
        eq(messagingThreads.organizationId, input.organizationId),
        eq(messagingThreads.id, input.threadId),
      ),
    );
}

export async function setThreadState(
  organizationId: string,
  threadId: string,
  state: "open" | "archived" | "spam" | "trash",
) {
  const [row] = await getDb()
    .update(messagingThreads)
    .set({ state, updatedAt: new Date() })
    .where(
      and(
        eq(messagingThreads.organizationId, organizationId),
        eq(messagingThreads.id, threadId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function assignThread(input: {
  organizationId: string;
  threadId: string;
  assignedUserId: string | null;
  assignedTeamId: string | null;
  assignedByUserId: string;
}) {
  const now = new Date();
  const [thread] = await getDb()
    .update(messagingThreads)
    .set({
      assignedUserId: input.assignedUserId,
      assignedTeamId: input.assignedTeamId,
      updatedAt: now,
    })
    .where(
      and(
        eq(messagingThreads.organizationId, input.organizationId),
        eq(messagingThreads.id, input.threadId),
      ),
    )
    .returning();
  await getDb()
    .insert(messagingThreadAssignments)
    .values({ ...input, updatedAt: now })
    .onConflictDoUpdate({
      target: messagingThreadAssignments.threadId,
      set: {
        assignedUserId: input.assignedUserId,
        assignedTeamId: input.assignedTeamId,
        assignedByUserId: input.assignedByUserId,
        updatedAt: now,
      },
    });
  return thread ?? null;
}

export async function addThreadLabel(input: {
  organizationId: string;
  threadId: string;
  labelId?: string;
  name?: string;
  color?: string | null;
  userId: string;
}) {
  let labelId = input.labelId;
  if (!labelId && input.name) {
    const [label] = await getDb()
      .insert(messagingLabels)
      .values({
        organizationId: input.organizationId,
        name: input.name.trim().slice(0, 80),
        color: input.color ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [messagingLabels.organizationId, messagingLabels.name],
        set: { color: input.color ?? null, updatedAt: new Date() },
      })
      .returning();
    labelId = label?.id;
  }
  if (!labelId)
    throw new AppError(422, "LABEL_REQUIRED", "A label id or name is required");
  const [label] = await getDb()
    .select()
    .from(messagingLabels)
    .where(
      and(
        eq(messagingLabels.organizationId, input.organizationId),
        eq(messagingLabels.id, labelId),
      ),
    )
    .limit(1);
  if (!label) throw new AppError(404, "LABEL_NOT_FOUND", "Label not found");
  await getDb()
    .insert(messagingThreadLabels)
    .values({
      organizationId: input.organizationId,
      threadId: input.threadId,
      labelId,
      appliedByUserId: input.userId,
    })
    .onConflictDoNothing({
      target: [messagingThreadLabels.threadId, messagingThreadLabels.labelId],
    });
  return label;
}

export async function removeThreadLabel(
  organizationId: string,
  threadId: string,
  labelId: string,
) {
  await getDb()
    .delete(messagingThreadLabels)
    .where(
      and(
        eq(messagingThreadLabels.organizationId, organizationId),
        eq(messagingThreadLabels.threadId, threadId),
        eq(messagingThreadLabels.labelId, labelId),
      ),
    );
}

export async function createInboundEvent(input: {
  provider: string;
  eventType: string;
  providerEventId: string | null;
  eventFingerprint: string;
  connectedAccountId: string | null;
  organizationId: string | null;
  payload: Record<string, unknown>;
}) {
  const eventIdentity = input.providerEventId
    ? and(
        eq(messagingInboundEvents.provider, input.provider),
        eq(messagingInboundEvents.providerEventId, input.providerEventId),
      )
    : null;
  if (eventIdentity) {
    const [existingById] = await getDb()
      .select()
      .from(messagingInboundEvents)
      .where(eventIdentity)
      .limit(1);
    if (existingById) return { event: existingById, duplicate: true };
  }
  let inserted: typeof messagingInboundEvents.$inferSelect | undefined;
  try {
    [inserted] = await getDb()
      .insert(messagingInboundEvents)
      .values(input)
      .onConflictDoNothing({
        target: [
          messagingInboundEvents.provider,
          messagingInboundEvents.eventFingerprint,
        ],
      })
      .returning();
  } catch (error) {
    // A concurrent delivery can win the provider-event unique index even
    // when its payload fingerprint differs. Resolve that race below rather
    // than acknowledging a duplicate as a failed webhook.
    if (!eventIdentity) throw error;
  }
  if (inserted) return { event: inserted, duplicate: false };
  const [existing] = await getDb()
    .select()
    .from(messagingInboundEvents)
    .where(
      eventIdentity
        ? or(
            and(
              eq(messagingInboundEvents.provider, input.provider),
              eq(
                messagingInboundEvents.eventFingerprint,
                input.eventFingerprint,
              ),
            ),
            eventIdentity,
          )
        : and(
            eq(messagingInboundEvents.provider, input.provider),
            eq(messagingInboundEvents.eventFingerprint, input.eventFingerprint),
          ),
    )
    .limit(1);
  if (!existing)
    throw new AppError(
      500,
      "INBOUND_EVENT_LEDGER_FAILED",
      "Inbound event could not be recorded",
    );
  return { event: existing, duplicate: true };
}

export async function updateInboundEvent(
  id: string,
  patch: Partial<typeof messagingInboundEvents.$inferInsert>,
) {
  const [row] = await getDb()
    .update(messagingInboundEvents)
    .set(patch)
    .where(eq(messagingInboundEvents.id, id))
    .returning();
  return row ?? null;
}

export async function claimInboundEvent(id: string) {
  const now = new Date();
  const [row] = await getDb()
    .update(messagingInboundEvents)
    .set({
      status: "processing",
      attempts: sql`${messagingInboundEvents.attempts} + 1`,
    })
    .where(
      and(
        eq(messagingInboundEvents.id, id),
        or(
          eq(messagingInboundEvents.status, "pending"),
          eq(messagingInboundEvents.status, "failed"),
        ),
        or(
          isNull(messagingInboundEvents.nextAttemptAt),
          lte(messagingInboundEvents.nextAttemptAt, now),
        ),
      ),
    )
    .returning();
  return row ?? null;
}

export async function getInboundEvent(id: string) {
  const [row] = await getDb()
    .select()
    .from(messagingInboundEvents)
    .where(eq(messagingInboundEvents.id, id))
    .limit(1);
  return row ?? null;
}

export async function createOutboxEvent(input: {
  organizationId: string;
  eventType: string;
  aggregateType: string;
  aggregateId?: string | null;
  payload: Record<string, unknown>;
}) {
  const [row] = await getDb()
    .insert(messagingOutboxEvents)
    .values(input)
    .returning();
  if (!row)
    throw new AppError(
      500,
      "MESSAGING_OUTBOX_FAILED",
      "Realtime event could not be recorded",
    );
  return row;
}

export async function createMessagingAuditEvent(input: {
  organizationId: string;
  userId?: string | null;
  action: string;
  aggregateType: string;
  aggregateId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const [row] = await getDb()
    .insert(messagingAuditEvents)
    .values({
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      action: input.action,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId ?? null,
      metadata: input.metadata ?? {},
    })
    .returning();
  return row ?? null;
}

export async function listPendingOutboxEvents(limit: number) {
  return getDb()
    .select()
    .from(messagingOutboxEvents)
    .where(isNull(messagingOutboxEvents.publishedAt))
    .orderBy(
      asc(messagingOutboxEvents.createdAt),
      asc(messagingOutboxEvents.id),
    )
    .limit(limit);
}

export async function listOutboxEventsSince(
  auth: MessagingAuthContext,
  lastEventId: string | null,
  limit: number,
) {
  const conditions = [
    eq(messagingOutboxEvents.organizationId, auth.organizationId),
  ];
  if (lastEventId) {
    const [last] = await getDb()
      .select({ createdAt: messagingOutboxEvents.createdAt })
      .from(messagingOutboxEvents)
      .where(
        and(
          eq(messagingOutboxEvents.id, lastEventId),
          eq(messagingOutboxEvents.organizationId, auth.organizationId),
        ),
      )
      .limit(1);
    if (last) {
      conditions.push(
        or(
          gt(messagingOutboxEvents.createdAt, last.createdAt),
          and(
            eq(messagingOutboxEvents.createdAt, last.createdAt),
            gt(messagingOutboxEvents.id, lastEventId),
          )!,
        )!,
      );
    }
  }
  return getDb()
    .select()
    .from(messagingOutboxEvents)
    .where(and(...conditions))
    .orderBy(
      asc(messagingOutboxEvents.createdAt),
      asc(messagingOutboxEvents.id),
    )
    .limit(limit);
}

export async function markOutboxPublished(id: string) {
  await getDb()
    .update(messagingOutboxEvents)
    .set({
      publishedAt: new Date(),
      attempts: sql`${messagingOutboxEvents.attempts} + 1`,
    })
    .where(eq(messagingOutboxEvents.id, id));
}

export async function insertAttachment(
  input: typeof messagingAttachments.$inferInsert,
) {
  const [row] = await getDb()
    .insert(messagingAttachments)
    .values(input)
    .returning();
  return row ?? null;
}

export async function insertInboundAttachment(
  input: typeof messagingAttachments.$inferInsert,
) {
  if (!input.messageId) {
    const attachment = await insertAttachment(input);
    return { attachment, inserted: Boolean(attachment) };
  }
  const identity = input.providerAttachmentId
    ? and(
        eq(messagingAttachments.organizationId, input.organizationId),
        eq(messagingAttachments.messageId, input.messageId),
        eq(
          messagingAttachments.providerAttachmentId,
          input.providerAttachmentId,
        ),
      )
    : and(
        eq(messagingAttachments.organizationId, input.organizationId),
        eq(messagingAttachments.messageId, input.messageId),
        eq(messagingAttachments.filename, input.filename),
        eq(messagingAttachments.sizeBytes, input.sizeBytes),
        input.providerUrl
          ? eq(messagingAttachments.providerUrl, input.providerUrl)
          : isNull(messagingAttachments.providerUrl),
      );
  const [existing] = await getDb()
    .select()
    .from(messagingAttachments)
    .where(identity)
    .limit(1);
  if (existing) return { attachment: existing, inserted: false };
  const inserted = await insertAttachment(input);
  return { attachment: inserted, inserted: Boolean(inserted) };
}

export async function getAuthorizedAttachment(
  organizationId: string,
  id: string,
) {
  const [row] = await getDb()
    .select()
    .from(messagingAttachments)
    .where(
      and(
        eq(messagingAttachments.organizationId, organizationId),
        eq(messagingAttachments.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getAttachmentForCreator(
  organizationId: string,
  userId: string,
  id: string,
) {
  const [row] = await getDb()
    .select()
    .from(messagingAttachments)
    .where(
      and(
        eq(messagingAttachments.organizationId, organizationId),
        eq(messagingAttachments.createdByUserId, userId),
        eq(messagingAttachments.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function updateAttachment(
  organizationId: string,
  id: string,
  patch: Partial<typeof messagingAttachments.$inferInsert>,
) {
  const [row] = await getDb()
    .update(messagingAttachments)
    .set(patch)
    .where(
      and(
        eq(messagingAttachments.organizationId, organizationId),
        eq(messagingAttachments.id, id),
      ),
    )
    .returning();
  return row ?? null;
}

export async function attachAttachmentsToMessage(input: {
  organizationId: string;
  threadId: string;
  messageId: string;
  attachmentIds: string[];
}) {
  if (input.attachmentIds.length === 0) return;
  await getDb()
    .update(messagingAttachments)
    .set({ messageId: input.messageId, threadId: input.threadId })
    .where(
      and(
        eq(messagingAttachments.organizationId, input.organizationId),
        inArray(messagingAttachments.id, input.attachmentIds),
      ),
    );
}

export async function getAttachmentWithMessage(
  organizationId: string,
  id: string,
) {
  const [row] = await getDb()
    .select({
      attachment: messagingAttachments,
      message: messagingMessages,
      thread: messagingThreads,
      account: messagingConnectedAccounts,
    })
    .from(messagingAttachments)
    .leftJoin(
      messagingMessages,
      eq(messagingMessages.id, messagingAttachments.messageId),
    )
    .leftJoin(
      messagingThreads,
      or(
        eq(messagingThreads.id, messagingMessages.threadId),
        eq(messagingThreads.id, messagingAttachments.threadId),
      ),
    )
    .leftJoin(
      messagingConnectedAccounts,
      eq(messagingConnectedAccounts.id, messagingThreads.connectedAccountId),
    )
    .where(
      and(
        eq(messagingAttachments.organizationId, organizationId),
        eq(messagingAttachments.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getMessageInOrganization(
  organizationId: string,
  id: string,
) {
  const [row] = await getDb()
    .select()
    .from(messagingMessages)
    .where(
      and(
        eq(messagingMessages.organizationId, organizationId),
        eq(messagingMessages.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listMessageAttachments(
  organizationId: string,
  messageId: string,
) {
  return getDb()
    .select()
    .from(messagingAttachments)
    .where(
      and(
        eq(messagingAttachments.organizationId, organizationId),
        eq(messagingAttachments.messageId, messageId),
      ),
    )
    .orderBy(asc(messagingAttachments.createdAt), asc(messagingAttachments.id));
}

export async function createAiArtifact(input: {
  organizationId: string;
  threadId: string;
  artifactType:
    | "summary"
    | "classification"
    | "entities"
    | "reply_draft"
    | "next_action";
  content?: Record<string, unknown>;
  status?: "pending" | "running" | "ready" | "failed" | "dismissed";
  modelProvider?: string | null;
  modelName?: string | null;
  policyVersion?: string | null;
}) {
  const [latest] = await getDb()
    .select({ version: messagingAiArtifacts.version })
    .from(messagingAiArtifacts)
    .where(
      and(
        eq(messagingAiArtifacts.organizationId, input.organizationId),
        eq(messagingAiArtifacts.threadId, input.threadId),
        eq(messagingAiArtifacts.artifactType, input.artifactType),
      ),
    )
    .orderBy(desc(messagingAiArtifacts.version))
    .limit(1);
  const [row] = await getDb()
    .insert(messagingAiArtifacts)
    .values({
      organizationId: input.organizationId,
      threadId: input.threadId,
      artifactType: input.artifactType,
      version: (latest?.version ?? 0) + 1,
      status: input.status ?? "pending",
      content: input.content ?? {},
      modelProvider: input.modelProvider ?? null,
      modelName: input.modelName ?? null,
      policyVersion: input.policyVersion ?? null,
    })
    .returning();
  if (!row)
    throw new AppError(
      500,
      "AI_ARTIFACT_PERSIST_FAILED",
      "AI artifact could not be persisted",
    );
  return row;
}

export async function listAiArtifacts(
  organizationId: string,
  threadId: string,
) {
  return getDb()
    .select()
    .from(messagingAiArtifacts)
    .where(
      and(
        eq(messagingAiArtifacts.organizationId, organizationId),
        eq(messagingAiArtifacts.threadId, threadId),
      ),
    )
    .orderBy(
      desc(messagingAiArtifacts.createdAt),
      desc(messagingAiArtifacts.version),
    );
}

export async function updateAiArtifact(
  organizationId: string,
  artifactId: string,
  patch: Partial<typeof messagingAiArtifacts.$inferInsert>,
) {
  const [row] = await getDb()
    .update(messagingAiArtifacts)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(messagingAiArtifacts.organizationId, organizationId),
        eq(messagingAiArtifacts.id, artifactId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function getAiArtifact(
  organizationId: string,
  artifactId: string,
) {
  const [row] = await getDb()
    .select()
    .from(messagingAiArtifacts)
    .where(
      and(
        eq(messagingAiArtifacts.organizationId, organizationId),
        eq(messagingAiArtifacts.id, artifactId),
      ),
    )
    .limit(1);
  return row ?? null;
}
