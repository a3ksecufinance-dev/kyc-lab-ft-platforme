CREATE TYPE "public"."ekyc_status" AS ENUM('PENDING', 'PROCESSING', 'PASS', 'REVIEW', 'FAIL');--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "file_path" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "mime_type" varchar(100);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "storage_backend" varchar(20) DEFAULT 'local';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ocr_data" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ocr_raw_text" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ocr_confidence" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ocr_processed_at" timestamp;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "mrz_data" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ekyc_status" "ekyc_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ekyc_score" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ekyc_checks" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ekyc_provider" varchar(50) DEFAULT 'local';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ekyc_processed_at" timestamp;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_secret" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_backup_codes" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enabled_at" timestamp;--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "documents_ekyc_idx" ON "documents" USING btree ("ekyc_status");