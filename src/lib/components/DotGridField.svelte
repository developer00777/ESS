<script lang="ts">
	/**
	 * A field of small dashes on a jittered grid that move away from the cursor
	 * and spring back. Used by the Mono theme behind the login hero and the
	 * dashboard greeting row. It fills its positioned parent.
	 *
	 * The dashes are neutral greys that follow light/dark (data-ess-theme).
	 * Drawing stops while the canvas is hidden (e.g. display:none in other
	 * themes) or off-screen, and pauses once every dash is at rest. Motion is
	 * contained to the canvas, so it runs under prefers-reduced-motion too.
	 */
	interface Props {
		/** Average spacing between dashes in px. */
		dotGap?: number;
		/** Radius around the cursor where dashes are pushed away (px). */
		interactionRadius?: number;
		/** Push strength. */
		repulsionStrength?: number;
		/** Spring constant pulling dashes home. */
		springK?: number;
		/** Velocity damping per frame (0–1). */
		damping?: number;
		/** Dash length range in px. */
		dashLength?: [number, number];
		/** Overall opacity multiplier for the dashes. */
		intensity?: number;
		/** Override the grey palette. */
		colors?: string[];
	}

	let {
		dotGap = 72,
		interactionRadius = 120,
		repulsionStrength = 7,
		springK = 0.065,
		damping = 0.8,
		dashLength = [7, 16],
		intensity = 1,
		colors
	}: Props = $props();

	const LIGHT = ['#18181b', '#27272a', '#3f3f46', '#52525b', '#71717a', '#a1a1aa'];
	const DARK = ['#fafafa', '#e4e4e7', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b'];

	type Particle = {
		ox: number;
		oy: number;
		x: number;
		y: number;
		vx: number;
		vy: number;
		w: number;
		h: number;
		rot: number;
		shade: number;
		alpha: number;
	};

	let canvas: HTMLCanvasElement;

	$effect(() => {
		const cvs = canvas;
		const ctx = cvs.getContext('2d');
		if (!ctx) return;

		// Read the props once per effect run so changes rebuild the field.
		const gap = dotGap;
		const ir = interactionRadius;
		const ir2 = ir * ir;
		const push = repulsionStrength;
		const k = springK;
		const damp = damping;
		const [hMin, hMax] = dashLength;
		const boost = intensity;
		const custom = colors;

		let W = 0;
		let H = 0;
		let particles: Particle[] = [];
		let raf = 0;
		let visible = true;
		const mouse = { x: -9999, y: -9999, active: false };

		// Colours: the prop, else a theme's `--dg-colors` (comma list) on the
		// canvas or an ancestor, else greys for light/dark.
		let palette = LIGHT;
		const readPalette = () => {
			const fromCss = getComputedStyle(cvs)
				.getPropertyValue('--dg-colors')
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
			palette =
				custom ??
				(fromCss.length
					? fromCss
					: document.documentElement.getAttribute('data-ess-theme') === 'dark'
						? DARK
						: LIGHT);
		};
		readPalette();

		function build() {
			const jitter = gap * 0.55;
			const cols = Math.ceil(W / gap) + 1;
			const rows = Math.ceil(H / gap) + 1;
			const out: Particle[] = [];
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					const ox = c * gap + (Math.random() - 0.5) * jitter * 2;
					const oy = r * gap + (Math.random() - 0.5) * jitter * 2;
					out.push({
						ox,
						oy,
						x: ox,
						y: oy,
						vx: 0,
						vy: 0,
						w: 1.8 + Math.random() * 1.6,
						h: hMin + Math.random() * (hMax - hMin),
						rot: Math.random() * Math.PI * 2,
						shade: Math.random(),
						alpha: (0.35 + Math.random() * 0.35) * boost
					});
				}
			}
			particles = out;
		}

		function resize() {
			const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
			W = cvs.offsetWidth;
			H = cvs.offsetHeight;
			cvs.width = Math.max(1, Math.round(W * dpr));
			cvs.height = Math.max(1, Math.round(H * dpr));
			ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
			build();
			kick();
		}

		function kick() {
			if (!raf && visible && !document.hidden && W > 0 && H > 0) raf = requestAnimationFrame(draw);
		}

		function dash(p: Particle, len: number, angle: number) {
			const hw = p.w / 2;
			const hh = len / 2;
			ctx!.save();
			ctx!.translate(p.x, p.y);
			ctx!.rotate(angle);
			ctx!.globalAlpha = p.alpha;
			ctx!.fillStyle = palette[Math.floor(p.shade * palette.length)];
			ctx!.beginPath();
			ctx!.roundRect(-hw, -hh, p.w, len, hw);
			ctx!.fill();
			ctx!.restore();
		}

		function draw() {
			raf = 0;
			if (document.hidden || !visible) return;
			ctx!.clearRect(0, 0, W, H);

			const active = mouse.active;
			let moving = false;

			for (const p of particles) {
				if (active) {
					const dx = p.x - mouse.x;
					const dy = p.y - mouse.y;
					const d2 = dx * dx + dy * dy;
					if (d2 < ir2 && d2 > 0.01) {
						const d = Math.sqrt(d2);
						const f = ((ir - d) / ir) ** 2 * push;
						p.vx += (dx / d) * f;
						p.vy += (dy / d) * f;
					}
				}
				p.vx += (p.ox - p.x) * k;
				p.vy += (p.oy - p.y) * k;
				p.vx *= damp;
				p.vy *= damp;
				p.x += p.vx;
				p.y += p.vy;

				const speed = Math.hypot(p.vx, p.vy);
				if (speed > 0.02 || Math.abs(p.ox - p.x) > 0.1 || Math.abs(p.oy - p.y) > 0.1) moving = true;
				const len = p.h + Math.min(speed * 0.6, 6);
				dash(p, len, speed > 0.5 ? Math.atan2(p.vy, p.vx) + Math.PI / 2 : p.rot);
			}
			ctx!.globalAlpha = 1;

			// Keep drawing while the cursor is over the field or anything is
			// still settling; otherwise stop until the next mouse move.
			if (moving || (active && mouse.x > -ir && mouse.x < W + ir && mouse.y > -ir && mouse.y < H + ir)) {
				raf = requestAnimationFrame(draw);
			}
		}

		const track = (cx: number, cy: number) => {
			const r = cvs.getBoundingClientRect();
			mouse.x = cx - r.left;
			mouse.y = cy - r.top;
			mouse.active = true;
			kick();
		};
		const onMove = (e: MouseEvent) => track(e.clientX, e.clientY);
		const onTouch = (e: TouchEvent) => {
			if (e.touches[0]) track(e.touches[0].clientX, e.touches[0].clientY);
		};
		const onLeave = () => {
			mouse.active = false;
			kick();
		};
		const onVisibility = () => kick();

		window.addEventListener('mousemove', onMove, { passive: true });
		window.addEventListener('touchmove', onTouch, { passive: true });
		document.documentElement.addEventListener('mouseleave', onLeave);
		window.addEventListener('touchend', onLeave);
		document.addEventListener('visibilitychange', onVisibility);

		const io = new IntersectionObserver(
			([e]) => {
				visible = e?.isIntersecting ?? true;
				kick();
			},
			{ threshold: 0.01 }
		);
		io.observe(cvs);

		const ro = new ResizeObserver(resize);
		ro.observe(cvs);

		// Recolour when light/dark or the theme changes, and draw once so a
		// field at rest picks up the new colours.
		const mo = new MutationObserver(() => {
			readPalette();
			for (const p of particles) p.vx += 0.03;
			kick();
		});
		mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ess-theme', 'data-ess-skin'] });

		resize();

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			io.disconnect();
			mo.disconnect();
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('touchmove', onTouch);
			document.documentElement.removeEventListener('mouseleave', onLeave);
			window.removeEventListener('touchend', onLeave);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>

<canvas bind:this={canvas} class="dot-grid-field" aria-hidden="true"></canvas>

<style>
	.dot-grid-field {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
		pointer-events: none;
	}
</style>
