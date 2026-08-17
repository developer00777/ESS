ALTER TABLE "leave_allocations" ADD COLUMN "is_hr_set" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_allocations" ADD COLUMN "hr_set_by" uuid;--> statement-breakpoint
ALTER TABLE "leave_allocations" ADD COLUMN "hr_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leave_allocations" ADD COLUMN "hr_set_note" text;--> statement-breakpoint
ALTER TABLE "leave_allocations" ADD CONSTRAINT "leave_allocations_hr_set_by_users_id_fk" FOREIGN KEY ("hr_set_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;