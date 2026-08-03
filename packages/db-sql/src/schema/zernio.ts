import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./user.js";

/**
 * Zernio profiles - Maps Plucia organizations to Zernio profiles
 * One profile per organization (user in single-tenant mode)
 */
export const zernioProfiles = pgTable(
  "zernio_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    zernioProfileId: text("zernio_profile_id").notNull().unique(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_zernio_profiles_org").on(table.organizationId),
    uniqueIndex("idx_zernio_profiles_zernio_id").on(table.zernioProfileId),
  ],
);

/**
 * Zernio accounts - Connected social accounts (WhatsApp, LinkedIn, etc.)
 * Stored separately from channel_connections for Zernio-specific metadata
 */
export const zernioAccounts = pgTable(
  "zernio_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    zernioAccountId: text("zernio_account_id").notNull().unique(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => zernioProfiles.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // 'whatsapp', 'linkedin', 'instagram', etc.
    platformAccountId: text("platform_account_id"), // Phone number, LinkedIn ID, etc.
    displayName: text("display_name"),
    status: text("status").notNull().default("active"), // 'active', 'disconnected', 'error'
    metadata: jsonb("metadata"), // Platform-specific data
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_zernio_accounts_org").on(table.organizationId),
    index("idx_zernio_accounts_platform").on(table.platform),
    index("idx_zernio_accounts_status").on(table.status),
  ],
);

/**
 * Zernio webhook events - Deduplication and audit trail
 */
export const zernioWebhooks = pgTable(
  "zernio_webhooks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: text("event_id").notNull().unique(), // Zernio's payload.id
    eventType: text("event_type").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    processed: boolean("processed").notNull().default(false),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_zernio_webhooks_event_id").on(table.eventId),
    index("idx_zernio_webhooks_org").on(table.organizationId),
    index("idx_zernio_webhooks_processed").on(table.processed),
  ],
);

/**
 * Relations
 */
export const zernioProfilesRelations = relations(
  zernioProfiles,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [zernioProfiles.organizationId],
      references: [organizations.id],
    }),
    accounts: many(zernioAccounts),
  }),
);

export const zernioAccountsRelations = relations(zernioAccounts, ({ one }) => ({
  organization: one(organizations, {
    fields: [zernioAccounts.organizationId],
    references: [organizations.id],
  }),
  profile: one(zernioProfiles, {
    fields: [zernioAccounts.profileId],
    references: [zernioProfiles.id],
  }),
}));

export const zernioWebhooksRelations = relations(zernioWebhooks, ({ one }) => ({
  organization: one(organizations, {
    fields: [zernioWebhooks.organizationId],
    references: [organizations.id],
  }),
}));

/**
 * Type exports
 */
export type ZernioProfile = typeof zernioProfiles.$inferSelect;
export type NewZernioProfile = typeof zernioProfiles.$inferInsert;
export type ZernioAccount = typeof zernioAccounts.$inferSelect;
export type NewZernioAccount = typeof zernioAccounts.$inferInsert;
export type ZernioWebhook = typeof zernioWebhooks.$inferSelect;
export type NewZernioWebhook = typeof zernioWebhooks.$inferInsert;
