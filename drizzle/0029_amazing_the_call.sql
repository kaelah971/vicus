CREATE TABLE "abuse_rate_limits" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "abuse_rate_limits_window_idx" ON "abuse_rate_limits" USING btree ("window_start");