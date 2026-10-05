import http from 'node:http';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.PORT ?? 8088);
const codes = (process.env.EMP_CODES ?? 'TEST001,TEST002,TEST003')
	.split(',')
	.map((code) => code.trim())
	.filter(Boolean);
const days = Number(process.env.DAYS ?? 10);

const sessions = new Set();
const transactions = [];
let nextId = 1001;

const formatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Asia/Kolkata',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23'
});

function ist(date) {
	const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
	return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function addPunch(empCode, punchTime, punchState) {
	const record = {
		id: nextId++,
		emp_code: empCode,
		punch_time: punchTime,
		punch_state: String(punchState),
		verify_type: 1,
		work_code: '0',
		terminal_sn: 'MOCK0001',
		terminal_alias: 'Mock gate',
		area_alias: 'Mock office',
		temperature: '0.0',
		mask_flag: 0,
		upload_time: ist(new Date()),
		department: { dept_code: '1', dept_name: 'Ops' }
	};
	transactions.push(record);
	return record;
}

const now = ist(new Date());
for (let back = days; back >= 0; back -= 1) {
	const day = ist(new Date(Date.now() - back * 86_400_000)).slice(0, 10);
	codes.forEach((code, index) => {
		const minute = String(index % 60).padStart(2, '0');
		const checkIn = `${day} 09:${minute}:15`;
		const checkOut = `${day} 18:${minute}:45`;
		if (checkIn <= now) addPunch(code, checkIn, 0);
		if (checkOut <= now) addPunch(code, checkOut, 1);
	});
}

function sessionOf(req) {
	const match = /(?:^|;\s*)sessionid=([^;]+)/.exec(req.headers.cookie ?? '');
	return match && sessions.has(match[1]) ? match[1] : null;
}

function list(url) {
	const query = url.searchParams;
	const start = query.get('start_time')?.replace('T', ' ');
	const end = query.get('end_time')?.replace('T', ' ');
	const empCode = query.get('emp_code');
	const ordering = query.get('ordering');
	const pageSize = Number(query.get('page_size') ?? 10);
	const page = Math.max(1, Number(query.get('page') ?? 1));

	if (pageSize > 1000) return { code: -91, msg: 'PageSize is greater than 1000', data: null };

	let rows = transactions.filter(
		(row) =>
			(!start || row.punch_time >= start) &&
			(!end || row.punch_time <= end) &&
			(!empCode || row.emp_code === empCode)
	);

	if (ordering) {
		const direction = ordering.startsWith('-') ? -1 : 1;
		const key = ordering.replace(/^-/, '');
		rows = rows.sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * direction);
	}

	const link = (target) => {
		const next = new URL(url);
		next.searchParams.set('page', String(target));
		return `http://127.0.0.1:${port}${next.pathname}${next.search}`;
	};

	return {
		count: rows.length,
		next: page * pageSize < rows.length ? link(page + 1) : null,
		previous: page > 1 ? link(page - 1) : null,
		msg: '',
		code: 0,
		data: rows.slice((page - 1) * pageSize, page * pageSize)
	};
}

function sendJson(res, status, body) {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
	const url = new URL(req.url, `http://localhost:${port}`);
	const path = url.pathname.replace(/\/+$/, '') || '/';

	if (path === '/login') {
		const id = randomUUID();
		sessions.add(id);
		res.writeHead(302, {
			'Set-Cookie': `sessionid=${id}; Path=/; HttpOnly; SameSite=Lax`,
			Location: '/'
		});
		res.end();
		return;
	}

	if (path === '/logout') {
		sessions.delete(sessionOf(req));
		res.writeHead(302, { 'Set-Cookie': 'sessionid=; Path=/; Max-Age=0', Location: '/' });
		res.end();
		return;
	}

	if (path === '/iclock/api/transactions') {
		if (!sessionOf(req)) {
			res.writeHead(302, { Location: `/login/?next=${encodeURIComponent(url.pathname + url.search)}` });
			res.end();
			return;
		}
		sendJson(res, 200, list(url));
		return;
	}

	if (path === '/dev/punch') {
		const record = addPunch(
			url.searchParams.get('emp') ?? codes[0],
			url.searchParams.get('time') ?? ist(new Date()),
			url.searchParams.get('state') ?? 255
		);
		sendJson(res, 200, record);
		return;
	}

	if (path === '/dev/state') {
		sendJson(res, 200, { punches: transactions.length, lastId: nextId - 1, sessions: sessions.size });
		return;
	}

	if (path === '/') {
		res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
		res.end(
			`<h1>Mock EasyTime Pro</h1><p>${sessionOf(req) ? 'Logged in.' : 'Logged out.'} ${transactions.length} punches.</p>` +
				'<p><a href="/login/">Log in</a> · <a href="/logout/">Log out</a> · ' +
				'<a href="/iclock/api/transactions/?page_size=2&ordering=-id">Latest 2</a> · ' +
				'<a href="/dev/punch">Add a punch now</a></p>'
		);
		return;
	}

	res.writeHead(404);
	res.end();
});

server.listen(port, () => {
	console.log(
		`Mock EasyTime Pro on http://localhost:${port} with ${transactions.length} punches for ${codes.join(', ')}`
	);
});
