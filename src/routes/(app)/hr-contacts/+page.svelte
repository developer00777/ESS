<script lang="ts">
	import Headset from '@lucide/svelte/icons/headset';
	import Mail from '@lucide/svelte/icons/mail';

	let { data } = $props();

	const roleLabel: Record<string, string> = {
		super_admin: 'Super Admin',
		team_lead: 'Team Lead',
		employee: 'Employee'
	};
</script>

<svelte:head>
	<title>HR Contacts — Champ HR ESS Portal</title>
</svelte:head>

<header class="page-header">
	<h1 class="section-title">HR Contacts</h1>
	<p class="section-subtitle">Direct line to the right HR representative</p>
</header>

<div class="contacts-grid">
	{#each data.contacts as contact (contact.id)}
		<div class="contact-card">
			<div class="contact-icon"><Headset size={20} /></div>
			<div class="contact-body">
				<strong>{contact.fullName}</strong>
				<span class="role">{contact.designation || roleLabel[contact.role]}</span>
				<a href="mailto:{contact.email}" class="email-link">
					<Mail size={14} />
					{contact.email}
				</a>
				{#if contact.officeTimings}
					<span class="timings">Available: {contact.officeTimings}</span>
				{/if}
			</div>
		</div>
	{:else}
		<p class="empty">No HR contacts on file yet.</p>
	{/each}
</div>

<style>
	.page-header {
		margin-bottom: 1.5rem;
	}

	.contacts-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1.1rem;
		max-width: 900px;
	}

	.contact-card {
		background: var(--color-mint);
		border-radius: var(--radius-md);
		padding: 1.25rem;
		display: flex;
		gap: 1rem;
	}

	.contact-icon {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		border-radius: var(--radius-sm);
		background: var(--color-white);
		color: var(--color-primary);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.contact-body {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}

	.contact-body strong {
		font-size: 0.95rem;
		color: var(--color-ink);
	}

	.role {
		font-size: 0.78rem;
		color: var(--color-text-soft);
	}

	.email-link {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.82rem;
		color: var(--color-primary);
		text-decoration: none;
		margin-top: 0.25rem;
	}

	.email-link:hover {
		text-decoration: underline;
	}

	.timings {
		font-size: 0.75rem;
		color: var(--color-muted);
		margin-top: 0.1rem;
	}

	.empty {
		color: var(--color-text-soft);
		font-size: 0.9rem;
	}
</style>
