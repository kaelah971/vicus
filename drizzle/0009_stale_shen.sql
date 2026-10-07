ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_ecosystems" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "asset_interests" jsonb DEFAULT '[]'::jsonb NOT NULL;