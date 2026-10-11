CREATE TABLE "asset_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"capability_type" varchar(32) NOT NULL,
	"title" varchar(120) NOT NULL,
	"short_description" text NOT NULL,
	"support_mode" varchar(16) NOT NULL,
	"cta_label" varchar(60) NOT NULL,
	"destination_url" text,
	"source_url" text NOT NULL,
	"eligibility_note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_capabilities" ADD CONSTRAINT "asset_capabilities_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_capabilities_circle_type_unique" ON "asset_capabilities" USING btree ("circle_id","capability_type");--> statement-breakpoint
CREATE INDEX "asset_capabilities_circle_active_idx" ON "asset_capabilities" USING btree ("circle_id","active");