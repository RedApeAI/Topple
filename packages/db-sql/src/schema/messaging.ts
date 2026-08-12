import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./user.js";

export const messagingProviderEnum = pgEnum("messaging_provider", [
  "linkedin",
  "whatsapp",
  "instagram",
  "telegram",
  "google",
  "outlook",
  "imap",
]);

export const messagingAccountStatusEnum = pgEnum("messaging_account_status", [
  "connecting",
  "connected",
  "syncing",
  "paused",
  "expired",
  "disconnected",
  "failed",
  "revoked",
]);

export const messagingThreadStateEnum = pgEnum("messaging_thread_state", [
  "open",
  "archived",
  "spam",
  "trash",
]);

export const messagingMessageDirectionEnum = pgEnum(
  "messaging_message_direction",
  ["inbound", "outbound"],
);

export const messagingMessageDeliveryStatusEnum = pgEnum(
  "messaging_message_delivery_status",
  ["pending", "sent", "delivered", "failed", "read", "deleted"],
);

export const messagingInboundEventStatusEnum = pgEnum(
  "messaging_inbound_event_status",
  ["pending", "processing", "processed", "failed", "dead_letter"],
);

export const messagingJobStatusEnum = pgEnum("messaging_job_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "dead_letter",
]);

export const messagingContactMatchStatusEnum = pgEnum(
  "messaging_contact_match_status",
  ["unmatched", "pending_review", "confirmed", "rejected"],
);

export const messagingAiArtifactTypeEnum = pgEnum(
  "messaging_ai_artifact_type",
  ["summary", "classification", "entities", "reply_draft", "next_action"],
);

export const messagingAiArtifactStatusEnum = pgEnum(
  "messaging_ai_artifact_status",
  ["pending", "running", "ready", "failed", "dismissed"],
);

/** A tenant-owned Unipile account. Provider secrets never live here. */
export const messagingConnectedAccounts = pgTable(
  "messaging_connected_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    unipileAccountId: text("unipile_account_id").notNull(),
    provider: messagingProviderEnum("provider").notNull(),
    providerAccountType: text("provider_account_type"),
    displayName: text("display_name"),
    username: text("username"),
    emailAddress: text("email_address"),
    phoneNumber: text("phone_number"),
    status: messagingAccountStatusEnum("status")
      .notNull()
      .default("connecting"),
    enabled: boolean("enabled").notNull().default(true),
    /** Admins can make an account available to the tenant's authorized users. */
    shared: boolean("shared").notNull().default(false),
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at", {
      withTimezone: true,
    }),
    lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    backfillCursor: text("backfill_cursor"),
    backfillProgress: integer("backfill_progress"),
    providerMetadata: jsonb("provider_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_messaging_account_unipile_id").on(table.unipileAccountId),
    index("idx_messaging_accounts_organization").on(table.organizationId),
    index("idx_messaging_accounts_org_provider_status").on(
      table.organizationId,
      table.provider,
      table.status,
    ),
    index("idx_messaging_accounts_org_shared").on(
      table.organizationId,
      table.shared,
    ),
    index("idx_messaging_accounts_sync").on(
      table.status,
      table.lastSuccessfulSyncAt,
    ),
  ],
);

/** One external conversation; contact association does not change this key. */
export const messagingThreads = pgTable(
  "messaging_threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectedAccountId: uuid("connected_account_id")
      .notNull()
      .references(() => messagingConnectedAccounts.id, {
        onDelete: "restrict",
      }),
    provider: messagingProviderEnum("provider").notNull(),
    externalThreadId: text("external_thread_id").notNull(),
    externalThreadAltId: text("external_thread_alt_id"),
    subject: text("subject"),
    title: text("title"),
    preview: text("preview"),
    latestMessageId: uuid("latest_message_id"),
    latestActivityAt: timestamp("latest_activity_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    unreadCount: integer("unread_count").notNull().default(0),
    state: messagingThreadStateEnum("state").notNull().default("open"),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedTeamId: text("assigned_team_id"),
    contactId: text("contact_id"),
    leadId: text("lead_id"),
    providerMetadata: jsonb("provider_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_messaging_thread_account_external").on(
      table.connectedAccountId,
      table.externalThreadId,
    ),
    index("idx_messaging_threads_org_activity").on(
      table.organizationId,
      table.latestActivityAt,
      table.id,
    ),
    index("idx_messaging_threads_org_state_activity").on(
      table.organizationId,
      table.state,
      table.latestActivityAt,
    ),
    index("idx_messaging_threads_account_activity").on(
      table.connectedAccountId,
      table.latestActivityAt,
    ),
    index("idx_messaging_threads_org_unread").on(
      table.organizationId,
      table.unreadCount,
    ),
    index("idx_messaging_threads_org_assignment").on(
      table.organizationId,
      table.assignedUserId,
      table.assignedTeamId,
    ),
    index("idx_messaging_threads_org_contact").on(
      table.organizationId,
      table.contactId,
      table.leadId,
    ),
  ],
);

export const messagingParticipants = pgTable(
  "messaging_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => messagingThreads.id, { onDelete: "cascade" }),
    provider: messagingProviderEnum("provider").notNull(),
    providerParticipantId: text("provider_participant_id").notNull(),
    normalizedName: text("normalized_name"),
    avatarUrl: text("avatar_url"),
    profileUrl: text("profile_url"),
    emailAddress: text("email_address"),
    phoneNumber: text("phone_number"),
    linkedinPublicIdentifier: text("linkedin_public_identifier"),
    instagramIdentifier: text("instagram_identifier"),
    telegramIdentifier: text("telegram_identifier"),
    role: text("role"),
    isSelf: boolean("is_self").notNull().default(false),
    providerMetadata: jsonb("provider_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_messaging_participant_thread_provider_id").on(
      table.threadId,
      table.providerParticipantId,
    ),
    index("idx_messaging_participants_org_provider").on(
      table.organizationId,
      table.provider,
    ),
    index("idx_messaging_participants_thread").on(table.threadId),
  ],
);

export const messagingMessages = pgTable(
  "messaging_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => messagingThreads.id, { onDelete: "cascade" }),
    connectedAccountId: uuid("connected_account_id")
      .notNull()
      .references(() => messagingConnectedAccounts.id, {
        onDelete: "restrict",
      }),
    externalMessageId: text("external_message_id"),
    externalMessageFingerprint: text("external_message_fingerprint").notNull(),
    providerEventType: text("provider_event_type"),
    direction: messagingMessageDirectionEnum("direction").notNull(),
    senderParticipantId: text("sender_participant_id"),
    recipients: jsonb("recipients")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    preview: text("preview"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    localCreatedAt: timestamp("local_created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deliveryStatus: messagingMessageDeliveryStatusEnum("delivery_status")
      .notNull()
      .default("pending"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    replyToExternalId: text("reply_to_external_id"),
    clientIdempotencyKey: text("client_idempotency_key"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    providerMetadata: jsonb("provider_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    rawPayloadReference: text("raw_payload_reference"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_messaging_message_account_fingerprint").on(
      table.connectedAccountId,
      table.externalMessageFingerprint,
    ),
    uniqueIndex("uq_messaging_message_org_idempotency")
      .on(table.organizationId, table.clientIdempotencyKey)
      .where(sql`${table.clientIdempotencyKey} is not null`),
    index("idx_messaging_messages_thread_order").on(
      table.threadId,
      table.sentAt,
      table.id,
    ),
    index("idx_messaging_messages_org_status").on(
      table.organizationId,
      table.deliveryStatus,
      table.sentAt,
    ),
    index("idx_messaging_messages_account_external").on(
      table.connectedAccountId,
      table.externalMessageId,
    ),
  ],
);

export const messagingContactIdentifiers = pgTable(
  "messaging_contact_identifiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: text("contact_id"),
    leadId: text("lead_id"),
    provider: messagingProviderEnum("provider").notNull(),
    identifierType: text("identifier_type").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    providerParticipantId: text("provider_participant_id"),
    displayName: text("display_name"),
    profileUrl: text("profile_url"),
    matchStatus: messagingContactMatchStatusEnum("match_status")
      .notNull()
      .default("unmatched"),
    matchConfidence: integer("match_confidence"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_messaging_identifier_org_provider_value").on(
      table.organizationId,
      table.provider,
      table.identifierType,
      table.normalizedValue,
    ),
    index("idx_messaging_identifiers_contact").on(
      table.organizationId,
      table.contactId,
    ),
    index("idx_messaging_identifiers_lead").on(
      table.organizationId,
      table.leadId,
    ),
    index("idx_messaging_identifiers_provider_participant").on(
      table.organizationId,
      table.provider,
      table.providerParticipantId,
    ),
  ],
);

export const messagingAttachments = pgTable(
  "messaging_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    messageId: uuid("message_id").references(() => messagingMessages.id, {
      onDelete: "cascade",
    }),
    threadId: uuid("thread_id").references(() => messagingThreads.id, {
      onDelete: "cascade",
    }),
    providerAttachmentId: text("provider_attachment_id"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key"),
    providerUrl: text("provider_url"),
    thumbnailMetadata: jsonb("thumbnail_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    downloadStatus: text("download_status").notNull().default("pending"),
    uploadTokenHash: text("upload_token_hash"),
    uploadExpiresAt: timestamp("upload_expires_at", { withTimezone: true }),
    safeDisplayMetadata: jsonb("safe_display_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_messaging_attachment_message_provider")
      .on(table.messageId, table.providerAttachmentId)
      .where(sql`${table.providerAttachmentId} is not null`),
    uniqueIndex("uq_messaging_attachment_upload_token").on(
      table.uploadTokenHash,
    ),
    index("idx_messaging_attachments_org").on(table.organizationId),
    index("idx_messaging_attachments_message").on(table.messageId),
    index("idx_messaging_attachments_thread").on(
      table.organizationId,
      table.threadId,
    ),
    index("idx_messaging_attachments_creator").on(
      table.organizationId,
      table.createdByUserId,
    ),
  ],
);

export const messagingLabels = pgTable(
  "messaging_labels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_messaging_label_org_name").on(
      table.organizationId,
      table.name,
    ),
    index("idx_messaging_labels_org").on(table.organizationId),
  ],
);

export const messagingThreadLabels = pgTable(
  "messaging_thread_labels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => messagingThreads.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => messagingLabels.id, { onDelete: "cascade" }),
    appliedByUserId: uuid("applied_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_messaging_thread_label").on(table.threadId, table.labelId),
    index("idx_messaging_thread_labels_org").on(table.organizationId),
    index("idx_messaging_thread_labels_label").on(table.labelId),
  ],
);

export const messagingThreadAssignments = pgTable(
  "messaging_thread_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => messagingThreads.id, { onDelete: "cascade" }),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedTeamId: text("assigned_team_id"),
    assignedByUserId: uuid("assigned_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_messaging_thread_assignment").on(table.threadId),
    index("idx_messaging_assignments_org_user").on(
      table.organizationId,
      table.assignedUserId,
    ),
  ],
);

export const messagingThreadReadStates = pgTable(
  "messaging_thread_read_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => messagingThreads.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadMessageId: uuid("last_read_message_id"),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_messaging_thread_read_user").on(
      table.threadId,
      table.userId,
    ),
    index("idx_messaging_read_states_org_user").on(
      table.organizationId,
      table.userId,
      table.isRead,
    ),
  ],
);

export const messagingInboundEvents = pgTable(
  "messaging_inbound_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    eventType: text("event_type").notNull(),
    providerEventId: text("provider_event_id"),
    eventFingerprint: text("event_fingerprint").notNull(),
    connectedAccountId: uuid("connected_account_id").references(
      () => messagingConnectedAccounts.id,
      { onDelete: "set null" },
    ),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: messagingInboundEventStatusEnum("status")
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
  },
  (table) => [
    uniqueIndex("uq_messaging_inbound_provider_event")
      .on(table.provider, table.providerEventId)
      .where(sql`${table.providerEventId} is not null`),
    uniqueIndex("uq_messaging_inbound_fingerprint").on(
      table.provider,
      table.eventFingerprint,
    ),
    index("idx_messaging_inbound_pending").on(
      table.status,
      table.nextAttemptAt,
      table.receivedAt,
    ),
    index("idx_messaging_inbound_org").on(
      table.organizationId,
      table.receivedAt,
    ),
  ],
);

export const messagingOutboxEvents = pgTable(
  "messaging_outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id"),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (table) => [
    index("idx_messaging_outbox_pending").on(
      table.publishedAt,
      table.createdAt,
    ),
    index("idx_messaging_outbox_org_created").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const messagingJobs = pgTable(
  "messaging_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobKey: text("job_key").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: messagingJobStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    progress: integer("progress"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_messaging_job_key").on(table.jobKey),
    index("idx_messaging_jobs_ready").on(
      table.status,
      table.nextAttemptAt,
      table.createdAt,
    ),
    index("idx_messaging_jobs_org").on(table.organizationId, table.createdAt),
  ],
);

export const messagingConnectionStates = pgTable(
  "messaging_connection_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nonceHash: text("nonce_hash").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestedChannel: text("requested_channel").notNull(),
    returnPath: text("return_path").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_messaging_connection_nonce").on(table.nonceHash),
    index("idx_messaging_connection_state_expiry").on(
      table.expiresAt,
      table.consumedAt,
    ),
  ],
);

export const messagingAiArtifacts = pgTable(
  "messaging_ai_artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => messagingThreads.id, { onDelete: "cascade" }),
    artifactType: messagingAiArtifactTypeEnum("artifact_type").notNull(),
    version: integer("version").notNull().default(1),
    status: messagingAiArtifactStatusEnum("status")
      .notNull()
      .default("pending"),
    content: jsonb("content")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    modelProvider: text("model_provider"),
    modelName: text("model_name"),
    policyVersion: text("policy_version"),
    confidence: integer("confidence"),
    tokenCount: integer("token_count"),
    costMicros: integer("cost_micros"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_messaging_ai_artifact_version").on(
      table.threadId,
      table.artifactType,
      table.version,
    ),
    index("idx_messaging_ai_artifacts_org_thread").on(
      table.organizationId,
      table.threadId,
      table.artifactType,
    ),
  ],
);

export const messagingAuditEvents = pgTable(
  "messaging_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_messaging_audit_org_created").on(
      table.organizationId,
      table.createdAt,
    ),
    index("idx_messaging_audit_aggregate").on(
      table.aggregateType,
      table.aggregateId,
    ),
  ],
);

export type MessagingConnectedAccount =
  typeof messagingConnectedAccounts.$inferSelect;
export type MessagingThread = typeof messagingThreads.$inferSelect;
export type MessagingMessage = typeof messagingMessages.$inferSelect;
export type MessagingParticipant = typeof messagingParticipants.$inferSelect;
export type MessagingAttachment = typeof messagingAttachments.$inferSelect;
export type MessagingOutboxEvent = typeof messagingOutboxEvents.$inferSelect;
export type MessagingJob = typeof messagingJobs.$inferSelect;
