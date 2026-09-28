import { describe, it, expect } from 'vitest';
import {
	matchName,
	matchNameWithCodeTieBreak,
	formatManager,
	nameWords,
	type MatchCandidate
} from './name-match';

/**
 * These pin the behaviour the HR sheets actually depend on. The module had no
 * test of its own despite being pure and sitting under every manager
 * resolution in the app — and one of the cases below ("Deepak" against
 * "Ranita Chowdhury De") is a collision that really did attach four employees
 * to the wrong manager.
 */

const coded = (key: string, fullName: string, employeeCode: string | null): MatchCandidate => ({
	key,
	fullName,
	employeeCode
});

describe('nameWords', () => {
	it('lowercases, strips punctuation and collapses whitespace', () => {
		expect(nameWords('  Deepak   G.  Guduru, ')).toEqual(['deepak', 'g', 'guduru']);
	});
});

describe('matchName', () => {
	const roster = [
		{ key: 'a', fullName: 'Deepak Guduru' },
		{ key: 'b', fullName: 'Santhosh Reddy S' },
		{ key: 'c', fullName: 'Ranita Chowdhury De' }
	];

	it('returns none for a blank or unusable name', () => {
		expect(matchName(null, roster).status).toBe('none');
		expect(matchName('   ', roster).status).toBe('none');
	});

	it('matches an exact full name outright', () => {
		const result = matchName('Deepak Guduru', roster);
		expect(result).toMatchObject({ status: 'matched', key: 'a' });
	});

	it('ignores word order', () => {
		const result = matchName('Guduru Deepak', roster);
		expect(result).toMatchObject({ status: 'matched', key: 'a' });
	});

	it('accepts a prefix of four characters or more', () => {
		// "Gudur" ~ "Guduru" is the genuine spelling drift in the tracker.
		const result = matchName('Deepak Gudur', roster);
		expect(result).toMatchObject({ status: 'matched', key: 'a' });
	});

	it('refuses a short prefix, so "Deepak" never matches the "De" surname', () => {
		// The real regression: a two-letter surname must not swallow a first name.
		const result = matchName('Deepak', roster);
		expect(result).toMatchObject({ status: 'matched', key: 'a' });
		expect(result).not.toMatchObject({ key: 'c' });
	});

	it('treats a single letter as an initial that matches only other initials', () => {
		const result = matchName('S', [{ key: 'x', fullName: 'Santhosh Reddy' }]);
		expect(result.status).toBe('none');
	});

	it('returns none when nobody resembles the name', () => {
		expect(matchName('Wholly Unrelated', roster).status).toBe('none');
	});

	it('reports a genuine tie as ambiguous rather than guessing', () => {
		const twins = [
			{ key: 'a', fullName: 'Deepak Guduru' },
			{ key: 'b', fullName: 'Deepak Sharma' }
		];
		const result = matchName('Deepak', twins);
		expect(result.status).toBe('ambiguous');
		if (result.status === 'ambiguous') {
			expect(result.tied.map((t) => t.key).sort()).toEqual(['a', 'b']);
		}
	});

	it('prefers the longer overlap when scores differ', () => {
		const candidates = [
			{ key: 'a', fullName: 'Santhosh Reddy S' },
			{ key: 'b', fullName: 'Santhosh Kumar' }
		];
		const result = matchName('Santhosh Reddy', candidates);
		expect(result).toMatchObject({ status: 'matched', key: 'a' });
	});
});

describe('matchNameWithCodeTieBreak', () => {
	it('passes a clean match straight through', () => {
		const result = matchNameWithCodeTieBreak('Deepak Guduru', [
			coded('a', 'Deepak Guduru', 'CIPL0225')
		]);
		expect(result).toMatchObject({ status: 'matched', key: 'a' });
	});

	it('breaks a tie in favour of the candidate carrying an employee code', () => {
		// The leftover seed login sharing a real manager's first name.
		const result = matchNameWithCodeTieBreak('Deepak', [
			coded('real', 'Deepak Guduru', 'CIPL0225'),
			coded('seed', 'Deepak Placeholder', null)
		]);
		expect(result).toMatchObject({ status: 'matched', key: 'real' });
	});

	it('stays ambiguous when every tied candidate has a code', () => {
		const result = matchNameWithCodeTieBreak('Deepak', [
			coded('a', 'Deepak Guduru', 'CIPL0225'),
			coded('b', 'Deepak Sharma', 'CIPL0891')
		]);
		expect(result.status).toBe('ambiguous');
	});

	it('stays ambiguous when no tied candidate has a code', () => {
		const result = matchNameWithCodeTieBreak('Deepak', [
			coded('a', 'Deepak Guduru', null),
			coded('b', 'Deepak Sharma', null)
		]);
		expect(result.status).toBe('ambiguous');
	});

	it('still returns none when the tie-break has nothing to resolve', () => {
		const result = matchNameWithCodeTieBreak('Nobody At All', [
			coded('a', 'Deepak Guduru', 'CIPL0225')
		]);
		expect(result.status).toBe('none');
	});
});

describe('formatManager', () => {
	it('renders name and code together', () => {
		expect(formatManager('Deepak Guduru', 'CIPL0225')).toBe('Deepak Guduru(CIPL0225)');
	});

	it('renders a bare name when there is no code, rather than an empty bracket', () => {
		// Managers outside the roster — "Chief" and other titles — have no code.
		expect(formatManager('Chief', null)).toBe('Chief');
		expect(formatManager('Chief', '   ')).toBe('Chief');
	});

	it('returns null when there is no name at all', () => {
		expect(formatManager(null, 'CIPL0225')).toBeNull();
		expect(formatManager('  ', 'CIPL0225')).toBeNull();
	});
});
