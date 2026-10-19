CREATE TABLE "payroll_cell_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_key" varchar(7) NOT NULL,
	"sheet" varchar(32) NOT NULL,
	"row_key" varchar(96) NOT NULL,
	"column" text NOT NULL,
	"value" text,
	"original" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_key" varchar(7) NOT NULL,
	"file_name" text NOT NULL,
	"compared_cells" integer NOT NULL,
	"matched_cells" integer NOT NULL,
	"result" jsonb NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payroll_cell_overrides" ADD CONSTRAINT "payroll_cell_overrides_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_reconciliations" ADD CONSTRAINT "payroll_reconciliations_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_cell_overrides_cell" ON "payroll_cell_overrides" USING btree ("cycle_key","sheet","row_key","column");