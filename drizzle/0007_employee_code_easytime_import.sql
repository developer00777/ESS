-- Employee code becomes the portal-wide identity key, and attendance ingestion
-- moves from the live ADMS push to the EasyTime Pro scheduled file export.

-- 1. Employee code on the profile. Backfilled from any bulk import that already
--    parsed it, then made unique (it is the attendance join key).
ALTER TABLE "employee_profiles" ADD COLUMN "employee_code" varchar(32);--> statement-breakpoint

UPDATE "employee_profiles" ep
SET "employee_code" = upper(trim(bir."employee_code"))
FROM "bulk_import_rows" bir
WHERE bir."created_user_id" = ep."user_id"
  AND bir."employee_code" IS NOT NULL
  AND trim(bir."employee_code") <> ''
  AND ep."employee_code" IS NULL;--> statement-breakpoint

-- Guard the backfill: if the same code was imported twice, keep it on the
-- earliest profile only so the unique constraint can be added.
UPDATE "employee_profiles"
SET "employee_code" = NULL
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (PARTITION BY "employee_code" ORDER BY "updated_at") AS rn
    FROM "employee_profiles"
    WHERE "employee_code" IS NOT NULL
  ) dupes WHERE rn > 1
);--> statement-breakpoint

ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_employee_code_unique" UNIQUE("employee_code");--> statement-breakpoint

-- 2. The device PIN is superseded by employee_code.
ALTER TABLE "employee_profiles" DROP COLUMN IF EXISTS "biometric_device_id";--> statement-breakpoint

-- 3. EasyTime Pro import tables.
CREATE TABLE "attendance_import_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" uuid,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_import_tokens_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint

CREATE TABLE "attendance_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid,
	"uploaded_by" uuid,
	"filename" text,
	"row_count" integer NOT NULL,
	"matched_count" integer NOT NULL,
	"unmatched_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "attendance_import_tokens" ADD CONSTRAINT "attendance_import_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_imports" ADD CONSTRAINT "attendance_imports_token_id_attendance_import_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."attendance_import_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_imports" ADD CONSTRAINT "attendance_imports_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- 4. device_punches moves from ADMS shape to the EasyTime export shape.
--    The old push path was never used in production, so its rows are dropped
--    rather than migrated; the table is rebuilt with the richer columns.
DROP TABLE IF EXISTS "device_punches";--> statement-breakpoint
DROP TABLE IF EXISTS "device_push_tokens";--> statement-breakpoint

CREATE TABLE "device_punches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid,
	"emp_code" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"dept_code" text,
	"dept_name" text,
	"punched_at" timestamp with time zone NOT NULL,
	"verify_type" text,
	"punch_state" text,
	"direction" text,
	"work_code" text,
	"card_number" text,
	"area_name" text,
	"terminal_alias" text,
	"terminal_sn" text,
	"temperature" text,
	"mask_flag" text,
	"raw_line" text NOT NULL,
	"matched_user_id" uuid,
	"attendance_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "device_punches" ADD CONSTRAINT "device_punches_import_id_attendance_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."attendance_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_punches" ADD CONSTRAINT "device_punches_matched_user_id_users_id_fk" FOREIGN KEY ("matched_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_punches" ADD CONSTRAINT "device_punches_attendance_id_attendance_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance"("id") ON DELETE no action ON UPDATE no action;
