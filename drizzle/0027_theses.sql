CREATE TABLE "theses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_user_id" uuid NOT NULL,
	"circle_id" uuid,
	"subject_slug" varchar(80),
	"title" varchar(180) NOT NULL,
	"claim" text NOT NULL,
	"timeframe" varchar(16) NOT NULL,
	"confidence" integer NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"thesis_type" varchar(32) DEFAULT 'paper' NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]' NOT NULL,
	"position_linked" boolean DEFAULT false NOT NULL,
	"linked_asset_slug" varchar(140),
	"outcome_note" text,
	"closes_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "theses_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "theses_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "theses_circle_status_idx" ON "theses" USING btree ("circle_id","status","created_at");
--> statement-breakpoint
CREATE INDEX "theses_subject_status_idx" ON "theses" USING btree ("subject_slug","status","created_at");
--> statement-breakpoint
CREATE INDEX "theses_author_idx" ON "theses" USING btree ("author_user_id");
