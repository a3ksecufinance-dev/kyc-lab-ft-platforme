CREATE TYPE "public"."alert_priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('OPEN', 'IN_REVIEW', 'ESCALATED', 'CLOSED', 'FALSE_POSITIVE');--> statement-breakpoint
CREATE TYPE "public"."alert_type" AS ENUM('THRESHOLD', 'PATTERN', 'VELOCITY', 'SANCTIONS', 'PEP', 'FRAUD', 'NETWORK');--> statement-breakpoint
CREATE TYPE "public"."case_decision" AS ENUM('PENDING', 'CLOSED_NO_ACTION', 'ESCALATED', 'SAR_FILED', 'STR_FILED');--> statement-breakpoint
CREATE TYPE "public"."case_severity" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('OPEN', 'UNDER_INVESTIGATION', 'PENDING_APPROVAL', 'ESCALATED', 'CLOSED', 'SAR_SUBMITTED');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('ONLINE', 'MOBILE', 'BRANCH', 'ATM', 'API');--> statement-breakpoint
CREATE TYPE "public"."customer_type" AS ENUM('INDIVIDUAL', 'CORPORATE', 'PEP', 'FOREIGN');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('PASSPORT', 'ID_CARD', 'DRIVING_LICENSE', 'PROOF_OF_ADDRESS', 'SELFIE', 'BANK_STATEMENT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('DRAFT', 'REVIEW', 'SUBMITTED', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."report_type" AS ENUM('SAR', 'STR', 'AML_STATISTICS', 'RISK_ASSESSMENT', 'COMPLIANCE', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."sanction_status" AS ENUM('CLEAR', 'MATCH', 'REVIEW', 'PENDING');--> statement-breakpoint
CREATE TYPE "public"."screening_decision" AS ENUM('CONFIRMED', 'DISMISSED', 'ESCALATED', 'PENDING');--> statement-breakpoint
CREATE TYPE "public"."screening_status" AS ENUM('CLEAR', 'MATCH', 'REVIEW', 'PENDING');--> statement-breakpoint
CREATE TYPE "public"."screening_type" AS ENUM('SANCTIONS', 'PEP', 'ADVERSE_MEDIA');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('PENDING', 'COMPLETED', 'FLAGGED', 'BLOCKED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('TRANSFER', 'DEPOSIT', 'WITHDRAWAL', 'PAYMENT', 'EXCHANGE');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'analyst', 'supervisor', 'compliance_officer', 'admin');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"alert_id" varchar(50) NOT NULL,
	"customer_id" integer NOT NULL,
	"transaction_id" integer,
	"scenario" varchar(200) NOT NULL,
	"alert_type" "alert_type" NOT NULL,
	"priority" "alert_priority" DEFAULT 'MEDIUM' NOT NULL,
	"status" "alert_status" DEFAULT 'OPEN' NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"enrichment_data" jsonb,
	"assigned_to" integer,
	"resolved_by" integer,
	"resolved_at" timestamp,
	"resolution" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "alerts_alert_id_unique" UNIQUE("alert_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" varchar(200) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" varchar(100),
	"details" jsonb,
	"ip_address" varchar(50),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_timeline" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" integer NOT NULL,
	"action" varchar(200) NOT NULL,
	"description" text,
	"performed_by" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" varchar(50) NOT NULL,
	"customer_id" integer NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"status" "case_status" DEFAULT 'OPEN' NOT NULL,
	"severity" "case_severity" DEFAULT 'MEDIUM' NOT NULL,
	"assigned_to" integer,
	"supervisor_id" integer,
	"linked_alerts" jsonb,
	"findings" text,
	"decision" "case_decision" DEFAULT 'PENDING' NOT NULL,
	"decision_notes" text,
	"decision_by" integer,
	"decision_at" timestamp,
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cases_case_id_unique" UNIQUE("case_id")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" varchar(50) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"email" varchar(320),
	"phone" varchar(50),
	"date_of_birth" varchar(20),
	"nationality" varchar(10),
	"residence_country" varchar(10),
	"address" text,
	"city" varchar(100),
	"profession" varchar(200),
	"employer" varchar(200),
	"source_of_funds" varchar(200),
	"monthly_income" numeric(15, 2),
	"customer_type" "customer_type" DEFAULT 'INDIVIDUAL' NOT NULL,
	"kyc_status" "kyc_status" DEFAULT 'PENDING' NOT NULL,
	"risk_level" "risk_level" DEFAULT 'LOW' NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"pep_status" boolean DEFAULT false NOT NULL,
	"sanction_status" "sanction_status" DEFAULT 'PENDING' NOT NULL,
	"last_review_date" timestamp,
	"next_review_date" timestamp,
	"assigned_analyst" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"document_type" "document_type" NOT NULL,
	"file_name" varchar(255),
	"file_url" text,
	"file_size" integer,
	"status" "document_status" DEFAULT 'PENDING' NOT NULL,
	"expiry_date" varchar(20),
	"document_number" varchar(100),
	"issuing_country" varchar(10),
	"verified_by" integer,
	"verified_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" varchar(50) NOT NULL,
	"report_type" "report_type" NOT NULL,
	"customer_id" integer,
	"case_id" integer,
	"title" varchar(300) NOT NULL,
	"status" "report_status" DEFAULT 'DRAFT' NOT NULL,
	"suspicion_type" varchar(200),
	"amount_involved" numeric(15, 2),
	"currency" varchar(10),
	"content" jsonb,
	"submitted_by" integer,
	"submitted_at" timestamp,
	"approved_by" integer,
	"approved_at" timestamp,
	"regulatory_ref" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reports_report_id_unique" UNIQUE("report_id")
);
--> statement-breakpoint
CREATE TABLE "screening_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"screening_type" "screening_type" NOT NULL,
	"status" "screening_status" DEFAULT 'PENDING' NOT NULL,
	"match_score" integer DEFAULT 0 NOT NULL,
	"matched_entity" varchar(300),
	"list_source" varchar(200),
	"confidence_score" integer DEFAULT 0 NOT NULL,
	"details" jsonb,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"decision" "screening_decision" DEFAULT 'PENDING' NOT NULL,
	"decision_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" varchar(50) NOT NULL,
	"customer_id" integer NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'EUR' NOT NULL,
	"transaction_type" "transaction_type" NOT NULL,
	"channel" "channel" DEFAULT 'ONLINE' NOT NULL,
	"counterparty" varchar(200),
	"counterparty_country" varchar(10),
	"counterparty_bank" varchar(200),
	"purpose" text,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"risk_rules" jsonb,
	"status" "transaction_status" DEFAULT 'PENDING' NOT NULL,
	"is_suspicious" boolean DEFAULT false NOT NULL,
	"flag_reason" text,
	"transaction_date" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "ubos" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"nationality" varchar(10),
	"date_of_birth" varchar(20),
	"ownership_percentage" numeric(5, 2),
	"role" varchar(100),
	"pep_status" boolean DEFAULT false NOT NULL,
	"sanction_status" "sanction_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(200) NOT NULL,
	"role" "user_role" DEFAULT 'analyst' NOT NULL,
	"department" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"last_signed_in" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_timeline" ADD CONSTRAINT "case_timeline_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_timeline" ADD CONSTRAINT "case_timeline_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_decision_by_users_id_fk" FOREIGN KEY ("decision_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_assigned_analyst_users_id_fk" FOREIGN KEY ("assigned_analyst") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_results" ADD CONSTRAINT "screening_results_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_results" ADD CONSTRAINT "screening_results_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ubos" ADD CONSTRAINT "ubos_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_alert_id_idx" ON "alerts" USING btree ("alert_id");--> statement-breakpoint
CREATE INDEX "alerts_customer_idx" ON "alerts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "alerts_status_idx" ON "alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "alerts_priority_idx" ON "alerts" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "alerts_created_at_idx" ON "alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "case_timeline_case_idx" ON "case_timeline" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cases_case_id_idx" ON "cases" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "cases_customer_idx" ON "cases" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "cases_status_idx" ON "cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cases_created_at_idx" ON "cases" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_customer_id_idx" ON "customers" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customers_risk_level_idx" ON "customers" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "customers_kyc_status_idx" ON "customers" USING btree ("kyc_status");--> statement-breakpoint
CREATE INDEX "customers_country_idx" ON "customers" USING btree ("residence_country");--> statement-breakpoint
CREATE INDEX "customers_created_at_idx" ON "customers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "documents_customer_idx" ON "documents" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_report_id_idx" ON "reports" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reports_type_idx" ON "reports" USING btree ("report_type");--> statement-breakpoint
CREATE INDEX "screening_customer_idx" ON "screening_results" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "screening_status_idx" ON "screening_results" USING btree ("status");--> statement-breakpoint
CREATE INDEX "screening_type_idx" ON "screening_results" USING btree ("screening_type");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_tx_id_idx" ON "transactions" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transactions_customer_idx" ON "transactions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "transactions_status_idx" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "transactions_suspicious_idx" ON "transactions" USING btree ("is_suspicious");--> statement-breakpoint
CREATE INDEX "ubos_customer_idx" ON "ubos" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");