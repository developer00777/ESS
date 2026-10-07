ALTER TABLE "attendance_imports" ADD COLUMN IF NOT EXISTS "duplicate_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "device_punches" ADD COLUMN IF NOT EXISTS "dedupe_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "device_punches_dedupe_key" ON "device_punches" USING btree ("dedupe_key");
