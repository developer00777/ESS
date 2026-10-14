<script lang="ts">
	import { enhance } from '$app/forms';
	import Video from '@lucide/svelte/icons/video';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';
	import Plus from '@lucide/svelte/icons/plus';
	import Info from '@lucide/svelte/icons/info';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Avatar from '$lib/components/Avatar.svelte';

	let { data, form } = $props();
	let busy = $state(false);
	let copied = $state(false);
	let setupOpen = $state(!data.configured);
	let mapping = $state({ userId: '', zoomKey: '' });
	let keyInput = $state<HTMLInputElement | null>(null);

	const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : 'Never');
	const varsSet = $derived(Object.values(data.vars).filter(Boolean).length);
	const varsTotal = $derived(Object.keys(data.vars).length);

	/** Masks an email or id for the connection card: never the whole thing. */
	function mask(s: string) {
		const at = s.indexOf('@');
		if (at > 1) return `${s[0]}${'•'.repeat(Math.max(3, at - 1))}${s.slice(at)}`;
		return s.length > 6 ? `${s.slice(0, 3)}${'•'.repeat(s.length - 5)}${s.slice(-2)}` : '••••••';
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(data.webhookUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* select it by hand */
		}
	}

	/** "Resolve" on an unmatched name drops it into the mapping form. */
	function resolve(name: string) {
		mapping = { userId: '', zoomKey: name };
		keyInput?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}
</script>

<svelte:head><title>Zoom — Champ HR ESS Portal</title></svelte:head>

{#if form?.error}
	<p class="ess-alert ess-alert--danger" role="alert">{form.error}</p>
{:else if form?.message}
	<p class="ess-alert ess-alert--success" role="status">{form.message}</p>
{/if}

<div class="ess-split ess-fill zoom-page">
	<div class="ess-stack">
		<!-- ---------- connection ---------- -->
		<section class="ess-card connection">
			<div class="conn-head">
				<span class="ess-tile conn-tile"><Video size={22} strokeWidth={1.75} /></span>
				<div class="conn-title">
					<h2 class="ess-h2">Zoom</h2>
					<p class="ess-caption">Video meetings for your team.</p>
				</div>
				<div class="conn-state">
					{#if data.configured}
						<span class="ess-badge ess-badge--ok"><span class="dot"></span> Connected</span>
					{:else}
						<span class="ess-badge ess-badge--warn"><span class="dot"></span> Not connected</span>
					{/if}
					<small class="ess-caption">Last checked {when(data.status.lastReconcileAt)}</small>
				</div>
				<div class="conn-actions">
					<form method="POST" action="?/check" use:enhance={() => { busy = true; return async ({ update }) => { await update(); busy = false; }; }}>
						<button class="ess-btn ess-btn--outline" disabled={busy || !data.configured}>{busy ? 'Checking…' : 'Check Zoom now'}</button>
					</form>
					<button type="button" class="ess-btn ess-btn--secondary" onclick={() => (setupOpen = !setupOpen)} aria-expanded={setupOpen}>
						Manage connection <ChevronDown size={15} class={setupOpen ? 'flip' : ''} />
					</button>
				</div>
			</div>

			<div class="conn-facts">
				<div class="fact">
					<span class="ess-caption">Company host account</span>
					<strong>{data.defaultHost ? mask(data.defaultHost) : 'Not set'}</strong>
					<small class="ess-caption">{data.defaultHost ? 'Hosts meetings for people without their own Zoom account.' : 'Set ZOOM_DEFAULT_HOST, or a licensed account is found in Zoom.'}</small>
				</div>
				<div class="fact">
					<span class="ess-caption">Credentials</span>
					<strong>{varsSet} of {varsTotal} set</strong>
					<small class="ess-caption">Kept on the server; never shown here.</small>
				</div>
				<div class="fact">
					<span class="ess-caption">Last event from Zoom</span>
					<strong>{data.status.lastEvent ?? 'None yet'}</strong>
					<small class="ess-caption">{data.status.lastEvent ? when(data.status.lastEventAt) : 'Events arrive once the webhook is validated.'}</small>
				</div>
			</div>

			{#if data.status.lastError}
				<div class="ess-notice ess-notice--danger">
					<span class="ess-notice__icon"><Info size={15} /></span>
					<span class="ess-notice__body"><strong>Last problem</strong>{data.status.lastError} <small>({when(data.status.lastErrorAt)})</small></span>
				</div>
			{/if}

			{#if setupOpen}
				<div class="setup">
					<h3 class="ess-h3">Setting up the Zoom app</h3>
					<dl class="ess-kv vars">
						{#each Object.entries(data.vars) as [k, set] (k)}
							<dt><code>{k}</code></dt>
							<dd><span class="ess-badge" class:ess-badge--ok={set} class:ess-badge--bad={!set}>{set ? 'Set' : 'Missing'}</span></dd>
						{/each}
					</dl>
					<ol class="steps">
						<li>In the Zoom web portal, turn on <strong>AI Companion › Meeting summary</strong> for the account, ideally starting automatically.</li>
						<li>At <strong>marketplace.zoom.us › Develop › Build App</strong>, create a <strong>Server-to-Server OAuth</strong> app. Copy the Account ID, Client ID and Client Secret.</li>
						<li>Add the admin read scopes for meeting summaries, past meeting participants, listing meetings, and users, plus the meeting write scope for scheduling.</li>
						<li>Under Feature › Event Subscriptions, add <strong>Meeting summary completed</strong> and <strong>End Meeting</strong>, with this endpoint:</li>
					</ol>
					<div class="url">
						<code>{data.webhookUrl}</code>
						<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={copy}>{#if copied}<Check size={14} /> Copied{:else}<Copy size={14} /> Copy{/if}</button>
					</div>
					<ol class="steps" start="5">
						<li>Copy the app's <strong>Secret Token</strong> into <code>ZOOM_WEBHOOK_SECRET</code>, set the other variables, redeploy, then press <strong>Validate</strong> in Zoom and activate the app.</li>
					</ol>
				</div>
			{/if}
		</section>

		<!-- ---------- host mapping ---------- -->
		<section class="ess-card ess-fill-card hosts-card">
			<div class="ess-card-head">
				<div>
					<h2 class="ess-h2">Host mapping</h2>
					<p class="ess-caption">Link Zoom accounts to people so meetings are hosted and attributed correctly.</p>
				</div>
				<button type="button" class="ess-btn ess-btn--primary" onclick={() => { mapping = { userId: '', zoomKey: '' }; keyInput?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }}>
					<Plus size={16} /> Add host
				</button>
			</div>
			<p class="ess-help">
				When someone schedules a meeting they pick which account hosts it: their own, a lead above them, or the company account. A person's account is their work email unless a different Zoom email or user ID is set here.
			</p>
			{#if data.links.length}
				<div class="ess-table-shell table-gap ess-scroll">
					<table class="ess-table">
						<thead><tr><th>Employee</th><th>Zoom account</th><th>Status</th><th></th></tr></thead>
						<tbody>
							{#each data.links as l (l.id)}
								<tr>
									<td>
										<span class="who">
											<Avatar userId={l.userId} fullName={l.fullName} size="md" />
											<span class="who-body"><strong>{l.fullName}</strong><small class="ess-caption">Linked {when(l.createdAt)}</small></span>
										</span>
									</td>
									<td><code class="key">{l.zoomKey}</code></td>
									<td><span class="ess-badge ess-badge--ok"><span class="dot"></span> Mapped</span></td>
									<td class="row-end">
										<form method="POST" action="?/link" use:enhance>
											<input type="hidden" name="zoomKey" value={l.zoomKey} />
											<input type="hidden" name="userId" value="" />
											<button class="ess-btn ess-btn--ghost ess-btn--sm">Remove</button>
										</form>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="ess-empty empty">
					<span class="ess-empty__icon"><Video size={20} /></span>
					<p class="ess-empty__title">No hosts mapped yet.</p>
					<p class="ess-caption">People host from their work email until you set a different Zoom account here.</p>
				</div>
			{/if}
		</section>

		<!-- ---------- unmatched names ---------- -->
		<section class="ess-card ess-fill-card unmatched-card">
			<div class="ess-card-head">
				<div>
					<h2 class="ess-h2">Unmatched meeting names</h2>
					<p class="ess-caption">Attendees match by work email. Personal accounts, phones and dial-ins show a name only; link them once and future meetings match.</p>
				</div>
			</div>
			{#if data.unmatched.length}
				<div class="ess-table-shell table-gap ess-scroll">
					<table class="ess-table">
						<thead><tr><th>Zoom name or email</th><th class="ess-num">Seen in</th><th>Link to</th><th></th></tr></thead>
						<tbody>
							{#each data.unmatched as u (u.name)}
								<tr>
									<td><strong>{u.name}</strong></td>
									<td class="ess-num">{u.count} {u.count === 1 ? 'meeting' : 'meetings'}</td>
									<td>
										<form method="POST" action="?/link" use:enhance class="link">
											<input type="hidden" name="zoomKey" value={u.name} />
											<select class="ess-select" name="userId" aria-label="Login for {u.name}" required>
												<option value="">Pick a person</option>
												{#each data.people as p (p.id)}<option value={p.id}>{p.fullName}</option>{/each}
											</select>
											<button class="ess-btn ess-btn--outline ess-btn--sm">Link</button>
										</form>
									</td>
									<td class="row-end"><button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => resolve(u.name)}>Resolve in form</button></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="ess-help">Nothing unmatched in the last 30 days.</p>
			{/if}
		</section>
	</div>

	<aside class="ess-stack">
		<!-- ---------- map a host ---------- -->
		<section class="ess-card map-card">
			<div class="ess-card-head">
				<h2 class="ess-h2">Match participant names</h2>
			</div>
			<p class="ess-caption">Link a Zoom name or email to a person.</p>
			<form method="POST" action="?/link" use:enhance={() => async ({ result, update }) => { await update(); if (result.type === 'success') mapping = { userId: '', zoomKey: '' }; }} class="map-form">
				<div class="ess-field">
					<label class="ess-label" for="zh-person">Person</label>
					<select id="zh-person" class="ess-select" name="userId" bind:value={mapping.userId} required>
						<option value="">Pick a person</option>
						{#each data.people as p (p.id)}<option value={p.id}>{p.fullName}</option>{/each}
					</select>
				</div>
				<div class="ess-field">
					<label class="ess-label" for="zh-key">Zoom name, email or user ID</label>
					<input id="zh-key" class="ess-input" name="zoomKey" bind:value={mapping.zoomKey} bind:this={keyInput} placeholder="priya.n@company.com" required />
					<span class="ess-help">The Zoom user ID is on the user's page in the Zoom admin portal (User Management › Users). It has to be a licensed user in the company account.</span>
				</div>
				<div class="map-actions">
					<button class="ess-btn ess-btn--primary">Save mapping</button>
					<button type="button" class="ess-btn ess-btn--secondary" onclick={() => (mapping = { userId: '', zoomKey: '' })}>Cancel</button>
				</div>
			</form>
		</section>

		<section class="ess-card about">
			<div class="about-body">
			<h3 class="ess-h3">About this integration</h3>
			<p class="ess-caption">One Server-to-Server OAuth app on the company Zoom account. Meetings scheduled in Champ Hub are created in Zoom, and when a call ends its AI summary comes back as minutes to review.</p>
			<ul class="about-list">
				<li><span class="ess-tile ess-tile--sm"><Video size={15} /></span> Schedule and join calls from Champ Hub</li>
				<li><span class="ess-tile ess-tile--sm"><Check size={15} /></span> Minutes and action items from each meeting</li>
				<li><span class="ess-tile ess-tile--sm"><Info size={15} /></span> Attendees matched to logins by email</li>
			</ul>
			<div class="ess-notice ess-notice--info">
				<span class="ess-notice__icon"><Info size={15} /></span>
				<span class="ess-notice__body"><strong>Summaries are checked every few hours.</strong>Press "Check Zoom now" to fetch the last three days straight away.</span>
			</div>
			</div>
		</section>
	</aside>
</div>

<style>
	.zoom-page {
		--ess-aside-width: 340px;
	}
	.connection {
		display: grid;
		gap: 12px;
	}
	.conn-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
	}
	.conn-tile {
		width: 40px;
		height: 40px;
	}
	.conn-title {
		display: grid;
		gap: 2px;
		min-width: 120px;
	}
	.conn-state {
		display: grid;
		gap: 4px;
		justify-items: start;
		margin-left: auto;
	}
	.conn-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.conn-actions :global(.flip) {
		transform: rotate(180deg);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: currentColor;
	}
	.conn-facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0;
		border-top: 1px solid var(--ess-border-subtle);
	}
	.fact {
		display: grid;
		gap: 1px;
		padding: 10px 16px 0 0;
		border-right: 1px solid var(--ess-border-subtle);
	}
	.fact + .fact {
		padding-left: 16px;
	}
	.fact:last-child {
		border-right: none;
	}
	.fact strong {
		font-size: 14px;
		font-weight: 500;
		overflow-wrap: anywhere;
	}

	.setup {
		display: grid;
		gap: 10px;
		padding-top: 12px;
		border-top: 1px solid var(--ess-border-subtle);
	}
	.vars {
		font-size: 13px;
	}
	.vars code {
		font-family: var(--ess-font-mono);
		font-size: 12px;
	}
	.steps {
		margin: 0;
		padding-left: 20px;
		display: grid;
		gap: 4px;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.url {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
		padding: 8px 10px;
		border-radius: var(--ess-radius-sm);
		background: var(--ess-sunken);
	}
	.url code {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
		font-family: var(--ess-font-mono);
		font-size: 12.5px;
	}

	.table-gap {
		margin-top: 10px;
	}
	.empty {
		padding: 14px 16px;
		gap: 4px;
	}
	.empty .ess-empty__icon {
		width: 34px;
		height: 34px;
		margin-bottom: 0;
	}
	.empty .ess-empty__title {
		font-size: 14.5px;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.who-body {
		display: grid;
	}
	.who strong {
		font-weight: 500;
	}
	.key {
		font-family: var(--ess-font-mono);
		font-size: 12.5px;
		overflow-wrap: anywhere;
	}
	.row-end {
		text-align: right;
		white-space: nowrap;
	}
	.link {
		display: flex;
		gap: 6px;
	}
	.link .ess-select {
		max-width: 240px;
	}

	.map-form {
		display: grid;
		gap: 10px;
		margin-top: 10px;
	}
	.map-actions {
		display: flex;
		gap: 8px;
	}
	.about-body {
		display: grid;
		gap: 10px;
		align-content: start;
	}
	.about-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
		font-size: 13px;
	}
	.about-list .ess-tile {
		width: 30px;
		height: 30px;
	}
	.about .ess-notice {
		padding: 9px 12px;
		gap: 10px;
		font-size: 12.5px;
	}

	/* Desktop fill: the two tables and the about panel scroll inside their
	   cards; the connection setup scrolls in its own box when opened. */
	@media (min-width: 1101px) and (min-height: 480px) {
		@container ess-fill (min-width: 0px) {
			.zoom-page .connection,
			.zoom-page .map-card {
				flex: 0 0 auto;
			}
			.zoom-page .hosts-card {
				flex: 3 1 0%;
				min-height: 150px;
			}
			.zoom-page .unmatched-card {
				flex: 1.6 1 0%;
				min-height: 100px;
			}
			.hosts-card .empty {
				flex: 1 1 0%;
				min-height: 0;
				overflow: auto;
				justify-content: safe center;
				padding: 6px 16px;
			}
			.empty > :global(*) {
				flex-shrink: 0;
			}
			.setup {
				max-height: 38vh;
				overflow: auto;
				overscroll-behavior: contain;
				scrollbar-width: thin;
			}
			.zoom-page .about {
				flex: 1 1 0%;
				min-height: 120px;
				display: flex;
				flex-direction: column;
				overflow: hidden;
			}
			.about-body {
				flex: 1 1 0%;
				min-height: 0;
				overflow: auto;
				overscroll-behavior: contain;
				scrollbar-width: thin;
			}
			.zoom-page .ess-table-shell th {
				position: sticky;
				top: 0;
				z-index: 1;
			}
		}
	}
	.about-list li {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	/* Short desktop screens: the connection header sits on one row, the
	   facts and empty state lie flat, and the forms tighten, so both
	   columns end on the same line without scrolling. */
	@media (min-width: 1101px) and (min-height: 480px) and (max-height: 820px) {
		@container ess-fill (min-width: 0px) {
			.connection {
				gap: 6px;
			}
			.conn-head {
				display: grid;
				grid-template-columns: auto minmax(0, 1fr) auto auto;
				gap: 8px;
			}
			.conn-tile {
				width: 34px;
				height: 34px;
			}
			.conn-state {
				margin-left: 0;
				gap: 2px;
				justify-items: end;
				text-align: right;
			}
			.conn-state .ess-caption,
			.conn-title .ess-caption {
				font-size: 12px;
			}
			.conn-actions {
				flex-wrap: nowrap;
			}
			.conn-actions .ess-btn {
				height: 30px;
				padding: 0 10px;
				font-size: 13px;
			}
			.fact {
				padding-top: 5px;
				gap: 0;
			}
			.fact .ess-caption {
				font-size: 12px;
				line-height: 1.35;
			}
			.fact strong {
				font-size: 13.5px;
			}
			.zoom-page .ess-card-head > div {
				display: flex;
				align-items: baseline;
				flex-wrap: wrap;
				gap: 0 10px;
			}
			.zoom-page .ess-card-head {
				margin-bottom: 6px;
			}
			.zoom-page .ess-card-head .ess-caption {
				font-size: 12px;
				line-height: 1.35;
			}
			.hosts-card .ess-card-head .ess-btn {
				height: 28px;
				padding: 0 12px;
				font-size: 13px;
			}
			.hosts-card > .ess-help {
				font-size: 12px;
				line-height: 1.35;
			}
			/* Natural heights first, so a short card is never cut while the
			   other has room to spare; longer tables then share what's left. */
			.zoom-page .hosts-card {
				flex-basis: auto;
				min-height: 120px;
			}
			.zoom-page .unmatched-card {
				flex-basis: auto;
				min-height: 80px;
			}
			.hosts-card .empty {
				display: grid;
				grid-template-columns: auto minmax(0, 1fr);
				justify-items: start;
				align-content: safe center;
				column-gap: 12px;
				row-gap: 0;
				gap: 0 12px;
				text-align: left;
				padding: 2px 4px;
			}
			.empty .ess-empty__icon {
				grid-row: span 2;
				width: 30px;
				height: 30px;
			}
			.empty .ess-empty__title {
				font-size: 13.5px;
				margin: 0;
			}
			.empty .ess-caption {
				font-size: 12px;
				margin: 0;
			}
			.table-gap {
				margin-top: 8px;
			}
			.map-form {
				gap: 8px;
				margin-top: 6px;
			}
			.map-card .ess-help {
				font-size: 12px;
				line-height: 1.35;
			}
			.zoom-page .about {
				min-height: 90px;
			}
			.about-body {
				gap: 8px;
			}
		}
	}

	@media (max-width: 720px) {
		.conn-state {
			margin-left: 0;
		}
		.conn-facts {
			grid-template-columns: 1fr;
		}
		.fact {
			border-right: none;
			padding-left: 0 !important;
		}
	}
</style>
