CREATE TYPE "public"."conversation_status" AS ENUM('open', 'closed', 'archived');--> statement-breakpoint
CREATE TABLE "agent_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lora_adapter_reference" text,
	"knowledge_base_reference" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"channel" "channel_type" NOT NULL,
	"external_thread_id" text NOT NULL,
	"mongo_document_id" text,
	"s3_key" text,
	"status" "conversation_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"inviter_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"active_organization_id" uuid,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_identities" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "refresh_tokens" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "auth_identities" CASCADE;--> statement-breakpoint
DROP TABLE "refresh_tokens" CASCADE;--> statement-breakpoint
ALTER TABLE "channel_connections" RENAME COLUMN "user_id" TO "created_by_user_id";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "avatar_url" TO "image";--> statement-breakpoint
ALTER TABLE "channel_connections" DROP CONSTRAINT "channel_connections_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "idx_channel_connections_user";--> statement-breakpoint
DROP INDEX "uq_channel_connection_per_user";--> statement-breakpoint
UPDATE "users"
SET "name" = split_part("email"::text, '@', 1)
WHERE "name" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD COLUMN "secret_reference" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
INSERT INTO "organizations" ("name", "slug", "metadata")
SELECT
	COALESCE("users"."name", 'Legacy organization'),
	'legacy-' || replace("users"."id"::text, '-', ''),
	json_build_object('legacyUserId', "users"."id")::text
FROM "users"
WHERE EXISTS (
	SELECT 1 FROM "channel_connections"
	WHERE "channel_connections"."created_by_user_id" = "users"."id"
);--> statement-breakpoint
INSERT INTO "members" ("organization_id", "user_id", "role")
SELECT "organizations"."id", "users"."id", 'owner'
FROM "users"
INNER JOIN "organizations"
	ON "organizations"."slug" = 'legacy-' || replace("users"."id"::text, '-', '');--> statement-breakpoint
UPDATE "channel_connections"
SET "organization_id" = "organizations"."id"
FROM "organizations"
WHERE "organizations"."slug" = 'legacy-' || replace("channel_connections"."created_by_user_id"::text, '-', '');--> statement-breakpoint
ALTER TABLE "channel_connections" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD CONSTRAINT "agent_configs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD CONSTRAINT "agent_configs_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_configs_organization" ON "agent_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_conversations_org_channel_thread" ON "conversations" USING btree ("organization_id","channel","external_thread_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_org_updated" ON "conversations" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_accounts_provider_account" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "idx_accounts_user" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_invitations_organization" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_invitations_email" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_members_organization_user" ON "members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_members_user" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_verifications_identifier" ON "verifications" USING btree ("identifier");--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_channel_connections_organization" ON "channel_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_channel_connection_per_organization" ON "channel_connections" USING btree ("organization_id","channel_type","external_account_id") WHERE "channel_connections"."external_account_id" is not null;--> statement-breakpoint
ALTER TABLE "channel_connections" DROP COLUMN "access_token_encrypted";--> statement-breakpoint
ALTER TABLE "channel_connections" DROP COLUMN "refresh_token_encrypted";--> statement-breakpoint
ALTER TABLE "channel_connections" DROP COLUMN "token_expires_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email_verified_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "password_hash";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "last_login_at";--> statement-breakpoint
DROP TYPE "public"."auth_provider";
