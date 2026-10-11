CREATE TABLE "user_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_user_id" uuid NOT NULL,
	"followed_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_follower_user_id_users_id_fk" FOREIGN KEY ("follower_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_followed_user_id_users_id_fk" FOREIGN KEY ("followed_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_follows_follower_followed_unique" ON "user_follows" USING btree ("follower_user_id","followed_user_id");--> statement-breakpoint
CREATE INDEX "user_follows_follower_idx" ON "user_follows" USING btree ("follower_user_id");--> statement-breakpoint
CREATE INDEX "user_follows_followed_idx" ON "user_follows" USING btree ("followed_user_id");