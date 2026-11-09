<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import { onMount } from 'svelte';
	import type { DayPlan, Run } from '$lib/cabs/types';
	import { clockLabel } from '$lib/cabs/clock';

	type Hex = { cell: string; boundary: [number, number][]; riderIds: string[] };

	let {
		plan,
		hexes,
		runId = null,
		showPins = true,
		colorOf
	}: { plan: DayPlan; hexes: Hex[]; runId?: string | null; showPins?: boolean; colorOf: (run: Run) => string } = $props();

	let el: HTMLDivElement;
	let L: typeof import('leaflet') | null = $state(null);
	let map: import('leaflet').Map | null = null;
	let layer: import('leaflet').LayerGroup | null = null;

	const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
	const token = (name: string) => getComputedStyle(el).getPropertyValue(name).trim();

	onMount(() => {
		let disposed = false;
		import('leaflet').then((mod) => {
			if (disposed) return;
			L = mod.default ?? mod;
			map = L.map(el, { zoomControl: true, attributionControl: true });
			L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
				maxZoom: 19,
				attribution: '&copy; OpenStreetMap contributors'
			}).addTo(map);
			layer = L.layerGroup().addTo(map);
		});
		return () => {
			disposed = true;
			map?.remove();
			map = null;
		};
	});

	$effect(() => {
		if (!L || !map || !layer) return;
		const office = plan.settings.office;
		if (!office) return;
		const leaflet = L;
		layer.clearLayers();

		const runs = plan.runs.filter((r) => !runId || r.id === runId);
		const visible = new Set(runs.flatMap((r) => [...r.trips.flatMap((t) => t.stops.map((s) => s.riderId)), ...r.unseated]));
		const bounds = leaflet.latLngBounds([[office.lat, office.lng]]);
		const muted = token('--ess-text-muted');
		const danger = token('--ess-danger');
		const ink = token('--ess-text');

		for (const h of hexes) {
			if (!h.riderIds.some((id) => visible.has(id))) continue;
			const poly = leaflet.polygon(h.boundary, { color: muted, weight: 1, fillColor: muted, fillOpacity: showPins ? 0.08 : 0.22 });
			poly.bindTooltip(`${h.riderIds.filter((id) => visible.has(id)).length} rider(s) in this area`);
			poly.addTo(layer);
			for (const [lat, lng] of h.boundary) bounds.extend([lat, lng]);
		}

		for (const run of runs) {
			const color = colorOf(run);
			for (const t of run.trips) {
				const path: [number, number][] = [[office.lat, office.lng], ...t.stops.map((s) => [s.pin.lat, s.pin.lng] as [number, number])];
				leaflet.polyline(path, { color, weight: 3, opacity: 0.85, dashArray: t.night && !t.guard ? '6 6' : undefined }).addTo(layer);
				if (!showPins) continue;
				t.stops.forEach((s, i) => {
					const icon = leaflet.divIcon({
						className: 'cab-stop',
						html: `<span style="background:${color}">${i + 1}</span>`,
						iconSize: [22, 22]
					});
					leaflet
						.marker([s.pin.lat, s.pin.lng], { icon })
						.bindTooltip(`<strong>${esc(s.name)}</strong> · ${esc(s.team || '—')}<br>${esc(t.cabLabel)}, ${clockLabel(run.depart)} run · drop ${i + 1} at ${clockLabel(s.eta)}`)
						.addTo(layer!);
				});
			}
			if (!showPins) continue;
			for (const id of run.unseated) {
				const r = plan.riders.find((x) => x.id === id);
				if (!r?.pin) continue;
				leaflet
					.circleMarker([r.pin.lat, r.pin.lng], { radius: 8, color: danger, weight: 3, fillOpacity: 0.2 })
					.bindTooltip(`<strong>${esc(r.name)}</strong>: no seat at ${clockLabel(run.depart)}`)
					.addTo(layer);
			}
		}

		const officeIcon = leaflet.divIcon({ className: 'cab-office', html: `<span style="background:${ink}">HQ</span>`, iconSize: [30, 22] });
		leaflet.marker([office.lat, office.lng], { icon: officeIcon }).bindTooltip('Office').addTo(layer);

		const m = map;
		requestAnimationFrame(() => {
			m.invalidateSize();
			m.fitBounds(bounds.pad(0.1), { maxZoom: 15 });
		});
	});
</script>

<div class="cab-map" bind:this={el} role="region" aria-label="Map of riders, areas and cab routes"></div>

<style>
	.cab-map {
		height: 520px;
		border-radius: var(--ess-radius-md);
		border: 1px solid var(--ess-border);
		overflow: hidden;
		background: var(--ess-sunken);
	}
	.cab-map :global(.cab-stop span),
	.cab-map :global(.cab-office span) {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		border-radius: var(--ess-radius-pill);
		border: 2px solid var(--ess-surface);
		color: var(--ess-text-on-primary);
		font: 600 11px/1 var(--ess-font-sans);
		box-shadow: 0 1px 3px var(--ess-backdrop);
	}
	.cab-map :global(.cab-office span) {
		border-radius: var(--ess-radius-sm);
	}
	@media (max-width: 720px) {
		.cab-map {
			height: 380px;
		}
	}
</style>
