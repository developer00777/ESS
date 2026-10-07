ALTER TABLE "attendance_imports" ADD COLUMN "duplicate_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "device_punches" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "device_punches_dedupe_key" ON "device_punches" USING btree ("dedupe_key");