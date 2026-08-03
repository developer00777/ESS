CREATE TYPE "public"."bulk_import_row_status" AS ENUM('ready', 'needs_review', 'created', 'skipped_existing');--> statement-breakpoint
CREATE TYPE "public"."bulk_import_status" AS ENUM('pending_review', 'applied');--> statement-breakpoint
CREATE TABLE "bulk_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"employee_code" text,
	"full_name" text NOT NULL,
	"designation" text,
	"official_email" text NOT NULL,
	"team_and_floor" text,
	"reporting_authority_raw" text,
	"reports_to_row_id" uuid,
	"role" "role" DEFAULT 'employee' NOT NULL,
	"status" "bulk_import_row_status" DEFAULT 'ready' NOT NULL,
	"existing_user_id" uuid,
	"created_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "bulk_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"uploaded_by" uuid,
	"status" "bulk_import_status" DEFAULT 'pending_review' NOT NULL,
	"row_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "bulk_import_rows" ADD CONSTRAINT "bulk_import_rows_import_id_bulk_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."bulk_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_import_rows" ADD CONSTRAINT "bulk_import_rows_reports_to_row_id_bulk_import_rows_id_fk" FOREIGN KEY ("reports_to_row_id") REFERENCES "public"."bulk_import_rows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_import_rows" ADD CONSTRAINT "bulk_import_rows_existing_user_id_users_id_fk" FOREIGN KEY ("existing_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_import_rows" ADD CONSTRAINT "bulk_import_rows_created_user_id_users_id_fk" FOREIGN KEY ("created_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_imports" ADD CONSTRAINT "bulk_imports_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;