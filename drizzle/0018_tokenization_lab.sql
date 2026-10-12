CREATE TABLE "tokenization_lab_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"asset_name" varchar(120) NOT NULL,
	"asset_code" varchar(12) NOT NULL,
	"asset_class" varchar(32) NOT NULL,
	"representation" text NOT NULL,
	"initial_amount" numeric(24, 7) NOT NULL,
	"issuer_public_key" varchar(64) NOT NULL,
	"holder_public_key" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"trustline_tx_hash" varchar(128),
	"issuance_tx_hash" varchar(128),
	"ledger" integer,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tokenization_lab_runs" ADD CONSTRAINT "tokenization_lab_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lab_runs_issuer_code_unique" ON "tokenization_lab_runs" USING btree ("issuer_public_key","asset_code");--> statement-breakpoint
CREATE INDEX "lab_runs_user_idx" ON "tokenization_lab_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lab_runs_status_idx" ON "tokenization_lab_runs" USING btree ("status");