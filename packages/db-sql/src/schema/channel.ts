import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./user.js";

export const channelTypeEnum = pgEnum("channel_type", [
  "whatsapp",
  "instagram",
  "linkedin",
  "email",
  "voice",
]);

export const channelConnectionStatusEnum = pgEnum("channel_connection_status", [
  "pending",
  "active",
  "error",
  "revoked",
  "disconnected",
]);

/** Tenant-scoped channel metadata. Raw credentials never belong in Postgres. */
export const channelConnections = pgTable(
  "channel_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    channelType: channelTypeEnum("channel_type").notNull(),
    externalAccountId: text("external_account_id"),
    displayName: text("display_name"),
    status: channelConnectionStatusEnum("status").notNull().default("pending"),
    secretReference: text("secret_reference"),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_channel_connections_organization").on(table.organizationId),
    uniqueIndex("uq_channel_connection_per_organization")
      .on(table.organizationId, table.channelType, table.externalAccountId)
      .where(sql`${table.externalAccountId} is not null`),
  ],
);
