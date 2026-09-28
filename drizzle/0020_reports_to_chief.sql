ALTER TABLE "employee_profiles" ADD COLUMN "reports_to_chief" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- People already imported with "Chief" (or the sheet's "Cheif") as their
-- reporting authority and no linked manager now report to Chief.
-- Mirrors isChiefReference() in src/lib/chief.ts.
UPDATE "employee_profiles" p
SET "reports_to_chief" = true
FROM "users" u
WHERE u."id" = p."user_id"
	AND u."reports_to" IS NULL
	AND regexp_replace(
		trim(regexp_replace(lower(coalesce(p."direct_reporting_authority", '')), '[^a-z]+', ' ', 'g')),
		'^the ', ''
	) IN ('chief', 'cheif');
