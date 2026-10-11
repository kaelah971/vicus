CREATE TABLE "space_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_user_id" uuid NOT NULL,
	"proposed_name" varchar(180) NOT NULL,
	"proposed_slug" varchar(140) NOT NULL,
	"description" text NOT NULL,
	"website_url" text,
	"project_type" varchar(48) NOT NULL,
	"ecosystem_focus" varchar(32),
	"requested_purpose" text NOT NULL,
	"affiliation_note" text,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "space_applications" ADD CONSTRAINT "space_applications_applicant_user_id_users_id_fk" FOREIGN KEY ("applicant_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_applications" ADD CONSTRAINT "space_applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "space_applications_applicant_status_idx" ON "space_applications" USING btree ("applicant_user_id","status");--> statement-breakpoint
CREATE INDEX "space_applications_status_idx" ON "space_applications" USING btree ("status");