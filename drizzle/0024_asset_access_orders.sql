CREATE TABLE "asset_access_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_circle_id" uuid NOT NULL,
	"source_asset" varchar(16) DEFAULT 'USDC' NOT NULL,
	"source_network" varchar(32) DEFAULT 'stellar_testnet' NOT NULL,
	"source_amount_subunits" varchar(32) NOT NULL,
	"destination_network" varchar(32) DEFAULT 'base' NOT NULL,
	"execution_wallet" varchar(64),
	"target_asset_address" varchar(64) NOT NULL,
	"venue" varchar(32) NOT NULL,
	"eligibility_acknowledged" boolean DEFAULT false NOT NULL,
	"access_transfer_id" uuid,
	"quote_amount_out" varchar(32),
	"quote_min_out" varchar(32),
	"quote_at" timestamp with time zone,
	"destination_usdc_amount" varchar(32),
	"target_amount" varchar(32),
	"approval_hash" varchar(128),
	"swap_hash" varchar(128),
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"failure_reason" varchar(64),
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "asset_access_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "asset_access_orders_target_circle_id_circles_id_fk" FOREIGN KEY ("target_circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "asset_access_orders_access_transfer_id_crosschain_transfers_id_fk" FOREIGN KEY ("access_transfer_id") REFERENCES "public"."crosschain_transfers"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "access_orders_user_idx" ON "asset_access_orders" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "access_orders_status_idx" ON "asset_access_orders" USING btree ("status");
