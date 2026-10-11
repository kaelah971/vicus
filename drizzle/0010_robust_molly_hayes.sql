CREATE TABLE "stellar_role_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"circle_id" uuid NOT NULL,
	"asset_id" uuid,
	"role" varchar(32) NOT NULL,
	"ecosystem" varchar(32) DEFAULT 'stellar' NOT NULL,
	"network" varchar(32) NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_state" varchar(48) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stellar_role_verifications" ADD CONSTRAINT "stellar_role_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stellar_role_verifications" ADD CONSTRAINT "stellar_role_verifications_wallet_id_stellar_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."stellar_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stellar_role_verifications" ADD CONSTRAINT "stellar_role_verifications_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stellar_role_verifications" ADD CONSTRAINT "stellar_role_verifications_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stellar_role_verifications_user_circle_unique" ON "stellar_role_verifications" USING btree ("user_id","circle_id");--> statement-breakpoint
CREATE INDEX "stellar_role_verifications_user_idx" ON "stellar_role_verifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stellar_role_verifications_circle_idx" ON "stellar_role_verifications" USING btree ("circle_id");