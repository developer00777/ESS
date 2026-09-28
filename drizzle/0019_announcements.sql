CREATE TYPE "public"."announcement_kind" AS ENUM('urgent', 'event', 'update');--> statement-breakpoint
CREATE TYPE "public"."announcement_status" AS ENUM('draft', 'published', 'taken_down');--> statement-breakpoint
CREATE TABLE "announcement_reads" (
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "announcement_kind" NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"body" text DEFAULT '' NOT NULL,
	"event_date" date,
	"event_time" varchar(5),
	"audience_all" boolean DEFAULT true NOT NULL,
	"audience_team_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"audience_shift_group_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"requires_ack" boolean DEFAULT false NOT NULL,
	"urgent_days" integer DEFAULT 3 NOT NULL,
	"email_copy" boolean DEFAULT false NOT NULL,
	"email_sent_at" timestamp with time zone,
	"attachment_id" text,
	"attachment_name" text,
	"status" "announcement_status" DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_reads_announcement_user" ON "announcement_reads" USING btree ("announcement_id","user_id");