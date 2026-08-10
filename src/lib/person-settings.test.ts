import { describe, test, expect } from 'vitest';

/**
 * Guards on the person settings panel's save.
 *
 * Role, reporting manager and HR all feed the approval chain, so a bad value
 * here does not fail loudly — it silently misroutes approvals or makes the
 * chain unresolvable. The reporting-loop check is the important one: a cycle
 * would make managerFor() walk forever.
 *
 * Mirrors src/routes/api/admin/users/[id]/settings/+server.ts.
 */

interface Person {
	id: string;
	reportsTo: string | null;
}

/** Walks up the reporting line from `managerId`, refusing if it returns to `userId`. */
function createsLoop(userId: string, managerId: string | null, people: Person[]): boolean {
	if (!managerId) return false;
	const byId = new Map(people.map((p) => [p.id, p]));
	const seen = new Set<string>([userId]);
	let cursor: string | null = managerId;
	while (cursor) {
		if (seen.has(cursor)) return true;
		seen.add(cursor);
		cursor = byId.get(cursor)?.reportsTo ?? null;
	}
	return false;
}

describe('assigning a manager always succeeds', () => {
	/**
	 * Mirrors the settings endpoint: walk up from the new manager, and if the
	 * chain arrives back at this employee, clear the line that closes it rather
	 * than refusing the assignment. Refusing left an admin unable to express a
	 * real re-organisation — the production data has exactly this shape
	 * (Bhavana → Prasanna, Deepak → Bhavana), so pointing Prasanna at Deepak was
	 * blocked outright.
	 */
	function assign(userId: string, managerId: string | null, people: Person[]) {
		if (!managerId) return { ok: true, cleared: [] as string[] };
		if (managerId === userId) return { ok: false, cleared: [] };
		const byId = new Map(people.map((p) => [p.id, p]));
		const cleared: string[] = [];
		const seen = new Set<string>();
		let cursor: string | null = managerId;
		while (cursor && !seen.has(cursor)) {
			seen.add(cursor);
			const row = byId.get(cursor);
			if (!row) break;
			if (row.reportsTo === userId) {
				cleared.push(row.id);
				break;
			}
			cursor = row.reportsTo;
		}
		return { ok: true, cleared };
	}

	// The production shape: bhavana → prasanna, deepak → bhavana.
	const org: Person[] = [
		{ id: 'prasanna', reportsTo: null },
		{ id: 'bhavana', reportsTo: 'prasanna' },
		{ id: 'deepak', reportsTo: 'bhavana' }
	];

	test('inverting a reporting line is allowed, not refused', () => {
		const r = assign('prasanna', 'deepak', org);
		expect(r.ok).toBe(true);
	});

	test('the line that would close the loop is the one cleared', () => {
		// bhavana → prasanna is what makes it a cycle, so bhavana is freed.
		expect(assign('prasanna', 'deepak', org).cleared).toEqual(['bhavana']);
	});

	test('an assignment with no cycle clears nobody', () => {
		expect(assign('bhavana', 'deepak', [
			{ id: 'bhavana', reportsTo: null },
			{ id: 'deepak', reportsTo: null }
		]).cleared).toEqual([]);
	});

	test('a direct swap frees the other person', () => {
		const pair: Person[] = [
			{ id: 'a', reportsTo: null },
			{ id: 'b', reportsTo: 'a' }
		];
		expect(assign('a', 'b', pair)).toEqual({ ok: true, cleared: ['b'] });
	});

	test('reporting to yourself is still refused', () => {
		// Not a re-organisation, just invalid.
		expect(assign('a', 'a', org).ok).toBe(false);
	});

	test('clearing a manager needs no walk at all', () => {
		expect(assign('bhavana', null, org)).toEqual({ ok: true, cleared: [] });
	});

	test('the walk terminates on a pre-existing cycle', () => {
		// Defensive: bad data must not hang the request.
		const broken: Person[] = [
			{ id: 'x', reportsTo: 'y' },
			{ id: 'y', reportsTo: 'x' }
		];
		expect(assign('z', 'x', broken).ok).toBe(true);
	});
});

/**
 * Cycle detection itself. No longer used to refuse an assignment — the endpoint
 * clears the offending line instead — but the detection has to stay correct,
 * since it is what decides *which* line gets cleared.
 */
describe('detecting a reporting-line cycle', () => {
	// a → b → c (c reports to nobody)
	const people: Person[] = [
		{ id: 'a', reportsTo: 'b' },
		{ id: 'b', reportsTo: 'c' },
		{ id: 'c', reportsTo: null }
	];

	test('a normal assignment is fine', () => {
		expect(createsLoop('a', 'c', people)).toBe(false);
	});

	test('reporting to yourself is a loop', () => {
		expect(createsLoop('a', 'a', people)).toBe(true);
	});

	test('a direct two-person cycle is caught', () => {
		// b already reports to c; making c report to b closes the loop.
		expect(createsLoop('c', 'b', people)).toBe(true);
	});

	test('a longer cycle is caught', () => {
		// a → b → c, so pointing c at a closes a three-person loop.
		expect(createsLoop('c', 'a', people)).toBe(true);
	});

	test('clearing the manager is never a loop', () => {
		expect(createsLoop('a', null, people)).toBe(false);
	});

	test('an unrelated branch does not false-positive', () => {
		const branched: Person[] = [
			{ id: 'a', reportsTo: 'boss' },
			{ id: 'b', reportsTo: 'boss' },
			{ id: 'boss', reportsTo: null }
		];
		expect(createsLoop('a', 'b', branched)).toBe(false);
	});
});

describe('self-assignment', () => {
	const invalid = (userId: string, value: string | null) => Boolean(value) && value === userId;

	test('nobody reports to themselves', () => {
		expect(invalid('a', 'a')).toBe(true);
		expect(invalid('a', 'b')).toBe(false);
	});

	test('nobody is their own HR contact', () => {
		expect(invalid('a', 'a')).toBe(true);
	});

	test('clearing either is allowed', () => {
		expect(invalid('a', null)).toBe(false);
	});
});

describe('which fields a partial save touches', () => {
	// The panel sends only what it holds; a key that is absent must be left
	// alone rather than nulled, so one panel cannot wipe another's field.
	function fieldsTouched(body: Record<string, unknown>): string[] {
		return ['role', 'reportsTo', 'hrUserId', 'shiftGroupId', 'officeTimings'].filter((k) =>
			Object.prototype.hasOwnProperty.call(body, k)
		);
	}

	test('only the keys present are considered', () => {
		expect(fieldsTouched({ role: 'employee' })).toEqual(['role']);
	});

	test('an explicit null is a change, not an absence', () => {
		expect(fieldsTouched({ reportsTo: null })).toEqual(['reportsTo']);
	});

	test('an empty body changes nothing', () => {
		expect(fieldsTouched({})).toEqual([]);
	});
});

describe('the HR stage after an assignment', () => {
	// Assigned HR routes the request; admins remain able to act so nothing
	// stalls when that person is away.
	const canApproveHr = (
		actor: { id: string; isAdmin: boolean },
		assignedHrId: string | null,
		requesterId: string,
		isSuperAdmin = false
	) => {
		if (actor.id === requesterId) return false;
		// A named HR owns the request; admins only cover the unassigned.
		if (assignedHrId) return assignedHrId === actor.id || isSuperAdmin;
		return actor.isAdmin;
	};

	test('the assigned HR person may approve', () => {
		expect(canApproveHr({ id: 'hr1', isAdmin: false }, 'hr1', 'emp')).toBe(true);
	});

	test('a different non-admin may not', () => {
		expect(canApproveHr({ id: 'hr2', isAdmin: false }, 'hr1', 'emp')).toBe(false);
	});

	test('an ordinary admin does not see a request with a named HR', () => {
		expect(canApproveHr({ id: 'boss', isAdmin: true }, 'hr1', 'emp')).toBe(false);
	});

	test('a Super Admin keeps an override', () => {
		expect(canApproveHr({ id: 'boss', isAdmin: true }, 'hr1', 'emp', true)).toBe(true);
	});

	test('with nobody assigned, admins still cover it', () => {
		expect(canApproveHr({ id: 'boss', isAdmin: true }, null, 'emp')).toBe(true);
		expect(canApproveHr({ id: 'nobody', isAdmin: false }, null, 'emp')).toBe(false);
	});

	test('being your own assigned HR still cannot self-approve', () => {
		expect(canApproveHr({ id: 'emp', isAdmin: true }, 'emp', 'emp')).toBe(false);
	});
});
