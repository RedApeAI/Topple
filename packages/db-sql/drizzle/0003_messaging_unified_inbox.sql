DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'messaging_provider'
  ) THEN
    CREATE TYPE "public"."messaging_provider" AS ENUM('linkedin', 'whatsapp', 'instagram', 'telegram', 'google', 'outlook', 'imap');
  END IF;
END
$$;--> statement-breakpoint
ALTER TYPE "public"."messaging_provider" ADD VALUE IF NOT EXISTS 'telegram';--> statement-breakpoint
ALTER TYPE "public"."messaging_provider" ADD VALUE IF NOT EXISTS 'google';--> statement-breakpoint
ALTER TYPE "public"."messaging_provider" ADD VALUE IF NOT EXISTS 'outlook';--> statement-breakpoint
ALTER TYPE "public"."messaging_provider" ADD VALUE IF NOT EXISTS 'imap';--> statement-breakpoint
CREATE TYPE "public"."messaging_account_status" AS ENUM('connecting', 'connected', 'syncing', 'paused', 'expired', 'disconnected', 'failed', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."messaging_thread_state" AS ENUM('open', 'archived', 'spam', 'trash');--> statement-breakpoint
CREATE TYPE "public"."messaging_message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."messaging_message_delivery_status" AS ENUM('pending', 'sent', 'delivered', 'failed', 'read', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."messaging_inbound_event_status" AS ENUM('pending', 'processing', 'processed', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."messaging_job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."messaging_contact_match_status" AS ENUM('unmatched', 'pending_review', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."messaging_ai_artifact_type" AS ENUM('summary', 'classification', 'entities', 'reply_draft', 'next_action');--> statement-breakpoint
CREATE TYPE "public"."messaging_ai_artifact_status" AS ENUM('pending', 'running', 'ready', 'failed', 'dismissed');--> statement-breakpoint
CREATE TABLE "messaging_connected_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"unipile_account_id" text NOT NULL,
	"provider" "messaging_provider" NOT NULL,
	"provider_account_type" text,
	"display_name" text,
	"username" text,
	"email_address" text,
	"phone_number" text,
	"status" "messaging_account_status" DEFAULT 'connecting' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"last_successful_sync_at" timestamp with time zone,
	"last_webhook_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"backfill_cursor" text,
	"backfill_progress" integer,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_messaging_account_unipile_id" UNIQUE("unipile_account_id")
);--> statement-breakpoint
CREATE TABLE "messaging_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connected_account_id" uuid NOT NULL,
	"provider" "messaging_provider" NOT NULL,
	"external_thread_id" text NOT NULL,
	"external_thread_alt_id" text,
	"subject" text,
	"title" text,
	"preview" text,
	"latest_message_id" uuid,
	"latest_activity_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"state" "messaging_thread_state" DEFAULT 'open' NOT NULL,
	"assigned_user_id" uuid,
	"assigned_team_id" text,
	"contact_id" text,
	"lead_id" text,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_messaging_thread_account_external" UNIQUE("connected_account_id", "external_thread_id")
);--> statement-breakpoint
CREATE TABLE "messaging_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"provider" "messaging_provider" NOT NULL,
	"provider_participant_id" text NOT NULL,
	"normalized_name" text,
	"avatar_url" text,
	"profile_url" text,
	"email_address" text,
	"phone_number" text,
	"linkedin_public_identifier" text,
	"instagram_identifier" text,
	"telegram_identifier" text,
	"role" text,
	"is_self" boolean DEFAULT false NOT NULL,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_messaging_participant_thread_provider_id" UNIQUE("thread_id", "provider_participant_id")
);--> statement-breakpoint
CREATE TABLE "messaging_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"connected_account_id" uuid NOT NULL,
	"external_message_id" text,
	"external_message_fingerprint" text NOT NULL,
	"provider_event_type" text,
	"direction" "messaging_message_direction" NOT NULL,
	"sender_participant_id" text,
	"recipients" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"body_text" text,
	"body_html" text,
	"preview" text,
	"sent_at" timestamp with time zone NOT NULL,
	"local_created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivery_status" "messaging_message_delivery_status" DEFAULT 'pending' NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"reply_to_external_id" text,
	"client_idempotency_key" text,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_payload_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "messaging_contact_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" text,
	"lead_id" text,
	"provider" "messaging_provider" NOT NULL,
	"identifier_type" text NOT NULL,
	"normalized_value" text NOT NULL,
	"provider_participant_id" text,
	"display_name" text,
	"profile_url" text,
	"match_status" "messaging_contact_match_status" DEFAULT 'unmatched' NOT NULL,
	"match_confidence" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_messaging_identifier_org_provider_value" UNIQUE("organization_id", "provider", "identifier_type", "normalized_value")
);--> statement-breakpoint
CREATE TABLE "messaging_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"message_id" uuid,
	"thread_id" uuid,
	"provider_attachment_id" text,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text,
	"provider_url" text,
	"thumbnail_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"download_status" text DEFAULT 'pending' NOT NULL,
	"upload_token_hash" text,
	"upload_expires_at" timestamp with time zone,
	"safe_display_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "messaging_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_messaging_label_org_name" UNIQUE("organization_id", "name")
);--> statement-breakpoint
CREATE TABLE "messaging_thread_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"applied_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_messaging_thread_label" UNIQUE("thread_id", "label_id")
);--> statement-breakpoint
CREATE TABLE "messaging_thread_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"assigned_user_id" uuid,
	"assigned_team_id" text,
	"assigned_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_messaging_thread_assignment" UNIQUE("thread_id")
);--> statement-breakpoint
CREATE TABLE "messaging_thread_read_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_message_id" uuid,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_messaging_thread_read_user" UNIQUE("thread_id", "user_id")
);--> statement-breakpoint
CREATE TABLE "messaging_inbound_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"provider_event_id" text,
	"event_fingerprint" text NOT NULL,
	"connected_account_id" uuid,
	"organization_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "messaging_inbound_event_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"error_code" text,
	"error_message" text
);--> statement-breakpoint
CREATE TABLE "messaging_outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);--> statement-breakpoint
CREATE TABLE "messaging_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_key" text NOT NULL,
	"organization_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "messaging_job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"progress" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_messaging_job_key" UNIQUE("job_key")
);--> statement-breakpoint
CREATE TABLE "messaging_connection_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nonce_hash" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"requested_channel" text NOT NULL,
	"return_path" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_messaging_connection_nonce" UNIQUE("nonce_hash")
);--> statement-breakpoint
CREATE TABLE "messaging_ai_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"artifact_type" "messaging_ai_artifact_type" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "messaging_ai_artifact_status" DEFAULT 'pending' NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model_provider" text,
	"model_name" text,
	"policy_version" text,
	"confidence" integer,
	"token_count" integer,
	"cost_micros" integer,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_messaging_ai_artifact_version" UNIQUE("thread_id", "artifact_type", "version")
);--> statement-breakpoint
CREATE TABLE "messaging_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "messaging_connected_accounts" ADD CONSTRAINT "messaging_connected_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_connected_accounts" ADD CONSTRAINT "messaging_connected_accounts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_threads" ADD CONSTRAINT "messaging_threads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_threads" ADD CONSTRAINT "messaging_threads_connected_account_id_messaging_connected_accounts_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."messaging_connected_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_threads" ADD CONSTRAINT "messaging_threads_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD CONSTRAINT "messaging_participants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD CONSTRAINT "messaging_participants_thread_id_messaging_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."messaging_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_thread_id_messaging_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."messaging_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_connected_account_id_messaging_connected_accounts_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."messaging_connected_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_contact_identifiers" ADD CONSTRAINT "messaging_contact_identifiers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_attachments" ADD CONSTRAINT "messaging_attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_attachments" ADD CONSTRAINT "messaging_attachments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_attachments" ADD CONSTRAINT "messaging_attachments_message_id_messaging_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messaging_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_attachments" ADD CONSTRAINT "messaging_attachments_thread_id_messaging_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."messaging_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_labels" ADD CONSTRAINT "messaging_labels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_thread_labels" ADD CONSTRAINT "messaging_thread_labels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_thread_labels" ADD CONSTRAINT "messaging_thread_labels_thread_id_messaging_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."messaging_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_thread_labels" ADD CONSTRAINT "messaging_thread_labels_label_id_messaging_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."messaging_labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_thread_labels" ADD CONSTRAINT "messaging_thread_labels_applied_by_user_id_users_id_fk" FOREIGN KEY ("applied_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_thread_assignments" ADD CONSTRAINT "messaging_thread_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_thread_assignments" ADD CONSTRAINT "messaging_thread_assignments_thread_id_messaging_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."messaging_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_thread_assignments" ADD CONSTRAINT "messaging_thread_assignments_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_thread_assignments" ADD CONSTRAINT "messaging_thread_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_thread_read_states" ADD CONSTRAINT "messaging_thread_read_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_thread_read_states" ADD CONSTRAINT "messaging_thread_read_states_thread_id_messaging_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."messaging_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_thread_read_states" ADD CONSTRAINT "messaging_thread_read_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_inbound_events" ADD CONSTRAINT "messaging_inbound_events_connected_account_id_messaging_connected_accounts_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."messaging_connected_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_inbound_events" ADD CONSTRAINT "messaging_inbound_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_outbox_events" ADD CONSTRAINT "messaging_outbox_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_jobs" ADD CONSTRAINT "messaging_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_connection_states" ADD CONSTRAINT "messaging_connection_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_connection_states" ADD CONSTRAINT "messaging_connection_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_ai_artifacts" ADD CONSTRAINT "messaging_ai_artifacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_ai_artifacts" ADD CONSTRAINT "messaging_ai_artifacts_thread_id_messaging_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."messaging_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_audit_events" ADD CONSTRAINT "messaging_audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_audit_events" ADD CONSTRAINT "messaging_audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_messaging_accounts_organization" ON "messaging_connected_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_messaging_accounts_org_provider_status" ON "messaging_connected_accounts" USING btree ("organization_id", "provider", "status");--> statement-breakpoint
CREATE INDEX "idx_messaging_accounts_org_shared" ON "messaging_connected_accounts" USING btree ("organization_id", "shared");--> statement-breakpoint
CREATE INDEX "idx_messaging_accounts_sync" ON "messaging_connected_accounts" USING btree ("status", "last_successful_sync_at");--> statement-breakpoint
CREATE INDEX "idx_messaging_threads_org_activity" ON "messaging_threads" USING btree ("organization_id", "latest_activity_at", "id");--> statement-breakpoint
CREATE INDEX "idx_messaging_threads_org_state_activity" ON "messaging_threads" USING btree ("organization_id", "state", "latest_activity_at");--> statement-breakpoint
CREATE INDEX "idx_messaging_threads_account_activity" ON "messaging_threads" USING btree ("connected_account_id", "latest_activity_at");--> statement-breakpoint
CREATE INDEX "idx_messaging_threads_org_unread" ON "messaging_threads" USING btree ("organization_id", "unread_count");--> statement-breakpoint
CREATE INDEX "idx_messaging_threads_org_assignment" ON "messaging_threads" USING btree ("organization_id", "assigned_user_id", "assigned_team_id");--> statement-breakpoint
CREATE INDEX "idx_messaging_threads_org_contact" ON "messaging_threads" USING btree ("organization_id", "contact_id", "lead_id");--> statement-breakpoint
CREATE INDEX "idx_messaging_participants_org_provider" ON "messaging_participants" USING btree ("organization_id", "provider");--> statement-breakpoint
CREATE INDEX "idx_messaging_participants_thread" ON "messaging_participants" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_messaging_message_account_fingerprint" ON "messaging_messages" USING btree ("connected_account_id", "external_message_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_messaging_message_org_idempotency" ON "messaging_messages" USING btree ("organization_id", "client_idempotency_key") WHERE "messaging_messages"."client_idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "idx_messaging_messages_thread_order" ON "messaging_messages" USING btree ("thread_id", "sent_at", "id");--> statement-breakpoint
CREATE INDEX "idx_messaging_messages_org_status" ON "messaging_messages" USING btree ("organization_id", "delivery_status", "sent_at");--> statement-breakpoint
CREATE INDEX "idx_messaging_messages_account_external" ON "messaging_messages" USING btree ("connected_account_id", "external_message_id");--> statement-breakpoint
CREATE INDEX "idx_messaging_identifiers_contact" ON "messaging_contact_identifiers" USING btree ("organization_id", "contact_id");--> statement-breakpoint
CREATE INDEX "idx_messaging_identifiers_lead" ON "messaging_contact_identifiers" USING btree ("organization_id", "lead_id");--> statement-breakpoint
CREATE INDEX "idx_messaging_identifiers_provider_participant" ON "messaging_contact_identifiers" USING btree ("organization_id", "provider", "provider_participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_messaging_attachment_message_provider" ON "messaging_attachments" USING btree ("message_id", "provider_attachment_id") WHERE "messaging_attachments"."provider_attachment_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_messaging_attachment_upload_token" ON "messaging_attachments" USING btree ("upload_token_hash");--> statement-breakpoint
CREATE INDEX "idx_messaging_attachments_org" ON "messaging_attachments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_messaging_attachments_message" ON "messaging_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_messaging_attachments_thread" ON "messaging_attachments" USING btree ("organization_id", "thread_id");--> statement-breakpoint
CREATE INDEX "idx_messaging_attachments_creator" ON "messaging_attachments" USING btree ("organization_id", "created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_messaging_labels_org" ON "messaging_labels" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_messaging_thread_labels_org" ON "messaging_thread_labels" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_messaging_thread_labels_label" ON "messaging_thread_labels" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "idx_messaging_assignments_org_user" ON "messaging_thread_assignments" USING btree ("organization_id", "assigned_user_id");--> statement-breakpoint
CREATE INDEX "idx_messaging_read_states_org_user" ON "messaging_thread_read_states" USING btree ("organization_id", "user_id", "is_read");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_messaging_inbound_provider_event" ON "messaging_inbound_events" USING btree ("provider", "provider_event_id") WHERE "messaging_inbound_events"."provider_event_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_messaging_inbound_fingerprint" ON "messaging_inbound_events" USING btree ("provider", "event_fingerprint");--> statement-breakpoint
CREATE INDEX "idx_messaging_inbound_pending" ON "messaging_inbound_events" USING btree ("status", "next_attempt_at", "received_at");--> statement-breakpoint
CREATE INDEX "idx_messaging_inbound_org" ON "messaging_inbound_events" USING btree ("organization_id", "received_at");--> statement-breakpoint
CREATE INDEX "idx_messaging_outbox_pending" ON "messaging_outbox_events" USING btree ("published_at", "created_at");--> statement-breakpoint
CREATE INDEX "idx_messaging_outbox_org_created" ON "messaging_outbox_events" USING btree ("organization_id", "created_at");--> statement-breakpoint
CREATE INDEX "idx_messaging_jobs_ready" ON "messaging_jobs" USING btree ("status", "next_attempt_at", "created_at");--> statement-breakpoint
CREATE INDEX "idx_messaging_jobs_org" ON "messaging_jobs" USING btree ("organization_id", "created_at");--> statement-breakpoint
CREATE INDEX "idx_messaging_connection_state_expiry" ON "messaging_connection_states" USING btree ("expires_at", "consumed_at");--> statement-breakpoint
CREATE INDEX "idx_messaging_ai_artifacts_org_thread" ON "messaging_ai_artifacts" USING btree ("organization_id", "thread_id", "artifact_type");--> statement-breakpoint
CREATE INDEX "idx_messaging_audit_org_created" ON "messaging_audit_events" USING btree ("organization_id", "created_at");--> statement-breakpoint
CREATE INDEX "idx_messaging_audit_aggregate" ON "messaging_audit_events" USING btree ("aggregate_type", "aggregate_id");
