import { describe, expect, it } from 'vitest';
import { actionLines, assignMode, dueBucket, dueFromMeeting, parseTaskCommand, rankBetween, readNextStep, type Reach } from './rules';

// Wed 7 Oct 2026, 11:20 IST.
const NOW = new Date('2026-10-07T05:50:00Z');

describe('who approves a task', () => {
	// Priya leads Arjun and Sneha; Arjun leads an intern. Vikram leads Neha.
	const priya: Reach = { selfId: 'priya', treeIds: ['arjun', 'sneha', 'intern'], isLead: true, anyone: false };
	const sneha: Reach = { selfId: 'sneha', treeIds: [], isLead: false, anyone: false };

	it('lets a lead give work straight to anyone below them, at any depth', () => {
		expect(assignMode(priya, 'arjun', 'priya')).toBe('direct');
		expect(assignMode(priya, 'intern', 'arjun')).toBe('direct');
	});

	it('lets a lead give themselves work without asking', () => {
		expect(assignMode(priya, 'priya', 'chief-of-ops')).toBe('direct');
	});

	it("sends an employee's task, even one for themselves, to the assignee's lead", () => {
		expect(assignMode(sneha, 'sneha', 'priya')).toBe('approval');
		expect(assignMode(sneha, 'arjun', 'priya')).toBe('approval');
		expect(assignMode(sneha, 'neha', 'vikram')).toBe('approval');
	});

	it("sends a lead's task for someone outside their team to that person's lead", () => {
		expect(assignMode(priya, 'neha', 'vikram')).toBe('approval');
	});

	it('has nobody to wait for when the assignee has no lead, or the task has no assignee', () => {
		expect(assignMode(sneha, 'ceo', null)).toBe('direct');
		expect(assignMode(sneha, null, null)).toBe('direct');
	});

	it('skips approval for Super Admin and "Give tasks without approval"', () => {
		expect(assignMode({ ...sneha, anyone: true }, 'neha', 'vikram')).toBe('direct');
	});
});

describe('order within a column', () => {
	it('puts a key strictly between its neighbours', () => {
		const cases: [string | null, string | null][] = [[null, null], [null, 'i'], ['i', null], ['a', 'b'], ['a', 'a1'], [null, '1'], [null, '01'], ['zz', null], ['a0i', 'a1']];
		for (const [a, b] of cases) {
			const k = rankBetween(a, b);
			if (a !== null) expect(k > a).toBe(true);
			if (b !== null) expect(k < b).toBe(true);
			expect(k.endsWith('0')).toBe(false);
		}
	});

	it('keeps finding room after many inserts into the same gap', () => {
		let lo: string | null = null;
		let hi: string | null = 'i';
		for (let n = 0; n < 200; n++) {
			const k = rankBetween(lo, hi);
			if (lo !== null) expect(k > lo).toBe(true);
			expect(k < hi!).toBe(true);
			if (n % 2) lo = k;
			else hi = k;
		}
	});

	it('refuses neighbours given the wrong way round', () => {
		expect(() => rankBetween('b', 'a')).toThrow();
	});
});

describe('/task', () => {
	it('reads owner, title and due day', () => {
		expect(parseTaskCommand('/task @Sneha Kulkarni check catch-all rules by Fri', NOW)).toEqual({ ownerName: 'Sneha Kulkarni', title: 'Check catch-all rules', due: '2026-10-09' });
		expect(parseTaskCommand('/task @Sneha check rules fri', NOW)).toEqual({ ownerName: 'Sneha', title: 'Check rules', due: '2026-10-09' });
		expect(parseTaskCommand('/task send the recap tomorrow', NOW)).toEqual({ ownerName: null, title: 'Send the recap', due: '2026-10-08' });
		expect(parseTaskCommand('/task update tracker 12 Oct', NOW)?.due).toBe('2026-10-12');
	});

	it('does not mistake words for weekdays', () => {
		expect(parseTaskCommand('/task set up monitoring', NOW)).toEqual({ ownerName: null, title: 'Set up monitoring', due: null });
		expect(parseTaskCommand('/task review satisfaction survey', NOW)?.due).toBeNull();
	});

	it('needs something to do', () => {
		expect(parseTaskCommand('/task', NOW)).toBeNull();
		expect(parseTaskCommand('/task @Sneha', NOW)).toBeNull();
	});
});

describe('meeting next steps', () => {
	it('finds the owner, the work and the due phrase', () => {
		expect(readNextStep('Arjun will dedupe the Q3 healthcare list and share the duplicate report by Thursday.')).toEqual({
			ownerHeard: 'Arjun',
			title: 'Dedupe the Q3 healthcare list and share the duplicate report',
			dueText: 'Thursday'
		});
		expect(readNextStep('Dev to check whether catch-all domains can be flagged.').ownerHeard).toBe('Dev');
		expect(readNextStep('Rahul Verma will map the fields before 14 Oct').dueText).toBe('14 Oct');
	});

	it('leaves the owner empty when the minutes name nobody', () => {
		expect(readNextStep('Someone needs to update the client delivery tracker.')).toEqual({ ownerHeard: null, title: 'Update the client delivery tracker', dueText: null });
		expect(readNextStep('The client will resend the file').ownerHeard).toBeNull();
	});

	it('counts due days from the meeting, not from today', () => {
		// Meeting Tue 6 Oct: "by Thursday" is 8 Oct even when reviewed later.
		expect(dueFromMeeting('Thursday', '2026-10-06')).toBe('2026-10-08');
		expect(dueFromMeeting(null, '2026-10-06')).toBeNull();
	});

	it('picks action lines out of pasted notes', () => {
		expect(actionLines('- Karan will build the dashboard by Friday\nDiscussed the November shift change\n2) Priya to review the plan')).toEqual(['Karan will build the dashboard by Friday', 'Priya to review the plan']);
	});
});

describe('due buckets', () => {
	it('sorts dates into the list groups', () => {
		expect(dueBucket('2026-10-06', '2026-10-07')).toBe('overdue');
		expect(dueBucket('2026-10-07', '2026-10-07')).toBe('today');
		expect(dueBucket('2026-10-14', '2026-10-07')).toBe('week');
		expect(dueBucket('2026-10-15', '2026-10-07')).toBe('later');
		expect(dueBucket(null, '2026-10-07')).toBe('none');
	});
});
