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

	// Each person gets one of a few quiet tints, picked from their id so it is
	// the same on every screen.
	const tint = $derived.by(() => {
		let h = 0;
		for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
		return ['lavender', 'mint', 'peach', 'sky', 'rose'][h % 5];
	});

	const src = $derived(`/api/profile-picture/${userId}${version ? `?v=${encodeURIComponent(String(version))}` : ''}`);
</script>

{#if hasPicture && !failed}
	<img class="avatar avatar--{size}" {src} alt={fullName} onerror={() => (failed = true)} />
{:else}
	<span class="avatar avatar--{size}" data-tint={tint} aria-hidden="true">{initials}</span>
{/if}

<style>
	.avatar {
		display: grid;
		place-items: center;
		border-radius: 50%;
		flex-shrink: 0;
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
		font-weight: 600;
		letter-spacing: 0.01em;
		object-fit: cover;
	}

	.avatar[data-tint='mint'] {
		background: var(--ess-success-bg);
		color: var(--ess-success);
	}
	.avatar[data-tint='peach'] {
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
	}
	.avatar[data-tint='sky'] {
		background: var(--ess-info-bg);
		color: var(--ess-info);
	}
	.avatar[data-tint='rose'] {
		background: var(--ess-pink-bg);
		color: var(--ess-pink);
	}

	.avatar--sm {
		width: 28px;
		height: 28px;
		font-size: 11px;
	}

	.avatar--md {
		width: 36px;
		height: 36px;
		font-size: 13px;
	}

	.avatar--lg {
		width: 56px;
		height: 56px;
		font-size: 20px;
	}

	.avatar--xl {
		width: 104px;
		height: 104px;
		font-size: 36px;
		font-family: var(--ess-font-display);
	}

	img.avatar {
		background: var(--ess-sunken);
	}
</style>
