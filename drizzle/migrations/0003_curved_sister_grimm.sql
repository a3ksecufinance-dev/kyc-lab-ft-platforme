CREATE TABLE "aml_rule_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"user_id" integer,
	"type" varchar(30) DEFAULT 'FALSE_POSITIVE' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aml_rule_feedback" ADD CONSTRAINT "aml_rule_feedback_rule_id_aml_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."aml_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_rule_feedback" ADD CONSTRAINT "aml_rule_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aml_feedback_rule_idx" ON "aml_rule_feedback" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "aml_feedback_date_idx" ON "aml_rule_feedback" USING btree ("created_at");