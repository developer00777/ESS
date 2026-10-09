<script lang="ts">
	import { goto } from '$app/navigation';
	import Lock from '@lucide/svelte/icons/lock';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import AuthLayout from '$lib/components/AuthLayout.svelte';
	import StepTracker from '$lib/components/StepTracker.svelte';

	let { data } = $props();

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let show = $state({ current: false, next: false, confirm: false });
	let errorMsg = $state('');
	let submitting = $state(false);

	// Which step the person is on, for the small timeline beside the form.
	const step = $derived(confirmPassword.length > 0 ? 2 : newPassword.length > 0 ? 1 : 0);

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
	<title>Change password — Champ HR</title>
</svelte:head>

<AuthLayout
	centered
	headline="A fresh start, securely."
	subtext={data.required ? 'Your account was just created. Choose a permanent password to continue.' : 'Choose a new password for your account.'}
	cardTitle="Change password"
	cardSub={data.required ? 'This is required before you can open the portal.' : 'You will stay signed in on this device.'}
	back={data.required ? undefined : { href: '/profile', label: 'Back' }}
>
	<form onsubmit={handleSubmit}>
		<label>
			<span>{data.required ? 'Temporary password' : 'Current password'}</span>
			<span class="field">
				<KeyRound size={18} strokeWidth={1.75} />
				<input type={show.current ? 'text' : 'password'} bind:value={currentPassword} required autocomplete="current-password" placeholder="••••••••" />
				<button type="button" class="eye" onclick={() => (show.current = !show.current)} aria-label={show.current ? 'Hide' : 'Show'}>
					{#if show.current}<EyeOff size={18} />{:else}<Eye size={18} />{/if}
				</button>
			</span>
		</label>

		<label>
			<span>New password</span>
			<span class="field">
				<Lock size={18} strokeWidth={1.75} />
				<input type={show.next ? 'text' : 'password'} bind:value={newPassword} required minlength="8" autocomplete="new-password" placeholder="At least 8 characters" />
				<button type="button" class="eye" onclick={() => (show.next = !show.next)} aria-label={show.next ? 'Hide' : 'Show'}>
					{#if show.next}<EyeOff size={18} />{:else}<Eye size={18} />{/if}
				</button>
			</span>
			<span class="help">At least 8 characters.</span>
		</label>

		<label>
			<span>Confirm new password</span>
			<span class="field">
				<ShieldCheck size={18} strokeWidth={1.75} />
				<input type={show.confirm ? 'text' : 'password'} bind:value={confirmPassword} required minlength="8" autocomplete="new-password" placeholder="••••••••" />
				<button type="button" class="eye" onclick={() => (show.confirm = !show.confirm)} aria-label={show.confirm ? 'Hide' : 'Show'}>
					{#if show.confirm}<EyeOff size={18} />{:else}<Eye size={18} />{/if}
				</button>
			</span>
		</label>

		{#if errorMsg}
			<p class="error" role="alert">{errorMsg}</p>
		{/if}

		<div class="actions">
			<button type="submit" class="ess-btn ess-btn--primary submit-btn" disabled={submitting}>
				{submitting ? 'Updating…' : 'Update password'}
			</button>
			{#if !data.required}
				<a href="/profile" class="ess-btn ess-btn--secondary cancel">Cancel</a>
			{/if}
		</div>
	</form>

	{#snippet aside()}
		<StepTracker
			steps={[
				{ label: 'Current password', description: 'Confirm it is you' },
				{ label: 'New password', description: 'At least 8 characters' },
				{ label: 'Confirm', description: 'Type it once more' }
			]}
			currentIndex={step}
		/>
	{/snippet}
</AuthLayout>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.actions {
		display: grid;
		gap: 10px;
	}
	.cancel {
		justify-content: center;
		height: 48px;
	}
</style>
