CREATE TYPE "public"."approval_step_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."license_status" AS ENUM('ACTIVE', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('ALERT_ASSIGNED', 'CASE_ESCALATED', 'SLA_BREACH', 'SCREENING_MATCH', 'APPROVAL_PENDING', 'APPROVAL_DECIDED', 'WALLET_FROZEN', 'CBS_DISCREPANCY', 'SYSTEM');--> statement-breakpoint
CREATE TABLE "approval_chains" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" "approval_action" NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"levels" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_delegations" (
	"id" serial PRIMARY KEY NOT NULL,
	"delegator_id" integer NOT NULL,
	"delegate_id" integer NOT NULL,
	"action" "approval_action",
	"valid_from" timestamp NOT NULL,
	"valid_until" timestamp NOT NULL,
	"reason" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"approval_id" integer NOT NULL,
	"level" integer NOT NULL,
	"min_role" varchar(30) NOT NULL,
	"label" varchar(200),
	"status" "approval_step_status" DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" integer,
	"reviewer_note" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"license_key" text NOT NULL,
	"license_id" varchar(36) NOT NULL,
	"client_name" varchar(200) NOT NULL,
	"institution_type" varchar(30) NOT NULL,
	"modules" jsonb NOT NULL,
	"max_users" integer DEFAULT 25 NOT NULL,
	"issued_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"activated_at" timestamp DEFAULT now() NOT NULL,
	"activated_by" integer,
	"status" "license_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(300) NOT NULL,
	"message" text,
	"entity_type" varchar(50),
	"entity_id" varchar(100),
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	"category" varchar(50) NOT NULL,
	"label" varchar(200) NOT NULL,
	"description" text,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "system_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "agent_accounts" ADD COLUMN "reactivated_at" timestamp;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "chain_id" integer;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "current_level" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "total_levels" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "escalated_at" timestamp;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "escalated_to" integer;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "anrf_deposit_date" timestamp;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "anrf_reference" varchar(100);--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "anrf_status" varchar(20);--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "wallet_risk_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "wallet_risk_level" varchar(20) DEFAULT 'LOW' NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "frozen_at" timestamp;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "frozen_reason" text;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "frozen_by" integer;--> statement-breakpoint
ALTER TABLE "approval_chains" ADD CONSTRAINT "approval_chains_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_delegator_id_users_id_fk" FOREIGN KEY ("delegator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_delegate_id_users_id_fk" FOREIGN KEY ("delegate_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approval_id_approval_requests_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approval_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_config" ADD CONSTRAINT "system_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_chains_action_idx" ON "approval_chains" USING btree ("action");--> statement-breakpoint
CREATE INDEX "approval_chains_active_idx" ON "approval_chains" USING btree ("action","is_active");--> statement-breakpoint
CREATE INDEX "delegations_delegator_idx" ON "approval_delegations" USING btree ("delegator_id");--> statement-breakpoint
CREATE INDEX "delegations_delegate_idx" ON "approval_delegations" USING btree ("delegate_id");--> statement-breakpoint
CREATE INDEX "delegations_active_idx" ON "approval_delegations" USING btree ("is_active","valid_until");--> statement-breakpoint
CREATE INDEX "approval_steps_approval_idx" ON "approval_steps" USING btree ("approval_id");--> statement-breakpoint
CREATE INDEX "approval_steps_level_idx" ON "approval_steps" USING btree ("approval_id","level");--> statement-breakpoint
CREATE UNIQUE INDEX "licenses_license_id_idx" ON "licenses" USING btree ("license_id");--> statement-breakpoint
CREATE INDEX "licenses_status_idx" ON "licenses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "system_config_key_idx" ON "system_config" USING btree ("key");--> statement-breakpoint
CREATE INDEX "system_config_category_idx" ON "system_config" USING btree ("category");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_escalated_to_users_id_fk" FOREIGN KEY ("escalated_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_frozen_by_users_id_fk" FOREIGN KEY ("frozen_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_chain_idx" ON "approval_requests" USING btree ("chain_id");--> statement-breakpoint
CREATE INDEX "wallets_risk_score_idx" ON "wallets" USING btree ("wallet_risk_score");--> statement-breakpoint
CREATE INDEX "wallets_frozen_idx" ON "wallets" USING btree ("frozen_at");