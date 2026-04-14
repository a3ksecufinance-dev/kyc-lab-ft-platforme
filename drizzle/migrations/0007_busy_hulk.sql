CREATE TYPE "public"."approval_action" AS ENUM('SAR_TRANSMIT', 'CASE_DECIDE', 'CUSTOMER_BLOCK', 'WALLET_SUSPEND');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."correspondent_risk" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'UNACCEPTABLE');--> statement-breakpoint
CREATE TYPE "public"."correspondent_status" AS ENUM('ACTIVE', 'UNDER_REVIEW', 'SUSPENDED', 'TERMINATED');--> statement-breakpoint
ALTER TYPE "public"."alert_type" ADD VALUE IF NOT EXISTS 'P2P_VELOCITY';--> statement-breakpoint
ALTER TYPE "public"."alert_type" ADD VALUE IF NOT EXISTS 'AGENT_MULE';--> statement-breakpoint
ALTER TYPE "public"."alert_type" ADD VALUE IF NOT EXISTS 'SMALL_ACCUMULATION';--> statement-breakpoint
ALTER TYPE "public"."alert_type" ADD VALUE IF NOT EXISTS 'MERCHANT_BYPASS';--> statement-breakpoint
ALTER TYPE "public"."alert_type" ADD VALUE IF NOT EXISTS 'DORMANT_REACTIVATION';--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE IF NOT EXISTS 'AGENT';--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE IF NOT EXISTS 'USSD';--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE IF NOT EXISTS 'ORANGE_MONEY';--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE IF NOT EXISTS 'WAVE';--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE IF NOT EXISTS 'CIH_MOBILE';--> statement-breakpoint
ALTER TYPE "public"."customer_type" ADD VALUE IF NOT EXISTS 'AGENT';--> statement-breakpoint
ALTER TYPE "public"."customer_type" ADD VALUE IF NOT EXISTS 'MERCHANT';--> statement-breakpoint
ALTER TYPE "public"."report_type" ADD VALUE IF NOT EXISTS 'BAM_MONTHLY';--> statement-breakpoint
ALTER TYPE "public"."report_type" ADD VALUE IF NOT EXISTS 'BAM_QUARTERLY';--> statement-breakpoint
ALTER TYPE "public"."report_type" ADD VALUE IF NOT EXISTS 'BAM_ANNUAL';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'AGENT_CASH_IN';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'AGENT_CASH_OUT';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'MOBILE_MONEY_IN';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'MOBILE_MONEY_OUT';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'P2P_TRANSFER';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'MERCHANT_PAYMENT';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'BILL_PAYMENT';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'BULK_DISBURSEMENT';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" varchar(50) NOT NULL,
	"user_id" integer,
	"name" varchar(200) NOT NULL,
	"phone" varchar(30),
	"region" varchar(100),
	"city" varchar(100),
	"license_number" varchar(100),
	"float_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(10) DEFAULT 'MAD' NOT NULL,
	"daily_tx_count" integer DEFAULT 0 NOT NULL,
	"daily_tx_volume" numeric(15, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_activity_at" timestamp,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"risk_flags" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_accounts_agent_id_unique" UNIQUE("agent_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" "approval_action" NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer NOT NULL,
	"requested_by" integer NOT NULL,
	"reviewed_by" integer,
	"status" "approval_status" DEFAULT 'PENDING' NOT NULL,
	"payload" jsonb,
	"requester_note" text,
	"reviewer_note" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "correspondent_assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_id" integer NOT NULL,
	"assessed_by" integer NOT NULL,
	"risk_score" integer NOT NULL,
	"risk_level" "correspondent_risk" NOT NULL,
	"aml_framework_score" integer DEFAULT 0 NOT NULL,
	"ownership_transp_score" integer DEFAULT 0 NOT NULL,
	"supervisory_score" integer DEFAULT 0 NOT NULL,
	"sanctions_risk_score" integer DEFAULT 0 NOT NULL,
	"findings" text,
	"recommendation" varchar(50),
	"approval_request_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "correspondent_banks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"bic" varchar(20),
	"country" varchar(3) NOT NULL,
	"jurisdiction" varchar(100),
	"aml_regulator" varchar(200),
	"fatf_status" varchar(50),
	"risk_score" integer DEFAULT 50 NOT NULL,
	"risk_level" "correspondent_risk" DEFAULT 'MEDIUM' NOT NULL,
	"status" "correspondent_status" DEFAULT 'UNDER_REVIEW' NOT NULL,
	"onboarded_by" integer,
	"approved_by" integer,
	"next_review_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kyc_tier_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"wallet_id" integer,
	"previous_tier" varchar(20),
	"new_tier" varchar(20) NOT NULL,
	"reason" text,
	"triggered_by" integer,
	"auto_triggered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pkyc_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"snapshot_date" timestamp DEFAULT now() NOT NULL,
	"drift_score" integer DEFAULT 0 NOT NULL,
	"drift_factors" jsonb,
	"review_triggered" boolean DEFAULT false NOT NULL,
	"baseline_days" integer DEFAULT 30 NOT NULL,
	"window_days" integer DEFAULT 7 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_id" varchar(50) NOT NULL,
	"customer_id" integer NOT NULL,
	"provider" varchar(50) DEFAULT 'INTERNAL' NOT NULL,
	"phone_number" varchar(30),
	"msisdn" varchar(30),
	"balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(10) DEFAULT 'MAD' NOT NULL,
	"kyc_tier" varchar(20) DEFAULT 'ALLEGED' NOT NULL,
	"daily_limit" numeric(15, 2),
	"monthly_limit" numeric(15, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"is_dormant" boolean DEFAULT false NOT NULL,
	"last_activity_at" timestamp,
	"dormant_since" timestamp,
	"reactivated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_wallet_id_unique" UNIQUE("wallet_id")
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "wallet_id" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "agent_id" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "ussd_session" varchar(100);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agent_accounts" ADD CONSTRAINT "agent_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "correspondent_assessments" ADD CONSTRAINT "correspondent_assessments_bank_id_correspondent_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."correspondent_banks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "correspondent_assessments" ADD CONSTRAINT "correspondent_assessments_assessed_by_users_id_fk" FOREIGN KEY ("assessed_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "correspondent_assessments" ADD CONSTRAINT "correspondent_assessments_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "correspondent_banks" ADD CONSTRAINT "correspondent_banks_onboarded_by_users_id_fk" FOREIGN KEY ("onboarded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "correspondent_banks" ADD CONSTRAINT "correspondent_banks_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "kyc_tier_snapshots" ADD CONSTRAINT "kyc_tier_snapshots_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "kyc_tier_snapshots" ADD CONSTRAINT "kyc_tier_snapshots_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "kyc_tier_snapshots" ADD CONSTRAINT "kyc_tier_snapshots_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pkyc_snapshots" ADD CONSTRAINT "pkyc_snapshots_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wallets" ADD CONSTRAINT "wallets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS"agent_accounts_agent_id_idx" ON "agent_accounts" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"agent_accounts_user_idx" ON "agent_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"agent_accounts_region_idx" ON "agent_accounts" USING btree ("region");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"agent_accounts_risk_idx" ON "agent_accounts" USING btree ("risk_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"approvals_entity_idx" ON "approval_requests" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"approvals_status_idx" ON "approval_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"approvals_requester_idx" ON "approval_requests" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"approvals_pending_idx" ON "approval_requests" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"corr_assess_bank_idx" ON "correspondent_assessments" USING btree ("bank_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"corr_assess_date_idx" ON "correspondent_assessments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"corr_bic_idx" ON "correspondent_banks" USING btree ("bic");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"corr_country_idx" ON "correspondent_banks" USING btree ("country");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"corr_risk_idx" ON "correspondent_banks" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"corr_review_idx" ON "correspondent_banks" USING btree ("next_review_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"kyc_tier_snaps_customer_idx" ON "kyc_tier_snapshots" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"kyc_tier_snaps_wallet_idx" ON "kyc_tier_snapshots" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"kyc_tier_snaps_date_idx" ON "kyc_tier_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"pkyc_customer_idx" ON "pkyc_snapshots" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"pkyc_date_idx" ON "pkyc_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"pkyc_score_idx" ON "pkyc_snapshots" USING btree ("drift_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"pkyc_customer_date_idx" ON "pkyc_snapshots" USING btree ("customer_id","snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS"wallets_wallet_id_idx" ON "wallets" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"wallets_customer_idx" ON "wallets" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"wallets_provider_idx" ON "wallets" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"wallets_tier_idx" ON "wallets" USING btree ("kyc_tier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"wallets_dormant_idx" ON "wallets" USING btree ("is_dormant");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "transactions" ADD CONSTRAINT "transactions_agent_id_agent_accounts_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"transactions_wallet_idx" ON "transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS"transactions_agent_idx" ON "transactions" USING btree ("agent_id");