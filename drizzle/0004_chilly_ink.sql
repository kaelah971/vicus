DROP INDEX "auth_challenges_wallet_created_idx";--> statement-breakpoint
CREATE INDEX "auth_challenges_created_idx" ON "auth_challenges" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "auth_challenges" DROP COLUMN "wallet_address";