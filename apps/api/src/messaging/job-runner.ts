import type { AppBindings } from "../types.js";
import { AppError } from "../lib/errors.js";
import {
  claimMessagingJob,
  completeMessagingJob,
  failMessagingJob,
} from "./jobs.js";
import { listPendingOutboxEvents, markOutboxPublished } from "./repository.js";
import {
  processMessagingAttachmentJob,
  processMessagingInboundEvent,
  reconcileMessagingMessage,
  syncMessagingAccount,
} from "./service.js";
import { processAiArtifactJob, type AiArtifactType } from "./ai.js";

/**
 * Bounded, idempotent job drain for the Worker scheduled handler. Requests may
 * also invoke it through waitUntil, but the scheduler is the durable safety
 * net for webhook retries and paged backfills.
 */
export async function processMessagingJobs(
  bindings?: AppBindings,
  limit = 5,
): Promise<number> {
  let processed = 0;
  for (let index = 0; index < limit; index += 1) {
    const job = await claimMessagingJob();
    if (!job) break;
    try {
      const accountId =
        typeof job.payload.accountId === "string"
          ? job.payload.accountId
          : null;
      switch (job.kind) {
        case "account_backfill":
        case "account_resync":
          if (!accountId || !job.organizationId)
            throw new AppError(
              422,
              "MESSAGING_JOB_PAYLOAD_INVALID",
              "Account sync job is missing its account scope",
            );
          await syncMessagingAccount({
            organizationId: job.organizationId,
            accountId,
            bindings,
          });
          break;
        case "webhook_retry": {
          const eventId =
            typeof job.payload.eventId === "string"
              ? job.payload.eventId
              : null;
          if (!eventId)
            throw new AppError(
              422,
              "MESSAGING_JOB_PAYLOAD_INVALID",
              "Webhook retry job is missing its event id",
            );
          await processMessagingInboundEvent({ eventId, bindings });
          break;
        }
        case "outbox_publish": {
          const events = await listPendingOutboxEvents(100);
          await Promise.all(
            events.map((event) => markOutboxPublished(event.id)),
          );
          break;
        }
        case "outbound_reconcile": {
          const messageId =
            typeof job.payload.messageId === "string"
              ? job.payload.messageId
              : null;
          if (!job.organizationId || !messageId)
            throw new AppError(
              422,
              "MESSAGING_JOB_PAYLOAD_INVALID",
              "Outbound reconciliation job is missing its message scope",
            );
          await reconcileMessagingMessage({
            bindings,
            messageId,
            auth: {
              organizationId: job.organizationId,
              organizationName: "",
              userId: "system",
              role: "owner",
            },
          });
          break;
        }
        case "attachment_process": {
          const attachmentId =
            typeof job.payload.attachmentId === "string"
              ? job.payload.attachmentId
              : null;
          if (!job.organizationId || !attachmentId)
            throw new AppError(
              422,
              "MESSAGING_JOB_PAYLOAD_INVALID",
              "Attachment job is missing its attachment scope",
            );
          await processMessagingAttachmentJob({
            bindings,
            organizationId: job.organizationId,
            attachmentId,
          });
          break;
        }
        case "ai_summary":
        case "ai_classification":
        case "ai_entities":
        case "ai_reply_draft":
        case "ai_next_action":
          if (
            !job.organizationId ||
            typeof job.payload.artifactId !== "string" ||
            typeof job.payload.threadId !== "string" ||
            typeof job.payload.artifactType !== "string"
          ) {
            throw new AppError(
              422,
              "MESSAGING_JOB_PAYLOAD_INVALID",
              "AI job is missing its artifact scope",
            );
          }
          await processAiArtifactJob({
            bindings,
            organizationId: job.organizationId,
            threadId: job.payload.threadId,
            artifactId: job.payload.artifactId,
            artifactType: job.payload.artifactType as AiArtifactType,
          });
          break;
        default:
          throw new AppError(
            422,
            "MESSAGING_JOB_KIND_INVALID",
            "Unknown messaging job kind",
          );
      }
      await completeMessagingJob(job.id);
      processed += 1;
    } catch (error) {
      await failMessagingJob({
        id: job.id,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        code: error instanceof AppError ? error.code : "MESSAGING_JOB_FAILED",
        message:
          error instanceof Error ? error.message : "Messaging job failed",
      });
    }
  }
  return processed;
}
