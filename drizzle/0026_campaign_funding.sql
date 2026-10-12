ALTER TABLE "campaigns" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "target_action" varchar(32) DEFAULT 'send' NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "reward_asset" varchar(16) DEFAULT 'USDC' NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "reward_network" varchar(32) DEFAULT 'stellar_testnet' NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "reward_per_completion" numeric(24, 7);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "participant_cap" integer;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "funded_amount" numeric(24, 7) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "reserved_amount" numeric(24, 7) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "paid_amount" numeric(24, 7) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "treasury_account" varchar(64);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "funding_tx_hash" varchar(128);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "funding_verified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "activated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "completed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_funding_tx_unique" ON "campaigns" ("funding_tx_hash");
--> statement-breakpoint
CREATE TABLE "campaign_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"proof_kind" varchar(16) NOT NULL,
	"proof_id" uuid NOT NULL,
	"reward_amount" numeric(24, 7) NOT NULL,
	"destination_public_key" varchar(64) NOT NULL,
	"payout_tx_hash" varchar(128),
	"payout_envelope" text,
	"payout_ledger" integer,
	"status" varchar(24) DEFAULT 'reserved' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "campaign_completions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "campaign_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_completions_proof_unique" ON "campaign_completions" ("campaign_id","proof_kind","proof_id");
--> statement-breakpoint
CREATE INDEX "campaign_completions_campaign_status_idx" ON "campaign_completions" USING btree ("campaign_id","status");
--> statement-breakpoint
CREATE INDEX "campaign_completions_user_idx" ON "campaign_completions" USING btree ("user_id");
