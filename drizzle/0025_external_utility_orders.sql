CREATE TABLE "external_utility_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_circle_id" uuid NOT NULL,
	"action_kind" varchar(16) DEFAULT 'swap' NOT NULL,
	"source_mint" varchar(64) NOT NULL,
	"source_amount_subunits" varchar(32) NOT NULL,
	"target_mint" varchar(64) NOT NULL,
	"destination_network" varchar(32) DEFAULT 'solana' NOT NULL,
	"execution_wallet" varchar(64),
	"venue" varchar(32) NOT NULL,
	"eligibility_acknowledged" boolean DEFAULT false NOT NULL,
	"quote_out_amount" varchar(32),
	"quote_min_out" varchar(32),
	"quote_at" timestamp with time zone,
	"swap_signature" varchar(128),
	"target_amount" varchar(32),
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"failure_reason" varchar(64),
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "external_utility_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "external_utility_orders_target_circle_id_circles_id_fk" FOREIGN KEY ("target_circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "utility_orders_user_idx" ON "external_utility_orders" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "utility_orders_status_idx" ON "external_utility_orders" USING btree ("status");
