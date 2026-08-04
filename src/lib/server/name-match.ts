/**
 * Person-name matching for HR spreadsheets.
 *
 * The HR trackers record reporting managers as free text ("Deepak", "Deepak
 * Gudur", "Santhosh Reddy S") which has to be reconciled against employee
 * records whose names are spelled differently, ordered differently, or
 * abbreviated ("Deepak Guduru", "S Santhosh Reddy"). Attaching someone to the
 * wrong manager is worse than leaving it unresolved, so an ambiguous match
 * resolves to nothing and is surfaced for a human to decide.
 */

export function nameWords(name: string): string[] {
	return name
		.trim()
		.toLowerCase()
		.replace(/[.,]/g, '')
		.split(/\s+/)
		.filter((w) => w.length > 0);
}

/**
 * Whether two single name-words refer to the same name.
 *
 * A short prefix is NOT enough on its own: "Deepak" must not match the "De" in
 * "Ranita Chowdhury De", which is exactly the collision that used to attach
 * four employees to the wrong manager. So a prefix only counts when it is at
 * least 4 characters, which still allows the genuine "Gudur" ~ "Guduru" and
 * "Prasanna" ~ "Prasannakumar" cases. Single letters are treated as initials
 * and only match other initials, never a full word.
 */
function wordsMatch(a: string, b: string): boolean {
	if (a === b) return true;
	if (a.length === 1 || b.length === 1) return false;
	const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
	return shorter.length >= 4 && longer.startsWith(shorter);
}

export interface NameCandidate {
	/** Whatever the caller needs back — a user id, a row index, etc. */
	key: string;
	fullName: string;
}

export type NameMatchOutcome =
	| { status: 'matched'; key: string; fullName: string; score: number }
	| { status: 'none' }
	| { status: 'ambiguous'; tied: NameCandidate[] };

/**
 * Resolves a free-text name against candidates.
 *
 * Every word of the shorter name must find a distinct partner in the longer
 * name (consumed pairwise, so a single "de" can't satisfy two target words).
 * Longer overlaps outrank shorter ones; an exact match always wins outright.
 */
export function matchName(raw: string | null, candidates: NameCandidate[]): NameMatchOutcome {
	if (!raw) return { status: 'none' };
	const target = nameWords(raw);
	if (target.length === 0) return { status: 'none' };

	const scored: { candidate: NameCandidate; score: number }[] = [];

	for (const candidate of candidates) {
		const words = nameWords(candidate.fullName);
		if (words.length === 0) continue;

		let score = 0;
		if (words.join(' ') === target.join(' ')) {
			score = 1000;
		} else {
			const [shortWords, longWords] =
				target.length <= words.length ? [target, words] : [words, target];
			const consumed = new Set<number>();
			const everyWordPaired = shortWords.every((w) => {
				const idx = longWords.findIndex((c, i) => !consumed.has(i) && wordsMatch(w, c));
				if (idx === -1) return false;
				consumed.add(idx);
				return true;
			});
			// Score by characters matched so "Santhosh Reddy S" beats a one-word
			// partial against the same person.
			if (everyWordPaired) score = shortWords.reduce((sum, w) => sum + w.length, 0);
		}

		if (score > 0) scored.push({ candidate, score });
	}

	if (scored.length === 0) return { status: 'none' };
	scored.sort((a, b) => b.score - a.score);

	const top = scored[0];
	const tied = scored.filter((s) => s.score === top.score);
	if (tied.length > 1) return { status: 'ambiguous', tied: tied.map((t) => t.candidate) };

	return {
		status: 'matched',
		key: top.candidate.key,
		fullName: top.candidate.fullName,
		score: top.score
	};
}

/**
 * Renders a manager for display as "Name(EMPCODE)".
 *
 * Employee code is the portal's identity key, so a resolved manager always
 * carries theirs. Managers who exist only as a name in the HR sheet — senior
 * staff outside this roster, or titles like "Chief" — have no code to show, so
 * they render as a plain name rather than a fabricated or blank code.
 */
export function formatManager(
	fullName: string | null | undefined,
	employeeCode: string | null | undefined
): string | null {
	const name = fullName?.trim();
	if (!name) return null;
	const code = employeeCode?.trim();
	return code ? `${name}(${code})` : name;
}
