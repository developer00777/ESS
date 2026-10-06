import { describe, test, expect, afterEach } from 'vitest';
import { env } from '$env/dynamic/private';
import {
	parseEasyTimeExport,
	parseEasyTimeRecords,
	punchDedupeKey,
	mergePunch,
	envTokenHash,
	hashImportToken
} from './easytime-import';

describe('envTokenHash', () => {
	afterEach(() => {
		delete env.EASYTIME_IMPORT_TOKEN;
	});

	test('is off when the variable is unset or too short to be a real secret', () => {
		expect(envTokenHash()).toBeNull();
		env.EASYTIME_IMPORT_TOKEN = 'short-token';
		expect(envTokenHash()).toBeNull();
	});

	test('hashes a long enough token, ignoring surrounding space', () => {
		const token = 'a'.repeat(43);
		env.EASYTIME_IMPORT_TOKEN = ` ${token}\n`;
		expect(envTokenHash()).toBe(hashImportToken(token));
	});
});

const tsvLine = (empCode: string, date: string, time: string, state = '0') =>
	[empCode, 'Asha', 'Rao', 'D1', 'Ops', date, time, '1', state, '-', '-', 'Office', 'Gate', 'SN1', '-', '0'].join(
		'\t'
	);

describe('parseEasyTimeRecords', () => {
	afterEach(() => {
		delete env.DEVICE_UTC_OFFSET;
	});

	test('maps a transactions API record onto a punch pinned to IST', () => {
		const [punch] = parseEasyTimeRecords([
			{
				id: 9001,
				emp_code: 'CIPL2666',
				punch_time: '2026-10-06 09:05:30',
				punch_state: '0',
				verify_type: 101,
				terminal_sn: 'CQZ7232',
				terminal_alias: 'Main gate',
				area_alias: 'Bangalore'
			}
		]);

		expect(punch.empCode).toBe('CIPL2666');
		expect(punch.punchDate).toBe('2026-10-06');
		expect(punch.punchedAt.toISOString()).toBe('2026-10-06T03:35:30.000Z');
		expect(punch.direction).toBe('in');
		expect(punch.verifyType).toBe('101');
		expect(punch.terminalSn).toBe('CQZ7232');
		expect(punch.terminalAlias).toBe('Main gate');
		expect(punch.areaName).toBe('Bangalore');
		expect(JSON.parse(punch.rawLine).id).toBe(9001);
	});

	test('accepts a T separator, minutes without seconds, and a numeric code', () => {
		const [punch] = parseEasyTimeRecords([
			{ emp_code: 2666, punch_time: '2026-10-06T18:40', punch_state: 1 }
		]);

		expect(punch.empCode).toBe('2666');
		expect(punch.punchedAt.toISOString()).toBe('2026-10-06T13:10:00.000Z');
		expect(punch.direction).toBe('out');
	});

	test('keeps the device date for an early-morning night-shift punch', () => {
		const [punch] = parseEasyTimeRecords([{ emp_code: 'A1', punch_time: '2026-10-07 01:30:00' }]);

		expect(punch.punchDate).toBe('2026-10-07');
		expect(punch.punchedAt.toISOString()).toBe('2026-10-06T20:00:00.000Z');
	});

	test('skips records without a code or a readable punch time', () => {
		const punches = parseEasyTimeRecords([
			null,
			'CIPL1',
			['CIPL1', '2026-10-06 09:00:00'],
			{ punch_time: '2026-10-06 09:00:00' },
			{ emp_code: 'CIPL1' },
			{ emp_code: 'CIPL1', punch_time: '06/10/2026 09:00' },
			{ emp_code: 'CIPL1', punch_time: '2026-10-06 25:00:00' },
			{ emp_code: '  ', punch_time: '2026-10-06 09:00:00' }
		]);

		expect(punches).toEqual([]);
	});

	test('ignores object-valued fields and prefers dept_name', () => {
		const [nested] = parseEasyTimeRecords([
			{ emp_code: 'A1', punch_time: '2026-10-06 09:00:00', department: { dept_name: 'Ops' } }
		]);
		const [flat] = parseEasyTimeRecords([
			{ emp_code: 'A1', punch_time: '2026-10-06 09:00:00', dept_name: 'Ops', department: 'Other' }
		]);

		expect(nested.deptName).toBeNull();
		expect(flat.deptName).toBe('Ops');
	});

	test('honours DEVICE_UTC_OFFSET', () => {
		env.DEVICE_UTC_OFFSET = '+00:00';
		const [punch] = parseEasyTimeRecords([{ emp_code: 'A1', punch_time: '2026-10-06 09:00:00' }]);

		expect(punch.punchedAt.toISOString()).toBe('2026-10-06T09:00:00.000Z');
	});
});

describe('parseEasyTimeExport', () => {
	test('skips a header row', () => {
		const punches = parseEasyTimeExport(
			['{emp_code}\t{first_name}\t{last_name}', tsvLine('CIPL2666', '2026-10-06', '09:05')].join('\r\n')
		);

		expect(punches).toHaveLength(1);
		expect(punches[0].punchedAt.toISOString()).toBe('2026-10-06T03:35:00.000Z');
	});

	test('reads a comma-separated file', () => {
		const punches = parseEasyTimeExport('CIPL2666,Asha,Rao,D1,Ops,2026-10-06,09:05,1,1');

		expect(punches).toHaveLength(1);
		expect(punches[0].direction).toBe('out');
	});
});

describe('punchDedupeKey', () => {
	test('a file line and an API record for the same punch share a key', () => {
		const [fromFile] = parseEasyTimeExport(tsvLine('CIPL2666', '2026-10-06', '09:05'));
		const [fromApi] = parseEasyTimeRecords([
			{ emp_code: 'cipl2666 ', punch_time: '2026-10-06 09:05:42', terminal_sn: 'OTHER' }
		]);

		expect(punchDedupeKey(fromApi)).toBe(punchDedupeKey(fromFile));
		expect(punchDedupeKey(fromFile)).toBe('CIPL2666|2026-10-06T03:35Z');
	});

	test('punches in different minutes get different keys', () => {
		const [a, b] = parseEasyTimeRecords([
			{ emp_code: 'A1', punch_time: '2026-10-06 09:05:59' },
			{ emp_code: 'A1', punch_time: '2026-10-06 09:06:00' }
		]);

		expect(punchDedupeKey(a)).not.toBe(punchDedupeKey(b));
	});
});

describe('mergePunch', () => {
	const at = (hhmm: string) => new Date(`2026-10-06T${hhmm}:00+05:30`);

	test('a punch with no state starts the day as the check-in', () => {
		expect(mergePunch(null, { punchedAt: at('09:00'), direction: null })).toEqual({
			checkInAt: at('09:00'),
			checkOutAt: null,
			changed: 'checkInAt'
		});
	});

	test('a later punch with no state becomes the check-out', () => {
		const merged = mergePunch(
			{ checkInAt: at('09:00'), checkOutAt: null },
			{ punchedAt: at('18:00'), direction: null }
		);

		expect(merged.checkOutAt).toEqual(at('18:00'));
		expect(merged.changed).toBe('checkOutAt');
	});

	test('a check-in only ever moves earlier', () => {
		const day = { checkInAt: at('09:00'), checkOutAt: at('18:00') };

		expect(mergePunch(day, { punchedAt: at('09:30'), direction: 'in' }).changed).toBeNull();
		expect(mergePunch(day, { punchedAt: at('08:45'), direction: 'in' })).toEqual({
			checkInAt: at('08:45'),
			checkOutAt: at('18:00'),
			changed: 'checkInAt'
		});
	});

	test('a check-out only ever moves later', () => {
		const day = { checkInAt: at('09:00'), checkOutAt: at('18:00') };

		expect(mergePunch(day, { punchedAt: at('17:00'), direction: 'out' }).changed).toBeNull();
		expect(mergePunch(day, { punchedAt: at('18:30'), direction: 'out' }).checkOutAt).toEqual(
			at('18:30')
		);
	});
});
