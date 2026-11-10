<script lang="ts">
	import { goto } from '$app/navigation';
	import Mail from '@lucide/svelte/icons/mail';
	import Lock from '@lucide/svelte/icons/lock';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ArrowBigUp from '@lucide/svelte/icons/arrow-big-up';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import AuthLayout from '$lib/components/AuthLayout.svelte';
	import { SignIn } from 'svelte-clerk';

	// Set by the root layout while Clerk is the sign-in (AUTH_PROVIDER=clerk).
	let { data } = $props();

	let email = $state('');
	let password = $state('');
	let show = $state(false);
	let error = $state('');
	let submitting = $state(false);
	let capsLock = $state(false);

	// A light check for the tick beside the email; the server still decides.
	const emailLooksValid = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email));
	// Both fields filled: the button gives one soft pulse to say it's ready.
	const ready = $derived(emailLooksValid && password.length > 0);

	// Server messages arrive with and without a closing full stop; show them
	// all as sentences.
	function sentence(text: string) {
		return /[.!?]$/.test(text) ? text : `${text}.`;
	}

	function trackCaps(e: KeyboardEvent) {
		capsLock = e.getModifierState?.('CapsLock') ?? false;
	}

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
				error = body.message ? sentence(body.message) : 'Incorrect email or password. Please try again.';
				return;
			}
			await goto('/dashboard');
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Log in — Champ HR</title>
</svelte:head>

<AuthLayout
	headline="Welcome to your workday."
	subtext="Attendance, leave, payroll and your team, all in one place."
	cardTitle="Log in"
	cardSub="Use your Work Email and Password to access your leave, attendance and more."
	busy={submitting ? 'Logging you in…' : undefined}
>
	{#if data.clerk && data.noPortalAccount}
		<form method="POST" action="/logout">
			<p class="error" role="alert">
				<CircleAlert size={16} />
				<span>This email isn't set up on Champ HR, or its access has been turned off. Ask HR to add you, then log in again.</span>
			</p>
			<button type="submit" class="ess-btn ess-btn--primary submit-btn">Use a different email <ArrowRight size={16} /></button>
		</form>
	{:else if data.clerk}
		<div class="clerk-signin">
			<SignIn routing="hash" fallbackRedirectUrl="/dashboard" />
		</div>
	{:else}
		<form onsubmit={handleSubmit}>
			<label>
				<span class="label-text">Work Email</span>
				<span class="field field--rich">
					<span class="field-icon" aria-hidden="true"><Mail size={18} strokeWidth={1.8} /></span>
					<input type="email" bind:value={email} required autocomplete="username" placeholder="name@company.com" />
					{#if emailLooksValid}
						<span class="field-ok" aria-hidden="true"><CircleCheck size={17} strokeWidth={2.2} /></span>
					{/if}
				</span>
			</label>

			<label>
				<span class="label-text">Password</span>
				<span class="field field--rich">
					<span class="field-icon" aria-hidden="true"><Lock size={18} strokeWidth={1.8} /></span>
					<input
						type={show ? 'text' : 'password'}
						bind:value={password}
						required
						autocomplete="current-password"
						placeholder="Enter your password"
						onkeydown={trackCaps}
						onkeyup={trackCaps}
						onblur={() => (capsLock = false)}
					/>
					<button type="button" class="eye" onclick={() => (show = !show)} aria-label={show ? 'Hide password' : 'Show password'}>
						{#key show}
							<span class="eye-swap">{#if show}<EyeOff size={18} />{:else}<Eye size={18} />{/if}</span>
						{/key}
					</button>
				</span>
				{#if capsLock}
					<span class="caps" role="status"><ArrowBigUp size={14} strokeWidth={2.2} /> Caps Lock is on</span>
				{/if}
			</label>

			{#if error}
				<p class="error" role="alert"><CircleAlert size={16} /><span>{error}</span></p>
			{/if}

			<button type="submit" class="ess-btn ess-btn--primary submit-btn" class:ready disabled={submitting}>
				{#if submitting}
					<span class="spin"><LoaderCircle size={18} /></span> Logging in…
				{:else}
					Log in <span class="arrow"><ArrowRight size={18} /></span>
				{/if}
			</button>
		</form>
	{/if}

	<p class="note"><strong>Need access?</strong> Accounts are set up by HR. Contact your HR team to request one or to get help logging in.</p>
</AuthLayout>

<style>
	.clerk-signin {
		display: flex;
		justify-content: center;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	/* ---------- inputs ----------
	   One 1px box with the icon inside it. On focus the border, the icon and
	   the label turn blue and a soft ring fades in. */
	.label-text {
		font-size: 13.5px;
		font-weight: 600;
		color: var(--lg-ink);
		transition: color 200ms ease;
	}
	label:focus-within .label-text {
		color: var(--lg-blue-a);
	}
	.field {
		position: relative;
		display: flex;
		align-items: center;
		height: clamp(46px, 6.2vh, 50px);
		padding: 0 4px 0 2px;
		border-radius: var(--lg-radius-field, 10px);
		border: 1px solid var(--lg-field-border);
		background: var(--lg-field);
		transition:
			border-color 200ms ease,
			box-shadow 200ms ease;
	}
	.field:hover {
		border-color: color-mix(in srgb, var(--lg-ink) 32%, var(--lg-field-border));
	}
	.field:focus-within {
		border-color: var(--lg-blue-a);
		box-shadow: 0 0 0 3px var(--lg-ring);
	}
	.field-icon {
		flex: none;
		display: grid;
		place-items: center;
		width: 40px;
		height: 100%;
		color: var(--lg-faint);
		transition:
			color 200ms ease,
			transform 250ms var(--lg-ease);
	}
	.field:focus-within .field-icon {
		color: var(--lg-blue-a);
		transform: scale(1.08);
	}
	/* .field input beats the layout's own input styles */
	.field input {
		flex: 1;
		min-width: 0;
		height: 100%;
		padding: 0 8px 0 0;
		border: none;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
		font-size: 15px;
		color: var(--lg-ink);
	}
	.field input:focus,
	.field input:hover {
		outline: none;
		border: none;
		box-shadow: none;
		background: transparent;
	}
	.field-ok {
		flex: none;
		display: grid;
		place-items: center;
		margin-right: 10px;
		color: #12a36b;
	}
	.field .eye {
		flex: none;
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--lg-faint);
		cursor: pointer;
		transition:
			background-color 200ms ease,
			color 200ms ease;
	}
	.field .eye:hover {
		color: var(--lg-ink);
		background: var(--lg-soft);
	}
	.field .eye:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px var(--lg-ring);
	}
	.eye-swap {
		display: grid;
		place-items: center;
	}
	.caps {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		margin-top: 2px;
		font-size: 12.5px;
		font-weight: 600;
		color: #b45309;
	}
	:global([data-ess-theme='dark']) .caps {
		color: #fbbf24;
	}

	/* ---------- error ---------- */
	.error {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 0;
		padding: 10px 12px;
		border-radius: var(--lg-radius-field, 10px);
		border: 1px solid color-mix(in srgb, var(--ess-danger) 30%, transparent);
		background: color-mix(in srgb, var(--ess-danger) 7%, transparent);
		line-height: 1.45;
	}
	.error :global(svg) {
		flex: none;
		margin-top: 2px;
	}

	/* ---------- the button ---------- */
	.arrow {
		display: inline-grid;
	}

	/* ---------- motion ----------
	   Each animation states its length with !important: the app shortens
	   every animation to 0.01ms under reduced motion (ess-components.css),
	   and these small, contained ones are meant to play there too. */
	.eye-swap {
		animation: swap 240ms ease both;
		animation-duration: 240ms !important;
	}
	.field-ok {
		animation: pop 380ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
		animation-duration: 380ms !important;
	}
	.caps {
		animation: slide-in 260ms ease both;
		animation-duration: 260ms !important;
	}
	.error {
		animation:
			slide-in 260ms ease both,
			shake 420ms cubic-bezier(0.36, 0.07, 0.19, 0.97) 120ms both;
		animation-duration: 260ms, 420ms !important;
	}
	/* One soft ring when the form becomes ready to send. It lives on its own
	   layer so the button's entrance animation is never replaced (and so
	   never replays when a field is cleared). */
	.submit-btn {
		position: relative;
	}
	.submit-btn::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		pointer-events: none;
	}
	.submit-btn.ready:not(:disabled)::after {
		animation: ready 1100ms ease-out;
		animation-duration: 1100ms !important;
	}
	.spin {
		display: inline-grid;
		animation: spin 800ms linear infinite;
		animation-duration: 800ms !important;
	}
	.label-text,
	.field,
	.field-icon,
	.field .eye {
		transition-duration: 200ms !important;
	}

	@keyframes swap {
		from {
			opacity: 0;
			transform: scale(0.7);
		}
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: scale(0.4);
		}
	}
	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	@keyframes shake {
		20%,
		60% {
			transform: translateX(-4px);
		}
		40%,
		80% {
			transform: translateX(4px);
		}
	}
	@keyframes ready {
		from {
			box-shadow: 0 0 0 0 color-mix(in srgb, var(--lg-btn) 45%, transparent);
		}
		to {
			box-shadow: 0 0 0 10px color-mix(in srgb, var(--lg-btn) 0%, transparent);
		}
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
