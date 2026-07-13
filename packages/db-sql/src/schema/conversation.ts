import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { channelTypeEnum } from "./channel.js";
import { organizations, users } from "./user.js";

export const conversationStatusEnum = pgEnum("conversation_status", [
  "open",
  "closed",
  "archived",
]);

/** Metadata and external history pointers only; never stores message bodies. */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    channel: channelTypeEnum("channel").notNull(),
    externalThreadId: text("external_thread_id").notNull(),
    mongoDocumentId: text("mongo_document_id"),
    s3Key: text("s3_key"),
    status: conversationStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_conversations_org_channel_thread").on(
      table.organizationId,
      table.channel,
      table.externalThreadId,
    ),
    index("idx_conversations_org_updated").on(
      table.organizationId,
      table.updatedAt,
    ),
  ],
);
