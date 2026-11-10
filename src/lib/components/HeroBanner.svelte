<script lang="ts">
	/**
	 * The login page's left panel: a hero banner in the style of a product
	 * landing page. A city skyline (drawn in SVG) sits under a light blue to
	 * deep navy gradient with the Champ HR headline, and a white stats card
	 * overlaps the banner's lower edge. The stats describe the product
	 * (self-service, one login, no forms) rather than claim figures.
	 *
	 * It is alive: the skyline drifts in parallax layers, clouds and a plane
	 * cross the sky, windows and beacons blink, a band of light sweeps over,
	 * the copy and card rise in and the stat numbers count. The motion stays
	 * inside the panel, so it plays even under prefers-reduced-motion (the
	 * app otherwise shortens every animation to 0.01ms; each animation here
	 * keeps its length with !important).
	 */

	// Seeded random numbers, so the skyline is the same on every render.
	function rng(seed: number) {
		let s = seed;
		return () => (s = (s * 16807) % 2147483647) / 2147483647;
	}

	const SUN_X = 455; // the glow sits behind the city here; faces turned to it catch the light

	// One building: its block, the face lit by the glow, vertical piers,
	// a grid of windows and rooftop pieces (setback, water tank, antenna).
	// Windows and piers are single paths, so a dense city stays light.
	type Building = {
		x: number;
		y: number;
		w: number;
		h: number;
		face: { x: number; w: number };
		roof: string;
		piers: string;
		wins: string;
		tw: { x: number; y: number; d: string }[];
	};
	function city(
		seed: number,
		from: number,
		to: number,
		base: number,
		[minH, maxH]: [number, number],
		[minW, maxW]: [number, number],
		o: { density: number; col: number; row: number; pier: number; roof: number; twinkles: number }
	) {
		const r = rng(seed);
		const out: Building[] = [];
		let x = from;
		while (x < to) {
			const w = minW + r() * (maxW - minW);
			const h = minH + Math.pow(r(), 1.4) * (maxH - minH);
			const y = base - h;
			const faceW = Math.max(3, w * 0.24);
			const face = x + w / 2 < SUN_X ? { x: x + w - faceW, w: faceW } : { x, w: faceW };
			let roof = '';
			const pick = r();
			if (pick < o.roof * 0.4) {
				// setback with a smaller block on top
				const sw = w * (0.45 + r() * 0.2);
				const sh = 8 + r() * 22;
				roof += `M${x + (w - sw) / 2} ${y} v${-sh} h${sw} v${sh}Z`;
			} else if (pick < o.roof * 0.75) {
				// water tank on legs
				const cx = x + w * (0.3 + r() * 0.4);
				roof += `M${cx - 5} ${y - 6} h10 v-9 h-10Z M${cx - 6} ${y - 15} L${cx} ${y - 20} L${cx + 6} ${y - 15}Z M${cx - 4} ${y} v-6 h1.4 v6Z M${cx + 2.6} ${y} v-6 h1.4 v6Z`;
			} else if (pick < o.roof) {
				// antenna
				const ax = x + w * (0.25 + r() * 0.5);
				roof += `M${ax} ${y} v${-(14 + r() * 26)} h1.6 V${y}Z`;
			}
			let piers = '';
			if (o.pier) for (let px = x + o.pier; px < x + w - 1; px += o.pier) piers += `M${px.toFixed(1)} ${(y + 4).toFixed(1)} V${base}`;
			let wins = '';
			const tw: Building['tw'] = [];
			if (o.density) {
				for (let wy = y + 6; wy < base - 5; wy += o.row) {
					for (let wx = x + 3; wx < x + w - 4; wx += o.col) {
						if (r() < o.density) {
							wins += `M${wx.toFixed(1)} ${wy.toFixed(1)}h2.4v3.2h-2.4Z`;
							if (tw.length < o.twinkles && r() < 0.04) tw.push({ x: wx, y: wy, d: (r() * 7).toFixed(1) });
						}
					}
				}
			}
			out.push({ x, y, w, h, face, roof, piers, wins, tw });
			x += w + r() * 4;
		}
		return out;
	}

	const BASE = 560;
	// Depth layers, back to front.
	const HORIZON = city(3, -100, 1300, 480, [8, 36], [10, 26], { density: 0, col: 0, row: 0, pier: 0, roof: 0.2, twinkles: 0 });
	const FAR = city(7, -100, 1300, 492, [30, 140], [18, 46], { density: 0.12, col: 5, row: 7, pier: 0, roof: 0.4, twinkles: 0 });
	const SHORE = city(31, -100, 420, BASE, [30, 110], [20, 48], { density: 0.22, col: 5, row: 7, pier: 0, roof: 0.5, twinkles: 1 });
	const MID = city(19, 380, 1300, BASE, [70, 250], [22, 60], { density: 0.3, col: 5, row: 7, pier: 6, roof: 0.6, twinkles: 2 });
	const NEAR = city(43, -100, 1300, 700, [60, 210], [30, 74], { density: 0.28, col: 6, row: 8, pier: 8, roof: 0.6, twinkles: 2 });
	const FRONT = city(57, -100, 1300, 724, [30, 110], [40, 90], { density: 0.16, col: 7, row: 9, pier: 0, roof: 0.7, twinkles: 1 });

	// The art-deco tower: six setbacks, piers on every tier, lit on the side
	// facing the glow, floodlit crown bands, mast and antenna.
	const DECO = { cx: 775 };
	const DECO_TIERS = [
		{ top: 372, bottom: 562, half: 86 },
		{ top: 330, bottom: 372, half: 70 },
		{ top: 292, bottom: 330, half: 58 },
		{ top: 240, bottom: 292, half: 42 },
		{ top: 206, bottom: 240, half: 28 },
		{ top: 168, bottom: 206, half: 18 },
		{ top: 128, bottom: 168, half: 10 }
	];
	const decoPiers = DECO_TIERS.map((t) => {
		let d = '';
		const step = t.half > 40 ? 6 : 4;
		for (let px = DECO.cx - t.half + step; px < DECO.cx + t.half - 1; px += step) d += `M${px} ${t.top + 3} V${t.bottom}`;
		return d;
	}).join(' ');
	const decoWins = (() => {
		const r = rng(101);
		let d = '';
		for (const t of DECO_TIERS.slice(0, 4)) {
			for (let wy = t.top + 6; wy < t.bottom - 4; wy += 7) {
				for (let wx = DECO.cx - t.half + 3; wx < DECO.cx + t.half - 4; wx += 6) if (r() < 0.32) d += `M${wx} ${wy}h2.2v3h-2.2Z`;
			}
		}
		return d;
	})();

	// Twinkle delays are fixed per window.
	const delay = (d: string) => `animation-delay: -${d}s`;

	const STATS = [
		{ title: 'Self-service access', text: 'Check attendance, apply for leave and get payslips anytime' },
		{ title: 'All your HR tools', text: 'Leave, attendance, payroll, policies and your team in one place' },
		{ title: 'Fully paperless', text: 'Apply, track and approve requests online' }
	];

	// The numbers count once the card is in: 0 → 24 (/7) and 9 → 0 forms.
	// The page is first drawn with the final values, so a slow load never
	// shows "0/7"; the count starts from zero once the script runs (the card
	// is still hidden by its entrance then). The count waits for the page's
	// intro (--enter, 0 when it is skipped) plus the card's own entrance, so
	// it runs while the numbers are on screen rather than before.
	let wrap: HTMLDivElement;
	let hours = $state(24);
	let forms = $state(0);
	$effect(() => {
		hours = 0;
		forms = 9;
		const enter = parseFloat(getComputedStyle(wrap).getPropertyValue('--enter')) || 0;
		const start = performance.now() + enter + 900;
		let raf = 0;
		const tick = (now: number) => {
			const p = Math.min(1, Math.max(0, (now - start) / 1300));
			const e = 1 - Math.pow(1 - p, 3);
			hours = Math.round(24 * e);
			forms = Math.round(9 * (1 - e));
			if (p < 1) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	});
	const values = $derived([`${hours}/7`, '1 Login', `${forms} ${forms === 1 ? 'Form' : 'Forms'}`]);
</script>

{#snippet cloud(w: number)}
	<ellipse cx="0" cy="0" rx={w} ry={w * 0.22} />
	<ellipse cx={-w * 0.35} cy={-w * 0.12} rx={w * 0.42} ry={w * 0.26} />
	<ellipse cx={w * 0.22} cy={-w * 0.18} rx={w * 0.48} ry={w * 0.3} />
{/snippet}

<div class="hero-wrap" bind:this={wrap}>
	<section class="banner">
		<svg class="city" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
			<defs>
				<!-- stop colours come from CSS, so the sky follows the theme -->
				<linearGradient id="hb-sky" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" class="sky-a" />
					<stop offset="0.55" class="sky-b" />
					<stop offset="0.8" class="sky-c" />
				</linearGradient>
				<radialGradient id="hb-sun" cx="0.38" cy="0.72" r="0.45">
					<stop offset="0" class="glow-a" />
					<stop offset="1" class="glow-b" />
				</radialGradient>
				<radialGradient id="hb-moon">
					<stop offset="0.3" stop-color="#c9d7ff" stop-opacity="0.28" />
					<stop offset="1" stop-color="#c9d7ff" stop-opacity="0" />
				</radialGradient>
				<linearGradient id="hb-haze" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" class="haze-a" />
					<stop offset="1" class="haze-b" />
				</linearGradient>
			</defs>
			<g class="drift">
				<rect x="-80" width="1360" height="700" fill="url(#hb-sky)" />
				<rect class="glow" x="-80" width="1360" height="700" fill="url(#hb-sun)" />

				<!-- night only: stars and a crescent moon -->
				<g class="night">
					{#each [[90, 60], [180, 140], [260, 40], [340, 110], [430, 70], [520, 30], [600, 120], [690, 80], [880, 50], [950, 130], [1080, 70], [1140, 150], [40, 200], [480, 190], [820, 170], [1180, 30], [150, 30], [620, 210]] as [sx, sy], k (k)}
						<circle class="star" cx={sx} cy={sy} r={k % 3 ? 1.4 : 2.2} style="animation-delay: -{(k * 0.7) % 4}s" />
					{/each}
					<circle cx="960" cy="112" r="110" fill="url(#hb-moon)" />
					<!-- a true crescent shape (no covering disc, which read as an eclipse) -->
					<path class="moon" d="M960 70 A42 42 0 1 0 960 154 A29 42 0 1 1 960 70 Z" />
				</g>

				<!-- clouds and a plane crossing the sky -->
				<g class="cloud cloud--a" transform="translate(0 110)">{@render cloud(90)}</g>
				<g class="cloud cloud--b" transform="translate(0 175)">{@render cloud(64)}</g>
				<g class="cloud cloud--c" transform="translate(0 245)">{@render cloud(110)}</g>
				<g class="plane" transform="translate(0 92)">
					<path class="plane-body" d="M0 0 H26 Q32 0 32 2 Q32 4 26 4 H0 L-4 -4 H1 Z M10 2 L4 10 H8 L16 2 Z" />
					<circle class="plane-light" cx="33" cy="2" r="1.8" />
					<path class="trail" d="M-6 1 H-120" />
				</g>

				<!-- light rays from the glow behind the city (day only) -->
				<g class="rays">
					{#each [[-60, 180], [80, 120], [250, 60], [520, 40], [760, 110], [980, 200]] as [rx, rw], k (k)}
						<polygon points="{SUN_X},505 {rx},-40 {rx + rw},-40" style="animation-delay: -{k * 1.6}s" />
					{/each}
				</g>

				<!-- horizon and far skyline in the haze -->
				<g class="layer layer--far">
					{#each HORIZON as b, k (k)}<rect class="c0" x={b.x} y={b.y} width={b.w} height={b.h + 2} /><path class="c0" d={b.roof} />{/each}
					{#each FAR as b, k (k)}
						<rect class="c1" x={b.x} y={b.y} width={b.w} height={b.h + 2} />
						<path class="c1" d={b.roof} />
						<rect class="f1" x={b.face.x} y={b.y} width={b.face.w} height={b.h} />
						<path class="w1" d={b.wins} />
					{/each}
				</g>
				<rect x="-80" y="430" width="1360" height="80" fill="url(#hb-haze)" />

				<!-- the river, the far shore and a suspension bridge -->
				<path class="river" d="M-100 486 H430 L392 562 H-100 Z" />
				<path class="c0" d="M-100 486 H360 V482 Q300 476 220 480 Q120 474 40 479 Q-40 474 -100 478 Z" />
				<g class="bridge">
					<path class="bridge-deck" d="M-100 502 Q130 498 400 504" />
					<path class="bridge-cable" d="M-100 470 Q20 500 70 452 Q170 500 260 452 Q330 498 420 472" />
					<path class="bridge-hangers" d={Array.from({ length: 30 }, (_, k) => -90 + k * 16).map((hx) => `M${hx} 502 V${hx < 70 ? 470 + (hx + 100) * 0.12 : hx < 260 ? 455 + Math.abs(hx - 165) * 0.45 : 455 + (hx - 260) * 0.1}`).join(' ')} />
					{#each [70, 260] as bx (bx)}
						<path class="bridge-tower" d="M{bx - 8} 504 V452 H{bx + 8} V504 H{bx + 4} V470 H{bx - 4} V504 Z" />
					{/each}
				</g>
				{#each [[20, 512, 180], [90, 526, 220], [40, 540, 160], [160, 552, 200]] as [rx, ry, rw], k (rx + '-' + ry)}
					<rect class="glint" x={rx} y={ry} width={rw} height="2" rx="1" style="animation-delay: -{k * 1.3}s" />
				{/each}

				<!-- mid-town: the shore blocks, the blocks and the two landmark towers -->
				<g class="layer layer--mid">
					{#each SHORE as b, k (k)}
						<rect class="c2" x={b.x} y={b.y} width={b.w} height={b.h} />
						<path class="c2" d={b.roof} />
						<rect class="f2" x={b.face.x} y={b.y} width={b.face.w} height={b.h} />
						<path class="w2" d={b.wins} />
						{#each b.tw as t, j (j)}<rect class="win tw" x={t.x} y={t.y} width="2.4" height="3.2" style={delay(t.d)} />{/each}
					{/each}
					{#each MID as b, k (k)}
						<rect class="c2" x={b.x} y={b.y} width={b.w} height={b.h} />
						<path class="c2" d={b.roof} />
						<rect class="f2" x={b.face.x} y={b.y} width={b.face.w} height={b.h} />
						<path class="pier" d={b.piers} />
						<path class="w2" d={b.wins} />
						{#each b.tw as t, j (j)}<rect class="win tw" x={t.x} y={t.y} width="2.4" height="3.2" style={delay(t.d)} />{/each}
					{/each}

					<!-- the slim tower on the right: faceted, lit side and shade side -->
					<path class="c2" d="M992 562 L1004 238 L1032 226 L1060 238 L1072 562 Z" />
					<path class="f2" d="M992 562 L1004 238 L1032 226 L1030 562 Z" />
					<path class="shade" d="M1032 226 L1060 238 L1072 562 L1036 562 Z" />
					<path class="pier" d={Array.from({ length: 40 }, (_, k) => `M${998 + k * 0.3} ${246 + k * 8} H${1066 - k * 0.3}`).join(' ')} />
					<rect class="c2" x="1029" y="150" width="6" height="80" />
					<rect class="c2" x="1031" y="100" width="2" height="52" />
					<circle class="beacon" cx="1032" cy="98" r="3.5" />

					<!-- the art-deco tower -->
					<g class="deco">
						{#each DECO_TIERS as t, k (k)}
							<rect class="c2" x={DECO.cx - t.half} y={t.top} width={t.half * 2} height={t.bottom - t.top} />
							<rect class="f2" x={DECO.cx - t.half} y={t.top} width={t.half * 0.9} height={t.bottom - t.top} />
							<rect class="shade" x={DECO.cx + t.half * 0.55} y={t.top} width={t.half * 0.45} height={t.bottom - t.top} />
							<rect class="ledge" x={DECO.cx - t.half - 2} y={t.top} width={t.half * 2 + 4} height="2.5" />
						{/each}
						<path class="pier" d={decoPiers} />
						<path class="w2" d={decoWins} />
						<!-- floodlit crown bands -->
						<rect class="lit" x={DECO.cx - 28} y="208" width="56" height="5" />
						<rect class="lit" x={DECO.cx - 18} y="170" width="36" height="4" />
						<rect class="lit" x={DECO.cx - 10} y="131" width="20" height="4" />
						<rect class="lit lit--soft" x={DECO.cx - 42} y="243" width="84" height="3" />
						<!-- mooring mast and antenna -->
						<path class="c2" d="M{DECO.cx - 7} 128 L{DECO.cx - 4} 96 H{DECO.cx + 4} L{DECO.cx + 7} 128 Z" />
						<rect class="lit lit--soft" x={DECO.cx - 4} y="100" width="8" height="3" />
						<rect class="c2" x={DECO.cx - 1.5} y="40" width="3" height="58" />
						<circle class="beacon" cx={DECO.cx} cy="38" r="4" style="animation-delay: -0.8s" />
					</g>
				</g>

				<!-- foreground blocks, and the darkest roofs at the very front -->
				<g class="layer layer--near">
					{#each NEAR as b, k (k)}
						<rect class="c3" x={b.x} y={b.y} width={b.w} height={b.h} />
						<path class="c3" d={b.roof} />
						<rect class="f3" x={b.face.x} y={b.y} width={b.face.w} height={b.h} />
						<path class="pier" d={b.piers} />
						<path class="w3" d={b.wins} />
						{#each b.tw as t, j (j)}<rect class="win tw" x={t.x} y={t.y} width="2.4" height="3.2" style={delay(t.d)} />{/each}
					{/each}
					{#each FRONT as b, k (k)}
						<rect class="c4" x={b.x} y={b.y} width={b.w} height={b.h} />
						<path class="c4" d={b.roof} />
						<rect class="f4" x={b.face.x} y={b.y} width={b.face.w} height={b.h} />
						<path class="w4" d={b.wins} />
					{/each}
				</g>
			</g>
		</svg>
		<div class="tint" aria-hidden="true"></div>
		<div class="sweep" aria-hidden="true"></div>

		<div class="copy">
			<h1>Champ HR</h1>
			<p class="subhead">Employee Self-Service</p>
			<p class="lede">
				<span class="lede-lead">Your workday, simplified.</span>
				<span class="lede-body">Track attendance, request time off and view your payslips from a single portal.</span>
			</p>
		</div>
	</section>

	<dl class="stats">
		{#each STATS as s, i (s.title)}
			<div class="stat" style="--i: {i}">
				<dt>
					<span class="value">{values[i]}</span>
					<span class="title">{s.title}</span>
				</dt>
				<dd>{s.text}</dd>
			</div>
		{/each}
	</dl>
</div>

<style>
	.hero-wrap {
		--hb-card: #ffffff;
		--hb-ink: #1f2430;
		--hb-muted: #6b7280;
		--hb-line: rgba(31, 36, 48, 0.08);
		--hb-border: rgba(31, 36, 48, 0.12);
		--hb-shadow: 0 1px 3px rgba(15, 23, 42, 0.08), 0 20px 44px -16px rgba(20, 50, 130, 0.42);
		--hb-num: #1f4fd1;
		--hb-ease: cubic-bezier(0.22, 1, 0.36, 1);
		--hb-in: var(--enter, 0ms);

		position: relative;
		height: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
		padding-bottom: clamp(70px, 12vh, 104px);
	}
	:global([data-ess-theme='dark']) .hero-wrap {
		--hb-card: #141a24;
		--hb-ink: #eef1f6;
		--hb-muted: #a3adbb;
		--hb-line: rgba(255, 255, 255, 0.08);
		--hb-border: rgba(255, 255, 255, 0.12);
		--hb-shadow: 0 1px 3px rgba(0, 0, 0, 0.4), 0 20px 44px -16px rgba(0, 0, 0, 0.85);
		--hb-num: #8fb3ff;
	}

	/* ---------- the scene, day (light theme) and night (dark theme) ---------- */
	.hero-wrap {
		--sky-a: #8fb8ff;
		--sky-b: #bcd5ff;
		--sky-c: #e4eeff;
		--glow: #ffffff;
		--glow-op: 0.9;
		--haze: #cfe0ff;
		--river: #d3e3ff;
		/* buildings, back (c0) to front (c4); f = the face lit by the glow */
		--c0: #b2c9f0;
		--c1: #8eaee6;
		--c2: #3e66c6;
		--c3: #213f8c;
		--c4: #0d2154;
		--f1: #a9c4f4;
		--f2: #6189dc;
		--f3: #3558ad;
		--f4: #19327a;
		--shade: rgba(8, 20, 60, 0.22);
		--pier: rgba(8, 22, 66, 0.28);
		--ledge: #9bbaf0;
		--bridge: #6f93d8;
		--win: #e3eeff;
		--win-op: 0.85;
		--w-far: 0.35;
		--w-mid: 0.6;
		--w-near: 0.7;
		--lit: #f2f7ff;
		--rays: 0.1;
		--cloud-op: 0.45;
		--night: 0;
		--tint:
			linear-gradient(100deg, rgba(12, 32, 92, 0.93) 0%, rgba(24, 62, 168, 0.8) 42%, rgba(74, 132, 236, 0.36) 72%, rgba(32, 76, 180, 0.3) 100%),
			linear-gradient(180deg, rgba(150, 190, 255, 0.12) 0%, rgba(8, 20, 64, 0.4) 100%);
	}
	:global([data-ess-theme='dark']) .hero-wrap {
		--sky-a: #040a1d;
		--sky-b: #0b1a44;
		--sky-c: #1c3170;
		--glow: #7d9cff;
		--glow-op: 0.35;
		--haze: #2a4488;
		--river: #1d336c;
		--c0: #18295a;
		--c1: #152657;
		--c2: #10204d;
		--c3: #0a1639;
		--c4: #050b20;
		--f1: #1d3168;
		--f2: #1a2f68;
		--f3: #122457;
		--f4: #0a1533;
		--shade: rgba(0, 0, 0, 0.3);
		--pier: rgba(0, 0, 0, 0.35);
		--ledge: #2a427f;
		--bridge: #3a5aa8;
		--win: #ffdf9a;
		--win-op: 0.9;
		--w-far: 0.45;
		--w-mid: 0.8;
		--w-near: 0.85;
		--lit: #fff0c4;
		--rays: 0;
		--cloud-op: 0.1;
		--night: 1;
		--tint:
			linear-gradient(100deg, rgba(3, 8, 28, 0.9) 0%, rgba(8, 22, 70, 0.72) 42%, rgba(20, 44, 120, 0.22) 72%, rgba(6, 14, 44, 0.3) 100%),
			linear-gradient(180deg, rgba(40, 70, 160, 0.08) 0%, rgba(2, 6, 20, 0.5) 100%);
	}
	.sky-a {
		stop-color: var(--sky-a);
	}
	.sky-b {
		stop-color: var(--sky-b);
	}
	.sky-c {
		stop-color: var(--sky-c);
	}
	.glow-a {
		stop-color: var(--glow);
		stop-opacity: var(--glow-op);
	}
	.glow-b {
		stop-color: var(--glow);
		stop-opacity: 0;
	}
	.haze-a {
		stop-color: var(--haze);
		stop-opacity: 0;
	}
	.haze-b {
		stop-color: var(--haze);
		stop-opacity: 0.55;
	}
	.night {
		opacity: var(--night);
		transition: opacity 600ms ease;
	}
	.star {
		fill: #ffffff;
	}
	.moon {
		fill: #f4f1e4;
	}

	/* ---------- the banner ---------- */
	.banner {
		position: relative;
		flex: 1;
		min-height: 0;
		border-radius: 14px;
		overflow: hidden;
		isolation: isolate;
		background: #1f4fd1;
	}
	.city {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.river {
		fill: var(--river);
		opacity: 0.6;
	}
	.glint {
		fill: #ffffff;
		opacity: 0.6;
	}
	/* buildings by depth: block colour, lit face, windows */
	.c0 {
		fill: var(--c0);
		opacity: 0.7;
	}
	.c1 {
		fill: var(--c1);
	}
	.c2 {
		fill: var(--c2);
	}
	.c3 {
		fill: var(--c3);
	}
	.c4 {
		fill: var(--c4);
	}
	.f1 {
		fill: var(--f1);
	}
	.f2 {
		fill: var(--f2);
	}
	.f3 {
		fill: var(--f3);
	}
	.f4 {
		fill: var(--f4);
	}
	.w1,
	.w2,
	.w3,
	.w4 {
		fill: var(--win);
	}
	.w1 {
		opacity: var(--w-far);
	}
	.w2 {
		opacity: var(--w-mid);
	}
	.w3,
	.w4 {
		opacity: var(--w-near);
	}
	.shade {
		fill: var(--shade);
	}
	.pier {
		fill: none;
		stroke: var(--pier);
		stroke-width: 1;
	}
	.ledge {
		fill: var(--ledge);
	}
	.win {
		fill: var(--win);
		opacity: var(--win-op);
	}
	.lit {
		fill: var(--lit);
	}
	.lit--soft {
		opacity: 0.7;
	}
	.rays polygon {
		fill: #ffffff;
		opacity: var(--rays);
	}
	.bridge-deck,
	.bridge-cable,
	.bridge-hangers {
		fill: none;
		stroke: var(--bridge);
	}
	.bridge-deck {
		stroke-width: 3;
	}
	.bridge-cable {
		stroke-width: 1.4;
	}
	.bridge-hangers {
		stroke-width: 0.7;
		opacity: 0.8;
	}
	.bridge-tower {
		fill: var(--bridge);
	}
	.cloud {
		fill: #ffffff;
		opacity: var(--cloud-op);
	}
	.river,
	.c0,
	.c1,
	.c2,
	.c3,
	.c4,
	.f1,
	.f2,
	.f3,
	.f4,
	.w1,
	.w2,
	.w3,
	.w4,
	.win,
	.lit,
	.cloud,
	.rays polygon {
		transition:
			fill 600ms ease,
			opacity 600ms ease;
	}
	.plane-body {
		fill: #ffffff;
		opacity: 0.9;
	}
	.plane-light {
		fill: #ff5a5a;
	}
	.trail {
		fill: none;
		stroke: #ffffff;
		stroke-width: 1.5;
		stroke-linecap: round;
		opacity: 0.35;
		stroke-dasharray: 2 6;
	}
	.beacon {
		fill: #ff4d4d;
	}

	/* coral to crimson became light blue to deep navy: deepest behind the
	   text so white copy stays legible */
	.tint {
		position: absolute;
		inset: 0;
		background: var(--tint);
	}
	/* a soft band of light passing over every few seconds */
	.sweep {
		position: absolute;
		inset: -20% -60%;
		background: linear-gradient(105deg, transparent 42%, rgba(255, 255, 255, 0.14) 50%, transparent 58%);
		pointer-events: none;
	}

	.copy {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: center;
		height: 100%;
		padding: 0 clamp(24px, 4vw, 54px) clamp(56px, 10vh, 90px);
		color: #fff;
		max-width: 620px;
	}
	h1 {
		margin: 0;
		font-family: var(--ess-font-display);
		font-size: clamp(40px, min(5.4vw, 8.4vh), 76px);
		font-weight: 750;
		line-height: 1;
		letter-spacing: -0.025em;
		color: #ffffff;
	}
	.subhead {
		margin: clamp(8px, 1.4vh, 14px) 0 0;
		font-size: clamp(20px, min(2.4vw, 3.8vh), 32px);
		font-weight: 650;
		letter-spacing: -0.01em;
	}
	.lede {
		display: flex;
		flex-direction: column;
		gap: clamp(4px, 0.8vh, 8px);
		margin: clamp(12px, 2.2vh, 22px) 0 0;
		max-width: 30em;
		color: #ffffff;
	}
	/* one clean sans throughout: a semibold lead line, then crisp body text */
	.lede-lead {
		font-family: var(--ess-font-display);
		font-size: clamp(17px, 2.7vh, 21px);
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	.lede-body {
		font-family: var(--ess-font-sans);
		font-size: clamp(14px, 2.1vh, 16px);
		font-weight: 400;
		line-height: 1.6;
		color: #e6edff;
	}

	/* ---------- the stats card over the banner's lower edge ---------- */
	.stats {
		position: absolute;
		left: 9%;
		right: 9%;
		bottom: 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin: 0;
		padding: clamp(14px, 2.6vh, 26px) 6px;
		border-radius: 12px;
		border: 1px solid var(--hb-border);
		background: var(--hb-card);
		box-shadow: var(--hb-shadow);
	}
	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 0 clamp(10px, 1.4vw, 20px);
		text-align: center;
		border-radius: 10px;
		transition: transform 300ms var(--hb-ease);
	}
	.stat + .stat {
		border-left: 1px solid var(--hb-line);
	}
	.stat:hover {
		transform: translateY(-3px);
	}
	dt {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}
	.value {
		font-family: var(--ess-font-display);
		font-size: clamp(26px, min(2.9vw, 4.8vh), 40px);
		font-weight: 750;
		line-height: 1.05;
		letter-spacing: -0.02em;
		color: var(--hb-num);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.title {
		font-size: clamp(14px, 2.1vh, 17px);
		font-weight: 650;
		color: var(--hb-ink);
	}
	dd {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--hb-muted);
	}

	@media (max-height: 700px) {
		dd {
			display: none;
		}
	}

	/* ---------- motion ----------
	   Each animation states its length with !important: the app shortens
	   every animation to 0.01ms under reduced motion (ess-components.css),
	   and this contained motion is meant to play there too. */
	.hero-wrap .banner {
		animation: banner-in 900ms var(--hb-ease) var(--hb-in) both;
		animation-duration: 900ms !important;
	}
	.hero-wrap .drift {
		transform-box: view-box;
		transform-origin: 65% 80%;
		animation: push 24s ease-in-out infinite alternate;
		animation-duration: 24s !important;
	}
	.hero-wrap .layer--far {
		animation: pan-far 26s ease-in-out infinite alternate;
		animation-duration: 26s !important;
	}
	.hero-wrap .layer--mid {
		animation: pan-mid 26s ease-in-out infinite alternate;
		animation-duration: 26s !important;
	}
	.hero-wrap .layer--near {
		animation: pan-near 26s ease-in-out infinite alternate;
		animation-duration: 26s !important;
	}
	.hero-wrap .glow {
		animation: glow 8s ease-in-out infinite alternate;
		animation-duration: 8s !important;
	}
	.hero-wrap .cloud {
		animation: cloud 80s linear infinite;
	}
	.hero-wrap .cloud--a {
		animation-duration: 80s !important;
		animation-delay: -20s;
	}
	.hero-wrap .cloud--b {
		animation-duration: 110s !important;
		animation-delay: -70s;
	}
	.hero-wrap .cloud--c {
		animation-duration: 140s !important;
		animation-delay: -40s;
	}
	.hero-wrap .plane {
		animation: plane 34s linear infinite;
		animation-duration: 34s !important;
		animation-delay: -6s;
	}
	.hero-wrap .plane-light,
	.hero-wrap .beacon {
		animation: blink 1.6s steps(1) infinite;
		animation-duration: 1.6s !important;
	}
	.hero-wrap .win.tw {
		animation: twinkle 7s steps(1) infinite;
		animation-duration: 7s !important;
	}
	.hero-wrap .star {
		animation: star 4s ease-in-out infinite alternate;
		animation-duration: 4s !important;
	}
	.hero-wrap .night,
	.hero-wrap .river,
	.hero-wrap .c0,
	.hero-wrap .c1,
	.hero-wrap .c2,
	.hero-wrap .c3,
	.hero-wrap .c4,
	.hero-wrap .f1,
	.hero-wrap .f2,
	.hero-wrap .f3,
	.hero-wrap .f4,
	.hero-wrap .w1,
	.hero-wrap .w2,
	.hero-wrap .w3,
	.hero-wrap .w4,
	.hero-wrap .win,
	.hero-wrap .lit,
	.hero-wrap .cloud,
	.hero-wrap .rays polygon {
		transition-duration: 600ms !important;
	}
	/* the rays breathe slowly */
	.hero-wrap .rays polygon {
		animation: rays 9s ease-in-out infinite alternate;
		animation-duration: 9s !important;
	}
	.hero-wrap .glint {
		animation: glint 4s ease-in-out infinite alternate;
		animation-duration: 4s !important;
	}
	.hero-wrap .sweep {
		animation: sweep 9s ease-in-out infinite;
		animation-duration: 9s !important;
		animation-delay: calc(var(--hb-in) + 1.6s);
	}
	.hero-wrap h1 {
		animation: rise 800ms var(--hb-ease) calc(var(--hb-in) + 200ms) both;
		animation-duration: 800ms !important;
	}
	.hero-wrap .subhead {
		animation: rise 800ms var(--hb-ease) calc(var(--hb-in) + 320ms) both;
		animation-duration: 800ms !important;
	}
	.hero-wrap .lede {
		animation: rise 800ms var(--hb-ease) calc(var(--hb-in) + 440ms) both;
		animation-duration: 800ms !important;
	}
	/* The card stays still once it is in: a constant float leaves its text
	   on half pixels, which renders blurry. */
	.hero-wrap .stats {
		animation: card-in 900ms var(--hb-ease) calc(var(--hb-in) + 500ms) both;
		animation-duration: 900ms !important;
	}
	.hero-wrap .stat {
		animation: pop 600ms var(--hb-ease) calc(var(--hb-in) + 700ms + var(--i) * 120ms) both;
		animation-duration: 600ms !important;
		transition-duration: 300ms !important;
	}

	@keyframes banner-in {
		from {
			opacity: 0;
			transform: translateY(14px);
		}
	}
	@keyframes push {
		from {
			transform: scale(1);
		}
		to {
			transform: scale(1.05);
		}
	}
	@keyframes pan-far {
		from {
			transform: translateX(0);
		}
		to {
			transform: translateX(-18px);
		}
	}
	@keyframes pan-mid {
		from {
			transform: translateX(0);
		}
		to {
			transform: translateX(-38px);
		}
	}
	@keyframes pan-near {
		from {
			transform: translateX(0);
		}
		to {
			transform: translateX(-70px);
		}
	}
	@keyframes glow {
		from {
			opacity: 0.75;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes cloud {
		from {
			translate: -260px 0;
		}
		to {
			translate: 1480px 0;
		}
	}
	@keyframes plane {
		0% {
			translate: -200px 40px;
		}
		60%,
		100% {
			translate: 1500px -30px;
		}
	}
	@keyframes blink {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.15;
		}
	}
	@keyframes rays {
		from {
			opacity: calc(var(--rays) * 0.4);
		}
		to {
			opacity: var(--rays);
		}
	}
	@keyframes star {
		from {
			opacity: 0.35;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes twinkle {
		0%,
		44% {
			opacity: 0.85;
		}
		45%,
		62% {
			opacity: 0.12;
		}
		63%,
		100% {
			opacity: 0.85;
		}
	}
	@keyframes glint {
		from {
			opacity: 0.25;
			transform: translateX(-8px);
		}
		to {
			opacity: 0.75;
			transform: translateX(8px);
		}
	}
	@keyframes sweep {
		0% {
			transform: translateX(-60%);
		}
		45%,
		100% {
			transform: translateX(60%);
		}
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
	}
	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(28px);
		}
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(10px) scale(0.96);
		}
	}
</style>
