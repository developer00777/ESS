import { describe, it, expect } from 'vitest';
import { attendanceWindow, buildAttendanceHeatmap } from './dashboard-analytics';
describe('dashboard attendance analytics', () => {
	it('aligns 13 complete weeks Monday through Sunday across year boundaries', () => {
		const range = attendanceWindow('2026-01-02');
		expect(new Date(range.start).getUTCDay()).toBe(1);
		expect(range.end).toBe('2026-01-04');
		expect(buildAttendanceHeatmap('2026-01-02', [])).toHaveLength(91);
	});
	it('distinguishes no record, incomplete punches, overnight durations and future', () => {
		const cells = buildAttendanceHeatmap('2026-10-09', [
			{date:'2026-10-08',checkInAt:'2026-10-08T20:00:00Z',checkOutAt:'2026-10-09T04:00:00Z'},
			{date:'2026-10-09',checkInAt:'2026-10-09T08:00:00Z',checkOutAt:null}
		]);
		expect(cells.find(c => c.date === '2026-10-08')).toMatchObject({hours:8,level:4});
		expect(cells.find(c => c.date === '2026-10-09')).toMatchObject({hours:0,level:1});
		expect(cells.find(c => c.date === '2026-10-07')?.level).toBe(0);
		expect(cells.find(c => c.date === '2026-10-10')?.level).toBe(-1);
	});
	it('does not double-count duplicate dates or turn invalid punches into hours', () => {
		const row = {date:'2026-10-09',checkInAt:'2026-10-09T08:00:00Z',checkOutAt:'2026-10-09T07:00:00Z'};
		expect(buildAttendanceHeatmap('2026-10-09',[row,row]).find(c=>c.date===row.date)).toMatchObject({hours:0,level:1});
	});
});
