import { db } from '$lib/server/db/postgres';
import { employeeProfiles, users } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { formatManager, matchName } from '$lib/server/name-match';

export interface ResolvedManager {
	/** Ready to render: "Deepak Guduru (CIPL0225)", or just the name if unlinked. */
	display: string;
	/** Set only when the manager is a real portal user. */
	userId: string | null;
	employeeCode: string | null;
	/** True when the name came from the HR sheet and matches nobody in the portal. */
	unlinked: boolean;
}

export interface ManagerSources {
	/** users.reportsTo — the authoritative link for the direct manager. */
	reportsTo: string | null;
	/** The direct manager's name as written in the HR sheet. */
	directRaw: string | null;
	/** employeeProfiles.dottedLineManagerId — resolved at import time. */
	dottedManagerId: string | null;
	/** The dotted-line manager's name as written in the HR sheet. */
	dottedRaw: string | null;
	/**
	 * The employee these managers belong to. Excluded from name lookups so a
	 * person is never shown as their own manager.
	 */
	selfUserId?: string | null;
}

export interface ResolvedManagers {
	direct: ResolvedManager | null;
	dotted: ResolvedManager | null;
}

/**
 * Turns manager references into display-ready values.
 *
 * A manager is preferentially resolved through the real FK, which yields their
 * employee code. When no link exists the raw HR-sheet name is shown on its own:
 * some managers named in the tracker are senior staff outside this roster, or
 * placeholders like "Chief", and inventing a code for them would misrepresent
 * the data.
 */
export async function resolveManagers(sources: ManagerSources): Promise<ResolvedManagers> {
	const ids = [sources.reportsTo, sources.dottedManagerId].filter((id): id is string => Boolean(id));

	const rows = ids.length
		? await db
				.select({
					id: users.id,
					fullName: users.fullName,
					employeeCode: employeeProfiles.employeeCode
				})
				.from(users)
				.leftJoin(employeeProfiles, eq(employeeProfiles.userId, users.id))
				.where(inArray(users.id, ids))
		: [];

	const byId = new Map(rows.map((r) => [r.id, r]));

	// Only the bulk import ever sets users.reportsTo, so accounts created any
	// other way carry the manager's name from the HR sheet with no link behind
	// it. Rather than report a colleague who is plainly in the portal as "not in
	// system", an unlinked name is matched against the live roster — which is
	// also what keeps a manager's employee code showing after the raw name and
	// the link disagree.
	const needsLookup =
		(!sources.reportsTo && Boolean(sources.directRaw?.trim())) ||
		(!sources.dottedManagerId && Boolean(sources.dottedRaw?.trim()));

	const roster = needsLookup
		? await db
				.select({
					id: users.id,
					fullName: users.fullName,
					employeeCode: employeeProfiles.employeeCode
				})
				.from(users)
				.leftJoin(employeeProfiles, eq(employeeProfiles.userId, users.id))
		: [];

	const build = (id: string | null, raw: string | null): ResolvedManager | null => {
		const linked = id ? byId.get(id) : undefined;
		if (linked) {
			return {
				display: formatManager(linked.fullName, linked.employeeCode) ?? linked.fullName,
				userId: linked.id,
				employeeCode: linked.employeeCode,
				unlinked: false
			};
		}

		const name = raw?.trim();
		if (!name) return null;

		// No link — try the roster. An ambiguous name resolves to nothing rather
		// than guessing between two people.
		const result = matchName(
			name,
			roster
				.filter((r) => r.id !== sources.selfUserId)
				.map((r) => ({ key: r.id, fullName: r.fullName }))
		);
		if (result.status === 'matched') {
			const found = roster.find((r) => r.id === result.key);
			if (found) {
				return {
					display: formatManager(found.fullName, found.employeeCode) ?? found.fullName,
					userId: found.id,
					employeeCode: found.employeeCode,
					unlinked: false
				};
			}
		}

		return { display: name, userId: null, employeeCode: null, unlinked: true };
	};

	return {
		direct: build(sources.reportsTo, sources.directRaw),
		dotted: build(sources.dottedManagerId, sources.dottedRaw)
	};
}
