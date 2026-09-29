/**
 * What Champ hands back to the page. Shared by the server loop and the panel.
 *
 * Champ never changes anything itself. Anything that would — a leave
 * request, an approval, a task, a settings or role change, a new login —
 * comes back as a card with a button, and nothing happens until a person
 * presses it. The button goes to /api/champ/apply, which runs the same code
 * and the same checks as the portal page that does that job.
 */

export type ChampCardKind =
	| 'leave_request'
	| 'correction'
	| 'comp_off'
	| 'approve'
	| 'task'
	| 'settings_change'
	| 'role_change'
	| 'create_login'
	| 'named_role'
	| 'announcement_draft';

export type ChampCard = {
	/** Unique within the conversation, for the panel to track done / failed. */
	id: string;
	kind: ChampCardKind;
	/** Short heading: "Leave request · not sent yet". */
	label: string;
	title: string;
	lines: string[];
	payload: Record<string, unknown>;
	buttons: { action: string; label: string; primary?: boolean }[];
	/** Shown after it succeeds: "Submitted · waiting on Rahul Menon". */
	doneText: string;
};

export type ChampReport = {
	title: string;
	columns: { key: string; label: string }[];
	rows: string[][];
	truncated: boolean;
};

export type ChampMessage = { role: 'user' | 'assistant'; content: string };

export type ChampResult = {
	reply: string;
	report?: ChampReport;
	cards: ChampCard[];
	usedTools: string[];
};

export const CHAMP_LIMITS = {
	/** Turns of history sent back to the model. */
	history: 12,
	/** Longest question, enough for a pasted list of report headings. */
	question: 4000,
	/** Rows in a report or list. */
	rows: 200,
	/** Questions per person per hour. */
	perHour: 40
};
