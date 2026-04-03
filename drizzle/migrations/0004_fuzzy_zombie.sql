CREATE TABLE "jurisdiction_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"jurisdiction_code" varchar(10) NOT NULL,
	"jurisdiction_name" varchar(200) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"threshold_single_tx" numeric(15, 2),
	"threshold_structuring" numeric(15, 2),
	"structuring_window_h" integer,
	"frequency_threshold" integer,
	"cash_threshold" numeric(15, 2),
	"currency_code" varchar(10) DEFAULT 'EUR' NOT NULL,
	"str_mandatory_above" numeric(15, 2),
	"str_delay_hours" integer DEFAULT 24,
	"sar_delay_hours" integer DEFAULT 72,
	"enhanced_dd_pep" boolean DEFAULT true NOT NULL,
	"enhanced_dd_high_risk" boolean DEFAULT true NOT NULL,
	"regulator_name" varchar(200),
	"regulator_code" varchar(50),
	"goaml_entity_type" varchar(50),
	"reporting_format" varchar(50) DEFAULT 'GOAML_2',
	"covered_countries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "jurisdiction_profiles_jurisdiction_code_unique" UNIQUE("jurisdiction_code")
);
--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "first_name" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "last_name" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "email" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "phone" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "date_of_birth" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "mfa_secret" SET DATA TYPE varchar(200);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "frozen_at" timestamp;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "frozen_reason" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "frozen_by" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "erasure_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "erasure_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "erasure_requested_by" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "erasure_completed_by" integer;--> statement-breakpoint
ALTER TABLE "jurisdiction_profiles" ADD CONSTRAINT "jurisdiction_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jurisdiction_profiles" ADD CONSTRAINT "jurisdiction_profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_frozen_by_users_id_fk" FOREIGN KEY ("frozen_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_erasure_requested_by_users_id_fk" FOREIGN KEY ("erasure_requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_erasure_completed_by_users_id_fk" FOREIGN KEY ("erasure_completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;