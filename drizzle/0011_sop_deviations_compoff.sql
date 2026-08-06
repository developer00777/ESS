CREATE TYPE "public"."comp_off_status" AS ENUM('pending', 'approved', 'rejected', 'used', 'lapsed');--> statement-breakpoint
CREATE TYPE "public"."deviation_reason" AS ENUM('login_not_captured', 'logout_not_captured', 'missing_biometric_punch', 'biometric_system_mismatch', 'prohance_mismatch', 'system_server_issue', 'machine_malfunction', 'technical_error', 'wrong_half_day', 'wrong_absent', 'incorrect_working_hours');--> statement-breakpoint
CREATE TYPE "public"."deviation_status" AS ENUM('pending', 'approved', 'rejected', 'needs_manager_approval', 'cancelled');--> statement-breakpoint
CREATE TABLE "attendance_deviations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"reason" "deviation_reason" NOT NULL,
	"description" text NOT NULL,
	"claimed_check_in" text,
	"claimed_check_out" text,
	"status" "deviation_status" DEFAULT 'pending' NOT NULL,
	"ai_summary" text,
	"ai_suggested_reason" "deviation_reason",
	"ai_confidence" numeric(4, 3),
	"ai_evidence_note" text,
	"ai_flags" jsonb,
	"ai_model" text,
	"ai_ran_at" timestamp with time zone,
	"evidence_snapshot" jsonb,
	"counts_toward_monthly_cap" boolean DEFAULT true NOT NULL,
	"month_key" varchar(7) NOT NULL,
	"supporting_document_id" text,
	"reviewer_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comp_off_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"worked_date" date NOT NULL,
	"worked_minutes" integer,
	"status" "comp_off_status" DEFAULT 'pending' NOT NULL,
	"expires_on" date NOT NULL,
	"used_on" date,
	"used_application_id" uuid,
	"evidence_snapshot" jsonb,
	"note" text,
	"approver_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_deviations" ADD CONSTRAINT "attendance_deviations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_deviations" ADD CONSTRAINT "attendance_deviations_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_off_credits" ADD CONSTRAINT "comp_off_credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_off_credits" ADD CONSTRAINT "comp_off_credits_used_application_id_leave_applications_id_fk" FOREIGN KEY ("used_application_id") REFERENCES "public"."leave_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_off_credits" ADD CONSTRAINT "comp_off_credits_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;