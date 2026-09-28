/**
 * Holds the page still while a fixed overlay is open.
 *
 * Without this, a wheel or trackpad gesture anywhere over the scrim scrolls the
 * page underneath the panel: you close the slide-over and the roster is no
 * longer where you left it. The panel's own promise — "closing returns you
 * exactly where you were" — only holds if the document stops scrolling while it
 * is up.
 *
 * The lock is `overflow: hidden` on <html> rather than the more common
 * `position: fixed` on <body>. Fixing the body collapses the scroll offset to
 * zero and re-lays-out everything inside it, which yanks the `position: sticky`
 * nav rail off screen whenever the panel is opened from halfway down a page.
 * Hiding overflow leaves the scroll offset — and so the rail — exactly as it
 * was.
 *
 * Reference counted: nested or overlapping overlays each take a lock, and the
 * page only starts scrolling again when the last one is released.
 */

let holders = 0;
/** Inline styles as they were before the first lock, to restore verbatim. */
let previous: { overflow: string; paddingRight: string } | null = null;
let restoreY = 0;

/** True when the browser reserves the scrollbar gutter for us via CSS. */
function gutterIsReserved(): boolean {
	return (
		typeof CSS !== 'undefined' &&
		typeof CSS.supports === 'function' &&
		CSS.supports('scrollbar-gutter', 'stable')
	);
}

/**
 * Takes a lock and returns its release function. Releasing twice is a no-op, so
 * callers can wire it straight to a teardown that may run more than once.
 */
export function lockPageScroll(): () => void {
	if (typeof document === 'undefined') return () => {};

	const root = document.documentElement;

	if (holders === 0) {
		previous = { overflow: root.style.overflow, paddingRight: root.style.paddingRight };
		restoreY = window.scrollY;

		// Classic overlay scrollbars (macOS, touch) take up no space, so this is
		// zero and nothing is padded. Where a scrollbar does take space, modern
		// browsers keep the gutter reserved through `scrollbar-gutter: stable`
		// and this is still zero; the manual pad is the fallback for the ones
		// that don't support it, and it is what stops the whole layout sliding
		// sideways by ~15px the moment the panel opens.
		if (!gutterIsReserved()) {
			const gutter = window.innerWidth - root.clientWidth;
			if (gutter > 0) {
				const pad = parseFloat(getComputedStyle(root).paddingRight) || 0;
				root.style.paddingRight = `${pad + gutter}px`;
			}
		}

		root.style.overflow = 'hidden';
	}

	holders += 1;
	let released = false;

	return () => {
		if (released) return;
		released = true;
		holders -= 1;
		if (holders > 0) return;

		root.style.overflow = previous?.overflow ?? '';
		root.style.paddingRight = previous?.paddingRight ?? '';
		previous = null;

		// Browsers keep the offset across an overflow change, so this is belt and
		// braces — but a stale offset here is exactly the bug the lock exists to
		// prevent, so it is worth asserting rather than assuming.
		if (Math.abs(window.scrollY - restoreY) > 1) {
			window.scrollTo({ top: restoreY, behavior: 'instant' as ScrollBehavior });
		}
	};
}
