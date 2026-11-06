/**
 * One-time copy of the Railway data into Cloudflare: every Postgres table into
 * D1, and what MongoDB held (activity log, uploaded files) into D1 + R2.
 *
 *   DATABASE_URL=postgres://… MONGO_URL=mongodb://… \
 *     npx tsx scripts/cloudflare/import-to-d1.ts --remote [--replace] [--dry-run]
 *
 *   --remote     write to the live D1/R2 (else a local simulation, see d1.ts)
 *   --replace    D1 already has rows (the container seeds the super admin on its
 *                first start): delete every row first, then import
 *   --dry-run    only read the sources and count
 *
 * Values are read with the old Postgres schema (pg-schema.ts) and written with
 * the D1 schema, so drizzle converts each one: timestamps to epoch ms, booleans
 * to 0/1, jsonb and arrays to JSON text. Ids are kept, MongoDB ObjectIds
 * included, so every reference (chat_messages.file_id, announcements'
 * attachment, policy source documents) still points at the right row.
 *
 * Foreign keys: tables go in dependency order. A reference to a table not yet
 * copied (a cycle, or a table pointing at itself, like users.reports_to) is
 * left empty on insert and filled in once every table is in. The D1 triggers
 * are dropped for the copy and recreated after, so they cannot rewrite the
 * imported roles.
 */
import { readFileSync } from 'node:fs';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { eq, getTableColumns, getTableName, is, sql, type SQL } from 'drizzle-orm';
import { SQLiteTable, getTableConfig, type SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { PgTable, type PgColumn } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as d1Schema from '../../src/lib/server/db/schema';
import * as pgSchema from './pg-schema';
import { fromCloudflareDir, openCloudflare } from './d1';

const DRY = process.argv.includes('--dry-run');
const REPLACE = process.argv.includes('--replace');
const DATABASE_URL = process.env.DATABASE_URL;
const MONGO_URL = process.env.MONGO_URL;
if (!DATABASE_URL) {
	console.error('Set DATABASE_URL (the Railway Postgres public URL). MONGO_URL is optional.');
	process.exit(1);
}

/** D1 binds at most 100 values per statement. */
const MAX_PARAMS = 100;
/** Statements per D1 batch (one transaction each). */
const BATCH = 50;

type AnyRow = Record<string, unknown>;
type Table = { key: string; name: string; d1: SQLiteTable; pg: PgTable | null };

function tables(): Table[] {
	const out: Table[] = [];
	for (const [key, value] of Object.entries(d1Schema)) {
		if (!is(value, SQLiteTable)) continue;
		const pgTable = (pgSchema as Record<string, unknown>)[key];
		out.push({ key, name: getTableName(value), d1: value, pg: is(pgTable, PgTable) ? pgTable : null });
	}
	return out;
}

/** Dependency order, plus, per table, the FK columns that must wait for phase 2. */
function plan(all: Table[]) {
	const byName = new Map(all.map((t) => [t.name, t]));
	// Per table: its references to other tables, split by whether the column
	// may be empty. A required (NOT NULL) reference must be copied after its
	// target; an optional one can be left empty and linked at the end.
	type Ref = { target: string; columns: string[]; required: boolean };
	const refs = new Map<string, Ref[]>();
	for (const t of all) {
		const cfg = getTableConfig(t.d1);
		refs.set(
			t.name,
			cfg.foreignKeys
				.map((fk) => {
					const r = fk.reference();
					return { target: getTableName(r.foreignTable), columns: r.columns.map((c) => c.name), required: r.columns.some((c) => c.notNull) };
				})
				.filter((r) => byName.has(r.target))
		);
	}
	const order: Table[] = [];
	const done = new Set<string>();
	const deferred = new Map<string, string[]>();
	while (order.length < all.length) {
		const left = all.filter((t) => !done.has(t.name));
		const waitingOn = (t: Table, requiredOnly: boolean) =>
			refs.get(t.name)!.filter((r) => r.target !== t.name && !done.has(r.target) && (!requiredOnly || r.required)).length;
		// Best: everything it points at is in. Else: its required references are
		// in, and the optional ones wait (breaks a cycle such as users ↔ teams).
		const free = left.filter((t) => waitingOn(t, false) === 0);
		const next =
			free[0] ??
			left.filter((t) => waitingOn(t, true) === 0).sort((a, b) => waitingOn(a, false) - waitingOn(b, false) || a.name.localeCompare(b.name))[0];
		if (!next) throw new Error(`required references form a cycle among: ${left.map((t) => t.name).join(', ')}`);
		// Columns to link later: optional references to tables not yet in, and
		// references to its own table (a row may point at a later row).
		const cols = refs
			.get(next.name)!
			.filter((r) => r.target === next.name || !done.has(r.target))
			.flatMap((r) => {
				if (r.required && r.target !== next.name) throw new Error(`${next.name} needs ${r.target} first`);
				if (r.required) throw new Error(`${next.name} has a required reference to itself; not supported`);
				return r.columns.map((c) => columnKey(next.d1, c));
			});
		if (cols.length) deferred.set(next.name, [...new Set(cols)]);
		order.push(next);
		done.add(next.name);
	}
	return { order, deferred };
}

function columnKey(table: SQLiteTable, dbName: string): string {
	for (const [key, col] of Object.entries(table) as [string, unknown][]) {
		if (col && typeof col === 'object' && (col as SQLiteColumn).name === dbName && 'columnType' in (col as object)) return key;
	}
	throw new Error(`no column ${dbName} on ${getTableName(table)}`);
}

function columnsOf(table: SQLiteTable): Record<string, SQLiteColumn> {
	const cols: Record<string, SQLiteColumn> = {};
	for (const c of getTableConfig(table).columns) cols[columnKey(table, c.name)] = c;
	return cols;
}

function primaryKeyOf(table: SQLiteTable): string[] {
	const cfg = getTableConfig(table);
	const single = cfg.columns.filter((c) => c.primary).map((c) => columnKey(table, c.name));
	if (single.length) return single;
	const composite = cfg.primaryKeys[0]?.columns.map((c) => columnKey(table, c.name));
	if (composite?.length) return composite;
	throw new Error(`${cfg.name} has no primary key`);
}

function chunk<T>(rows: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
	return out;
}

const TRIGGER_FILE = 'migrations/0001_triggers_and_defaults.sql';

function triggerStatements(): { name: string; sql: string }[] {
	return readFileSync(TRIGGER_FILE, 'utf8')
		.split('--> statement-breakpoint')
		.map((s) => s.trim())
		.map((s) => ({ s, m: s.match(/CREATE TRIGGER IF NOT EXISTS\s+(\w+)/i) }))
		.filter((x) => x.m)
		.map((x) => ({ name: x.m![1], sql: x.s.slice(x.s.search(/CREATE TRIGGER/i)) }));
}

async function main() {
	const pool = new pg.Pool({
		connectionString: DATABASE_URL,
		ssl: /localhost|127\.0\.0\.1|host\.docker\.internal/.test(DATABASE_URL!) ? undefined : { rejectUnauthorized: false }
	});
	const source = drizzlePg(pool, { schema: pgSchema });
	const cf = await openCloudflare();
	const target = drizzleD1(cf.d1 as never, { schema: d1Schema });
	const all = tables();
	const { order, deferred } = plan(all);

	// --- 0. Tables must exist; target must be empty, or --replace --------------
	const have = (await cf.d1.prepare(`select name from sqlite_master where type = 'table'`).all()) as { results: { name: string }[] };
	const missingTables = all.filter((t) => !have.results.some((r) => r.name === t.name));
	if (missingTables.length) {
		console.error(
			`D1 has no ${missingTables.map((t) => t.name).slice(0, 5).join(', ')}${missingTables.length > 5 ? '…' : ''} table. ` +
				'Deploy and let the container start once (it applies migrations/), then run this again.'
		);
		process.exit(1);
	}
	const counts: [string, number][] = [];
	for (const t of all) {
		const [{ n }] = await target.select({ n: sql<number>`count(*)` }).from(t.d1);
		if (n > 0) counts.push([t.name, n]);
	}
	if (counts.length && !REPLACE && !DRY) {
		console.error(`D1 already has rows (${counts.map(([t, n]) => `${t}: ${n}`).join(', ')}). Re-run with --replace to delete them first.`);
		process.exit(1);
	}

	// --- 1. Read Postgres ------------------------------------------------------
	const data = new Map<string, AnyRow[]>();
	for (const t of order) {
		if (!t.pg) continue;
		const exists = await pool.query(`select to_regclass($1) as t`, [`public.${getTableName(t.pg)}`]);
		if (!exists.rows[0].t) {
			console.warn(`  ${t.name}: not in Postgres, skipped`);
			continue;
		}
		// Only the columns this database has: an older one (migrations behind) is
		// missing a few, and D1's defaults fill those in.
		const present = new Set(
			(await pool.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`, [getTableName(t.pg)])).rows.map((r) => r.column_name as string)
		);
		const fields: Record<string, PgColumn> = {};
		const absent: string[] = [];
		for (const [key, col] of Object.entries(getTableColumns(t.pg))) {
			if (present.has(col.name)) fields[key] = col;
			else absent.push(col.name);
		}
		if (absent.length) console.warn(`  ${t.name}: source has no ${absent.join(', ')} (D1 default used)`);
		data.set(t.name, (await source.select(fields).from(t.pg)) as AnyRow[]);
	}

	// --- 2. Read MongoDB ---------------------------------------------------------
	type FileOut = { id: string; kind: string; ownerId: string | null; filename: string; mimeType: string; uploadedBy: string | null; createdAt: Date; bytes: Buffer };
	const files: FileOut[] = [];
	const activity: AnyRow[] = [];
	const policies: AnyRow[] = [];
	let mongo: { close(): Promise<void> } | null = null;
	if (MONGO_URL) {
		const { MongoClient } = fromCloudflareDir('mongodb') as typeof import('mongodb');
		const client = await new MongoClient(MONGO_URL).connect();
		mongo = client;
		const mdb = client.db();
		const date = (v: unknown) => (v instanceof Date ? v : v ? new Date(String(v)) : new Date());
		const bytes = (d: Record<string, unknown>) => Buffer.from(String(d.fileBase64 ?? ''), 'base64');
		for (const d of await mdb.collection('activity_log').find().toArray()) {
			activity.push({ id: d._id.toString(), actorUserId: d.actorUserId, action: d.action, targetType: d.targetType, targetId: d.targetId ?? null, details: d.details ?? null, createdAt: date(d.createdAt) });
		}
		for (const d of await mdb.collection('policy_documents').find().toArray()) {
			const id = d._id.toString();
			files.push({ id, kind: 'policy', ownerId: null, filename: d.filename ?? 'document', mimeType: d.mimeType ?? 'application/octet-stream', uploadedBy: d.uploadedBy ?? null, createdAt: date(d.createdAt), bytes: bytes(d) });
			policies.push({ id, kind: d.kind, fileId: id, uploadedBy: d.uploadedBy, extractedJson: d.extractedJson ?? null, extractionModel: d.extractionModel ?? null, status: d.status, createdAt: date(d.createdAt), publishedAt: d.publishedAt ? date(d.publishedAt) : null });
		}
		for (const d of await mdb.collection('profile_pictures').find().toArray()) {
			files.push({ id: `avatar-${d.userId}`, kind: 'avatar', ownerId: d.userId, filename: 'avatar', mimeType: d.mimeType ?? 'image/jpeg', uploadedBy: d.userId, createdAt: date(d.updatedAt), bytes: bytes(d) });
		}
		for (const [collection, kind] of [['announcement_files', 'announcement'], ['chat_files', 'chat']] as const) {
			for (const d of await mdb.collection(collection).find().toArray()) {
				files.push({ id: d._id.toString(), kind, ownerId: null, filename: d.filename ?? 'file', mimeType: d.mimeType ?? 'application/octet-stream', uploadedBy: d.uploadedBy ?? null, createdAt: date(d.createdAt), bytes: bytes(d) });
			}
		}
	} else {
		console.warn('MONGO_URL not set: the activity log and uploaded files are NOT copied.');
	}

	console.log('\nRows to copy:');
	for (const t of order) if (data.get(t.name)?.length) console.log(`  ${t.name.padEnd(32)} ${data.get(t.name)!.length}`);
	console.log(`  activity_log (Mongo)             ${activity.length}`);
	console.log(`  policy_documents (Mongo)         ${policies.length}`);
	console.log(`  files → R2 (Mongo)               ${files.length} (${(files.reduce((n, f) => n + f.bytes.length, 0) / 1e6).toFixed(1)} MB)`);
	if (DRY) {
		await pool.end();
		await mongo?.close();
		await cf.close();
		return;
	}

	// --- 3. Clear the target (one transaction, FK checks at commit) -----------------
	const triggers = triggerStatements();
	const raw = (q: string) => cf.d1.prepare(q);
	if (counts.length) {
		console.log('\nDeleting the rows already in D1 (--replace)…');
		await cf.d1.batch([raw('PRAGMA defer_foreign_keys = on'), ...[...order].reverse().map((t) => raw(`DELETE FROM "${t.name}"`))]);
	}
	await cf.d1.batch(triggers.map((t) => raw(`DROP TRIGGER IF EXISTS "${t.name}"`)));

	// --- 4. Insert (FK columns that point forward left empty) --------------------
	const later: { table: Table; pk: string[]; rows: AnyRow[]; cols: string[] }[] = [];
	const insertAll = async (t: Table, rows: AnyRow[]) => {
		const cols = columnsOf(t.d1);
		const wait = deferred.get(t.name) ?? [];
		const clean = rows.map((r) => {
			const out: AnyRow = {};
			for (const key of Object.keys(cols)) if (r[key] !== undefined) out[key] = wait.includes(key) ? null : r[key];
			return out;
		});
		const perRow = Math.max(1, Object.keys(cols).length);
		const statements = chunk(clean, Math.max(1, Math.floor(MAX_PARAMS / perRow))).map((c) => target.insert(t.d1).values(c as never));
		for (const group of chunk(statements, BATCH)) await target.batch(group as never);
		if (wait.length) later.push({ table: t, pk: primaryKeyOf(t.d1), rows, cols: wait });
		console.log(`  ${t.name.padEnd(32)} ${rows.length}`);
	};

	console.log('\nCopying…');
	for (const t of order) {
		if (t.name === 'activity_log' && activity.length) await insertAll(t, activity);
		else if (t.name === 'policy_documents' && policies.length) {
			// stored_files must be in first; it comes later in name order otherwise.
			continue;
		} else if (t.name === 'stored_files' && files.length) {
			await insertAll(t, files.map(({ bytes, ...f }) => ({ ...f, byteSize: bytes.length, updatedAt: f.createdAt })));
			if (policies.length) await insertAll(all.find((x) => x.name === 'policy_documents')!, policies);
		} else if (data.get(t.name)?.length) await insertAll(t, data.get(t.name)!);
	}

	// --- 5. Fill in the forward references --------------------------------------
	for (const { table, pk, rows, cols } of later) {
		const updates = rows
			.filter((r) => cols.some((c) => r[c] != null))
			.map((r) => {
				const set: AnyRow = {};
				for (const c of cols) if (r[c] != null) set[c] = r[c];
				const tcols = columnsOf(table.d1);
				const where = pk.map((k) => eq(tcols[k], r[k] as never)).reduce<SQL | undefined>((a, b) => (a ? sql`${a} and ${b}` : b), undefined)!;
				return target.update(table.d1).set(set as never).where(where);
			});
		for (const group of chunk(updates, BATCH)) await target.batch(group as never);
		if (updates.length) console.log(`  ${table.name}: linked ${updates.length} row(s) (${cols.join(', ')})`);
	}

	// --- 6. File bytes to R2 ----------------------------------------------------------
	let n = 0;
	for (const f of files) {
		await cf.files.put(`files/${f.id}`, f.bytes, { httpMetadata: { contentType: f.mimeType } });
		if (++n % 25 === 0) console.log(`  R2: ${n}/${files.length}`);
	}
	if (files.length) console.log(`  R2: ${files.length} file(s) uploaded`);

	// --- 7. Triggers back, and a check ------------------------------------------------
	await cf.d1.batch(triggers.map((t) => raw(t.sql)));
	const fk = (await raw('PRAGMA foreign_key_check').all()) as { results: unknown[] };
	console.log(fk.results.length ? `\nWARNING: ${fk.results.length} broken foreign key(s): ${JSON.stringify(fk.results.slice(0, 5))}` : '\nForeign keys: all valid.');
	console.log('Done.');

	await pool.end();
	await mongo?.close();
	await cf.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
