<script lang="ts">
	import { goto } from '$app/navigation';
	import AuthLayout from '$lib/components/AuthLayout.svelte';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let submitting = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		submitting = true;
		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				error = body.message ?? 'Invalid email or password';
				return;
			}
			await goto('/dashboard');
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Sign in — Champ HR ESS Portal</title>
</svelte:head>

<AuthLayout
	headline="Champ HR ESS Portal"
	subtext="Transforming Employee Experience Through Digital HR"
	cardTitle="Sign in"
	cardSub="One Portal. One Login. Complete Employee Experience."
>
	<form onsubmit={handleSubmit}>
		<label>
			<span>Email</span>
			<input type="email" bind:value={email} required autocomplete="username" placeholder="you@champ-hr.local" />
		</label>

		<label>
			<span>Password</span>
			<input type="password" bind:value={password} required autocomplete="current-password" placeholder="••••••••" />
		</label>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<button type="submit" class="ess-btn ess-btn--primary submit-btn" disabled={submitting}>
			{submitting ? 'Signing in…' : 'Sign In'}
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
