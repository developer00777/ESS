<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import PageHeader from '$lib/components/PageHeader.svelte';
</script>

<svelte:head>
	<title>Payroll — Champ HR</title>
</svelte:head>

<PageHeader crumb={['Payroll']} title="Your payslips, when they’re ready." sub="Payroll is not available in the portal yet." compact />

<section class="empty ess-card ess-fill">
	<div class="art" aria-hidden="true">
		<span class="doc"><FileText size={36} strokeWidth={1.5} /></span>
		<svg class="line" viewBox="0 0 320 60">
			<path d="M0 50 C 60 50, 80 40, 100 24 S 150 10, 180 20 S 260 50, 320 10" fill="none" stroke="var(--ess-primary-soft)" stroke-width="2" />
			<circle cx="100" cy="24" r="6" fill="var(--ess-primary-soft)" />
			<circle cx="180" cy="20" r="6" fill="var(--ess-primary)" />
			<circle cx="320" cy="10" r="6" fill="var(--ess-primary-soft)" />
		</svg>
	</div>
	<h2 class="ess-h2">Payroll is not available yet</h2>
	<p>Your HR team will let you know when payslips are published here. Until then, payroll questions go to HR directly.</p>
	<div class="actions">
		<a href="/hr-contacts" class="ess-btn ess-btn--primary">Contact HR</a>
		<a href="/dashboard" class="ess-btn ess-btn--secondary">Return to Today</a>
	</div>
</section>

<style>
	/* One card that fills the workspace with its message centred, so the
	   page ends where the screen does. */
	.empty {
		padding: 32px 24px;
		display: grid;
		justify-items: center;
		align-content: center;
		text-align: center;
		gap: 10px;
	}
	.art {
		display: grid;
		justify-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}
	.doc {
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		border-radius: 16px;
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}
	.line {
		width: 260px;
		max-width: 100%;
	}
	p {
		max-width: 46ch;
		color: var(--ess-text-secondary);
		font-size: 14px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 10px;
		margin-top: 8px;
	}
</style>
