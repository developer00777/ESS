/**
 * Sorting and paging for a table of rows already in the browser (UI only:
 * it never asks the server for anything). A page builds one per table:
 *
 *   const view = new TableView(() => rows, {
 *     name: (r) => r.fullName,
 *     joined: (r) => r.joinedOn,
 *   });
 *
 * and loops over `view.rows` (this page's slice, sorted) instead of `rows`.
 * Each sortable header is a <SortButton {view} key="name">; the table's
 * foot is <TablePager {view} />.
 *
 * A header cycles default → ascending → descending → default. Sorting is
 * stable (ties keep their original order), empty values sort last, numbers
 * and dates compare as such, and text compares the way people read it
 * ("Item 2" before "Item 10", case and accents ignored).
 */

export type SortDir = 'asc' | 'desc' | null;
type Value = string | number | boolean | Date | null | undefined;
export type Accessors<T> = Record<string, (row: T) => Value>;

/** Rows per page, the default for every table. */
export const PAGE_SIZE = 12;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function compare(a: Value, b: Value): number {
	const emptyA = a === null || a === undefined || a === '';
	const emptyB = b === null || b === undefined || b === '';
	if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
	if (a instanceof Date || b instanceof Date) return +new Date(a as Date) - +new Date(b as Date);
	if (typeof a === 'number' && typeof b === 'number') return a - b;
	if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
	return collator.compare(String(a), String(b));
}

export class TableView<T> {
	/** The column being sorted on, and which way (null: the original order). */
	key = $state<string | null>(null);
	dir = $state<SortDir>(null);
	page = $state(1);
	// A default here as well, so the derived values below can name it.
	readonly pageSize: number = PAGE_SIZE;

	#source: () => T[];
	#by: Accessors<T>;

	constructor(source: () => T[], by: Accessors<T>, pageSize = PAGE_SIZE) {
		this.#source = source;
		this.#by = by;
		this.pageSize = pageSize;
	}

	/** Every row, in the chosen order. */
	sorted = $derived.by(() => {
		const rows = this.#source() ?? [];
		const get = this.key && this.dir ? this.#by[this.key] : undefined;
		if (!get) return rows;
		const sign = this.dir === 'asc' ? 1 : -1;
		// Index as the tie-break keeps the sort stable either way round.
		return rows
			.map((row, i) => ({ row, i, v: get(row) }))
			.sort((x, y) => {
				const c = compare(x.v, y.v);
				// Empty values stay last in both directions.
				const emptyX = x.v === null || x.v === undefined || x.v === '';
				const emptyY = y.v === null || y.v === undefined || y.v === '';
				if (emptyX !== emptyY) return c;
				return c === 0 ? x.i - y.i : sign * c;
			})
			.map((x) => x.row);
	});

	total = $derived(this.sorted.length);
	pages = $derived(Math.max(1, Math.ceil(this.total / this.pageSize)));
	/** The page shown: kept in range when rows go away (a filter, a delete). */
	current = $derived(Math.min(Math.max(1, this.page), this.pages));
	from = $derived(this.total === 0 ? 0 : (this.current - 1) * this.pageSize + 1);
	to = $derived(Math.min(this.current * this.pageSize, this.total));
	/** The rows on the page shown. */
	rows = $derived(this.sorted.slice((this.current - 1) * this.pageSize, this.current * this.pageSize));

	/** Default → ascending → descending → default, back to page 1. */
	sort(key: string) {
		if (this.key !== key) {
			this.key = key;
			this.dir = 'asc';
		} else if (this.dir === 'asc') {
			this.dir = 'desc';
		} else {
			this.key = null;
			this.dir = null;
		}
		this.page = 1;
	}

	/** For the header cell's aria-sort. */
	ariaSort(key: string): 'ascending' | 'descending' | 'none' {
		return this.key === key && this.dir ? (this.dir === 'asc' ? 'ascending' : 'descending') : 'none';
	}

	dirOf(key: string): SortDir {
		return this.key === key ? this.dir : null;
	}

	go(page: number) {
		this.page = Math.min(Math.max(1, page), this.pages);
	}
}
