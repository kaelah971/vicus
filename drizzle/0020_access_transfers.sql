CREATE TABLE "crosschain_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_network" varchar(32) NOT NULL,
	"source_wallet" varchar(64) NOT NULL,
	"destination_network" varchar(32) NOT NULL,
	"asset" varchar(16) DEFAULT 'USDC' NOT NULL,
	"amount" numeric(24, 6) NOT NULL,
	"destination_address" text NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"forwarding" boolean DEFAULT true NOT NULL,
	"source_tx_hash" varchar(128),
	"cctp_message" text,
	"destination_tx_hash" varchar(128),
	"fee_subunits_6" varchar(32),
	"retryable" boolean DEFAULT false NOT NULL,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crosschain_transfers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "access_transfers_user_idx" ON "crosschain_transfers" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "access_transfers_status_idx" ON "crosschain_transfers" USING btree ("status");
