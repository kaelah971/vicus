CREATE TABLE "asset_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_user_id" uuid NOT NULL,
	"space_application_id" uuid,
	"asset_name" varchar(120) NOT NULL,
	"asset_type" varchar(32) NOT NULL,
	"network" varchar(32) NOT NULL,
	"identifier" text NOT NULL,
	"code" varchar(32),
	"issuer_claim" text,
	"documentation_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chain_evidence_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"issuer_website" text,
	"canonical_key" text NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"validation_findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewed_by" uuid,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"registered_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_registrations" ADD CONSTRAINT "asset_registrations_applicant_user_id_users_id_fk" FOREIGN KEY ("applicant_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_registrations" ADD CONSTRAINT "asset_registrations_space_application_id_space_applications_id_fk" FOREIGN KEY ("space_application_id") REFERENCES "public"."space_applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_registrations" ADD CONSTRAINT "asset_registrations_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_registrations" ADD CONSTRAINT "asset_registrations_registered_asset_id_assets_id_fk" FOREIGN KEY ("registered_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_registrations_applicant_status_idx" ON "asset_registrations" USING btree ("applicant_user_id","status");--> statement-breakpoint
CREATE INDEX "asset_registrations_status_idx" ON "asset_registrations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "asset_registrations_canonical_idx" ON "asset_registrations" USING btree ("canonical_key");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_registrations_canonical_approved_unique" ON "asset_registrations" USING btree ("canonical_key") WHERE "status" = 'approved';