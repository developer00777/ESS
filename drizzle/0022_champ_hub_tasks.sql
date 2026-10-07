CREATE TYPE "public"."meeting_state" AS ENUM('upcoming', 'waiting', 'ready', 'published', 'no_summary');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'in_review', 'done');--> statement-breakpoint
CREATE TABLE "hub_dismissals" (
	"user_id" uuid NOT NULL,
	"need_key" text NOT NULL,
	"until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"title" text NOT NULL,
	"owner_id" uuid,
	"owner_heard" text,
	"due_date" date,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"step_index" integer,
	"confidence" numeric(4, 3),
	"included" boolean DEFAULT true NOT NULL,
	"task_id" uuid,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zoom_uuid" text,
	"zoom_meeting_id" text,
	"host_id" uuid,
	"host_email" text,
	"topic" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_min" integer,
	"state" "meeting_state" DEFAULT 'waiting' NOT NULL,
	"summary" jsonb,
	"extraction" jsonb,
	"source" text DEFAULT 'zoom' NOT NULL,
	"attendee_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"guest_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetings_zoom_uuid_unique" UNIQUE("zoom_uuid")
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"actor_id" uuid,
	"kind" text DEFAULT 'activity' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_subtasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"assignee_id" uuid,
	"created_by" uuid NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"due_date" date,
	"blocked" boolean DEFAULT false NOT NULL,
	"request_state" text,
	"request_note" text,
	"rank" text DEFAULT 'i' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"meeting_id" uuid,
	"source_message_id" uuid,
	"source_channel_id" uuid,
	"source_quote" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zoom_user_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zoom_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"linked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zoom_user_links_zoom_key_unique" UNIQUE("zoom_key")
);
--> statement-breakpoint
ALTER TABLE "hub_dismissals" ADD CONSTRAINT "hub_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_items" ADD CONSTRAINT "meeting_items_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_items" ADD CONSTRAINT "meeting_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_items" ADD CONSTRAINT "meeting_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_subtasks" ADD CONSTRAINT "task_subtasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_message_id_chat_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_channel_id_chat_channels_id_fk" FOREIGN KEY ("source_channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zoom_user_links" ADD CONSTRAINT "zoom_user_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zoom_user_links" ADD CONSTRAINT "zoom_user_links_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hub_dismissals_user_key" ON "hub_dismissals" USING btree ("user_id","need_key");--> statement-breakpoint
-- Champ's Requests tab kept its own small task list (champ_tasks). Champ Hub
-- has one task model, so the open and recent ones move across. champ_tasks is
-- left in place, unread, rather than dropped.
INSERT INTO "tasks" ("title", "assignee_id", "created_by", "status", "due_date", "request_state", "request_note", "completed_at", "created_at", "updated_at")
SELECT
	t.title,
	CASE WHEN t.status = 'declined' THEN t.from_user ELSE t.to_user END,
	t.from_user,
	CASE WHEN t.status = 'done' THEN 'done'::task_status ELSE 'todo'::task_status END,
	(t.due_at AT TIME ZONE 'Asia/Kolkata')::date,
	CASE WHEN t.status = 'declined' THEN 'declined' ELSE NULL END,
	t.note,
	CASE WHEN t.status = 'done' THEN t.decided_at ELSE NULL END,
	t.created_at,
	coalesce(t.decided_at, t.created_at)
FROM "champ_tasks" t
WHERE t.status <> 'withdrawn';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_assignee_status" ON "tasks" ("assignee_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meetings_host_started" ON "meetings" ("host_id", "started_at");
