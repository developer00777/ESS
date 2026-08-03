-- Pink leave (menstrual leave): one day per calendar month for confirmed female
-- employees. The quota refreshes monthly and does NOT accumulate — unused days
-- expire at month end rather than building a balance.

-- Monthly-quota + gender restriction on leave types. Both are null for existing
-- accrual-based types, so nothing about Casual/Sick/Earned leave changes.
ALTER TABLE "leave_types" ADD COLUMN "monthly_quota_days" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "gender_eligibility" text;--> statement-breakpoint

-- HR override. null = follow the automatic rule; true/false = explicit decision.
ALTER TABLE "employee_profiles" ADD COLUMN "pink_leave_eligible_override" boolean;--> statement-breakpoint

-- Seed the leave type itself. Guarded so re-running is safe and so it doesn't
-- duplicate if HR has already published a policy containing it.
INSERT INTO "leave_types" (
  "code", "name", "accrual_per_month", "carry_forward_cap",
  "encashment_eligible", "eligibility", "requires_documentation",
  "monthly_quota_days", "gender_eligibility", "notes", "is_active"
)
SELECT
  'PINK', 'Pink Leave', 0, 0,
  false, 'post_probation', false,
  1, 'female',
  'One day per calendar month for confirmed female employees. Does not carry over — unused days expire at month end.',
  true
WHERE NOT EXISTS (SELECT 1 FROM "leave_types" WHERE upper("code") = 'PINK');
