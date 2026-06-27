CREATE TYPE "public"."kyc_session_channel" AS ENUM('CBS_API', 'DIGITAL_WEB', 'AGENT_OFFICE', 'MOBILE_APP');--> statement-breakpoint
CREATE TYPE "public"."kyc_session_status" AS ENUM('DRAFT', 'OCR_DONE', 'AGENT_REVIEW', 'PENDING_CA', 'DECIDED', 'ABANDONED');--> statement-breakpoint
CREATE TABLE "kyc_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_ref" varchar(50) NOT NULL,
	"channel" "kyc_session_channel" NOT NULL,
	"status" "kyc_session_status" DEFAULT 'DRAFT' NOT NULL,
	"cbs_ref" varchar(100),
	"cbs_code" varchar(50),
	"ocr_result" jsonb,
	"candidate_fields" jsonb,
	"cbs_fields" jsonb,
	"decision_result" jsonb,
	"customer_id" integer,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"modified_fields" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"decided_at" timestamp,
	"abandoned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kyc_sessions_session_ref_unique" UNIQUE("session_ref")
);
--> statement-breakpoint
ALTER TABLE "kyc_sessions" ADD CONSTRAINT "kyc_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_sessions" ADD CONSTRAINT "kyc_sessions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_sessions_session_ref_idx" ON "kyc_sessions" USING btree ("session_ref");--> statement-breakpoint
CREATE INDEX "kyc_sessions_status_idx" ON "kyc_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kyc_sessions_channel_idx" ON "kyc_sessions" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "kyc_sessions_cbs_ref_idx" ON "kyc_sessions" USING btree ("cbs_ref");--> statement-breakpoint
CREATE INDEX "kyc_sessions_expires_idx" ON "kyc_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "kyc_sessions_customer_idx" ON "kyc_sessions" USING btree ("customer_id");