CREATE TYPE "public"."login_email_status" AS ENUM('pending', 'approved', 'sending', 'sent', 'failed', 'cancelled', 'skipped');--> statement-breakpoint
CREATE TABLE "login_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"import_id" uuid,
	"send_to" text,
	"status" "login_email_status" DEFAULT 'pending' NOT NULL,
	"requested_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"attempted_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "login_emails" ADD CONSTRAINT "login_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_emails" ADD CONSTRAINT "login_emails_import_id_bulk_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."bulk_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_emails" ADD CONSTRAINT "login_emails_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_emails" ADD CONSTRAINT "login_emails_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;