CREATE TYPE "public"."calendar_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "holiday_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_group_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "calendar_status" DEFAULT 'draft' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source_document_id" text,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_id" uuid NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'PUBLIC' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_groups_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD COLUMN "shift_group_id" uuid;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "code" varchar(32);--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "eligibility" text;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "requires_documentation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "documentation_note" text;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "fixed_days" integer;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "source_document_id" text;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "policy_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "effective_from" date;--> statement-breakpoint
ALTER TABLE "holiday_calendars" ADD CONSTRAINT "holiday_calendars_shift_group_id_shift_groups_id_fk" FOREIGN KEY ("shift_group_id") REFERENCES "public"."shift_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_calendars" ADD CONSTRAINT "holiday_calendars_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_calendar_id_holiday_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."holiday_calendars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_shift_group_id_shift_groups_id_fk" FOREIGN KEY ("shift_group_id") REFERENCES "public"."shift_groups"("id") ON DELETE no action ON UPDATE no action;