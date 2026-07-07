ALTER TYPE "public"."kyc_session_status" ADD VALUE 'RECTO_ONLY' BEFORE 'OCR_DONE';--> statement-breakpoint
ALTER TABLE "kyc_sessions" ADD COLUMN "agent_user_id" integer;--> statement-breakpoint
ALTER TABLE "kyc_sessions" ADD COLUMN "recto_uploaded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "kyc_sessions" ADD COLUMN "verso_uploaded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "kyc_sessions" ADD COLUMN "recto_ocr_data" jsonb;--> statement-breakpoint
ALTER TABLE "kyc_sessions" ADD COLUMN "verso_ocr_data" jsonb;--> statement-breakpoint
ALTER TABLE "kyc_sessions" ADD COLUMN "recto_confidence" integer;--> statement-breakpoint
ALTER TABLE "kyc_sessions" ADD COLUMN "verso_confidence" integer;--> statement-breakpoint
ALTER TABLE "kyc_sessions" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kyc_sessions" ADD COLUMN "quality_checks" jsonb;--> statement-breakpoint
ALTER TABLE "kyc_sessions" ADD COLUMN "magic_token" varchar(128);--> statement-breakpoint
ALTER TABLE "kyc_sessions" ADD COLUMN "magic_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "kyc_sessions" ADD CONSTRAINT "kyc_sessions_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kyc_sessions_agent_idx" ON "kyc_sessions" USING btree ("agent_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_sessions_magic_token_idx" ON "kyc_sessions" USING btree ("magic_token");