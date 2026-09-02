ALTER TABLE "leave_allocations" ADD COLUMN "hr_set_days" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "monthly_usage_cap" numeric(5, 2);