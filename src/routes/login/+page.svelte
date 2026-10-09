<script lang="ts">
	import { goto } from '$app/navigation';
	import Mail from '@lucide/svelte/icons/mail';
	import Lock from '@lucide/svelte/icons/lock';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Info from '@lucide/svelte/icons/info';
	import AuthLayout from '$lib/components/AuthLayout.svelte';

	let email = $state('');
	let password = $state('');
	let show = $state(false);
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
	<title>Sign in — Champ HR</title>
</svelte:head>

<AuthLayout
	headline="Welcome to your workday."
	subtext="People. Progress. Possibility."
	cardTitle="Sign in"
	cardSub="Access your Champ HR account to manage your leave, attendance and more."
>
	<form onsubmit={handleSubmit}>
		<label>
			<span>Work email</span>
			<span class="field">
				<Mail size={18} strokeWidth={1.75} />
				<input type="email" bind:value={email} required autocomplete="username" placeholder="you@company.com" />
			</span>
		</label>

		<label>
			<span>Password</span>
			<span class="field">
				<Lock size={18} strokeWidth={1.75} />
				<input type={show ? 'text' : 'password'} bind:value={password} required autocomplete="current-password" placeholder="••••••••••" />
				<button type="button" class="eye" onclick={() => (show = !show)} aria-label={show ? 'Hide password' : 'Show password'}>
					{#if show}<EyeOff size={18} />{:else}<Eye size={18} />{/if}
				</button>
			</span>
		</label>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<button type="submit" class="ess-btn ess-btn--primary submit-btn" disabled={submitting}>
			{submitting ? 'Signing in…' : 'Sign in'}
			{#if !submitting}<ArrowRight size={18} />{/if}
		</button>
	</form>

	<div class="note">
		<span class="i"><Info size={18} /></span>
		<div>
			<strong>Need access?</strong>
			Your login is created by HR. Contact your HR team to request an account or get help signing in.
		</div>
	</div>
</AuthLayout>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
</style>
