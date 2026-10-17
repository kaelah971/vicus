ALTER TABLE "space_applications" ADD COLUMN "asset_details" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "space_applications" ADD COLUMN "eligibility" jsonb;--> statement-breakpoint
ALTER TABLE "space_applications" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "space_applications" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "space_applications" ADD CONSTRAINT "space_applications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;