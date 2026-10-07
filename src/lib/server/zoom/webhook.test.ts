import { describe, expect, it } from 'vitest';
import { encodeMeetingUuid, hmacHex, urlValidationResponse, verifyZoomSignature } from './webhook';

const secret = 'zoom-secret-token';
const body = JSON.stringify({ event: 'meeting.summary_completed', payload: { object: { meeting_uuid: 'abc==' } } });
const nowMs = Date.parse('2026-10-07T06:00:00Z');
const ts = String(Math.floor(nowMs / 1000));
const sign = (t: string, b: string) => 'v0=' + hmacHex(secret, `v0:${t}:${b}`);

describe('Zoom webhook signature', () => {
	it('accepts an event Zoom signed', () => {
		expect(verifyZoomSignature({ secret, timestamp: ts, signature: sign(ts, body), rawBody: body, nowMs })).toBe(true);
	});

	it('refuses a changed body, a wrong secret or a missing header', () => {
		expect(verifyZoomSignature({ secret, timestamp: ts, signature: sign(ts, body), rawBody: body + ' ', nowMs })).toBe(false);
		expect(verifyZoomSignature({ secret: 'other', timestamp: ts, signature: sign(ts, body), rawBody: body, nowMs })).toBe(false);
		expect(verifyZoomSignature({ secret, timestamp: null, signature: sign(ts, body), rawBody: body, nowMs })).toBe(false);
		expect(verifyZoomSignature({ secret, timestamp: ts, signature: null, rawBody: body, nowMs })).toBe(false);
	});

	it('refuses an event replayed after five minutes', () => {
		const old = String(Math.floor(nowMs / 1000) - 301);
		expect(verifyZoomSignature({ secret, timestamp: old, signature: sign(old, body), rawBody: body, nowMs })).toBe(false);
	});

	it('answers the URL check with the token signed by the same secret', () => {
		expect(urlValidationResponse(secret, 'plain')).toEqual({ plainToken: 'plain', encryptedToken: hmacHex(secret, 'plain') });
	});
});

describe('meeting UUIDs in paths', () => {
	it('double-encodes UUIDs with leading or doubled slashes', () => {
		expect(encodeMeetingUuid('aDYlohsHRtCd4ii1uC2+hA==')).toBe('aDYlohsHRtCd4ii1uC2%2BhA%3D%3D');
		expect(encodeMeetingUuid('/ajXp112QmuoKj4854875==')).toBe('%252FajXp112QmuoKj4854875%253D%253D');
		expect(encodeMeetingUuid('ab//cd')).toBe('ab%252F%252Fcd');
	});
});
