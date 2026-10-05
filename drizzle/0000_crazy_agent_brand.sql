CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"circle_id" uuid,
	"type" varchar(80) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"issuer" text,
	"chain" varchar(48) NOT NULL,
	"type" varchar(80) NOT NULL,
	"name" varchar(180) NOT NULL,
	"description" text NOT NULL,
	"intended_use" text,
	"official_url" text,
	"risk_note" text,
	"eligibility_note" text,
	"source_status" varchar(80) NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"circle_id" uuid,
	"badge_type" varchar(80) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuer_user_id" uuid,
	"circle_id" uuid NOT NULL,
	"objective" text NOT NULL,
	"budget_asset" varchar(32),
	"budget_amount" numeric(24, 7),
	"budget_status" varchar(40) NOT NULL,
	"status" varchar(40) NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circle_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(60) NOT NULL,
	"source" varchar(60) NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "circles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid,
	"slug" varchar(140) NOT NULL,
	"name" varchar(180) NOT NULL,
	"tagline" text,
	"status" varchar(40) NOT NULL,
	"category" varchar(100) NOT NULL,
	"official_status" varchar(40) NOT NULL,
	"featured_rank" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"campaign_id" uuid,
	"type" varchar(60) NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"reward_asset" varchar(32),
	"reward_amount" numeric(24, 7),
	"eligibility_rule" jsonb,
	"review_mode" varchar(60) NOT NULL,
	"status" varchar(40) NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" varchar(80) NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_issuer_user_id_users_id_fk" FOREIGN KEY ("issuer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_memberships" ADD CONSTRAINT "circle_memberships_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_memberships" ADD CONSTRAINT "circle_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_circle_created_idx" ON "activity_events" USING btree ("circle_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_events_user_created_idx" ON "activity_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "assets_chain_code_idx" ON "assets" USING btree ("chain","code");--> statement-breakpoint
CREATE INDEX "badges_user_idx" ON "badges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "badges_circle_idx" ON "badges" USING btree ("circle_id");--> statement-breakpoint
CREATE INDEX "campaigns_circle_status_idx" ON "campaigns" USING btree ("circle_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "circle_memberships_circle_user_unique" ON "circle_memberships" USING btree ("circle_id","user_id");--> statement-breakpoint
CREATE INDEX "circle_memberships_user_idx" ON "circle_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "circles_slug_unique" ON "circles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "circles_category_status_idx" ON "circles" USING btree ("category","status");--> statement-breakpoint
CREATE INDEX "missions_circle_status_idx" ON "missions" USING btree ("circle_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_unique" ON "users" USING btree ("handle");