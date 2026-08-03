<script lang="ts">
	import User from '@lucide/svelte/icons/user';
	import Briefcase from '@lucide/svelte/icons/briefcase';
	import Banknote from '@lucide/svelte/icons/banknote';
	import FileText from '@lucide/svelte/icons/file-text';
	import Users from '@lucide/svelte/icons/users';
	import Phone from '@lucide/svelte/icons/phone';
	import Shield from '@lucide/svelte/icons/shield';
	import Check from '@lucide/svelte/icons/check';
	import ProfileCard from '$lib/components/ProfileCard.svelte';
	import { enhance } from '$app/forms';

	let { data } = $props();

	let editing = $state(false);
	let phone = $state(data.profile?.phone ?? '');
	let personalEmail = $state(data.profile?.personalEmail ?? '');
	let address = $state(data.profile?.address ?? '');
	let permanentAddress = $state(data.profile?.permanentAddress ?? '');
	let emergencyContactName = $state(data.profile?.emergencyContactName ?? '');
	let emergencyContactRelationship = $state(data.profile?.emergencyContactRelationship ?? '');
	let emergencyContactPhone = $state(data.profile?.emergencyContactPhone ?? '');
	let fatherName = $state(data.profile?.fatherName ?? '');
	let motherName = $state(data.profile?.motherName ?? '');
	let maritalStatus = $state(data.profile?.maritalStatus ?? '');
	let spouseName = $state(data.profile?.spouseName ?? '');
	let bankAccountNumber = $state(data.profile?.bankAccountNumber ?? '');
	let bankAccountHolderName = $state(data.profile?.bankAccountHolderName ?? '');
	let bankName = $state(data.profile?.bankName ?? '');
	let bankIfsc = $state(data.profile?.bankIfsc ?? '');
	let aadharNumber = $state(data.profile?.aadharNumber ?? '');
	let panNumber = $state(data.profile?.panNumber ?? '');
	let uanNumber = $state(data.profile?.uanNumber ?? '');
</script>

<svelte:head>
	<title>My Profile — Champ HR ESS Portal</title>
</svelte:head>

<header class="page-header">
	<h1 class="ess-page-title">Employee Profile</h1>
	<p class="ess-page-sub">"My Profile" — a single source of truth for personal data</p>
</header>

<form
	method="POST"
	action="?/updateSelfService"
	use:enhance={() => {
		return async ({ update }) => {
			await update();
			editing = false;
		};
	}}
>
	<div class="profile-grid">
		<ProfileCard icon={User} title="Personal Information">
			{#if editing}
				<label>Phone <input name="phone" bind:value={phone} /></label>
				<label>Personal Email <input name="personalEmail" bind:value={personalEmail} /></label>
				<label>Address <input name="address" bind:value={address} /></label>
				<label>Permanent Address <input name="permanentAddress" bind:value={permanentAddress} /></label>
			{:else}
				<p>{data.profile?.phone || 'No phone on file'}</p>
				<p>{data.profile?.personalEmail || data.userRow.email}</p>
				<p>{data.profile?.address || 'No address on file'}</p>
				{#if data.profile?.gender || data.profile?.bloodGroup}
					<p class="muted">{[data.profile?.gender, data.profile?.bloodGroup].filter(Boolean).join(' · ')}</p>
				{/if}
			{/if}
		</ProfileCard>

		<ProfileCard icon={Briefcase} title="Job Information">
			<p><strong>Employee code:</strong> <span class="emp-code">{data.profile?.employeeCode || '—'}</span></p>
			<p><strong>Designation:</strong> {data.profile?.designation || '—'}</p>
			<p><strong>Team:</strong> {data.profile?.teamAndFloor || '—'}</p>
			<p><strong>Floor:</strong> {data.profile?.floorDetails || '—'}</p>
			<p><strong>Joined:</strong> {data.profile?.dateOfJoining || '—'}</p>
			<p><strong>Shift:</strong> {data.profile?.shiftType || '—'} ({data.profile?.officeTimings || '—'})</p>
			<p><strong>Reports to:</strong> {data.profile?.directReportingAuthority || '—'}</p>
			<p class="hr-locked">HR-locked fields</p>
		</ProfileCard>

		<ProfileCard icon={Banknote} title="Bank Details">
			{#if editing}
				<label>Account No. <input name="bankAccountNumber" bind:value={bankAccountNumber} /></label>
				<label>Account Holder <input name="bankAccountHolderName" bind:value={bankAccountHolderName} /></label>
				<label>Bank Name <input name="bankName" bind:value={bankName} /></label>
				<label>IFSC <input name="bankIfsc" bind:value={bankIfsc} /></label>
			{:else}
				<p>{data.profile?.bankAccountNumber ? '•••• ' + data.profile.bankAccountNumber.slice(-4) : 'Not added'}</p>
				<p>{data.profile?.bankName || ''}</p>
				<p>{data.profile?.bankIfsc || ''}</p>
			{/if}
		</ProfileCard>

		<ProfileCard icon={FileText} title="Government IDs">
			{#if editing}
				<label>Aadhar Number <input name="aadharNumber" bind:value={aadharNumber} /></label>
				<label>PAN Number <input name="panNumber" bind:value={panNumber} /></label>
				<label>UAN Number <input name="uanNumber" bind:value={uanNumber} /></label>
			{:else}
				<p>Aadhar: {data.profile?.aadharNumber ? '•••• ' + String(data.profile.aadharNumber).slice(-4) : 'Not added'}</p>
				<p>PAN: {data.profile?.panNumber || 'Not added'}</p>
				<p>UAN: {data.profile?.uanNumber || 'Not added'}</p>
			{/if}
		</ProfileCard>

		<ProfileCard icon={Users} title="Family Details">
			{#if editing}
				<label>Father's Name <input name="fatherName" bind:value={fatherName} /></label>
				<label>Mother's Name <input name="motherName" bind:value={motherName} /></label>
				<label>Marital Status <input name="maritalStatus" bind:value={maritalStatus} /></label>
				<label>Spouse Name <input name="spouseName" bind:value={spouseName} /></label>
			{:else}
				<p>Father: {data.profile?.fatherName || 'Not added'}</p>
				<p>Mother: {data.profile?.motherName || 'Not added'}</p>
				<p>{data.profile?.maritalStatus || 'Not added'}{data.profile?.spouseName ? ` · ${data.profile.spouseName}` : ''}</p>
			{/if}
		</ProfileCard>

		<ProfileCard icon={Phone} title="Emergency Contacts">
			{#if editing}
				<label>Name <input name="emergencyContactName" bind:value={emergencyContactName} /></label>
				<label>Relationship <input name="emergencyContactRelationship" bind:value={emergencyContactRelationship} /></label>
				<label>Phone <input name="emergencyContactPhone" bind:value={emergencyContactPhone} /></label>
			{:else}
				<p>{data.profile?.emergencyContactName || 'Not added'}</p>
				<p>{data.profile?.emergencyContactRelationship || ''}</p>
				<p>{data.profile?.emergencyContactPhone || ''}</p>
			{/if}
		</ProfileCard>

		<ProfileCard icon={Shield} title="Benefits">
			<p>Insurance, PF, ESI, Gratuity</p>
		</ProfileCard>
	</div>

	<div class="edit-actions">
		{#if editing}
			<button type="submit" class="ess-btn ess-btn--primary">Save Changes</button>
			<button type="button" class="ess-btn ess-btn--ghost" onclick={() => (editing = false)}>Cancel</button>
		{:else}
			<button type="button" class="ess-btn ess-btn--primary" onclick={() => (editing = true)}>
				Edit My Details
			</button>
		{/if}
	</div>
</form>

<div class="benefit-banner">
	<div class="benefit-item">
		<span class="badge"><Check size={16} /></span>
		<span>Self-service profile updates</span>
	</div>
	<div class="benefit-item">
		<span class="badge"><Check size={16} /></span>
		<span>Reduced HR dependency</span>
	</div>
	<div class="benefit-item">
		<span class="badge"><Check size={16} /></span>
		<span>Accurate employee records</span>
	</div>
</div>

<style>
	.page-header {
		margin-bottom: 1.5rem;
	}

	.profile-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 1.1rem;
	}

	.profile-grid label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.78rem;
		font-weight: 600;
	}

	.profile-grid input {
		border: 1px solid var(--ess-border-strong);
		border-radius: var(--ess-radius-sm);
		padding: 0.4rem 0.55rem;
		font-size: 0.85rem;
		font-family: inherit;
		color: var(--ess-text);
		background: var(--ess-surface);
	}

	.hr-locked {
		font-size: 0.72rem;
		color: var(--ess-text-muted);
		font-style: italic;
	}

	.emp-code {
		font-family: var(--ess-font-mono);
		letter-spacing: 0.02em;
	}

	.muted {
		font-size: 0.78rem;
		color: var(--ess-text-muted);
	}

	.edit-actions {
		margin-top: 1.25rem;
		display: flex;
		gap: 0.75rem;
	}

	.benefit-banner {
		margin-top: 2rem;
		background: var(--ess-inverse);
		border-radius: var(--ess-radius-lg);
		padding: 1.5rem 2rem;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1.5rem;
	}

	.benefit-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--ess-text-inverse);
		font-weight: 600;
		font-size: 0.9rem;
	}

	.badge {
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		border-radius: 50%;
		background: linear-gradient(150deg, var(--acc2), var(--acc));
		color: var(--ess-text-on-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.5),
			0 6px 16px -8px var(--glow);
	}
</style>
