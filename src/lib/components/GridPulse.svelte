<script lang="ts">
	/**
	 * Grid Pulse (ported from the React component of the same name): a fine
	 * grid that takes colour where the pointer passes and lets it go a moment
	 * later, with a few cells lighting on their own. The spectrum runs down
	 * the field like a printed colour chart, so a sweep reveals one coherent
	 * band of colour rather than confetti.
	 *
	 * Here it is light mode only: in dark mode it is hidden and asleep. Place
	 * it inside a positioned container, under the content. Decoration only:
	 * hidden from assistive tech, transparent to the pointer, drawn on one
	 * canvas that sleeps whenever nothing is lit, paused off screen, and
	 * still for readers who ask for reduced motion.
	 */
	interface Props {
		/** Cell size in px. The hairlines and the lit cells share it. */
		cell?: number;
		/** How far from the pointer a cell can still catch light, in cells. */
		reach?: number;
		/** How many cells light on their own each beat, so the grid is never dead. */
		ambient?: number;
		/** A lid, so a fast sweep cannot light the whole field at once. */
		maxLit?: number;
		/** Elements whose lines of text the light holds back from, looked up
		 *  inside the grid's parent. */
		avoid?: string;
	}

	let { cell = 24, reach = 2.6, ambient = 2, maxLit = 180, avoid = '[data-grid-avoid]' }: Props = $props();

	/** Hue at the top of the field and how far it turns by the bottom: yellow,
	 *  through orange, red, magenta and blue, to green. */
	const HUE_TOP = 60;
	const HUE_SPAN = 270;
	/** Each cell takes one of these lightnesses, so a sweep reads as a field
	 *  of tints rather than one flat colour (light ground). */
	const TINTS = [88, 80, 72, 64, 56];
	/** How faint a cell goes right behind a line of text. */
	const FAINT = 0.13;
	/** How many cells it takes to come back up to full strength. */
	const FADE = 2.2;
	/** Clearing kept around each line of text, in px. */
	const PAD = 5;
	const FADE_IN = 160;
	const FADE_OUT = 750;

	type Cell = { col: number; row: number; colour: string; dim: number; born: number; until: number };

	const easeOut = (t: number) => 1 - (1 - t) ** 2;
	const easeIn = (t: number) => t * t;

	let box = $state<HTMLDivElement | null>(null);
	let paper = $state<HTMLCanvasElement | null>(null);

	$effect(() => {
		const el = box;
		const canvas = paper;
		const ctx = canvas?.getContext('2d');
		if (!el || !canvas || !ctx) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		// Read the props once per run (they re-run the effect when they change).
		const size = cell;
		const near = reach;
		const own = ambient;
		const lid = maxLit;
		const keepClear = avoid;

		let cols = 1;
		let rows = 1;
		let width = 0;
		let height = 0;
		let clear: DOMRect[] = [];
		const cells = new Map<string, Cell>();

		// Light mode only: asleep while the portal is dark.
		const isDark = () => document.documentElement.getAttribute('data-ess-theme') === 'dark';
		let dark = isDark();

		// Protect the lines of text, not the boxes that hold them.
		const measureText = () => {
			const bounds = el.getBoundingClientRect();
			const scope = el.parentElement ?? document;
			clear = [...scope.querySelectorAll(keepClear)].flatMap((node) => {
				const range = document.createRange();
				range.selectNodeContents(node);
				const lines = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
				const boxes = lines.length > 0 ? lines : [node.getBoundingClientRect()];
				return boxes.map((r) => new DOMRect(r.left - bounds.left - PAD, r.top - bounds.top - PAD, r.width + PAD * 2, r.height + PAD * 2));
			});
		};

		const measure = () => {
			width = el.clientWidth;
			height = el.clientHeight;
			cols = Math.max(1, Math.ceil(width / size));
			rows = Math.max(1, Math.ceil(height / size));
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			measureText();
			wake();
		};

		/** How bright a cell may be, by its distance from the nearest line of
		 *  text: faint behind the words rather than cut out. */
		const brightness = (col: number, row: number) => {
			const x = col * size + size / 2;
			const y = row * size + size / 2;
			let nearest = Number.POSITIVE_INFINITY;
			for (const r of clear) {
				const dx = Math.max(r.left - x, 0, x - r.right);
				const dy = Math.max(r.top - y, 0, y - r.bottom);
				nearest = Math.min(nearest, Math.hypot(dx, dy));
				if (nearest === 0) break;
			}
			if (nearest === Number.POSITIVE_INFINITY) return 1;
			return FAINT + (1 - FAINT) * Math.min(1, nearest / (FADE * size));
		};

		const ink = (row: number) => {
			const t = rows > 1 ? Math.min(1, row / (rows - 1)) : 0;
			const hue = (((HUE_TOP - t * HUE_SPAN) % 360) + 360) % 360;
			const tint = TINTS[Math.floor(Math.random() * TINTS.length)];
			return `hsl(${Math.round(hue)} 94% ${tint}%)`;
		};

		// One loop draws every cell; it runs only while something is lit.
		let frame = 0;
		const draw = (now: number) => {
			frame = 0;
			ctx.clearRect(0, 0, width, height);
			for (const [key, c] of cells) {
				let alpha: number;
				if (now < c.until) {
					alpha = easeOut(Math.min(1, (now - c.born) / FADE_IN));
				} else {
					const t = (now - c.until) / FADE_OUT;
					if (t >= 1) {
						cells.delete(key);
						continue;
					}
					alpha = 1 - easeIn(t);
				}
				ctx.globalAlpha = alpha * c.dim;
				ctx.fillStyle = c.colour;
				// Inset by the hairline, so the grid still shows between lit cells.
				ctx.fillRect(c.col * size + 1, c.row * size + 1, size - 1, size - 1);
			}
			ctx.globalAlpha = 1;
			if (cells.size > 0) frame = requestAnimationFrame(draw);
		};
		function wake() {
			if (!frame) frame = requestAnimationFrame(draw);
		}

		/** Lights one cell, unless it is off the grid or already lit. */
		const light = (col: number, row: number, hold: number) => {
			if (dark) return;
			if (col < 0 || row < 0 || col >= cols || row >= rows) return;
			if (cells.size >= lid) return;
			const key = `${col},${row}`;
			const now = performance.now();
			const lit = cells.get(key);
			if (lit && now < lit.until) return;
			// A cell caught again while fading picks up from where it had got to.
			let born = now;
			if (lit) {
				const faded = 1 - easeIn(Math.min(1, (now - lit.until) / FADE_OUT));
				born = now - (1 - Math.sqrt(1 - faded)) * FADE_IN;
			}
			cells.set(key, { col, row, colour: lit?.colour ?? ink(row), dim: brightness(col, row), born, until: now + hold });
			wake();
		};

		// The pointer paints; cells further from it catch light less often.
		let pending = 0;
		let at: { x: number; y: number } | null = null;
		const paint = () => {
			pending = 0;
			if (!at) return;
			const cx = Math.floor(at.x / size);
			const cy = Math.floor(at.y / size);
			const span = Math.ceil(near);
			for (let dy = -span; dy <= span; dy++) {
				for (let dx = -span; dx <= span; dx++) {
					const away = Math.hypot(dx, dy);
					if (away > near) continue;
					if (Math.random() > 1 - away / (near + 0.6)) continue;
					light(cx + dx, cy + dy, 260 + Math.random() * 900);
				}
			}
		};
		// Listened for on the window: the grid sits under the content.
		const onMove = (event: PointerEvent) => {
			if (dark) return;
			const bounds = el.getBoundingClientRect();
			at = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
			if (!pending) pending = requestAnimationFrame(paint);
		};

		// A few cells find their own way on; paused while out of sight.
		let visible = true;
		let beat = 0;
		const drift = () => {
			beat = window.setTimeout(drift, 1400 + Math.random() * 1800);
			if (!visible || document.hidden || dark) return;
			for (let i = 0; i < own; i++) {
				light(Math.floor(Math.random() * cols), Math.floor(Math.random() * rows), 900 + Math.random() * 1600);
			}
		};
		beat = window.setTimeout(drift, 500);

		const sight = new IntersectionObserver(([entry]) => {
			visible = entry?.isIntersecting ?? true;
		});
		sight.observe(el);
		const resize = new ResizeObserver(measure);
		resize.observe(el);
		// Text added, removed or rewritten moves the lines to hold back from.
		let recheck = 0;
		const copy = new MutationObserver(() => {
			if (!recheck)
				recheck = requestAnimationFrame(() => {
					recheck = 0;
					measureText();
				});
		});
		copy.observe(el.parentElement ?? document.body, { childList: true, subtree: true, characterData: true });
		// Follow the portal's theme switch: going dark clears the field.
		const theme = new MutationObserver(() => {
			dark = isDark();
			if (dark) {
				cells.clear();
				ctx.clearRect(0, 0, width, height);
			}
		});
		theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ess-theme'] });
		measure();
		// Lines of text move once the web fonts arrive.
		document.fonts?.ready.then(measureText).catch(() => {});
		window.addEventListener('pointermove', onMove, { passive: true });

		return () => {
			sight.disconnect();
			resize.disconnect();
			copy.disconnect();
			cancelAnimationFrame(recheck);
			theme.disconnect();
			cancelAnimationFrame(frame);
			cancelAnimationFrame(pending);
			clearTimeout(beat);
			window.removeEventListener('pointermove', onMove);
		};
	});
</script>

<div bind:this={box} class="grid-pulse" aria-hidden="true" data-slot="grid-pulse" style:--grid-pulse-cell="{cell}px">
	<canvas bind:this={paper}></canvas>
</div>

<style>
	.grid-pulse {
		position: absolute;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		pointer-events: none;
		/* The hairlines, faint on their own so the lit cells keep full ink. */
		--grid-pulse-line: color-mix(in oklab, var(--ess-text) 6%, transparent);
		background-image:
			linear-gradient(to right, var(--grid-pulse-line) 1px, transparent 1px),
			linear-gradient(to bottom, var(--grid-pulse-line) 1px, transparent 1px);
		background-size: var(--grid-pulse-cell) var(--grid-pulse-cell);
		/* Fades out at the bottom. */
		-webkit-mask-image: linear-gradient(to bottom, #000 92%, transparent);
		mask-image: linear-gradient(to bottom, #000 92%, transparent);
	}
	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	/* Light mode only. */
	:global([data-ess-theme='dark']) .grid-pulse {
		display: none;
	}
</style>
