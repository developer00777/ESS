import { env } from '$env/dynamic/private';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** The fields the bulk importer needs. `null` means "not present in this sheet". */
export interface SheetMapping {
	sheetName: string;
	headerRow: number;
	columns: {
		employeeCode: string | null;
		fullName: string | null;
		designation: string | null;
		officialEmail: string | null;
		teamAndFloor: string | null;
		reportingAuthority: string | null;
	};
	/** The model's own note on anything ambiguous — surfaced to the Super Admin. */
	note: string | null;
}

export interface SheetSummary {
	name: string;
	rowCount: number;
	/** First few rows as raw cell text, already redacted. */
	sampleRows: string[][];
}

/**
 * Masks anything that looks like personal data before it leaves the system.
 * The model only needs a column's SHAPE to map it, never its real contents —
 * these sheets carry bank accounts, Aadhaar numbers, DOBs and addresses.
 */
export function redactCell(value: string): string {
	let out = value;
	// Digits → N. Preserves length/format so "2023-06-21" still reads as a date
	// shape and "50100509155982" still reads as a long number.
	out = out.replace(/\d/g, 'N');
	// Local part of an email → keep the domain, which is what identifies the column.
	out = out.replace(/[^\s@]+@/g, 'user@');
	return out.length > 40 ? `${out.slice(0, 40)}…` : out;
}

async function callOpenRouter(messages: Array<{ role: string; content: string }>): Promise<string> {
	const apiKey = env.OPENROUTER_API_KEY;
	const model = env.OPENROUTER_MODEL ?? 'google/gemini-3.5-flash';
	if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

	const res = await fetch(OPENROUTER_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ model, messages, temperature: 0 })
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`OpenRouter request failed (${res.status}): ${body}`);
	}

	const data = await res.json();
	const content: string | undefined = data?.choices?.[0]?.message?.content;
	if (!content) throw new Error('OpenRouter returned no content');
	return content;
}

function parseJsonResponse<T>(raw: string): T {
	const cleaned = raw
		.trim()
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/```\s*$/i, '');
	return JSON.parse(cleaned) as T;
}

const SYSTEM_PROMPT = `You map HR spreadsheets onto a fixed schema for an employee-onboarding importer.

You are given every sheet in a workbook: its name, row count, and the first few rows as raw cells. Cell VALUES are redacted — digits are replaced with N and email local-parts with "user" — because they contain personal data. Map columns from HEADER TEXT and value SHAPE, never from the actual values.

Choose the ONE sheet that lists individual employees (one person per row). Ignore sheets that are lookups, designations lists, summaries, or notes — a sheet of ~200 rows with only a code/name/designation is usually a reference list, while the employee sheet has contact and job columns.

Identify the header row (1-indexed; often row 1, but some sheets have a title row above it).

Then map these fields to EXACT header text from that sheet, or null if genuinely absent:
- employeeCode: the company employee ID (e.g. "CIPL Emp Code", "Emp Code", "Employee ID"). NOT a serial/row number.
- fullName: the person's name (e.g. "Name Of the Champion", "Employee Name").
- designation: job title.
- officialEmail: the WORK email. If both work and personal email columns exist, pick the work one.
- teamAndFloor: team, department or location.
- reportingAuthority: who they report to (manager/supervisor). Prefer the DIRECT one over a dotted-line one.

Reply with ONLY this JSON, no prose:
{"sheetName":"...","headerRow":1,"columns":{"employeeCode":"..."|null,"fullName":"..."|null,"designation":"..."|null,"officialEmail":"..."|null,"teamAndFloor":"..."|null,"reportingAuthority":"..."|null},"note":"..."|null}

Header values must be copied EXACTLY as given, including any trailing spaces. Use "note" to flag anything ambiguous or a column you deliberately left null.`;

/**
 * Asks the model which sheet and columns to use. Called only when the
 * deterministic parser can't recognise the workbook, so a familiar file never
 * depends on the network or an API key.
 */
export async function mapSpreadsheet(sheets: SheetSummary[]): Promise<SheetMapping> {
	const described = sheets
		.map((s) => {
			const rows = s.sampleRows
				.map((r, i) => `  row ${i + 1}: ${JSON.stringify(r)}`)
				.join('\n');
			return `Sheet "${s.name}" (${s.rowCount} rows):\n${rows}`;
		})
		.join('\n\n');

	const raw = await callOpenRouter([
		{ role: 'system', content: SYSTEM_PROMPT },
		{ role: 'user', content: described }
	]);

	const mapping = parseJsonResponse<SheetMapping>(raw);

	if (!mapping?.sheetName || !mapping.columns) {
		throw new Error('The model did not return a usable sheet mapping');
	}
	// A sheet with no name column can't produce employees; fail loudly rather
	// than importing a batch of blank people.
	if (!mapping.columns.fullName) {
		throw new Error(
			`Could not find an employee-name column in "${mapping.sheetName}"${mapping.note ? ` — ${mapping.note}` : ''}`
		);
	}
	if (!Number.isInteger(mapping.headerRow) || mapping.headerRow < 1) {
		mapping.headerRow = 1;
	}

	return mapping;
}
