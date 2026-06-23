CREATE TABLE "good_guys_list" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"reason" text NOT NULL,
	"category" varchar(30) DEFAULT 'TRUSTED' NOT NULL,
	"valid_from" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"added_by" integer NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"revoked_at" timestamp,
	"revoked_by" integer,
	"revoke_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "silencing_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"matchers" jsonb NOT NULL,
	"valid_from" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"max_matches" integer,
	"created_by" integer NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "nic_number" varchar(50);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "birth_city" varchar(100);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "birth_country" varchar(10);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "cbs_ref" varchar(50);--> statement-breakpoint
ALTER TABLE "good_guys_list" ADD CONSTRAINT "good_guys_list_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "good_guys_list" ADD CONSTRAINT "good_guys_list_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "good_guys_list" ADD CONSTRAINT "good_guys_list_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "good_guys_list" ADD CONSTRAINT "good_guys_list_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silencing_rules" ADD CONSTRAINT "silencing_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silencing_rules" ADD CONSTRAINT "silencing_rules_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "good_guys_customer_idx" ON "good_guys_list" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "good_guys_active_idx" ON "good_guys_list" USING btree ("is_active","valid_until");--> statement-breakpoint
CREATE INDEX "good_guys_added_by_idx" ON "good_guys_list" USING btree ("added_by");--> statement-breakpoint
CREATE INDEX "silencing_active_idx" ON "silencing_rules" USING btree ("is_active","valid_until");--> statement-breakpoint
CREATE INDEX "silencing_created_by_idx" ON "silencing_rules" USING btree ("created_by");