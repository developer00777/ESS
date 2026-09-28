import { describe, it, expect } from 'vitest';
import { buildOrgTree, flattenDepthFirst, reportCount, type OrgPerson } from './org-chart';

const p = (id: string, fullName: string, reportsTo: string | null = null): OrgPerson => ({
	id,
	fullName,
	role: 'employee',
	reportsTo,
	teamId: null
});

describe('buildOrgTree', () => {
	it('grows a chain and stamps the depth', () => {
		const tree = buildOrgTree([p('a', 'Amara'), p('b', 'Bala', 'a'), p('c', 'Chen', 'b')]);

		expect(tree.roots).toHaveLength(1);
		expect(tree.roots[0].person.id).toBe('a');
		expect(tree.roots[0].children[0].person.id).toBe('b');
		expect(tree.roots[0].children[0].depth).toBe(1);
		expect(tree.roots[0].children[0].children[0].depth).toBe(2);
	});

	it('returns every manager-less person as their own root', () => {
		// Today's reality: reports_to is NULL for most accounts, so a flat list
		// of roots is the normal output, not a failure.
		const tree = buildOrgTree([p('a', 'Amara'), p('b', 'Bala'), p('c', 'Chen')]);
		expect(tree.roots.map((r) => r.person.id)).toEqual(['a', 'b', 'c']);
		expect(tree.orphans).toHaveLength(0);
	});

	it('sorts siblings and roots by name', () => {
		const tree = buildOrgTree([p('a', 'Amara'), p('z', 'Zara', 'a'), p('m', 'Mina', 'a')]);
		expect(tree.roots[0].children.map((c) => c.person.fullName)).toEqual(['Mina', 'Zara']);
	});

	it('treats a manager outside the set as no manager, so team views still work', () => {
		// Filtering to one team legitimately leaves reports_to dangling.
		const tree = buildOrgTree([p('b', 'Bala', 'someone-else'), p('c', 'Chen', 'b')]);
		expect(tree.roots).toHaveLength(1);
		expect(tree.roots[0].person.id).toBe('b');
		expect(tree.roots[0].children[0].person.id).toBe('c');
	});

	it('treats a self-referencing manager as no manager', () => {
		const tree = buildOrgTree([p('a', 'Amara', 'a')]);
		expect(tree.roots).toHaveLength(1);
		expect(tree.cycleMemberIds).toEqual([]);
	});

	it('terminates on a two-person loop and names both members', () => {
		// If this ever hangs, the page hangs. That is the point of the test.
		const tree = buildOrgTree([p('a', 'Amara', 'b'), p('b', 'Bala', 'a')]);

		expect(tree.roots).toHaveLength(0);
		expect(tree.orphans.length).toBeGreaterThan(0);
		expect(tree.cycleMemberIds.sort()).toEqual(['a', 'b']);
		expect(tree.totalPeople).toBe(2);
	});

	it('terminates on a three-person loop', () => {
		const tree = buildOrgTree([p('a', 'Amara', 'c'), p('b', 'Bala', 'a'), p('c', 'Chen', 'b')]);
		expect(tree.cycleMemberIds.sort()).toEqual(['a', 'b', 'c']);
	});

	it('never loses anyone, loop or not', () => {
		const people = [
			p('root', 'Root'),
			p('kid', 'Kid', 'root'),
			p('x', 'Xavier', 'y'),
			p('y', 'Yasmin', 'x')
		];
		const tree = buildOrgTree(people);
		const placed = [...flattenDepthFirst(tree.roots), ...flattenDepthFirst(tree.orphans)];

		expect(placed).toHaveLength(people.length);
		expect(placed.map((n) => n.person.id).sort()).toEqual(['kid', 'root', 'x', 'y']);
	});

	it('handles an empty roster', () => {
		const tree = buildOrgTree([]);
		expect(tree).toMatchObject({ roots: [], orphans: [], cycleMemberIds: [], totalPeople: 0 });
	});
});

describe('flattenDepthFirst', () => {
	it('returns root-first depth-first order', () => {
		const tree = buildOrgTree([
			p('a', 'Amara'),
			p('b', 'Bala', 'a'),
			p('c', 'Chen', 'b'),
			p('d', 'Divya', 'a')
		]);
		expect(flattenDepthFirst(tree.roots).map((n) => n.person.id)).toEqual(['a', 'b', 'c', 'd']);
	});
});

describe('reportCount', () => {
	it('counts the whole subtree, not just direct reports', () => {
		const tree = buildOrgTree([
			p('a', 'Amara'),
			p('b', 'Bala', 'a'),
			p('c', 'Chen', 'b'),
			p('d', 'Divya', 'a')
		]);
		expect(reportCount(tree.roots[0])).toBe(3);
	});
});
