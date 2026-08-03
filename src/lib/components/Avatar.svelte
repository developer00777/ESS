<script lang="ts">
	interface Props {
		userId: string;
		fullName: string;
		/** Whether this user has a picture — from the page's server load. */
		hasPicture?: boolean;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		/** Bumped after an upload to bypass the cached image. */
		version?: string | number;
	}

	let { userId, fullName, hasPicture = false, size = 'md', version }: Props = $props();

	// If the image 404s or fails to decode, fall back to initials rather than
	// leaving a broken-image icon in the roster.
	let failed = $state(false);

	const initials = $derived(
		fullName
			.split(' ')
			.map((p) => p[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);

	const src = $derived(
		`/api/profile-picture/${userId}${version ? `?v=${encodeURIComponent(String(version))}` : ''}`
	);
</script>

{#if hasPicture && !failed}
	<img class="avatar avatar--{size}" {src} alt={fullName} onerror={() => (failed = true)} />
{:else}
	<span class="avatar avatar--{size}" aria-hidden="true">{initials}</span>
{/if}

<style>
	.avatar {
		display: grid;
		place-items: center;
		border-radius: 50%;
		flex-shrink: 0;
		background: linear-gradient(150deg, var(--acc2), var(--acc));
		color: var(--ess-text-on-primary);
		font-weight: 700;
		object-fit: cover;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.5),
			0 6px 16px -8px var(--glow);
	}

	.avatar--sm {
		width: 26px;
		height: 26px;
		font-size: 10px;
	}

	.avatar--md {
		width: 34px;
		height: 34px;
		font-size: var(--ess-fs-caption);
	}

	.avatar--lg {
		width: 56px;
		height: 56px;
		font-size: var(--ess-fs-h2);
	}

	.avatar--xl {
		width: 104px;
		height: 104px;
		font-size: 34px;
	}

	img.avatar {
		/* The gradient is the initials background; an image covers it entirely. */
		background: var(--ess-sunken);
	}
</style>
