CREATE TABLE "user_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"linked_user_id" uuid,
	"display_name" varchar(160) NOT NULL,
	"handle_snapshot" varchar(80),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_contacts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "user_contacts_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_contacts_owner_linked_unique" ON "user_contacts" USING btree ("owner_user_id","linked_user_id");
--> statement-breakpoint
CREATE INDEX "user_contacts_owner_idx" ON "user_contacts" USING btree ("owner_user_id");
--> statement-breakpoint
CREATE TABLE "contact_wallet_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"network" varchar(16) NOT NULL,
	"address" text NOT NULL,
	"label" varchar(80),
	"verified_source" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_wallet_endpoints_contact_id_user_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."user_contacts"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contact_endpoints_contact_network_address_unique" ON "contact_wallet_endpoints" USING btree ("contact_id","network","address");
--> statement-breakpoint
CREATE TABLE "user_receive_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"network" varchar(16) NOT NULL,
	"address" text NOT NULL,
	"label" varchar(80),
	"enabled" boolean DEFAULT false NOT NULL,
	"visibility" varchar(16) DEFAULT 'contacts_only' NOT NULL,
	"ownership_status" varchar(16) DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_receive_endpoints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "receive_endpoints_user_network_address_unique" ON "user_receive_endpoints" USING btree ("user_id","network","address");
--> statement-breakpoint
CREATE INDEX "receive_endpoints_user_idx" ON "user_receive_endpoints" USING btree ("user_id");
