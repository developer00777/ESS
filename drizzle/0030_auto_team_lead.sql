-- Managers get Team Lead access on their own: a plain Employee becomes a Team
-- Lead when someone's reporting line is newly pointed at them, or when they
-- are newly set to report to Chief — however that happened (People settings,
-- a new login, a bulk import, Champ, a script).
--
-- It is a default, not a lock. It fires only when the line actually changes,
-- so a Super Admin who sets the role back by hand is not overridden by later
-- saves; only a new change to the line promotes again. Admins, Super Admins
-- and people on a named role keep the access they have.
CREATE OR REPLACE FUNCTION promote_reporting_manager() RETURNS trigger AS $$
BEGIN
	IF NEW.reports_to IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.reports_to IS DISTINCT FROM OLD.reports_to) THEN
		UPDATE users SET role = 'team_lead'
		WHERE id = NEW.reports_to AND role = 'employee' AND custom_role_id IS NULL;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS users_promote_reporting_manager ON users;
--> statement-breakpoint
CREATE TRIGGER users_promote_reporting_manager
	AFTER INSERT OR UPDATE OF reports_to ON users
	FOR EACH ROW EXECUTE FUNCTION promote_reporting_manager();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION promote_chief_report() RETURNS trigger AS $$
BEGIN
	IF NEW.reports_to_chief AND (TG_OP = 'INSERT' OR NOT OLD.reports_to_chief) THEN
		UPDATE users SET role = 'team_lead'
		WHERE id = NEW.user_id AND role = 'employee' AND custom_role_id IS NULL;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS employee_profiles_promote_chief_report ON employee_profiles;
--> statement-breakpoint
CREATE TRIGGER employee_profiles_promote_chief_report
	AFTER INSERT OR UPDATE OF reports_to_chief ON employee_profiles
	FOR EACH ROW EXECUTE FUNCTION promote_chief_report();
--> statement-breakpoint
-- Once, for everyone who already manages someone or reports to Chief.
UPDATE users SET role = 'team_lead'
WHERE role = 'employee' AND custom_role_id IS NULL
	AND (
		id IN (SELECT reports_to FROM users WHERE reports_to IS NOT NULL)
		OR id IN (SELECT user_id FROM employee_profiles WHERE reports_to_chief)
	);
