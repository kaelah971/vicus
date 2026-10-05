ALTER TABLE "assets" ADD COLUMN "stellar_network" varchar(32);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "stellar_asset_code" varchar(32);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "stellar_issuer_account" varchar(64);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "stellar_contract_id" varchar(64);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "verification_mode" varchar(48);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "verification_source_url" text;