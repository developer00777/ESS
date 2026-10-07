import { describe, expect, it } from 'vitest';
import { extractItems, resolveOwner } from './extract';

const attendees = [
	{ key: 'arjun', fullName: 'Arjun Mehta' },
	{ key: 'sneha', fullName: 'Sneha Kulkarni' },
	{ key: 'neha', fullName: 'Neha Gupta' }
];
const team = [...attendees, { key: 'rahul', fullName: 'Rahul Verma' }, { key: 'rahul2', fullName: 'Rahul Sharma' }];

describe('who an action item belongs to', () => {
	it('matches a first name to the attendee it belongs to', () => {
		expect(resolveOwner('Arjun', attendees, team)).toBe('arjun');
		expect(resolveOwner('Sneha Kulkarni', attendees, team)).toBe('sneha');
	});

	it('falls back to the host\'s team for someone named but not on the call', () => {
		expect(resolveOwner('Rahul Verma', attendees, team)).toBe('rahul');
	});

	it('refuses to guess between two people with the same first name', () => {
		expect(resolveOwner('Rahul', attendees, team)).toBeNull();
	});

	it('ignores device suffixes and leaves unknown names unmatched', () => {
		expect(resolveOwner('Arjun (iPhone)', attendees, team)).toBe('arjun');
		expect(resolveOwner('Dev', attendees, team)).toBeNull();
		expect(resolveOwner(null, attendees, team)).toBeNull();
	});
});

describe('reading minutes without the model', () => {
	it('turns next steps into items with owners, dates from the meeting day, and honest confidence', async () => {
		const { items, extraction } = await extractItems({
			summary: {
				overview: '',
				details: [],
				nextSteps: ['Arjun will dedupe the healthcare list by Thursday.', 'Someone needs to update the tracker.', 'Dev to check the catch-all rules.']
			},
			meetingDay: '2026-10-06',
			attendees: [{ userId: 'arjun', name: 'Arjun Mehta', email: null }, { userId: null, name: 'Dev (iPhone)', email: null }],
			team: [{ id: 'arjun', fullName: 'Arjun Mehta' }]
		});
		expect(extraction.plain).toBe(true);
		expect(items[0]).toMatchObject({ ownerId: 'arjun', title: 'Dedupe the healthcare list', dueDate: '2026-10-08', stepIndex: 0 });
		expect(items[1]).toMatchObject({ ownerId: null, ownerHeard: null, title: 'Update the tracker' });
		expect(items[2]).toMatchObject({ ownerId: null, ownerHeard: 'Dev' });
		expect(items[2].confidence).toBeLessThanOrEqual(0.5);
	});
});
