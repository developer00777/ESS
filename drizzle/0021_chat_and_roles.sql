CREATE TYPE "public"."chat_channel_kind" AS ENUM('channel', 'dm', 'group', 'desk', 'system', 'announcements');--> statement-breakpoint
CREATE TYPE "public"."chat_channel_source" AS ENUM('manual', 'team', 'shift', 'everyone');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "champ_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user" uuid NOT NULL,
	"to_user" uuid NOT NULL,
	"title" text NOT NULL,
	"due_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chat_celebrations" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"on_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "chat_channel_kind" NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"source" "chat_channel_source" DEFAULT 'manual' NOT NULL,
	"source_id" uuid,
	"is_private" boolean DEFAULT false NOT NULL,
	"read_only" boolean DEFAULT false NOT NULL,
	"team_id" uuid,
	"unique_key" text,
	"desk_owner_id" uuid,
	"desk_status" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "chat_channels_unique_key_unique" UNIQUE("unique_key")
);
--> statement-breakpoint
CREATE TABLE "chat_members" (
	"channel_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"added_by" text DEFAULT 'person' NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"muted_until" timestamp with time zone,
	"notify" text DEFAULT 'all' NOT NULL,
	"last_digest_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"thread_root_id" uuid,
	"author_id" uuid,
	"kind" text DEFAULT 'text' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"card" jsonb,
	"file_id" text,
	"file_name" text,
	"file_mime" text,
	"file_size" integer,
	"mentions" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"mentions_all" boolean DEFAULT false NOT NULL,
	"sensitive" boolean DEFAULT false NOT NULL,
	"visible_to" uuid,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"hidden_by" uuid,
	"pinned_at" timestamp with time zone,
	"pinned_by" uuid,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"last_reply_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_poll_votes" (
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"option_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email_digest" boolean DEFAULT true NOT NULL,
	"sound" boolean DEFAULT true NOT NULL,
	"celebrations" boolean DEFAULT true NOT NULL,
	"push" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_reactions" (
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_id" uuid,
	"text" text NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"reported_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_saved" (
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_by" uuid,
	"done_by" uuid,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"base_role" "role" DEFAULT 'employee' NOT NULL,
	"capabilities" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "custom_role_id" uuid;--> statement-breakpoint
ALTER TABLE "champ_tasks" ADD CONSTRAINT "champ_tasks_from_user_users_id_fk" FOREIGN KEY ("from_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "champ_tasks" ADD CONSTRAINT "champ_tasks_to_user_users_id_fk" FOREIGN KEY ("to_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_celebrations" ADD CONSTRAINT "chat_celebrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_desk_owner_id_users_id_fk" FOREIGN KEY ("desk_owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_visible_to_users_id_fk" FOREIGN KEY ("visible_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_pinned_by_users_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_poll_votes" ADD CONSTRAINT "chat_poll_votes_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_poll_votes" ADD CONSTRAINT "chat_poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_prefs" ADD CONSTRAINT "chat_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reactions" ADD CONSTRAINT "chat_reactions_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reactions" ADD CONSTRAINT "chat_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reminders" ADD CONSTRAINT "chat_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reminders" ADD CONSTRAINT "chat_reminders_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_saved" ADD CONSTRAINT "chat_saved_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_saved" ADD CONSTRAINT "chat_saved_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_todos" ADD CONSTRAINT "chat_todos_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_todos" ADD CONSTRAINT "chat_todos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_todos" ADD CONSTRAINT "chat_todos_done_by_users_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_roles" ADD CONSTRAINT "custom_roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_celebrations_user_kind_date" ON "chat_celebrations" USING btree ("user_id","kind","on_date");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_members_channel_user" ON "chat_members" USING btree ("channel_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_poll_votes_message_user_option" ON "chat_poll_votes" USING btree ("message_id","user_id","option_index");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_reactions_message_user_emoji" ON "chat_reactions" USING btree ("message_id","user_id","emoji");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_saved_message_user" ON "chat_saved" USING btree ("message_id","user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_custom_role_id_custom_roles_id_fk" FOREIGN KEY ("custom_role_id") REFERENCES "public"."custom_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_channel_created" ON "chat_messages" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_thread_root" ON "chat_messages" USING btree ("thread_root_id");--> statement-breakpoint
CREATE INDEX "chat_members_user" ON "chat_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_messages_search" ON "chat_messages" USING gin (to_tsvector('simple', "body"));--> statement-breakpoint
INSERT INTO "custom_roles" ("name", "description", "base_role", "capabilities") VALUES
	('IT Support', 'Looks after logins, passwords and the biometric devices.', 'employee',
		ARRAY['people.directory','people.create_login','people.reset_password','people.password_activity','people.employee_code','attendance.biometric_upload','attendance.device_sync','chat.dm_anyone']),
	('Operations', 'Runs day-to-day operations across teams: rosters, attendance and channels.', 'employee',
		ARRAY['people.directory','org.view','attendance.biometric_upload','leave.week_off_rosters','chat.dm_anyone','chat.create_channels','chat.mention_all'])
ON CONFLICT ("name") DO NOTHING;
