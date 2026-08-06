CREATE TYPE "public"."week_off_pattern" AS ENUM('fixed', 'rotational');--> statement-breakpoint
CREATE TABLE "week_off_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"roster_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"assigned_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "week_off_rosters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"pattern" "week_off_pattern" NOT NULL,
	"weekdays" jsonb,
	"rotation_weeks" jsonb,
	"cycle_weeks" integer,
	"rotation_anchor_date" date,
	"team_id" uuid,
	"status" "calendar_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "week_off_assignments" ADD CONSTRAINT "week_off_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_off_assignments" ADD CONSTRAINT "week_off_assignments_roster_id_week_off_rosters_id_fk" FOREIGN KEY ("roster_id") REFERENCES "public"."week_off_rosters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_off_assignments" ADD CONSTRAINT "week_off_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_off_rosters" ADD CONSTRAINT "week_off_rosters_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_off_rosters" ADD CONSTRAINT "week_off_rosters_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_off_rosters" ADD CONSTRAINT "week_off_rosters_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;