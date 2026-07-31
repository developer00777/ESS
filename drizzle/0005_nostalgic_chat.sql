CREATE TABLE "device_punches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid,
	"device_serial" text,
	"device_user_pin" text NOT NULL,
	"punched_at" timestamp with time zone NOT NULL,
	"direction" text,
	"raw_line" text NOT NULL,
	"matched_user_id" uuid,
	"attendance_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" uuid,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_push_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD COLUMN "biometric_device_id" varchar(32);--> statement-breakpoint
ALTER TABLE "device_punches" ADD CONSTRAINT "device_punches_token_id_device_push_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."device_push_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_punches" ADD CONSTRAINT "device_punches_matched_user_id_users_id_fk" FOREIGN KEY ("matched_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_punches" ADD CONSTRAINT "device_punches_attendance_id_attendance_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_biometric_device_id_unique" UNIQUE("biometric_device_id");