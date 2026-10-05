import { describe, test, expect } from 'vitest';
import { orderAndCollapse } from './easytime-ingest';
import { mergePunch, parseEasyTimeRecords, type PunchDay } from './easytime-import';

const record = (emp_code: string, punch_time: string, punch_state?: string) => ({
	emp_code,
	punch_time,
	punch_state
});

describe('orderAndCollapse', () => {
	test('applies an out-of-order batch oldest first', () => {
		const parsed = parseEasyTimeRecords([
			record('A1', '2026-10-06 18:02:00', '255'),
			record('A1', '2026-10-06 09:01:00', '255')
		]);

		const { punches } = orderAndCollapse(parsed);
		let day: PunchDay | null = null;
		for (const punch of punches) day = mergePunch(day, punch);

		expect(day?.checkInAt?.toISOString()).toBe('2026-10-06T03:31:00.000Z');
		expect(day?.checkOutAt?.toISOString()).toBe('2026-10-06T12:32:00.000Z');
	});

	test('collapses repeats of the same punch within one batch', () => {
		const parsed = parseEasyTimeRecords([
			record('A1', '2026-10-06 09:01:10', '0'),
			record('a1', '2026-10-06 09:01:50', '0'),
			record('A1', '2026-10-06 09:02:00', '0'),
			record('B2', '2026-10-06 09:01:10', '0')
		]);

		const { punches, repeats } = orderAndCollapse(parsed);

		expect(repeats).toBe(1);
		expect(punches.map((p) => p.dedupeKey)).toEqual([
			'A1|2026-10-06T03:31Z',
			'B2|2026-10-06T03:31Z',
			'A1|2026-10-06T03:32Z'
		]);
		expect(punches[0].punchedAt.toISOString()).toBe('2026-10-06T03:31:10.000Z');
	});
});
