-- Master-tracker fields: every column the HR Team Master Tracker carries now has
-- a home on the employee profile, and the dotted-line manager gets a resolved
-- link so managers can render as "Name (EMPCODE)".

ALTER TABLE "employee_profiles" ADD COLUMN IF NOT EXISTS "father_dob" date;
ALTER TABLE "employee_profiles" ADD COLUMN IF NOT EXISTS "children" jsonb;
ALTER TABLE "employee_profiles" ADD COLUMN IF NOT EXISTS "dotted_line_manager_id" uuid;

DO $$ BEGIN
 ALTER TABLE "employee_profiles"
   ADD CONSTRAINT "employee_profiles_dotted_line_manager_id_users_id_fk"
   FOREIGN KEY ("dotted_line_manager_id") REFERENCES "users"("id")
   ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Staging columns for the import review screen. The tracker carries ~50 profile
-- fields; they ride along as JSON rather than as ~50 mirror columns on a table
-- whose rows are discarded once an import is applied.
ALTER TABLE "bulk_import_rows" ADD COLUMN IF NOT EXISTS "dotted_line_authority_raw" text;
ALTER TABLE "bulk_import_rows" ADD COLUMN IF NOT EXISTS "profile_data" jsonb;
ALTER TABLE "bulk_import_rows" ADD COLUMN IF NOT EXISTS "repair_notes" jsonb;
