-- ProHance activity ingestion tables only.
-- NOTE: drizzle-kit's generated diff for this migration also tried to re-apply
-- changes from 0007–0009 (its meta snapshots had drifted from the hand-authored
-- SQL in those migrations). The 0010 snapshot now matches schema.ts, so this
-- drift is healed going forward; the SQL below is trimmed to just what is new.
CREATE TABLE "prohance_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" text DEFAULT 'poll' NOT NULL,
	"range_from" date NOT NULL,
	"range_to" date NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"matched_count" integer DEFAULT 0 NOT NULL,
	"unmatched_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "prohance_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_id" uuid,
	"emp_code" text NOT NULL,
	"console_login_id" text,
	"user_name" text,
	"session_date" date NOT NULL,
	"first_login" timestamp with time zone,
	"last_logout" timestamp with time zone,
	"logged_minutes" integer,
	"active_minutes" integer,
	"idle_minutes" integer,
	"time_on_system_minutes" integer,
	"time_away_minutes" integer,
	"day_type" text,
	"raw" jsonb,
	"matched_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prohance_days" ADD CONSTRAINT "prohance_days_sync_id_prohance_syncs_id_fk" FOREIGN KEY ("sync_id") REFERENCES "public"."prohance_syncs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prohance_days" ADD CONSTRAINT "prohance_days_matched_user_id_users_id_fk" FOREIGN KEY ("matched_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prohance_days_emp_code_session_date" ON "prohance_days" USING btree ("emp_code","session_date");
