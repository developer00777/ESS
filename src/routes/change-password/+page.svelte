<script lang="ts">
	import { goto } from '$app/navigation';
	import AuthLayout from '$lib/components/AuthLayout.svelte';

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let errorMsg = $state('');
	let submitting = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		errorMsg = '';

		if (newPassword !== confirmPassword) {
			errorMsg = 'New password and confirmation do not match';
			return;
		}

		submitting = true;
		try {
			const res = await fetch('/api/auth/change-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ currentPassword, newPassword })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				errorMsg = body.message ?? 'Could not update password';
				return;
			}
			await goto('/dashboard');
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Change Password — Champ HR ESS Portal</title>
</svelte:head>

<AuthLayout
	headline="Set a new password"
	subtext="Your account was just created — choose a permanent password to continue."
	cardTitle="Change password"
	cardSub="This is required before you can access the portal."
>
	<form onsubmit={handleSubmit}>
		<label>
			<span>Temporary password</span>
			<input
				type="password"
				bind:value={currentPassword}
				required
				autocomplete="current-password"
				placeholder="••••••••"
			/>
		</label>

		<label>
			<span>New password</span>
			<input
				type="password"
				bind:value={newPassword}
				required
				minlength="8"
				autocomplete="new-password"
				placeholder="At least 8 characters"
			/>
		</label>

		<label>
			<span>Confirm new password</span>
			<input
				type="password"
				bind:value={confirmPassword}
				required
				minlength="8"
				autocomplete="new-password"
				placeholder="••••••••"
			/>
		</label>

		{#if errorMsg}
			<p class="error">{errorMsg}</p>
		{/if}

		<button type="submit" class="ess-btn ess-btn--primary submit-btn" disabled={submitting}>
			{submitting ? 'Updating…' : 'Update Password'}
		</button>
	</form>
</AuthLayout>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
