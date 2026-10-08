ALTER TYPE "public"."meeting_state" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "join_url" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "agenda" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "approver_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Tasks waiting under the old rule (the assignee accepts) now wait for the
-- assignee's lead instead. With no lead to ask, they simply start.
UPDATE "tasks" t SET "approver_id" = u."reports_to"
FROM "users" u
WHERE t."assignee_id" = u."id" AND t."request_state" = 'pending';--> statement-breakpoint
UPDATE "tasks" SET "request_state" = NULL WHERE "request_state" = 'pending' AND "approver_id" IS NULL;
