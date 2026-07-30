ALTER TYPE "public"."role" ADD VALUE 'admin' BEFORE 'team_lead';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT true NOT NULL;