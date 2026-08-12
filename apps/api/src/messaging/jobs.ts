import { getDb, messagingJobs } from "@repo/db-sql";
import { and, eq, lte, or, sql } from "drizzle-orm";

export type MessagingJobKind =
  | "account_backfill"
  | "account_resync"
  | "webhook_retry"
  | "outbox_publish"
  | "outbound_reconcile"
  | "attachment_process"
  | "ai_summary"
  | "ai_classification"
  | "ai_entities"
  | "ai_reply_draft"
  | "ai_next_action";

export async function enqueueMessagingJob(input: {
  jobKey: string;
  organizationId?: string | null;
  kind: MessagingJobKind;
  payload: Record<string, unknown>;
  nextAttemptAt?: Date;
  maxAttempts?: number;
}) {
  const [inserted] = await getDb()
    .insert(messagingJobs)
    .values({
      jobKey: input.jobKey,
      organizationId: input.organizationId ?? null,
      kind: input.kind,
      payload: input.payload,
      nextAttemptAt: input.nextAttemptAt ?? new Date(),
      maxAttempts: input.maxAttempts ?? 8,
    })
    .onConflictDoNothing({ target: messagingJobs.jobKey })
    .returning();
  if (inserted) return inserted;
  const [existing] = await getDb()
    .select()
    .from(messagingJobs)
    .where(eq(messagingJobs.jobKey, input.jobKey))
    .limit(1);
  return existing ?? null;
}

export async function claimMessagingJob() {
  const now = new Date();
  const stale = new Date(now.getTime() - 5 * 60_000);
  const [candidate] = await getDb()
    .select()
    .from(messagingJobs)
    .where(
      and(
        or(
          eq(messagingJobs.status, "pending"),
          and(
            eq(messagingJobs.status, "running"),
            lte(messagingJobs.startedAt, stale),
          ),
        ),
        lte(messagingJobs.nextAttemptAt, now),
      ),
    )
    .orderBy(messagingJobs.nextAttemptAt, messagingJobs.createdAt)
    .limit(1);
  if (!candidate) return null;
  const [claimed] = await getDb()
    .update(messagingJobs)
    .set({
      status: "running",
      attempts: sql`${messagingJobs.attempts} + 1`,
      startedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(messagingJobs.id, candidate.id),
        or(
          eq(messagingJobs.status, "pending"),
          and(
            eq(messagingJobs.status, "running"),
            lte(messagingJobs.startedAt, stale),
          ),
        ),
      ),
    )
    .returning();
  return claimed ?? null;
}

export async function completeMessagingJob(id: string) {
  await getDb()
    .update(messagingJobs)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(messagingJobs.id, id));
}

export async function failMessagingJob(input: {
  id: string;
  attempts: number;
  maxAttempts: number;
  code: string;
  message: string;
}) {
  const deadLetter = input.attempts >= input.maxAttempts;
  const nextAttemptAt = new Date(
    Date.now() +
      Math.min(60 * 60_000, 2 ** Math.min(input.attempts, 10) * 1000),
  );
  await getDb()
    .update(messagingJobs)
    .set({
      status: deadLetter ? "dead_letter" : "pending",
      nextAttemptAt,
      lastErrorCode: input.code,
      lastErrorMessage: input.message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(messagingJobs.id, input.id));
}
