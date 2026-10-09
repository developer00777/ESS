<script lang="ts">
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import SendHorizontal from '@lucide/svelte/icons/send-horizontal';
	import Smile from '@lucide/svelte/icons/smile';
	import X from '@lucide/svelte/icons/x';
	import { SLASH_COMMANDS, detectSensitive, SENSITIVE_LABEL } from '$lib/chat/rules';
	import { fileSize } from '$lib/chat/format';
	import type { ChatMessageView } from '$lib/server/chat/messages';

	let {
		channelId,
		threadRootId = null,
		members = [],
		placeholder = 'Message',
		disabledReason = null,
		canMentionAll = false,
		onsent
	}: {
		channelId: string;
		threadRootId?: string | null;
		members?: { id: string; fullName: string }[];
		placeholder?: string;
		disabledReason?: string | null;
		canMentionAll?: boolean;
		onsent?: (m: ChatMessageView | null) => void;
	} = $props();

	let text = $state('');
	let ta = $state<HTMLTextAreaElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let file = $state<{ id: string; name: string; mime: string; size: number } | null>(null);
	let uploading = $state(false);
	let sending = $state(false);
	let error = $state('');
	let confirmSensitive = $state<string | null>(null);
	let emojiOpen = $state(false);
	/** Name → id for people picked from the @ list. */
	let picked = $state<Record<string, string>>({});

	const EMOJI = ['👍', '❤️', '😂', '🎉', '🙏', '✅', '👀', '🔥', '😊', '🤔', '👏', '💯'];

	type Item = { value: string; label: string; hint: string };
	let pop = $state<Item[]>([]);
	let popIndex = $state(0);

	const warn = $derived(detectSensitive(text));

	let lastTyping = 0;
	function typing() {
		const now = Date.now();
		if (now - lastTyping < 3000) return;
		lastTyping = now;
		void fetch('/api/chat/typing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId, threadRootId }) }).catch(() => {});
	}

	function autosize() {
		if (!ta) return;
		ta.style.height = 'auto';
		ta.style.height = Math.min(160, ta.scrollHeight) + 'px';
	}

	function updatePop() {
		const before = text.slice(0, ta?.selectionStart ?? text.length);
		const cmd = /^\/(\w*)$/.exec(before);
		const at = /(?:^|\s)@([\w.'-]*)$/.exec(before);
		if (cmd) {
			pop = SLASH_COMMANDS.filter((c) => c.c.startsWith('/' + cmd[1])).map((c) => ({ value: c.c + ' ', label: c.c, hint: c.d }));
		} else if (at) {
			const q = at[1].toLowerCase();
			const people = members
				.filter((m) => m.fullName.toLowerCase().includes(q))
				.slice(0, 7)
				.map((m) => ({ value: `@${m.fullName} `, label: m.fullName, hint: '' }));
			const extra = [
				{ value: '@Champ ', label: 'Champ', hint: 'Ask the assistant; everyone here sees the answer' },
				...(canMentionAll ? [{ value: '@channel ', label: '@channel', hint: 'Notify everyone here' }] : [])
			].filter((x) => x.label.toLowerCase().replace('@', '').startsWith(q));
			pop = [...people, ...extra];
		} else pop = [];
		popIndex = 0;
	}

	function pick(item: Item) {
		if (!ta) return;
		const pos = ta.selectionStart ?? text.length;
		const before = text.slice(0, pos).replace(/(^\/\w*$)|((?:^|\s)@[\w.'-]*$)/, (m) => (m.startsWith(' ') ? ' ' : ''));
		text = before + item.value + text.slice(pos);
		const person = members.find((m) => `@${m.fullName} ` === item.value);
		if (person) picked[person.fullName] = person.id;
		pop = [];
		queueMicrotask(() => {
			ta?.focus();
			const p = (before + item.value).length;
			ta?.setSelectionRange(p, p);
			autosize();
		});
	}

	/** Drop an emoji in at the caret. */
	function insertEmoji(e: string) {
		emojiOpen = false;
		const pos = ta?.selectionStart ?? text.length;
		text = text.slice(0, pos) + e + text.slice(pos);
		queueMicrotask(() => {
			ta?.focus();
			ta?.setSelectionRange(pos + e.length, pos + e.length);
			autosize();
		});
	}

	function onKey(e: KeyboardEvent) {
		if (pop.length) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				popIndex = (popIndex + 1) % pop.length;
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				popIndex = (popIndex - 1 + pop.length) % pop.length;
				return;
			}
			if (e.key === 'Enter' || e.key === 'Tab') {
				e.preventDefault();
				pick(pop[popIndex]);
				return;
			}
			if (e.key === 'Escape') {
				pop = [];
				return;
			}
		}
		if (e.key === 'Escape' && emojiOpen) {
			emojiOpen = false;
			return;
		}
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void send();
		}
	}

	async function upload(f: File) {
		error = '';
		if (f.size > 10 * 1024 * 1024) {
			error = 'Files can be up to 10 MB';
			return;
		}
		uploading = true;
		const fd = new FormData();
		fd.append('file', f);
		try {
			const res = await fetch('/api/chat/files', { method: 'POST', body: fd });
			const r = await res.json();
			if (!res.ok) error = r.message ?? 'That file could not be shared';
			else file = r.file;
		} catch {
			error = 'Could not upload. Check your connection.';
		} finally {
			uploading = false;
			if (fileInput) fileInput.value = '';
		}
	}

	async function send(confirm = false) {
		const body = text.trim();
		if ((!body && !file) || sending) return;
		sending = true;
		error = '';
		const mentions = Object.entries(picked)
			.filter(([n]) => body.includes('@' + n))
			.map(([, id]) => id);
		try {
			const res = await fetch('/api/chat/messages', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					channelId,
					threadRootId,
					body,
					mentions,
					mentionAll: /(^|\s)@(channel|here)\b/.test(body),
					confirmSensitive: confirm,
					file
				})
			});
			const r = await res.json().catch(() => ({}));
			if (!res.ok) {
				if (r.needsConfirm) {
					confirmSensitive = r.message;
					return;
				}
				error = r.message ?? 'That did not send';
				return;
			}
			text = '';
			file = null;
			picked = {};
			confirmSensitive = null;
			queueMicrotask(autosize);
			onsent?.(r.message ?? null);
		} catch {
			error = 'Could not send. Check your connection.';
		} finally {
			sending = false;
			ta?.focus();
		}
	}

	export function focus() {
		ta?.focus();
	}
</script>

<div class="composer">
	{#if pop.length}
		<ul class="pop" role="listbox" aria-label="Suggestions">
			{#each pop as item, i (item.value)}
				<li role="option" aria-selected={i === popIndex}>
					<button type="button" onmousedown={(e) => { e.preventDefault(); pick(item); }}>
						<strong>{item.label}</strong>
						{#if item.hint}<small>{item.hint}</small>{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if disabledReason}
		<p class="disabled">{disabledReason}</p>
	{:else}
		{#if confirmSensitive}
			<div class="confirm" role="alert">
				<span>{confirmSensitive}</span>
				<button type="button" class="ess-btn ess-btn--secondary ess-btn--sm" onclick={() => send(true)}>Send anyway</button>
				<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (confirmSensitive = null)}>Edit it</button>
			</div>
		{/if}
		{#if file}
			<div class="attached">
				<Paperclip size={13} /> {file.name} <small>{fileSize(file.size)}</small>
				<button type="button" aria-label="Remove file" onclick={() => (file = null)}><X size={13} /></button>
			</div>
		{/if}
		<div class="box">
			<label class="icon" title="Attach a file">
				<Paperclip size={18} strokeWidth={1.75} />
				<span class="sr-only">Attach a file</span>
				<input
					bind:this={fileInput}
					type="file"
					accept="image/*,application/pdf,.docx,.xlsx,.pptx,.csv,.txt"
					onchange={(e) => {
						const f = (e.currentTarget as HTMLInputElement).files?.[0];
						if (f) void upload(f);
					}}
				/>
			</label>
			<textarea
				bind:this={ta}
				bind:value={text}
				rows="1"
				maxlength="4000"
				{placeholder}
				aria-label={placeholder}
				oninput={() => {
					autosize();
					updatePop();
					if (text) typing();
				}}
				onkeydown={onKey}
				onclick={updatePop}
				onpaste={(e) => {
					const f = e.clipboardData?.files?.[0];
					if (f) {
						e.preventDefault();
						void upload(f);
					}
				}}
			></textarea>
			<div class="emoji-wrap">
				<button type="button" class="icon" title="Emoji" aria-label="Add an emoji" aria-expanded={emojiOpen} onclick={() => (emojiOpen = !emojiOpen)}>
					<Smile size={18} strokeWidth={1.75} />
				</button>
				{#if emojiOpen}
					<div class="emoji" role="listbox" aria-label="Emoji">
						{#each EMOJI as e (e)}<button type="button" role="option" aria-selected="false" onmousedown={(ev) => { ev.preventDefault(); insertEmoji(e); }}>{e}</button>{/each}
					</div>
				{/if}
			</div>
			<button type="button" class="send" aria-label="Send" disabled={sending || uploading || (!text.trim() && !file)} onclick={() => send()}>
				<SendHorizontal size={18} />
			</button>
		</div>
		<p class="hint">
			{#if warn.length}
				<span class="warn">This looks like {warn.map((k) => SENSITIVE_LABEL[k]).join(' and ')}. You will be asked to confirm.</span>
			{:else if uploading}
				Uploading…
			{:else if error}
				<span class="err">{error}</span>
			{:else}
				Enter sends · Shift + Enter for a new line · / for commands · @ to mention
			{/if}
		</p>
	{/if}
</div>

<style>
	.composer {
		position: relative;
		padding: 10px 16px 10px;
		border-top: 1px solid var(--ess-border);
		background: var(--ess-surface);
	}
	.box {
		display: flex;
		align-items: flex-end;
		gap: 4px;
		padding: 6px 6px 6px 8px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-field-bg);
		transition:
			border-color var(--ess-t-fast),
			box-shadow var(--ess-t-fast);
	}
	/* One quiet cue for the whole box. The portal-wide :focus-visible ring
	   would otherwise draw a second box around the textarea inside it. */
	.box:focus-within {
		border-color: var(--ess-primary);
		box-shadow: 0 0 0 3px var(--ring);
	}
	textarea:focus,
	textarea:focus-visible {
		outline: none;
		box-shadow: none;
	}
	textarea {
		flex: 1;
		border: 0;
		background: none;
		resize: none;
		outline: none;
		font: inherit;
		font-size: 14.5px;
		color: var(--ess-text);
		line-height: 1.45;
		padding: 8px 6px;
		max-height: 160px;
	}
	textarea::placeholder {
		color: var(--ess-text-muted);
	}
	.icon,
	.send {
		width: 38px;
		height: 38px;
		display: grid;
		place-items: center;
		border-radius: var(--ess-radius-sm);
		border: 0;
		background: none;
		color: var(--ess-text-secondary);
		cursor: pointer;
		position: relative;
		overflow: hidden;
		flex-shrink: 0;
	}
	.icon input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.icon:hover,
	.icon[aria-expanded='true'] {
		background: var(--ess-surface-hover);
		color: var(--ess-text);
	}
	.emoji-wrap {
		position: relative;
	}
	.emoji {
		position: absolute;
		right: 0;
		bottom: calc(100% + 8px);
		display: grid;
		grid-template-columns: repeat(6, 32px);
		gap: 2px;
		padding: 6px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-modal-bg);
		box-shadow: var(--ess-elev-3);
		z-index: 10;
	}
	.emoji button {
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: 6px;
		background: none;
		font-size: 18px;
		cursor: pointer;
	}
	.emoji button:hover {
		background: var(--ess-primary-soft);
	}
	.send {
		background: var(--ess-primary);
		color: var(--ess-text-on-primary);
		overflow: visible;
	}
	.send:hover:not(:disabled) {
		background: var(--ess-primary-hover);
	}
	.send:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.hint {
		margin: 6px 4px 0;
		font-size: 11.5px;
		color: var(--ess-text-muted);
	}
	.warn {
		color: var(--ess-warning);
		font-weight: 500;
	}
	.err {
		color: var(--ess-danger);
		font-weight: 500;
	}
	.disabled {
		margin: 6px 0;
		font-size: 13px;
		color: var(--ess-text-muted);
		text-align: center;
	}
	.confirm {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
		padding: 10px 12px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
		font-size: 13px;
	}
	.confirm span {
		flex: 1;
		min-width: 200px;
	}
	.attached {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 8px;
		padding: 5px 10px;
		border-radius: var(--ess-radius-sm);
		border: 1px solid var(--ess-border);
		background: var(--ess-sunken);
		font-size: 12.5px;
	}
	.attached small {
		color: var(--ess-text-muted);
	}
	.attached button {
		border: 0;
		background: none;
		padding: 0;
		cursor: pointer;
		color: inherit;
		display: inline-flex;
	}
	.pop {
		position: absolute;
		left: 16px;
		bottom: calc(100% - 4px);
		width: min(380px, calc(100% - 32px));
		max-height: 260px;
		overflow-y: auto;
		list-style: none;
		margin: 0;
		padding: 6px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-modal-bg);
		box-shadow: var(--ess-elev-3);
		z-index: 10;
	}
	.pop button {
		display: flex;
		align-items: baseline;
		gap: 8px;
		width: 100%;
		border: 0;
		background: none;
		text-align: left;
		padding: 7px 9px;
		border-radius: var(--ess-radius-sm);
		font: inherit;
		font-size: 13.5px;
		color: var(--ess-text);
		cursor: pointer;
	}
	.pop strong {
		font-weight: 500;
	}
	.pop small {
		color: var(--ess-text-muted);
		font-size: 12px;
	}
	.pop li[aria-selected='true'] button,
	.pop button:hover {
		background: var(--ess-primary-soft);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
</style>
