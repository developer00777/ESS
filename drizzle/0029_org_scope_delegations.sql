CREATE TABLE "delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"reason" text,
	"created_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delegations_window_valid" CHECK ("delegations"."ends_on" >= "delegations"."starts_on"),
	CONSTRAINT "delegations_not_self" CHECK ("delegations"."from_id" <> "delegations"."to_id")
);
--> statement-breakpoint
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_from_id_users_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_to_id_users_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delegations_from_window" ON "delegations" USING btree ("from_id","starts_on","ends_on");--> statement-breakpoint
CREATE INDEX "delegations_to" ON "delegations" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX "employee_profiles_dotted_manager" ON "employee_profiles" USING btree ("dotted_line_manager_id");--> statement-breakpoint
CREATE INDEX "employee_profiles_hr_user" ON "employee_profiles" USING btree ("hr_user_id");--> statement-breakpoint
CREATE INDEX "users_reports_to" ON "users" USING btree ("reports_to");