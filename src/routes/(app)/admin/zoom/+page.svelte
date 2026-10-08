<script lang="ts">
	import { enhance } from '$app/forms';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Copy from '@lucide/svelte/icons/copy';

	let { data, form } = $props();
	let busy = $state(false);
	let copied = $state(false);

	const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : 'Never');

	async function copy() {
		try {
			await navigator.clipboard.writeText(data.webhookUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* select it by hand */
		}
	}
</script>

<svelte:head><title>Zoom — Champ HR ESS Portal</title></svelte:head>

{#if form?.error}
	<p class="ess-alert ess-alert--danger gap" role="alert">{form.error}</p>
{:else if form?.message}
	<p class="ess-alert ess-alert--success gap" role="status">{form.message}</p>
{/if}

<div class="grid">
	<section class="ess-card block">
		<h2 class="ess-h3">Connection</h2>
		{#if data.configured}
			<p class="state ok"><CircleCheck size={16} /> Connected to the company Zoom account</p>
		{:else}
			<p class="state warn"><CircleAlert size={16} /> Not connected. Meetings works from pasted notes until the variables below are set.</p>
		{/if}
		<dl class="kv">
			{#each Object.entries(data.vars) as [k, set] (k)}
				<dt><code>{k}</code></dt>
				<dd>{set ? 'Set' : 'Missing'}</dd>
			{/each}
			<dt>Last event</dt>
			<dd>{data.status.lastEvent ? `${data.status.lastEvent} · ${when(data.status.lastEventAt)}` : 'None received yet'}</dd>
			<dt>Last check</dt>
			<dd>{when(data.status.lastReconcileAt)}</dd>
			{#if data.status.lastError}
				<dt>Last problem</dt>
				<dd class="err">{data.status.lastError} <small>({when(data.status.lastErrorAt)})</small></dd>
			{/if}
		</dl>
		<form method="POST" action="?/check" use:enhance={() => { busy = true; return async ({ update }) => { await update(); busy = false; }; }}>
			<button class="ess-btn ess-btn--secondary ess-btn--sm" disabled={busy || !data.configured}>Check Zoom now</button>
		</form>
	</section>

	<section class="ess-card block">
		<h2 class="ess-h3">Setting up the Zoom app</h2>
		<ol class="steps">
			<li>In the Zoom web portal, turn on <strong>AI Companion › Meeting summary</strong> for the account, ideally starting automatically.</li>
			<li>At <strong>marketplace.zoom.us › Develop › Build App</strong>, create a <strong>Server-to-Server OAuth</strong> app. Copy the Account ID, Client ID and Client Secret.</li>
			<li>Add the admin read scopes for meeting summaries, past meeting participants, listing meetings, and users.</li>
			<li>Under Feature › Event Subscriptions, add <strong>Meeting summary completed</strong> and <strong>End Meeting</strong>, with this endpoint:</li>
		</ol>
		<div class="url">
			<code>{data.webhookUrl}</code>
			<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={copy}><Copy size={14} /> {copied ? 'Copied' : 'Copy'}</button>
		</div>
		<ol class="steps" start="5">
			<li>Copy the app's <strong>Secret Token</strong> into <code>ZOOM_WEBHOOK_SECRET</code>, set the other three variables, redeploy, then press <strong>Validate</strong> in Zoom and activate the app.</li>
		</ol>
	</section>
</div>

<section class="ess-card block">
	<h2 class="ess-h3">Who hosts scheduled meetings</h2>
	<p class="ess-caption">
		When someone schedules a meeting, they pick which account hosts it: their own, their team lead's or anyone above them, or the company account
		{#if data.defaultHost}(<code>{data.defaultHost}</code>){:else}(not set: add <code>ZOOM_DEFAULT_HOST</code>){/if}.
		A person's account is their work email unless you set a different Zoom email or Zoom user ID here.
	</p>
	<form method="POST" action="?/link" use:enhance class="host-form">
		<div class="ess-field">
			<label class="ess-label" for="zh-person">Person</label>
			<select id="zh-person" class="ess-select" name="userId" required>
				<option value="">Pick a person</option>
				{#each data.people as p (p.id)}<option value={p.id}>{p.fullName}</option>{/each}
			</select>
		</div>
		<div class="ess-field">
			<label class="ess-label" for="zh-key">Their Zoom email or user ID</label>
			<input id="zh-key" class="ess-input" name="zoomKey" placeholder="priya.n@company.com or KdYKjnimT4KPd8FFgQt9FQ" required />
		</div>
		<button class="ess-btn ess-btn--primary ess-btn--sm">Save</button>
	</form>
	<p class="ess-help">The Zoom user ID is on the user's page in the Zoom admin portal (User Management › Users). It has to be a licensed user in the company Zoom account.</p>
</section>

<section class="ess-card block">
	<h2 class="ess-h3">Zoom names and logins</h2>
	<p class="ess-caption">Attendees match by work email. Personal accounts, phones and dial-ins show a name only; link those here once and future meetings match them.</p>

	{#if data.unmatched.length}
		<div class="ess-table-shell">
			<table class="ess-table">
				<thead><tr><th>Zoom name or email</th><th class="ess-num">Seen in</th><th>Login</th></tr></thead>
				<tbody>
					{#each data.unmatched as u (u.name)}
						<tr>
							<td>{u.name}</td>
							<td class="ess-num">{u.count} {u.count === 1 ? 'meeting' : 'meetings'}</td>
							<td>
								<form method="POST" action="?/link" use:enhance class="link">
									<input type="hidden" name="zoomKey" value={u.name} />
									<select class="ess-select" name="userId" aria-label="Login for {u.name}" required>
										<option value="">Pick a person</option>
										{#each data.people as p (p.id)}<option value={p.id}>{p.fullName}</option>{/each}
									</select>
									<button class="ess-btn ess-btn--secondary ess-btn--sm">Link</button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="ess-help">Nothing unmatched in the last 30 days.</p>
	{/if}

	{#if data.links.length}
		<h3 class="ess-h3 sub">Set by hand (host accounts and matched names)</h3>
		<div class="ess-table-shell">
			<table class="ess-table">
				<thead><tr><th>Zoom email, user ID or name</th><th>Login</th><th></th></tr></thead>
				<tbody>
					{#each data.links as l (l.id)}
						<tr>
							<td>{l.zoomKey}</td>
							<td>{l.fullName}</td>
							<td>
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
	{/if}
</section>

<style>
	.gap {
		margin-bottom: 16px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 16px;
		margin-bottom: 16px;
	}
	.block {
		display: grid;
		gap: 12px;
		align-content: start;
	}
	.state {
		margin: 0;
		display: flex;
		gap: 8px;
		align-items: center;
		font-weight: 600;
	}
	.state.ok {
		color: var(--ess-success);
	}
	.state.warn {
		color: var(--ess-warning);
	}
	.kv {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 6px 16px;
		margin: 0;
		font-size: 13px;
	}
	.kv dt {
		color: var(--ess-text-muted);
	}
	.kv dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.err {
		color: var(--ess-danger);
	}
	.steps {
		margin: 0;
		padding-left: 20px;
		display: grid;
		gap: 6px;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.url {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
		padding: 8px 10px;
		border-radius: 10px;
		background: var(--ess-sunken);
	}
	.url code {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
		font-family: var(--ess-font-mono);
		font-size: 12.5px;
	}
	.link {
		display: flex;
		gap: 6px;
	}
	.link .ess-select {
		max-width: 260px;
	}
	.sub {
		margin-top: 8px;
	}
	.host-form {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto;
		gap: 10px;
		align-items: end;
	}
	@media (max-width: 720px) {
		.host-form {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
