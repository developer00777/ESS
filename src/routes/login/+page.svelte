<script lang="ts">
	import { goto } from '$app/navigation';

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

<div class="login-screen">
	<div class="deco deco-a"></div>
	<div class="deco deco-b"></div>
	<div class="deco deco-c"></div>

	<div class="login-content">
		<div class="brand-block">
			<span class="eyebrow-light">CHAMP HR</span>
			<h1>Champ HR ESS Portal</h1>
			<p>Transforming Employee Experience Through Digital HR</p>
		</div>

		<form class="login-card" onsubmit={handleSubmit}>
			<h2>Sign in</h2>
			<p class="sub">One Portal. One Login. Complete Employee Experience.</p>

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

			<button type="submit" class="btn btn-primary submit-btn" disabled={submitting}>
				{submitting ? 'Signing in…' : 'Sign In'}
			</button>
		</form>
	</div>
</div>

<style>
	.login-screen {
		min-height: 100vh;
		background: var(--color-ink);
		position: relative;
		overflow: hidden;
		display: flex;
		align-items: center;
	}

	.deco {
		position: absolute;
		border-radius: 50%;
		opacity: 0.9;
	}

	.deco-a {
		width: 420px;
		height: 420px;
		background: var(--color-primary);
		top: 55%;
		right: -10%;
	}

	.deco-b {
		width: 260px;
		height: 260px;
		background: var(--color-accent);
		top: 68%;
		right: 4%;
	}

	.deco-c {
		width: 260px;
		height: 260px;
		background: var(--color-accent-alt);
		top: -12%;
		left: -8%;
	}

	.login-content {
		position: relative;
		z-index: 1;
		width: 100%;
		max-width: 1100px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: 1.1fr 0.9fr;
		gap: 3rem;
		align-items: center;
		padding: 2rem;
	}

	.brand-block {
		color: var(--color-text-inverse);
	}

	.eyebrow-light {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--color-accent);
	}

	.brand-block h1 {
		font-size: 2.6rem;
		font-weight: 800;
		margin: 0.5rem 0 0.75rem;
		line-height: 1.15;
	}

	.brand-block p {
		font-size: 1.05rem;
		color: rgba(242, 248, 247, 0.75);
		max-width: 30ch;
	}

	.login-card {
		background: var(--color-white);
		border-radius: var(--radius-lg);
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
	}

	.login-card h2 {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--color-ink);
	}

	.sub {
		font-size: 0.85rem;
		color: var(--color-text-soft);
		margin-top: -0.5rem;
		margin-bottom: 0.25rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-ink);
	}

	input {
		border: 1px solid #d7e6e4;
		border-radius: var(--radius-sm);
		padding: 0.65rem 0.8rem;
		font-size: 0.95rem;
	}

	input:focus {
		outline: 2px solid var(--color-primary);
		outline-offset: 1px;
	}

	.error {
		color: var(--color-danger);
		font-size: 0.85rem;
	}

	.submit-btn {
		justify-content: center;
		margin-top: 0.5rem;
	}

	@media (max-width: 860px) {
		.login-content {
			grid-template-columns: 1fr;
		}
	}
</style>
