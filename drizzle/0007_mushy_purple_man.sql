CREATE TABLE "reward_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_submission_id" uuid NOT NULL,
	"mission_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"network" varchar(32) NOT NULL,
	"asset" varchar(32) NOT NULL,
	"amount" numeric(24, 7) NOT NULL,
	"destination_public_key" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"transaction_hash" varchar(128),
	"signed_envelope_xdr" text,
	"ledger" integer,
	"failure_code" varchar(80),
	"failure_message" text,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_mission_submission_id_mission_submissions_id_fk" FOREIGN KEY ("mission_submission_id") REFERENCES "public"."mission_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_wallet_id_stellar_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."stellar_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reward_claims_submission_unique" ON "reward_claims" USING btree ("mission_submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_claims_transaction_hash_unique" ON "reward_claims" USING btree ("transaction_hash");--> statement-breakpoint
CREATE INDEX "reward_claims_user_status_idx" ON "reward_claims" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "reward_claims_mission_idx" ON "reward_claims" USING btree ("mission_id");--> statement-breakpoint
UPDATE "missions"
SET "reward_asset" = 'XLM', "reward_amount" = '0.1'
WHERE "id" = '00000000-0000-0000-0000-000000000401'
  AND "reward_asset" IS NULL;