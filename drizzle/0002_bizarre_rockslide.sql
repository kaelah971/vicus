CREATE TABLE "mission_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text,
	"evidence_url" text,
	"score" integer,
	"status" varchar(32) NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"revision_reason" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "mission_config" jsonb;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "duplicate_policy" varchar(40) DEFAULT 'one-per-user' NOT NULL;--> statement-breakpoint
ALTER TABLE "mission_submissions" ADD CONSTRAINT "mission_submissions_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_submissions" ADD CONSTRAINT "mission_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_submissions" ADD CONSTRAINT "mission_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mission_submissions_mission_user_unique" ON "mission_submissions" USING btree ("mission_id","user_id");--> statement-breakpoint
CREATE INDEX "mission_submissions_mission_status_idx" ON "mission_submissions" USING btree ("mission_id","status");--> statement-breakpoint
CREATE INDEX "mission_submissions_user_submitted_idx" ON "mission_submissions" USING btree ("user_id","submitted_at");--> statement-breakpoint
CREATE INDEX "mission_submissions_review_queue_idx" ON "mission_submissions" USING btree ("status","submitted_at");