CREATE TABLE "onchain_action_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"mission_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"network" varchar(32) NOT NULL,
	"transaction_hash" varchar(128) NOT NULL,
	"operation_index" integer,
	"source_account" varchar(64) NOT NULL,
	"destination_account" varchar(64) NOT NULL,
	"asset_code" varchar(32) NOT NULL,
	"asset_issuer" varchar(64) NOT NULL,
	"amount" numeric(24, 7) NOT NULL,
	"ledger" integer,
	"transaction_created_at" timestamp with time zone,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "asset_capability_id" uuid;--> statement-breakpoint
ALTER TABLE "onchain_action_proofs" ADD CONSTRAINT "onchain_action_proofs_submission_id_mission_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."mission_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onchain_action_proofs" ADD CONSTRAINT "onchain_action_proofs_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onchain_action_proofs" ADD CONSTRAINT "onchain_action_proofs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "onchain_action_proofs_submission_unique" ON "onchain_action_proofs" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onchain_action_proofs_mission_hash_unique" ON "onchain_action_proofs" USING btree ("mission_id","transaction_hash");--> statement-breakpoint
CREATE INDEX "onchain_action_proofs_mission_user_idx" ON "onchain_action_proofs" USING btree ("mission_id","user_id");--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_asset_capability_id_asset_capabilities_id_fk" FOREIGN KEY ("asset_capability_id") REFERENCES "public"."asset_capabilities"("id") ON DELETE set null ON UPDATE no action;