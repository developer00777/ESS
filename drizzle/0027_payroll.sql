CREATE TABLE "payroll_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cycle_key" varchar(7) NOT NULL,
	"salary_action" text,
	"comment" text,
	"remarks" text,
	"opening_balance" numeric(6, 2),
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD COLUMN "last_working_day" date;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_adjustments_user_cycle" ON "payroll_adjustments" USING btree ("user_id","cycle_key");