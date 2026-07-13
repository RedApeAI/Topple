import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./user.js";

export const orchestratorEventStatusEnum = pgEnum("orchestrator_event_status", [
  "pending",
  "processing",
  "delivered",
  "failed",
]);

/** Transactional outbox for safely forwarding work to the AI operator. */
export const orchestratorEvents = pgTable(
  "orchestrator_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: orchestratorEventStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_orchestrator_events_pending")
      .on(table.createdAt)
      .where(sql`${table.status} = 'pending'`),
  ],
);
