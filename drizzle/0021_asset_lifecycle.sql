CREATE TABLE "asset_lifecycle_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"stage" varchar(16) NOT NULL,
	"title" varchar(120) NOT NULL,
	"short_description" text NOT NULL,
	"support_mode" varchar(16) NOT NULL,
	"access_mode" varchar(16),
	"cta_label" varchar(60),
	"destination_url" text,
	"source_url" text NOT NULL,
	"eligibility_note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_lifecycle_steps_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "lifecycle_circle_stage_unique" ON "asset_lifecycle_steps" USING btree ("circle_id","stage");
--> statement-breakpoint
CREATE INDEX "lifecycle_circle_active_idx" ON "asset_lifecycle_steps" USING btree ("circle_id","active");
