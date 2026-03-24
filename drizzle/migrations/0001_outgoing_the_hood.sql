CREATE TYPE "public"."aml_rule_category" AS ENUM('THRESHOLD', 'FREQUENCY', 'PATTERN', 'GEOGRAPHY', 'COUNTERPARTY', 'VELOCITY', 'CUSTOMER');--> statement-breakpoint
CREATE TYPE "public"."aml_rule_status" AS ENUM('ACTIVE', 'INACTIVE', 'TESTING');--> statement-breakpoint
CREATE TABLE "aml_rule_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"transaction_id" integer,
	"customer_id" integer,
	"triggered" boolean DEFAULT false NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"details" jsonb,
	"execution_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aml_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"category" "aml_rule_category" NOT NULL,
	"status" "aml_rule_status" DEFAULT 'ACTIVE' NOT NULL,
	"conditions" jsonb NOT NULL,
	"base_score" integer DEFAULT 50 NOT NULL,
	"priority" varchar(10) DEFAULT 'MEDIUM' NOT NULL,
	"alert_type" varchar(20) DEFAULT 'THRESHOLD' NOT NULL,
	"threshold_value" numeric(15, 2),
	"window_minutes" integer,
	"count_threshold" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "aml_rules_rule_id_unique" UNIQUE("rule_id")
);
--> statement-breakpoint
ALTER TABLE "aml_rule_executions" ADD CONSTRAINT "aml_rule_executions_rule_id_aml_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."aml_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_rule_executions" ADD CONSTRAINT "aml_rule_executions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_rule_executions" ADD CONSTRAINT "aml_rule_executions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_rules" ADD CONSTRAINT "aml_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_rules" ADD CONSTRAINT "aml_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aml_exec_rule_idx" ON "aml_rule_executions" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "aml_exec_tx_idx" ON "aml_rule_executions" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "aml_exec_date_idx" ON "aml_rule_executions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "aml_exec_triggered_idx" ON "aml_rule_executions" USING btree ("triggered");--> statement-breakpoint
CREATE UNIQUE INDEX "aml_rules_rule_id_idx" ON "aml_rules" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "aml_rules_status_idx" ON "aml_rules" USING btree ("status");--> statement-breakpoint
CREATE INDEX "aml_rules_category_idx" ON "aml_rules" USING btree ("category");