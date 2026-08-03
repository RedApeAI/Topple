CREATE TABLE "zernio_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"zernio_account_id" text NOT NULL,
	"profile_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"platform_account_id" text,
	"display_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb,
	"connected_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zernio_accounts_zernio_account_id_unique" UNIQUE("zernio_account_id")
);
--> statement-breakpoint
CREATE TABLE "zernio_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"zernio_profile_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zernio_profiles_zernio_profile_id_unique" UNIQUE("zernio_profile_id")
);
--> statement-breakpoint
CREATE TABLE "zernio_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"organization_id" uuid,
	"processed" boolean DEFAULT false NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zernio_webhooks_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "zernio_accounts" ADD CONSTRAINT "zernio_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zernio_accounts" ADD CONSTRAINT "zernio_accounts_profile_id_zernio_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."zernio_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zernio_profiles" ADD CONSTRAINT "zernio_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zernio_webhooks" ADD CONSTRAINT "zernio_webhooks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_zernio_accounts_org" ON "zernio_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_zernio_accounts_platform" ON "zernio_accounts" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "idx_zernio_accounts_status" ON "zernio_accounts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_zernio_profiles_org" ON "zernio_profiles" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_zernio_profiles_zernio_id" ON "zernio_profiles" USING btree ("zernio_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_zernio_webhooks_event_id" ON "zernio_webhooks" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_zernio_webhooks_org" ON "zernio_webhooks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_zernio_webhooks_processed" ON "zernio_webhooks" USING btree ("processed");