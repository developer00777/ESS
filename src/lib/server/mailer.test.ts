import { describe, test, expect, vi, afterEach } from 'vitest';
import { buildWelcomeEmail, sendEmail, sendWelcomeEmail } from './mailer';

/**
 * The template is asserted on rather than eyeballed because it carries a
 * password: a truncation or an escaping bug here hands someone a login they
 * cannot use, and nothing downstream would catch it.
 */

const BASE = {
	fullName: 'Priya Raghunathan',
	username: 'priya.r@championsmail.com',
	temporaryPassword: 'aB3-xY7_qZ',
	portalUrl: 'https://champ-hr.com'
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('buildWelcomeEmail', () => {
	test('carries the login id, password and portal link in both bodies', () => {
		const mail = buildWelcomeEmail(BASE);

		for (const body of [mail.html, mail.text]) {
			expect(body).toContain('priya.r@championsmail.com');
			expect(body).toContain('aB3-xY7_qZ');
			expect(body).toContain('https://champ-hr.com');
		}
	});

	test('greets by first name only', () => {
		const mail = buildWelcomeEmail(BASE);
		expect(mail.text).toContain('Hi Priya,');
		expect(mail.text).not.toContain('Hi Priya Raghunathan');
	});

	test('falls back to a neutral greeting when the name is blank', () => {
		// The tracker has shipped rows with a whitespace-only name; a greeting
		// reading "Hi ," is worse than an impersonal one.
		const mail = buildWelcomeEmail({ ...BASE, fullName: '   ' });
		expect(mail.text).toContain('Hi there,');
	});

	test('says the temporary password stops working after first sign-in', () => {
		const mail = buildWelcomeEmail(BASE);
		expect(mail.text.toLowerCase()).toContain('password the first time you sign in');
	});

	test('escapes HTML in the name and password', () => {
		// base64url passwords never contain these, but the name comes from a
		// spreadsheet cell and an unescaped one would break the markup around it.
		const mail = buildWelcomeEmail({
			...BASE,
			fullName: '<script>alert(1)</script>',
			temporaryPassword: 'a&b<c>"d'
		});

		expect(mail.html).not.toContain('<script>');
		expect(mail.html).toContain('&lt;script&gt;');
		expect(mail.html).toContain('a&amp;b&lt;c&gt;&quot;d');
		// The plain-text part is not markup, so it keeps the literal password.
		expect(mail.text).toContain('a&b<c>"d');
	});

	test('does not double up the slash when the portal URL has a trailing one', () => {
		const mail = buildWelcomeEmail({ ...BASE, portalUrl: 'https://champ-hr.com/' });
		expect(mail.text).toContain('https://champ-hr.com\n');
		expect(mail.html).not.toContain('champ-hr.com//');
	});
});

describe('sendEmail', () => {
	test('posts to Resend with bearer auth and a single recipient', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ id: 'msg_123' }), { status: 200 })
		);
		vi.stubGlobal('fetch', fetchMock);

		const result = await sendEmail({
			to: 'someone@example.com',
			subject: 'Subject',
			html: '<p>hi</p>',
			text: 'hi'
		});

		expect(result).toEqual({ ok: true, id: 'msg_123' });

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://api.resend.com/emails');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toMatch(/^Bearer /);
		expect(JSON.parse(init.body).to).toEqual(['someone@example.com']);
	});

	test("surfaces Resend's own message on a rejection", async () => {
		// "domain is not verified" and a rate-limit both arrive as 4xx; the operator
		// needs the message to know which one they are looking at.
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ message: 'The offer.championsmail.com domain is not verified.' }), {
					status: 403
				})
			)
		);

		const result = await sendEmail({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });

		expect(result.ok).toBe(false);
		expect(result.error).toContain('domain is not verified');
	});

	test('reports the status when the error body is not JSON', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
		);

		const result = await sendEmail({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });
		expect(result.ok).toBe(false);
		expect(result.error).toBeTruthy();
	});

	test('returns a failure rather than throwing when the network is down', async () => {
		// The caller has already committed an account row by this point, so a throw
		// here would roll back work that genuinely succeeded.
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')));

		const result = await sendEmail({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });

		expect(result.ok).toBe(false);
		expect(result.error).toContain('ENOTFOUND');
	});
});

describe('sendWelcomeEmail', () => {
	test('delivers to the login id by default', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 })
		);
		vi.stubGlobal('fetch', fetchMock);

		await sendWelcomeEmail(BASE);

		expect(JSON.parse(fetchMock.mock.calls[0][1].body).to).toEqual([BASE.username]);
	});

	test('redirects delivery but still shows the real login id in the body', async () => {
		// The dry-run path: one reviewer receives what the employee would have got,
		// so the body must keep naming the employee's own username.
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ id: 'msg_2' }), { status: 200 })
		);
		vi.stubGlobal('fetch', fetchMock);

		await sendWelcomeEmail({ ...BASE, to: 'reviewer@example.com' });

		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.to).toEqual(['reviewer@example.com']);
		expect(body.text).toContain(BASE.username);
	});
});
