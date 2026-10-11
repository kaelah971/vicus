CREATE TABLE "circle_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circle_post_helpful" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circle_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"type" varchar(32) NOT NULL,
	"title" varchar(180) NOT NULL,
	"body" text NOT NULL,
	"source_url" text,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "circle_answers" ADD CONSTRAINT "circle_answers_post_id_circle_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."circle_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_answers" ADD CONSTRAINT "circle_answers_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_post_helpful" ADD CONSTRAINT "circle_post_helpful_post_id_circle_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."circle_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_post_helpful" ADD CONSTRAINT "circle_post_helpful_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_posts" ADD CONSTRAINT "circle_posts_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_posts" ADD CONSTRAINT "circle_posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "circle_answers_post_idx" ON "circle_answers" USING btree ("post_id","status","created_at");--> statement-breakpoint
CREATE INDEX "circle_answers_author_idx" ON "circle_answers" USING btree ("author_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "circle_post_helpful_post_user_unique" ON "circle_post_helpful" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "circle_post_helpful_post_idx" ON "circle_post_helpful" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "circle_post_helpful_user_idx" ON "circle_post_helpful" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "circle_posts_circle_status_idx" ON "circle_posts" USING btree ("circle_id","status","created_at");--> statement-breakpoint
CREATE INDEX "circle_posts_author_idx" ON "circle_posts" USING btree ("author_user_id");