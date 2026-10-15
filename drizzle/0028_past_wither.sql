CREATE TABLE IF NOT EXISTS "user_baskets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(80) NOT NULL,
	"theme" text NOT NULL,
	"rationale" text NOT NULL,
	"constituents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" varchar(16) DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "basket_watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"basket_kind" varchar(16) NOT NULL,
	"basket_ref" varchar(80) NOT NULL,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_baskets" ADD CONSTRAINT "user_baskets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "basket_watches" ADD CONSTRAINT "basket_watches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_baskets_owner_slug_unique" ON "user_baskets" USING btree ("owner_user_id","slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_baskets_owner_idx" ON "user_baskets" USING btree ("owner_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "basket_watches_user_kind_ref_unique" ON "basket_watches" USING btree ("user_id","basket_kind","basket_ref");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "basket_watches_user_idx" ON "basket_watches" USING btree ("user_id");
