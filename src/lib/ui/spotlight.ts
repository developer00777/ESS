/**
 * Cursor spotlight for cards: while the pointer moves over a card (and any
 * card it sits inside), sets --mx/--my on it to the pointer's position, so
 * the card's CSS can draw a glow there (see "cursor spotlight" in
 * ess-components.css). Purely visual; one passive listener, one update
 * per frame. Returns a cleanup function.
 */
const CARD = '.ess-card, .ess-metric, .ess-figures';

export function cardSpotlight(root: Document = document): () => void {
	let frame = 0;
	let last: PointerEvent | null = null;

	function update() {
		frame = 0;
		const e = last;
		if (!e) return;
		let el = (e.target as Element | null)?.closest?.<HTMLElement>(CARD) ?? null;
		while (el) {
			const r = el.getBoundingClientRect();
			el.style.setProperty('--mx', `${e.clientX - r.left}px`);
			el.style.setProperty('--my', `${e.clientY - r.top}px`);
			el = el.parentElement?.closest<HTMLElement>(CARD) ?? null;
		}
	}

	function move(e: PointerEvent) {
		if (e.pointerType !== 'mouse') return;
		last = e;
		if (!frame) frame = requestAnimationFrame(update);
	}

	root.addEventListener('pointermove', move, { passive: true });
	return () => {
		root.removeEventListener('pointermove', move);
		if (frame) cancelAnimationFrame(frame);
	};
}
