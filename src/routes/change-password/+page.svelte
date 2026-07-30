<script lang="ts">
	import { goto } from '$app/navigation';

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

<div class="login-screen">
	<div class="deco deco-a"></div>
	<div class="deco deco-b"></div>
	<div class="deco deco-c"></div>

	<div class="login-content">
		<div class="brand-block">
			<span class="eyebrow-light">CHAMP HR</span>
			<h1>Set a new password</h1>
			<p>Your account was just created — choose a permanent password to continue.</p>
		</div>

		<form class="login-card" onsubmit={handleSubmit}>
			<h2>Change password</h2>
			<p class="sub">This is required before you can access the portal.</p>

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

			<button type="submit" class="btn btn-primary submit-btn" disabled={submitting}>
				{submitting ? 'Updating…' : 'Update Password'}
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
