<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Award from '@lucide/svelte/icons/award';
	import Activity from '@lucide/svelte/icons/activity';
	import type { PageData } from './$types';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Clock from '@lucide/svelte/icons/clock';
	import FileText from '@lucide/svelte/icons/file-text';
	import Users from '@lucide/svelte/icons/users';
	let { data }: { data: PageData } = $props();
	let selected = $state<string | null>(null);
	let panel = $state<'attendance' | 'actions' | 'upcoming'>('attendance');
	let moreMetrics = $state(false);
	let refreshError = $state(false);
	const selectedCell = $derived(data.analytics.heatmap.find(c => c.date === selected));
	const metrics = $derived([
		{ label: 'Attendance', value: String(data.analytics.recordedDays), unit: 'days', detail: 'Recorded this month', icon: Clock, href: '/attendance', tone: 'green' },
		{ label: 'Leave balance', value: String(data.leaveBalance), unit: 'days', detail: data.leaveAllocated + ' days allocated', icon: Calendar, href: '/leave', tone: 'violet' },
		{ label: 'Pending leave', value: String(data.pendingCount), unit: '', detail: 'Awaiting approval', icon: FileText, href: '/leave', tone: 'amber' },
		{ label: 'Your tenure', value: data.analytics.tenure ?? 'Not set', unit: '', detail: data.analytics.joiningDate ? 'Joined ' + data.analytics.joiningDate : 'Joining date not on file', icon: Award, href: '/profile', tone: 'violet' },
		{ label: 'Recorded hours', value: String(data.analytics.recordedHours), unit: 'hrs', detail: data.analytics.completeDays + ' completed punch pairs · month', icon: Activity, href: '/attendance', tone: 'green' }
	]);
	onMount(() => {
		let busy = false;
		async function refresh() {
			if (document.visibilityState !== 'visible' || busy) return;
			busy = true;
			try { await invalidateAll(); refreshError = false; } catch { refreshError = true; } finally { busy = false; }
		}
		const timer = setInterval(refresh, 300000);
		document.addEventListener('visibilitychange', refresh);
		return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
	});
	const days = $derived.by(() => {
		let total = 0;
		return data.analytics.heatmap.filter(c => c.date.startsWith(data.analytics.today.slice(0, 7))).map(c => {
			if (c.recorded) total += 1;
			return { ...c, total, future: c.date > data.analytics.today };
		});
	});
	const elapsed = $derived(days.filter(d => !d.future));
	const trend = $derived(elapsed.slice(-7));
	const points = $derived(trend.map((d, i) => `${40 + i * (560 / Math.max(1, trend.length - 1))},${170 - d.total * (140 / Math.max(1, ...trend.map(v => v.total)))}`).join(' '));
	const links = [
		{ label: 'Apply leave', sub: 'Submit a new request', href: '/leave/apply', icon: Calendar },
		{ label: 'My requests', sub: 'View all leaves', href: '/leave', icon: FileText },
		{ label: 'My attendance', sub: 'View punch logs', href: '/attendance', icon: Clock },
		{ label: 'My team', sub: 'View your team', href: '/team', icon: Users }
	];
</script>

<div class="overview" class:show-upcoming={panel === 'upcoming'}>
	<div class="live"><span class="live-dot"></span>{refreshError ? 'Refresh unavailable · showing last loaded records' : 'Connected to your HR records · refreshes every 5 min'}<span>Updated {new Date(data.analytics.updatedAt).toLocaleTimeString('en-IN', {timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'})} IST</span></div>
	<div class="metrics" class:more-metrics={moreMetrics}>
		{#each metrics as metric, i}<a class="metric card" href={metric.href} style:--order={i}><div class="metric-top"><span>{metric.label}</span><span class="orb {metric.tone}"><metric.icon size={19}/></span></div><strong class:tenure={metric.label === 'Your tenure'}>{metric.value}<small>{metric.unit}</small></strong><p>{metric.detail}</p><span class="metric-line {metric.tone}"></span></a>{/each}
	</div>
	<button class="metric-switch" type="button" onclick={() => moreMetrics = !moreMetrics}>{moreMetrics ? 'Attendance & leave ←' : 'Tenure & hours →'}</button>
	<div class="panel-switch" aria-label="Dashboard panels">
		<button type="button" aria-pressed={panel === 'attendance'} onclick={() => panel = 'attendance'}>Attendance & heatmap</button>
		<button type="button" aria-pressed={panel === 'actions'} onclick={() => panel = 'actions'}>Attention & quick links</button>
		<button type="button" aria-pressed={panel === 'upcoming'} onclick={() => panel = 'upcoming'}>Upcoming</button>
	</div>
	<div class="grid" class:show-actions={panel === 'actions'}>
		<section class="card chart">
			<header><div><h2>Attendance overview</h2><p>Recorded check-in days this month · cumulative</p></div><a href="/attendance">View attendance ↗</a></header>
			<svg viewBox="0 0 640 215" role="img" aria-label={`Cumulative recorded attendance over ${trend.length} days. ${data.analytics.recordedDays} recorded days this month.`}>
				<defs><linearGradient id="attendance-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity="0.22"/><stop offset="100%" stop-color="currentColor" stop-opacity="0.02"/></linearGradient></defs>
				{#each [30, 65, 100, 135, 170] as y}<line x1="40" x2="600" y1={y} y2={y} stroke="var(--ess-border)"/>{/each}
				<polygon points={`40,170 ${points} ${trend.length > 1 ? 600 : 40},170`} fill="url(#attendance-fill)"/>
				<polyline {points} fill="none" stroke="currentColor" stroke-width="2.5"/>
				{#each trend as d, i}
					{@const x = 40 + i * (560 / Math.max(1, trend.length - 1))}
					{@const y = 170 - d.total * (140 / Math.max(1, ...trend.map(v => v.total)))}
					<circle cx={x} cy={y} r="5" fill="currentColor" stroke="var(--ess-surface)" stroke-width="2"/>
					<text {x} y={y - 12} text-anchor="middle">{d.total}</text><text {x} y="199" text-anchor="middle">{d.label}</text>
				{/each}
			</svg>
			<header class="month-head"><div><h3>Attendance heatmap</h3><p>13 weeks · recorded time between punches</p></div><span class="heat-legend">Less <i data-level="0"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i> More</span></header>
			<div class="heat-wrap"><div class="weekdays" aria-hidden="true">{#each ['M','T','W','T','F','S','S'] as day}<span>{day}</span>{/each}</div><div class="heatmap" aria-label="Attendance heatmap, Monday through Sunday, oldest week first">
			{#each data.analytics.heatmap as cell}<button type="button" data-level={cell.level} class:selected={selected === cell.date} onclick={() => selected = cell.date} aria-pressed={selected === cell.date} aria-label={cell.label + ': ' + (cell.level === -1 ? 'Future' : !cell.recorded ? 'No punch recorded' : !cell.complete ? 'Check-out missing' : cell.hours + ' recorded hours')} title={cell.label + ': ' + (cell.level === -1 ? 'Future' : !cell.recorded ? 'No punch recorded' : !cell.complete ? 'Check-out missing' : cell.hours + ' hours')}></button>{/each}
			</div></div>
			<p class="heat-detail" aria-live="polite">{#if selectedCell}{selectedCell.label}: {selectedCell.level === -1 ? 'Future date' : !selectedCell.recorded ? 'No punch recorded' : !selectedCell.complete ? 'Check-in recorded; check-out missing' : selectedCell.hours + ' recorded hours'}{:else}Select a day for details. Amber = missing check-out; outline = future.{/if}</p>
		</section>
		<div class="side">
			<section class="card"><header><h2>Needs your attention</h2><a href="/leave">View all</a></header>
				{#each data.missingCheckOuts.slice(0, 1) as item}<a class="attention" href={`/attendance?raise=${item.date}`}><span class="orb warning"><Clock size={22}/></span><div><b>Missing check-out</b><p>{item.date}</p></div><span class="tag">Review</span></a>{/each}
				{#if data.pendingCount > 0}<a class="attention" href="/leave"><span class="orb violet"><FileText size={22}/></span><div><b>Leave requests</b><p>{data.pendingCount} awaiting approval</p></div><span class="tag">Pending</span></a>{/if}
				{#if data.approvalQueue.length > 0}<a class="attention" href="/leave"><b>{data.approvalQueue.length} team requests to review</b><span class="tag">Review</span></a>{/if}
				{#if !data.missingCheckOuts.length && !data.pendingCount && !data.approvalQueue.length}<p class="clear">You're all caught up. Nothing needs your attention.</p>{/if}
			</section>
			<section class="card"><header><h2>Quick links</h2></header><div class="quick">{#each links as link}<a href={link.href}><span class="orb"><link.icon size={23}/></span><div><b>{link.label}</b><p>{link.sub}</p></div><span aria-hidden="true">›</span></a>{/each}</div></section>
		</div>
	</div>
	<section class="card upcoming"><header><h2>Upcoming</h2><a href="/hub/meetings">View meetings</a></header><div class="events">
		{#each data.meetingsToday.filter(m => m.state === 'upcoming').slice(0, 1) as meeting}<a href="/hub/meetings"><span class="orb"><Calendar size={23}/></span><div><b>{meeting.topic}</b><p>{new Date(meeting.startedAt).toLocaleTimeString('en-IN', {timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'})} · {meeting.durationMin ?? 30} min</p></div></a>{/each}
		{#each data.upcomingHolidays.slice(0, 1) as holiday}<a href="/policies"><span class="orb green"><Calendar size={23}/></span><div><b>{holiday.name}</b><p>{holiday.date} · {holiday.type} holiday</p></div></a>{/each}
		{#if !data.meetingsToday.some(m => m.state === 'upcoming') && !data.upcomingHolidays.length}<p>No upcoming meetings today or published holidays.</p>{/if}
	</div></section>
</div>

<style>
	.overview { display:grid; gap:18px; }
	.card { background:var(--ess-surface); border:1px solid var(--ess-border); border-radius:12px; padding:20px; min-width:0; }
	.metrics {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;}
	.metric {display:flex;align-items:center;gap:20px;color:var(--ess-text);padding:24px;}
	.metric > div {min-width:0;}
	.metric strong {display:block;font-size:30px;line-height:1.3;letter-spacing:-1px;}
	.metric small {font-size:20px;letter-spacing:0;}
	p {font-size:13px;color:var(--ess-text-muted);margin:3px 0 0;}
	.orb {display:grid;place-items:center;width:48px;height:48px;flex:none;border-radius:50%;background:var(--ess-primary-softer);color:var(--ess-primary-text);}
	.metric .orb {width:72px;height:72px;}
	.green {color:var(--ess-success);background:var(--ess-success-bg);}
	.violet {background:var(--ess-primary-soft);}
	.warning {color:var(--ess-warning);background:var(--ess-warning-bg);}
	.grid {display:grid;grid-template-columns:minmax(0,1.7fr) minmax(300px,1fr);gap:18px;align-items:start;}
	header {display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
	h2 {font-family:var(--ess-font-sans);font-size:20px;font-weight:600;letter-spacing:-.4px;}
	h3 {font-size:14px;font-weight:600;}
	header a {font-size:13px;}
	svg {display:block;width:100%;height:auto;max-height:260px;color:var(--ess-primary);}
	svg text {font-size:11px;fill:var(--ess-text-secondary);}
	.month-head {margin-top:16px;}
	.side {display:grid;gap:16px;min-width:0;}
	.attention,.quick a,.events a {display:flex;gap:12px;align-items:center;border:1px solid var(--ess-border);border-radius:10px;padding:12px;color:var(--ess-text);min-width:0;}
	.attention {margin-top:10px;flex-wrap:wrap;}
	.attention > div,.quick a > div,.events a > div {flex:1;min-width:0;overflow-wrap:anywhere;}
	b {font-size:14px;font-weight:600;}
	.tag {font-size:12px;padding:5px 9px;background:var(--ess-primary-soft);color:var(--ess-primary-text);border-radius:6px;}
	.quick {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
	.quick a {gap:8px;padding:10px;}
	.quick .orb {width:36px;height:36px;}
	.quick p {font-size:11px;}
	.events {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:12px;}
	.clear {padding:12px 0;}
	@media(max-width:1200px) {.metric {padding:18px;gap:12px;}.metric .orb {width:48px;height:48px;}.grid {grid-template-columns:minmax(0,1fr);}.side {grid-template-columns:repeat(2,minmax(0,1fr));}.quick {grid-template-columns:1fr;}}
	@media(max-width:720px) {.metrics,.side {grid-template-columns:1fr;}.card {padding:16px;}.metric {padding:16px;}.metric strong {font-size:26px;}.quick {grid-template-columns:repeat(2,minmax(0,1fr));}}
	@media(max-width:440px) {.quick {grid-template-columns:1fr;}}
	.overview {gap:12px;}
	.live {display:flex;align-items:center;gap:7px;font-size:11px;color:var(--ess-text-muted);flex-wrap:wrap;}
	.live > span:last-child {margin-left:auto;}
	.live-dot {width:6px;height:6px;border-radius:50%;background:var(--ess-success);}
	.metrics {grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;}
	.card {padding:16px;border-radius:14px;box-shadow:0 3px 14px rgb(35 40 85 / 3%);}
	.metric {position:relative;display:block;padding:14px 16px 17px;overflow:hidden;animation:card-enter .45s both;animation-delay:calc(var(--order)*55ms);transition:transform .18s,box-shadow .18s;}
	.metric:hover {transform:translateY(-3px);box-shadow:0 8px 24px rgb(35 40 85 / 9%);}
	.metric-top {display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:12px;font-weight:500;color:var(--ess-text-secondary);}
	.metric .orb {width:30px;height:30px;border-radius:9px;}
	.metric strong {font-size:30px;line-height:1.3;margin-top:4px;font-variant-numeric:tabular-nums;letter-spacing:-1px;}
	.metric strong.tenure {font-size:22px;letter-spacing:-.5px;min-height:39px;display:flex;align-items:center;}
	.metric small {font-size:13px;margin-left:5px;font-weight:400;letter-spacing:0;}
	.metric p {font-size:10px;line-height:1.4;}
	.metric-line {position:absolute;height:3px;bottom:0;left:16px;right:16px;border-radius:3px;opacity:.7;}
	.metric-line.green {background:var(--ess-success);}.metric-line.violet {background:var(--ess-primary);}.metric-line.amber {background:var(--ess-warning);}
	.orb.amber {background:var(--ess-warning-bg);color:var(--ess-warning);}
	.grid {grid-template-columns:minmax(0,1.6fr) minmax(285px,1fr);gap:12px;}
	header {margin-bottom:10px;gap:8px;} h2 {font-size:17px;} p {font-size:12px;}
	svg {max-height:170px;}
	.chart polyline {stroke-dasharray:1000;stroke-dashoffset:1000;animation:draw 1.2s ease forwards;}
	.month-head {margin-top:8px;}
	.heat-wrap {display:flex;gap:8px;}
	.weekdays {display:grid;grid-template-rows:repeat(7,1fr);font-size:9px;color:var(--ess-text-muted);width:12px;}
	.weekdays span {display:flex;align-items:center;}
	.heatmap {display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,15px);grid-template-columns:repeat(13,minmax(0,1fr));gap:4px;flex:1;min-width:0;}
	.heatmap button,.heat-legend i {border:1px solid var(--ess-border);background:var(--ess-sunken);border-radius:3px;min-width:0;padding:0;}
	.heatmap button {cursor:pointer;transition:transform .15s,filter .15s;}
	.heatmap button:hover,.heatmap button.selected {transform:scale(1.12);outline:2px solid var(--ess-primary);outline-offset:1px;z-index:1;}
	.heatmap [data-level='-1'] {background:transparent;border-style:dashed;}
	.heatmap [data-level='1'] {background:var(--ess-warning-bg);border-color:var(--ess-warning);}
	.heatmap [data-level='2'],.heat-legend [data-level='2'] {background:#c4eadd;border-color:#9ed2bf;}
	.heatmap [data-level='3'],.heat-legend [data-level='3'] {background:#6fc7a7;border-color:#6fc7a7;}
	.heatmap [data-level='4'],.heat-legend [data-level='4'] {background:#29976f;border-color:#29976f;}
	.heat-legend {display:flex;align-items:center;gap:4px;font-size:10px;color:var(--ess-text-muted);}
	.heat-legend i {width:10px;height:10px;}
	.heat-detail {font-size:10px;min-height:16px;margin-top:6px;}
	.side {gap:12px;grid-template-columns:1fr;}.quick {grid-template-columns:repeat(2,minmax(0,1fr));}
	.attention {padding:9px;margin-top:8px;gap:8px;}.attention .orb {width:32px;height:32px;}
	.quick a {padding:8px;}.quick p {font-size:10px;}.quick b {font-size:12px;}
	.events a {padding:9px;}.events .orb {width:34px;height:34px;}
	@keyframes card-enter {from {opacity:0;transform:translateY(8px);} to {opacity:1;transform:none;}}
	@keyframes draw {to {stroke-dashoffset:0;}}
	@media(min-width:1100px) and (max-height:850px) { .card {padding:12px;}.metric {padding:10px 12px 14px;} svg {max-height:112px;}.heatmap {grid-template-rows:repeat(7,12px);gap:3px;}.overview {gap:10px;}h2 {font-size:16px;} }
	@media(max-width:1099px) {.metrics {grid-template-columns:repeat(3,minmax(0,1fr));}.grid {grid-template-columns:1fr;}.side {grid-template-columns:repeat(2,minmax(0,1fr));}.quick {grid-template-columns:1fr;}}
	@media(max-width:650px) {.metrics {grid-template-columns:repeat(2,minmax(0,1fr));}.side {grid-template-columns:1fr;}.metric {padding:12px;}.metric strong {font-size:26px;}.metric strong.tenure {font-size:19px;}.live > span:last-child {margin-left:0;}}
	@media(prefers-reduced-motion:reduce) {.metric,.chart polyline {animation:none;}.chart polyline {stroke-dashoffset:0;}.metric,.heatmap button {transition:none;}.metric:hover,.heatmap button:hover {transform:none;}}

	/* Fixed composition: summaries have a budget; graphics use the remaining space. */
	.overview {display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:12px;min-height:0;}
	.live {min-height:0;}
	.metrics {max-height:none;overflow:visible;padding:0;grid-template-columns:repeat(5,minmax(0,1fr));}
	.metric {min-width:0;padding:12px 14px 16px;}
	.grid {min-height:0;align-items:stretch;}
	.chart {min-height:0;display:flex;flex-direction:column;overflow:visible;}
	.chart > header {flex:none;}
	.chart > svg {flex:1 1 0%;min-height:0;height:100%;max-height:none;width:100%;}
	.heat-wrap {flex:.65 1 0%;min-height:0;}
	.heatmap {grid-template-rows:repeat(7,minmax(0,1fr));min-height:0;}
	.heat-detail {flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
	.side {min-height:0;grid-template-rows:minmax(0,1fr) minmax(0,1fr);align-content:stretch;}
	.side > .card {min-height:0;display:flex;flex-direction:column;}
	.side header {flex:none;}
	.quick {flex:1;min-height:0;}
	.quick a {min-height:0;}
	.attention {flex:1;min-height:0;margin-top:6px;padding:7px;flex-wrap:nowrap;}
	.attention b,.events b {display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
	.upcoming {max-height:none;padding:12px 16px;}
	.upcoming header {margin-bottom:7px;}
	.events a {padding:7px 10px;}
	.metric-switch,.panel-switch {display:none;}
	.panel-switch button,.metric-switch {border:1px solid var(--ess-border);border-radius:7px;background:var(--ess-surface);color:var(--ess-primary-text);padding:5px 8px;font:inherit;font-size:11px;cursor:pointer;}
	.panel-switch button[aria-pressed='true'] {background:var(--ess-primary-soft);border-color:var(--ess-primary);}
	@media(min-width:1100px) and (max-height:800px) {
		.overview {gap:8px;}.metric {padding:8px 12px 12px;}.metric strong {font-size:25px;}.metric strong.tenure {font-size:19px;min-height:32px;}.metric-top {font-size:11px;}.card {padding:10px 12px;}.chart header p {font-size:10px;}.side h2 {font-size:15px;}.attention .orb {width:26px;height:26px;}.quick p {display:none;}.month-head {margin-top:4px;margin-bottom:6px;}.heatmap {gap:3px;}.upcoming header {margin-bottom:4px;}.events .orb {width:28px;height:28px;}
	}
	@media(max-width:1099px), (max-height:600px) {
		.overview {grid-template-rows:auto auto auto minmax(0,1fr);gap:8px;}
		.live {display:none;}
		.metrics {grid-template-columns:repeat(3,minmax(0,1fr));}
		.metrics:not(.more-metrics) .metric:nth-child(n+4),.metrics.more-metrics .metric:nth-child(-n+3) {display:none;}
		.metrics.more-metrics {grid-template-columns:repeat(2,minmax(0,1fr));}
		.metric-switch {display:block;justify-self:end;}
		.panel-switch {display:flex;gap:5px;flex-wrap:wrap;}
		.grid {display:block;min-height:0;}
		.grid .chart,.grid .side {height:100%;}
		.grid:not(.show-actions) .side,.grid.show-actions .chart {display:none;}
		.side {grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) minmax(0,1fr);}
		.upcoming {display:none;}
		.show-upcoming .grid {display:none;}.show-upcoming .upcoming {display:block;min-height:0;}
		.quick {grid-template-columns:repeat(2,minmax(0,1fr));}
		.metric strong {font-size:22px;}.metric strong.tenure {font-size:18px;}.metric .orb {display:none;}.metric p {font-size:10px;}.metric-top {font-size:11px;}
	}
	@media(max-width:500px) {.metric {padding:8px;}.metric p {display:none;}.metric strong {font-size:20px;}.metric small {font-size:10px;}.panel-switch button {font-size:10px;padding:5px;}.heat-legend {display:none;}.chart header p {font-size:10px;}.chart header a {font-size:11px;}.chart h2 {font-size:15px;}}
</style>
