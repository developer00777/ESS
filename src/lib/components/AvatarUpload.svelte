<script lang="ts">
	import Camera from '@lucide/svelte/icons/camera';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Avatar from './Avatar.svelte';
	import { invalidateAll } from '$app/navigation';

	interface Props {
		userId: string;
		fullName: string;
		hasPicture: boolean;
		/** Server-provided updatedAt, so a reload never shows a cached old image. */
		pictureVersion?: number | null;
	}

	let { userId, fullName, hasPicture, pictureVersion }: Props = $props();

	let busy = $state(false);
	let errorMsg = $state('');
	// Local overrides so the UI updates immediately after upload/remove, before
	// invalidateAll() brings fresh server data. `override` wins once set; until
	// then the server's value shows through.
	let override = $state<boolean | null>(null);
	let uploadedAt = $state<number | undefined>(undefined);
	let fileInput = $state<HTMLInputElement | null>(null);

	const shows = $derived(override ?? hasPicture);
	// Prefer the just-uploaded timestamp, else the server's.
	const version = $derived(uploadedAt ?? pictureVersion ?? undefined);

	/**
	 * Downscales to a square before upload. Keeps stored images ~20-40KB and
	 * avoids a native image library on the server. Crops to the centre square
	 * so portraits and landscapes both come out looking right in a circle.
	 */
	async function resizeToSquare(file: File, size = 256): Promise<Blob> {
		const bitmap = await createImageBitmap(file);
		const side = Math.min(bitmap.width, bitmap.height);
		const sx = (bitmap.width - side) / 2;
		const sy = (bitmap.height - side) / 2;

		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Could not process the image in this browser');
		ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
		bitmap.close();

		return new Promise((resolve, reject) => {
			canvas.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error('Could not process the image'))),
				'image/jpeg',
				0.85
			);
		});
	}

	async function onFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		errorMsg = '';

		if (!file.type.startsWith('image/')) {
			errorMsg = 'Please choose an image file';
			input.value = '';
			return;
		}

		busy = true;
		try {
			const resized = await resizeToSquare(file);
			const form = new FormData();
			form.set('file', resized, 'avatar.jpg');

			const res = await fetch('/api/profile-picture', { method: 'POST', body: form });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				errorMsg = body.message ?? 'Could not upload the picture';
				return;
			}

			override = true;
			uploadedAt = Date.now();
			await invalidateAll();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Could not upload the picture';
		} finally {
			busy = false;
			input.value = '';
		}
	}

	async function removePicture() {
		errorMsg = '';
		busy = true;
		try {
			const res = await fetch('/api/profile-picture', { method: 'DELETE' });
			if (!res.ok) {
				errorMsg = 'Could not remove the picture';
				return;
			}
			override = false;
			uploadedAt = Date.now();
			await invalidateAll();
		} finally {
			busy = false;
		}
	}
</script>

<div class="avatar-upload">
	<div class="avatar-frame" class:busy>
		<Avatar {userId} {fullName} hasPicture={shows} size="xl" {version} />
		<button
			type="button"
			class="change-btn"
			onclick={() => fileInput?.click()}
			disabled={busy}
			aria-label={shows ? 'Change profile picture' : 'Add profile picture'}
			title={shows ? 'Change profile picture' : 'Add profile picture'}
		>
			<Camera size={15} />
		</button>
	</div>

	<div class="avatar-meta">
		<strong>{fullName}</strong>
		<div class="avatar-actions">
			<button type="button" class="ess-btn ess-btn--sm ess-btn--secondary" onclick={() => fileInput?.click()} disabled={busy}>
				{busy ? 'Saving…' : shows ? 'Change photo' : 'Add photo'}
			</button>
			{#if shows}
				<button type="button" class="ess-btn ess-btn--sm ess-btn--ghost" onclick={removePicture} disabled={busy}>
					<Trash2 size={14} />
					Remove
				</button>
			{/if}
		</div>
		{#if errorMsg}
			<p class="ess-error">{errorMsg}</p>
		{:else}
			<p class="hint">JPEG, PNG or WebP. Cropped to a square automatically.</p>
		{/if}
	</div>

	<input
		bind:this={fileInput}
		type="file"
		accept="image/jpeg,image/png,image/webp"
		onchange={onFileChange}
		hidden
	/>
</div>

<style>
	.avatar-upload {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		flex-wrap: wrap;
	}

	.avatar-frame {
		position: relative;
		flex-shrink: 0;
		line-height: 0;
	}

	.avatar-frame.busy {
		opacity: 0.6;
	}

	.change-btn {
		position: absolute;
		right: -2px;
		bottom: -2px;
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		border: 2px solid var(--ess-canvas);
		background: linear-gradient(180deg, color-mix(in oklab, var(--acc) 82%, #fff), var(--acc));
		color: var(--ess-text-on-primary);
		cursor: pointer;
		transition: transform var(--ess-t-fast);
	}

	.change-btn:hover:not(:disabled) {
		transform: translateY(-1px);
	}

	.change-btn:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.avatar-meta {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
	}

	.avatar-meta strong {
		font-family: var(--ess-font-display);
		font-size: var(--ess-fs-h2);
	}

	.avatar-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.hint {
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-secondary);
	}
</style>
