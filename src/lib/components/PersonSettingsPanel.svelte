<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import Avatar from '$lib/components/Avatar.svelte';

	/**
	 * Every org setting for one employee, edited together and saved once.
	 *
	 * A slide-over rather than a page: the roster stays behind it, so closing
	 * returns you exactly where you were instead of losing your place in a
	 * thirteen-row table. Edits are held locally until Save, so backing out of a
	 * half-made change costs nothing.
	 */

	interface Person {
		id: string;
		fullName: string;
		email: string;
		employeeCode: string | null;
		hasPicture: boolean;
		role: string;
		reportsTo: string | null;
		hrUserId: string | null;
		shiftGroupId: string | null;
		officeTimings: string | null;
		shiftType: string | null;
		weekOffRosterId: string | null;
	}

	interface Props {
		person: Person;
		people: Array<{ id: string; fullName: string; role: string }>;
		shiftGroups: Array<{ id: string; name: string }>;
		rosters: Array<{ id: string; name: string; summary: string; status: string }>;
		roles: readonly string[];
		currentUserId: string;
		onclose: () => void;
		onsaved: () => void;
	}

	let { person, people, shiftGroups, rosters, roles, currentUserId, onclose, onsaved }: Props =
		$props();

	// Deliberately a one-time seed: these are draft values the user edits until
	// they hit Save, so they must NOT track the prop. The call site wraps this
	// component in {#key person.id}, which remounts it when a different row is
	// selected — that is what refreshes the fields.
	// svelte-ignore state_referenced_locally
	let role = $state(person.role);
	// svelte-ignore state_referenced_locally
	let reportsTo = $state(person.reportsTo ?? '');
	// svelte-ignore state_referenced_locally
	let hrUserId = $state(person.hrUserId ?? '');
	// svelte-ignore state_referenced_locally
	let shiftGroupId = $state(person.shiftGroupId ?? '');
	// svelte-ignore state_referenced_locally
	let officeTimings = $state(person.officeTimings ?? '');
	// svelte-ignore state_referenced_locally
	let shiftType = $state(person.shiftType ?? '');
	// svelte-ignore state_referenced_locally
	let weekOffRosterId = $state(person.weekOffRosterId ?? '');

	let saving = $state(false);
	let saveError = $state('');

	const isSelf = $derived(person.id === currentUserId);

	// Nobody can be their own manager or their own HR contact.
	const candidates = $derived(people.filter((p) => p.id !== person.id));

	const dirty = $derived(
		role !== person.role ||
			reportsTo !== (person.reportsTo ?? '') ||
			hrUserId !== (person.hrUserId ?? '') ||
			shiftGroupId !== (person.shiftGroupId ?? '') ||
			officeTimings !== (person.officeTimings ?? '') ||
			shiftType !== (person.shiftType ?? '') ||
			weekOffRosterId !== (person.weekOffRosterId ?? '')
	);

	async function save() {
		saveError = '';
		saving = true;
		try {
			const res = await fetch(`/api/admin/users/${person.id}/settings`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					// Role is omitted on your own row: the server refuses it, and
					// sending an unchanged value would be a needless no-op.
					...(isSelf ? {} : { role }),
					reportsTo: reportsTo || null,
					hrUserId: hrUserId || null,
					shiftGroupId: shiftGroupId || null,
					officeTimings,
					shiftType,
					weekOffRosterId: weekOffRosterId || null
				})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				saveError = body.message ?? 'Could not save these settings';
				return;
			}
			onsaved();
		} finally {
			saving = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Clicking the backdrop closes, matching how every other slide-over behaves. -->
<div
	class="backdrop"
	role="button"
	tabindex="-1"
	aria-label="Close panel"
	onclick={onclose}
	onkeydown={(e) => e.key === 'Enter' && onclose()}
></div>

<aside class="panel" aria-label="Settings for {person.fullName}">
	<header class="panel-head">
		<div class="who">
			<Avatar userId={person.id} fullName={person.fullName} hasPicture={person.hasPicture} size="sm" />
			<div class="who-text">
				<strong>{person.fullName}</strong>
				<span class="meta">{person.employeeCode ?? 'No code'} · {person.email}</span>
			</div>
		</div>
		<button type="button" class="close-btn" onclick={onclose} aria-label="Close">
			<X size={18} />
		</button>
	</header>

	<div class="panel-body">
		<section class="group">
			<h3>Organisation</h3>

			<label class="field">
				<span class="label">Role</span>
				{#if isSelf}
					<span class="static-value">{role.replace('_', ' ')}</span>
					<span class="hint">You cannot change your own role.</span>
				{:else}
					<select class="ess-select" bind:value={role}>
						{#each roles as r (r)}
							<option value={r}>{r.replace('_', ' ')}</option>
						{/each}
					</select>
				{/if}
			</label>

			<label class="field">
				<span class="label">Reports to</span>
				<select class="ess-select" bind:value={reportsTo}>
					<option value="">— not set —</option>
					{#each candidates as p (p.id)}
						<option value={p.id}>{p.fullName} ({p.role.replace('_', ' ')})</option>
					{/each}
				</select>
				<span class="hint">Gives the first approval on leave, comp-off and attendance corrections.</span>
			</label>

			<label class="field">
				<span class="label">Concerned HR</span>
				<select class="ess-select" bind:value={hrUserId}>
					<option value="">— any admin —</option>
					{#each candidates as p (p.id)}
						<option value={p.id}>{p.fullName} ({p.role.replace('_', ' ')})</option>
					{/each}
				</select>
				<span class="hint">
					Handles the second approval. Other admins can still act, so nothing stalls if they are away.
				</span>
			</label>
		</section>

		<section class="group">
			<h3>Schedule</h3>

			<label class="field">
				<span class="label">Shift group</span>
				<select class="ess-select" class:unset={!shiftGroupId} bind:value={shiftGroupId}>
					<option value="">— not set —</option>
					{#each shiftGroups as g (g.id)}
						<option value={g.id}>{g.name}</option>
					{/each}
				</select>
				<span class="hint">Resolves which holiday calendar applies.</span>
			</label>

			<label class="field">
				<span class="label">Shift type</span>
				<input class="ess-input" bind:value={shiftType} placeholder="e.g. Day Shift" />
			</label>

			<label class="field">
				<span class="label">Office timings</span>
				<input class="ess-input" bind:value={officeTimings} placeholder="e.g. 9:00 AM - 6:00 PM" />
				<span class="hint">Bounds how far a check-out may sit from its check-in on a night shift.</span>
			</label>

			<label class="field">
				<span class="label">Week-off roster</span>
				<select class="ess-select" bind:value={weekOffRosterId}>
					<option value="">Saturday + Sunday (default)</option>
					{#each rosters as r (r.id)}
						<option value={r.id}>
							{r.name}{r.status === 'published' ? '' : ' (draft)'} — {r.summary}
						</option>
					{/each}
				</select>
				<span class="hint">Reflects on this employee's leave and attendance calendars.</span>
			</label>
		</section>
	</div>

	<footer class="panel-foot">
		{#if saveError}
			<p class="ess-error">{saveError}</p>
		{/if}
		<div class="actions">
			<button type="button" class="ess-btn ess-btn--ghost" onclick={onclose} disabled={saving}>
				Cancel
			</button>
			<button
				type="button"
				class="ess-btn ess-btn--primary"
				onclick={save}
				disabled={saving || !dirty}
			>
				{saving ? 'Saving…' : dirty ? 'Save changes' : 'No changes'}
			</button>
		</div>
	</footer>
</aside>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 0.4);
		border: none;
		padding: 0;
		z-index: 40;
		animation: fade var(--ess-t-fast) ease-out;
	}

	.panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(440px, 100vw);
		background: var(--ess-surface);
		border-left: 1px solid var(--ess-border);
		box-shadow: -12px 0 32px rgb(0 0 0 / 0.18);
		display: flex;
		flex-direction: column;
		z-index: 41;
		animation: slide-in 180ms cubic-bezier(0.32, 0.72, 0, 1);
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
	}

	@keyframes slide-in {
		from {
			transform: translateX(100%);
		}
	}

	/* Respect a reduced-motion preference — the panel still appears, it just
	   does not travel. */
	@media (prefers-reduced-motion: reduce) {
		.panel,
		.backdrop {
			animation: none;
		}
	}

	.panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 18px 20px;
		border-bottom: 1px solid var(--ess-border);
	}

	.who {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.who-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.who-text .meta {
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.close-btn {
		background: transparent;
		border: none;
		color: var(--ess-text-muted);
		cursor: pointer;
		padding: 4px;
		border-radius: 6px;
		display: inline-flex;
		flex-shrink: 0;
	}

	.close-btn:hover {
		color: var(--ess-text);
		background: var(--ess-sunken);
	}

	.panel-body {
		flex: 1;
		overflow-y: auto;
		padding: 18px 20px;
	}

	.group + .group {
		margin-top: 1.75rem;
	}

	.group h3 {
		font-size: var(--ess-fs-eyebrow);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ess-text-secondary);
		margin-bottom: 0.85rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 1rem;
	}

	.label {
		font-size: var(--ess-fs-caption);
		font-weight: 600;
		color: var(--ess-text);
	}

	.hint {
		font-size: 0.72rem;
		color: var(--ess-text-secondary);
		line-height: 1.4;
	}

	.static-value {
		text-transform: capitalize;
		color: var(--ess-text-secondary);
		padding: 6px 0;
	}

	/* Unassigned leaves the employee with no holiday calendar — a real problem,
	   so it reads as a warning rather than a neutral empty value. */
	.unset {
		color: var(--ess-warning);
		border-color: var(--ess-warning);
	}

	.panel-foot {
		border-top: 1px solid var(--ess-border);
		padding: 14px 20px;
		background: var(--ess-sunken);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.panel-foot .ess-error {
		margin-bottom: 10px;
	}

	@media (max-width: 520px) {
		.panel {
			width: 100vw;
		}
	}
</style>
