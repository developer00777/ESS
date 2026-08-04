/**
 * Indian financial year: 1 April to 31 March.
 *
 * A calendar month alone is ambiguous for HR purposes — March and April 2026
 * sit in different financial years despite being adjacent — so the calendars
 * label which FY the month being viewed belongs to.
 */

/** The FY a month belongs to, identified by its starting calendar year. */
export function financialYearStart(year: number, monthIndex: number): number {
	// monthIndex is 0-based: 0 = January, 3 = April.
	return monthIndex >= 3 ? year : year - 1;
}

/**
 * Short label for display, e.g. "FY 26-27" for April 2026 through March 2027.
 * Two digits because the full form ("FY 2026-2027") crowds a calendar header.
 */
export function financialYearLabel(year: number, monthIndex: number): string {
	const start = financialYearStart(year, monthIndex);
	const end = start + 1;
	return `FY ${String(start % 100).padStart(2, '0')}-${String(end % 100).padStart(2, '0')}`;
}
