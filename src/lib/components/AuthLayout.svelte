<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		headline: string;
		subtext: string;
		cardTitle: string;
		cardSub: string;
		children: Snippet;
	}

	let { headline, subtext, cardTitle, cardSub, children }: Props = $props();
</script>

<div class="login-screen">
	<div class="deco deco-a"></div>
	<div class="deco deco-b"></div>
	<div class="deco deco-c"></div>

	<div class="login-content">
		<div class="brand-block">
			<span class="eyebrow-light">CHAMP HR</span>
			<h1>{headline}</h1>
			<p>{subtext}</p>
		</div>

		<div class="login-card">
			<h2>{cardTitle}</h2>
			<p class="sub">{cardSub}</p>
			{@render children()}
		</div>
	</div>
</div>

<style>
	.login-screen {
		min-height: 100vh;
		background: transparent; /* the .cosmos layer paints the deep-space canvas */
		position: relative;
		overflow: hidden;
		display: flex;
		align-items: center;
	}

	.deco {
		position: absolute;
		border-radius: 50%;
		opacity: 0.32;
		filter: blur(90px);
		pointer-events: none;
	}

	.deco-a {
		width: 420px;
		height: 420px;
		background: var(--acc);
		top: 55%;
		right: -10%;
	}

	.deco-b {
		width: 260px;
		height: 260px;
		background: var(--acc2);
		top: 68%;
		right: 4%;
		opacity: 0.22;
	}

	.deco-c {
		width: 260px;
		height: 260px;
		background: var(--acc);
		top: -12%;
		left: -8%;
		opacity: 0.24;
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
		color: var(--ess-teal-50);
	}

	.eyebrow-light {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--ess-green-400);
	}

	.brand-block h1 {
		font-family: var(--ess-font-display);
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
		background: var(--ess-glass-bg);
		border: 1px solid var(--ess-glass-border);
		border-radius: var(--ess-radius-lg);
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		box-shadow: var(--ess-glass-shadow);
	}

	.login-card h2 {
		font-family: var(--ess-font-display);
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--ess-n-900);
	}

	.sub {
		font-size: 0.85rem;
		color: var(--ess-n-500);
		margin-top: -0.5rem;
		margin-bottom: 0.25rem;
	}

	:global(.login-card label) {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--ess-n-900);
	}

	:global(.login-card input) {
		border: 1px solid var(--ess-n-200);
		border-radius: 10px;
		padding: 0.65rem 0.8rem;
		font-size: 0.95rem;
		font-family: inherit;
		color: var(--ess-n-900);
		background: var(--ess-field-bg);
		transition:
			border-color var(--ess-t-fast),
			box-shadow var(--ess-t-fast);
	}

	:global(.login-card input:focus) {
		outline: none;
		border-color: var(--ess-primary);
		box-shadow: 0 0 0 3px var(--ring);
	}

	:global(.login-card .error) {
		color: var(--ess-danger);
		font-size: 0.85rem;
	}

	:global(.login-card .submit-btn) {
		justify-content: center;
		margin-top: 0.5rem;
	}

	@media (max-width: 860px) {
		.login-content {
			grid-template-columns: 1fr;
		}
	}
</style>
