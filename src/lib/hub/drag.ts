/**
 * Dragging cards on a Champ Hub board, with a mouse or a finger.
 *
 * Pointer Events rather than the HTML drag API, which does nothing on phones.
 * A mouse drag starts after a 5px move; a touch drag after a 250ms press, so
 * an ordinary swipe still scrolls the board. Cards carry `data-card="<id>"`,
 * drop areas `data-zone="<key>"`; inside a zone the card lands between the
 * cards around the pointer, and the caller hears which ones those were.
 *
 * Every drag has a non-drag path (Status and Assignee in the task sheet, and
 * Alt + arrow keys on a focused card), so this is a convenience, not the only
 * way to move work.
 */

export type DropTarget = { zone: string; beforeId: string | null; afterId: string | null };

type Options = { ondrop: (taskId: string, target: DropTarget) => void; disabled?: boolean };

export function dragBoard(node: HTMLElement, options: Options) {
	let opts = options;
	let start: { x: number; y: number; id: string; el: HTMLElement; pointerId: number; touch: boolean } | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let dragging = false;
	let ghost: HTMLElement | null = null;
	let line: HTMLElement | null = null;
	let target: DropTarget | null = null;
	let offset = { x: 0, y: 0 };
	let suppressClick = false;

	function begin() {
		if (!start) return;
		dragging = true;
		const r = start.el.getBoundingClientRect();
		offset = { x: start.x - r.left, y: start.y - r.top };
		ghost = start.el.cloneNode(true) as HTMLElement;
		ghost.classList.add('hub-drag-ghost');
		Object.assign(ghost.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, pointerEvents: 'none', zIndex: '90' });
		document.body.appendChild(ghost);
		line = document.createElement('div');
		line.className = 'hub-drop-line';
		start.el.classList.add('hub-dragging');
		try {
			start.el.setPointerCapture(start.pointerId);
		} catch {
			/* capture is a nicety */
		}
		navigator.vibrate?.(10);
	}

	function cleanup() {
		if (timer) clearTimeout(timer);
		timer = null;
		ghost?.remove();
		line?.remove();
		ghost = line = null;
		start?.el.classList.remove('hub-dragging');
		node.querySelectorAll('.hub-zone-over').forEach((z) => z.classList.remove('hub-zone-over'));
		start = null;
		dragging = false;
		target = null;
	}

	function locate(x: number, y: number) {
		const el = document.elementFromPoint(x, y) as HTMLElement | null;
		const zone = el?.closest<HTMLElement>('[data-zone]');
		node.querySelectorAll('.hub-zone-over').forEach((z) => z !== zone && z.classList.remove('hub-zone-over'));
		if (!zone || !node.contains(zone) || !start) {
			line?.remove();
			target = null;
			return;
		}
		zone.classList.add('hub-zone-over');
		const cards = [...zone.querySelectorAll<HTMLElement>('[data-card]')].filter((c) => c.dataset.card !== start!.id);
		let after: HTMLElement | null = null;
		for (const c of cards) {
			const r = c.getBoundingClientRect();
			if (y < r.top + r.height / 2) {
				after = c;
				break;
			}
		}
		const idx = after ? cards.indexOf(after) : cards.length;
		const before = idx > 0 ? cards[idx - 1] : null;
		const list = zone.querySelector<HTMLElement>('[data-zone-list]') ?? zone;
		if (line) {
			if (after) after.before(line);
			else list.appendChild(line);
		}
		target = { zone: zone.dataset.zone!, beforeId: before?.dataset.card ?? null, afterId: after?.dataset.card ?? null };
	}

	function autoScroll(x: number) {
		const scroller = node.querySelector<HTMLElement>('[data-scroll]') ?? node;
		const r = scroller.getBoundingClientRect();
		if (x < r.left + 40) scroller.scrollLeft -= 14;
		else if (x > r.right - 40) scroller.scrollLeft += 14;
	}

	function down(e: PointerEvent) {
		if (opts.disabled || e.button !== 0) return;
		const t = e.target as HTMLElement;
		if (t.closest('button, input, select, textarea, a, [data-no-drag]')) return;
		const el = t.closest<HTMLElement>('[data-card]');
		if (!el || !node.contains(el)) return;
		start = { x: e.clientX, y: e.clientY, id: el.dataset.card!, el, pointerId: e.pointerId, touch: e.pointerType !== 'mouse' };
		if (start.touch) timer = setTimeout(begin, 250);
	}

	function move(e: PointerEvent) {
		if (!start) return;
		const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
		if (!dragging) {
			if (start.touch) {
				// Moved before the press registered: it was a scroll.
				if (dist > 8) cleanup();
				return;
			}
			if (dist < 5) return;
			begin();
		}
		e.preventDefault();
		if (ghost) Object.assign(ghost.style, { left: `${e.clientX - offset.x}px`, top: `${e.clientY - offset.y}px` });
		locate(e.clientX, e.clientY);
		autoScroll(e.clientX);
	}

	function up() {
		if (!start) return;
		const id = start.id;
		const t = target;
		const was = dragging;
		cleanup();
		if (was) {
			suppressClick = true;
			setTimeout(() => (suppressClick = false), 0);
			if (t) opts.ondrop(id, t);
		}
	}

	function click(e: MouseEvent) {
		if (suppressClick) {
			e.stopPropagation();
			e.preventDefault();
		}
	}

	function key(e: KeyboardEvent) {
		if (e.key === 'Escape' && start) cleanup();
	}

	// A touch drag must not scroll the page under it.
	function touchmove(e: TouchEvent) {
		if (dragging) e.preventDefault();
	}

	node.addEventListener('pointerdown', down);
	window.addEventListener('pointermove', move, { passive: false });
	window.addEventListener('pointerup', up);
	window.addEventListener('pointercancel', cleanup);
	window.addEventListener('keydown', key);
	node.addEventListener('click', click, true);
	node.addEventListener('touchmove', touchmove, { passive: false });

	return {
		update(next: Options) {
			opts = next;
		},
		destroy() {
			cleanup();
			node.removeEventListener('pointerdown', down);
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			window.removeEventListener('pointercancel', cleanup);
			window.removeEventListener('keydown', key);
			node.removeEventListener('click', click, true);
			node.removeEventListener('touchmove', touchmove);
		}
	};
}
