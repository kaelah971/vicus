CREATE TABLE "asset_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"recipient_user_id" uuid,
	"contact_id" uuid,
	"network" varchar(16) DEFAULT 'stellar_mainnet' NOT NULL,
	"circle_id" uuid NOT NULL,
	"asset_code" varchar(32) NOT NULL,
	"asset_issuer" varchar(64) NOT NULL,
	"amount" numeric(24, 7) NOT NULL,
	"destination_address" text NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"transaction_hash" varchar(128),
	"ledger" integer,
	"failure_reason" varchar(64),
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "asset_transfers_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "asset_transfers_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "asset_transfers_contact_id_user_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."user_contacts"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "asset_transfers_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "asset_transfers_tx_hash_unique" ON "asset_transfers" USING btree ("transaction_hash");
--> statement-breakpoint
CREATE INDEX "asset_transfers_sender_idx" ON "asset_transfers" USING btree ("sender_user_id");
--> statement-breakpoint
CREATE INDEX "asset_transfers_status_idx" ON "asset_transfers" USING btree ("status");
