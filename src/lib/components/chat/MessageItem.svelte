<script lang="ts">
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Pin from '@lucide/svelte/icons/pin';
	import Bookmark from '@lucide/svelte/icons/bookmark';
	import SmilePlus from '@lucide/svelte/icons/smile-plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Flag from '@lucide/svelte/icons/flag';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import ListPlus from '@lucide/svelte/icons/list-plus';
	import Avatar from '$lib/components/Avatar.svelte';
	import EssCard from './EssCard.svelte';
	import { fileSize, renderBody, timeOf } from '$lib/chat/format';
	import type { ChatMessageView } from '$lib/server/chat/messages';

	let {
		message,
		meId,
		meName,
		grouped = false,
		inThread = false,
		status = null,
		onreply,
		onmaketask,
		onchanged
	}: {
		message: ChatMessageView;
		meId: string;
		meName: string;
		/** Same author a moment ago: no name or avatar repeated. */
		grouped?: boolean;
		inThread?: boolean;
		status?: { label: string; state: string; online: boolean } | null;
		onreply?: (m: ChatMessageView) => void;
		/** Champ Hub: turn this message into a task. */
		onmaketask?: (m: ChatMessageView) => void;
		onchanged: (id: string) => void;
	} = $props();

	const QUICK = ['👍', '❤️', '😂', '🎉', '🙏', '✅'];
	const mine = $derived(message.author?.id === meId);
	const isBot = $derived(!message.author);
	const name = $derived(message.author?.fullName ?? (message.kind === 'champ' ? 'Champ' : 'ESS'));

	let picking = $state(false);
	let editing = $state(false);
	let draft = $state('');
	let reporting = $state(false);
	let reason = $state('');
	let confirmDelete = $state(false);
	let err = $state('');

	async function post(path: string, body: unknown = {}, method = 'POST') {
		err = '';
		const res = await fetch(`/api/chat/messages/${message.id}${path}`, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) err = (await res.json().catch(() => ({}))).message ?? 'That did not work';
		else onchanged(message.id);
		return res.ok;
	}

	async function react(emoji: string) {
		picking = false;
		await post('/react', { emoji });
	}

	async function saveEdit() {
		if (await post('', { body: draft }, 'PATCH')) editing = false;
	}

	async function vote(i: number) {
		await post('/vote', { option: i });
	}
</script>

<div class="msg" class:grouped class:mine class:private={message.privateToYou} class:champ={message.kind === 'champ'} id="m-{message.id}">
	<div class="gutter">
		{#if !grouped}
			{#if message.author}
				<span class="av-wrap">
					<Avatar userId={message.author.id} fullName={message.author.fullName} size="md" />
					{#if status}<span class="dot" data-state={status.state} class:online={status.online}></span>{/if}
				</span>
			{:else}
				<span class="bot" class:champ-bot={message.kind === 'champ'} aria-hidden="true">{message.kind === 'champ' ? '✨' : 'ESS'}</span>
			{/if}
		{:else}
			<span class="t-hover">{timeOf(message.createdAt)}</span>
		{/if}
	</div>
	<div class="content">
		{#if !grouped}
			<div class="hd">
				<strong>{name}</strong>
				{#if isBot}<span class="tag">{message.kind === 'champ' ? 'ASSISTANT' : 'PORTAL'}</span>{/if}
				{#if status}<span class="st" title={status.label}>{status.label}</span>{/if}
				<span class="t">{timeOf(message.createdAt)}</span>
				{#if message.pinned}<span class="pinned"><Pin size={11} /> Pinned</span>{/if}
			</div>
		{/if}

		{#if message.hidden}
			<p class="removed"><EyeOff size={13} /> Hidden by HR</p>
		{:else if message.deleted}
			<p class="removed">This message was deleted.</p>
		{:else if editing}
			<textarea class="ess-textarea edit" bind:value={draft} rows="3" aria-label="Edit message"></textarea>
			<div class="row">
				<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" onclick={saveEdit}>Save</button>
				<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (editing = false)}>Cancel</button>
			</div>
		{:else}
			{#if message.kind === 'poll' && message.poll}
				<div class="poll">
					<strong>📊 {message.poll.question}</strong>
					{#each message.poll.options as o, i (i)}
						{@const pct = message.poll.total ? Math.round((o.count / message.poll.total) * 100) : 0}
						<button type="button" class="opt" class:mine={o.mine} onclick={() => vote(i)}>
							<span class="bar" style="width:{pct}%"></span>
							<span class="lbl">{o.label}</span>
							<span class="n">{o.count}</span>
						</button>
					{/each}
					<span class="meta">{message.poll.total} {message.poll.total === 1 ? 'vote' : 'votes'} · tap again to take yours back</span>
				</div>
			{:else if message.body}
				<div class="body">{@html renderBody(message.body, meName)}{#if message.editedAt}<span class="edited"> (edited)</span>{/if}</div>
			{/if}
			{#if message.sensitive}<p class="warn">Contains a number that looks like an ID or bank detail.</p>{/if}
			{#if message.file}
				{#if message.file.mime.startsWith('image/')}
					<a class="img" href="/api/chat/files/{message.file.id}" target="_blank" rel="noopener">
						<img src="/api/chat/files/{message.file.id}" alt={message.file.name} loading="lazy" />
					</a>
				{:else}
					<a class="file" href="/api/chat/files/{message.file.id}" target="_blank" rel="noopener">
						<Paperclip size={14} />
						<span>{message.file.name}</span>
						<small>{fileSize(message.file.size)}</small>
					</a>
				{/if}
			{/if}
			{#if message.card && message.kind !== 'poll'}
				<EssCard {message} onchanged={() => onchanged(message.id)} />
			{/if}
			{#if message.privateToYou}<p class="private-note">Only you can see this</p>{/if}
		{/if}

		{#if message.reactions.length}
			<div class="reacts">
				{#each message.reactions as r (r.emoji)}
					<button type="button" class="re" class:mine={r.mine} title={r.names.join(', ')} onclick={() => react(r.emoji)}>{r.emoji} {r.count}</button>
				{/each}
			</div>
		{/if}
		{#if !inThread && message.replyCount > 0}
			<button type="button" class="thread-link" onclick={() => onreply?.(message)}>
				<MessageSquare size={13} />
				{message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
			</button>
		{/if}
		{#if reporting}
			<div class="row">
				<input class="ess-input" bind:value={reason} placeholder="What's wrong with it? HR will see this" aria-label="Report reason" />
				<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" disabled={!reason.trim()} onclick={async () => { if (await post('/report', { reason })) { reporting = false; reason = ''; } }}>Report</button>
				<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (reporting = false)}>Cancel</button>
			</div>
		{/if}
		{#if confirmDelete}
			<div class="row">
				<span class="warn">Delete this message for everyone?</span>
				<button type="button" class="ess-btn ess-btn--danger ess-btn--sm" onclick={async () => { await post('', {}, 'DELETE'); confirmDelete = false; }}>Delete</button>
				<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (confirmDelete = false)}>Keep</button>
			</div>
		{/if}
		{#if err}<p class="err">{err}</p>{/if}
	</div>

	{#if !message.deleted && !message.hidden && !editing}
		<div class="actions" role="toolbar" aria-label="Message actions">
			<button type="button" title="React" aria-label="React" onclick={() => (picking = !picking)}><SmilePlus size={15} /></button>
			{#if !inThread && !message.privateToYou}
				<button type="button" title="Reply in thread" aria-label="Reply in thread" onclick={() => onreply?.(message)}><MessageSquare size={15} /></button>
			{/if}
			{#if onmaketask && message.author && message.kind === 'text' && !message.privateToYou}
				<button type="button" title="Make task" aria-label="Make a task from this message" onclick={() => onmaketask?.(message)}><ListPlus size={15} /></button>
			{/if}
			<button type="button" title={message.pinned ? 'Unpin' : 'Pin'} aria-label={message.pinned ? 'Unpin' : 'Pin'} onclick={() => post('/pin')}><Pin size={15} /></button>
			<button type="button" title={message.saved ? 'Remove from saved' : 'Save'} aria-label="Save" class:on={message.saved} onclick={() => post('/save')}><Bookmark size={15} /></button>
			{#if mine && message.kind === 'text'}
				<button type="button" title="Edit" aria-label="Edit" onclick={() => { draft = message.body; editing = true; }}><Pencil size={15} /></button>
				<button type="button" title="Delete" aria-label="Delete" onclick={() => (confirmDelete = true)}><Trash2 size={15} /></button>
			{:else if !mine && message.author}
				<button type="button" title="Report to HR" aria-label="Report to HR" onclick={() => (reporting = true)}><Flag size={15} /></button>
			{/if}
			{#if picking}
				<div class="picker">
					{#each QUICK as e (e)}<button type="button" onclick={() => react(e)} aria-label="React {e}">{e}</button>{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.msg {
		position: relative;
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr);
		gap: 12px;
		padding: 6px 20px 6px 16px;
	}
	.msg.grouped {
		padding-top: 1px;
	}
	.msg:hover,
	.msg:focus-within {
		background: var(--ess-sunken);
	}
	.msg.private .body {
		border: 1px dashed var(--ess-border-strong);
	}
	.gutter {
		display: flex;
		justify-content: center;
	}
	.av-wrap {
		position: relative;
		display: inline-flex;
		height: max-content;
	}
	.dot {
		position: absolute;
		right: -1px;
		bottom: -1px;
		width: 11px;
		height: 11px;
		border-radius: 50%;
		border: 2px solid var(--ess-surface);
		background: var(--ess-text-muted);
	}
	.dot[data-state='in'] {
		background: var(--ess-success);
	}
	.dot[data-state='leave'],
	.dot[data-state='holiday'] {
		background: var(--ess-warning);
	}
	.dot[data-state='night'] {
		background: var(--ess-primary);
	}
	.dot[data-state='weekoff'],
	.dot[data-state='off'],
	.dot[data-state='left'] {
		background: var(--ess-surface);
		box-shadow: inset 0 0 0 1.5px var(--ess-text-muted);
	}
	.bot {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--ess-success);
		background: var(--ess-success-bg);
	}
	.bot.champ-bot {
		font-size: 15px;
		color: var(--ess-primary-text);
		background: var(--ess-primary-soft);
	}
	.t-hover {
		font-size: 10.5px;
		color: var(--ess-text-muted);
		opacity: 0;
		padding-top: 6px;
		font-variant-numeric: tabular-nums;
	}
	.msg:hover .t-hover {
		opacity: 1;
	}
	.content {
		min-width: 0;
	}
	.hd {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 4px 8px;
		margin-bottom: 4px;
	}
	.hd strong {
		font-size: 14px;
		font-weight: 600;
	}
	.tag {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.06em;
		padding: 0 5px;
		border-radius: 4px;
		background: var(--ess-sunken);
		color: var(--ess-text-muted);
	}
	.st {
		font-size: 11.5px;
		color: var(--ess-text-muted);
		max-width: 180px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.t {
		font-size: 12px;
		color: var(--ess-text-muted);
		font-variant-numeric: tabular-nums;
	}
	.pinned {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 11.5px;
		color: var(--ess-warning);
		font-weight: 500;
	}
	/* The message itself sits in a soft bubble; mine are pale lavender. */
	.body {
		display: inline-block;
		max-width: min(100%, 720px);
		padding: 10px 14px;
		border-radius: 12px;
		border-top-left-radius: 4px;
		background: var(--ess-sunken);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		line-height: 1.5;
		font-size: 14.5px;
		color: var(--ess-text);
	}
	.msg.mine .body {
		background: var(--ess-primary-soft);
	}
	.msg.champ .body {
		background: var(--ess-primary-softer);
		border: 1px solid var(--ess-primary-soft);
	}
	.body :global(a) {
		color: var(--ess-primary-text);
	}
	.body :global(code) {
		font-family: var(--ess-font-mono);
		font-size: 12.5px;
		padding: 1px 5px;
		border-radius: 5px;
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
	}
	.body :global(.mention) {
		color: var(--ess-primary-text);
		background: var(--ess-surface);
		border-radius: 4px;
		padding: 0 3px;
		font-weight: 500;
	}
	.body :global(.mention-me) {
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
	}
	.edited {
		font-size: 11px;
		color: var(--ess-text-muted);
	}
	.removed {
		margin: 0;
		font-style: italic;
		font-size: 13px;
		color: var(--ess-text-muted);
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.warn {
		margin: 4px 0 0;
		font-size: 12px;
		color: var(--ess-warning);
	}
	.err {
		margin: 4px 0 0;
		font-size: 12px;
		color: var(--ess-danger);
	}
	.private-note {
		margin: 4px 0 0;
		font-size: 11px;
		color: var(--ess-text-muted);
	}
	.img {
		display: inline-block;
		margin-top: 6px;
		max-width: min(360px, 100%);
	}
	.img img {
		max-width: 100%;
		max-height: 280px;
		border-radius: var(--ess-radius-md);
		border: 1px solid var(--ess-border);
		display: block;
	}
	.file {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		margin-top: 8px;
		padding: 10px 14px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-surface);
		color: var(--ess-text);
		text-decoration: none;
		font-size: 13.5px;
		font-weight: 500;
		max-width: 100%;
	}
	.file :global(svg) {
		color: var(--ess-primary-text);
	}
	.file span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.file small {
		color: var(--ess-text-muted);
		font-weight: 400;
	}
	.reacts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 6px;
	}
	.re {
		border: 1px solid var(--ess-border);
		background: var(--ess-surface);
		border-radius: 99px;
		padding: 2px 10px;
		font-size: 12.5px;
		cursor: pointer;
		color: var(--ess-text);
	}
	.re:hover {
		border-color: var(--ess-border-strong);
	}
	.re.mine {
		border-color: var(--ess-primary);
		background: var(--ess-primary-soft);
	}
	.thread-link {
		margin-top: 6px;
		border: 0;
		background: none;
		padding: 0;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--ess-primary-text);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
		margin-top: 6px;
	}
	.row .ess-input {
		flex: 1;
		min-width: 180px;
	}
	.edit {
		width: 100%;
	}
	.poll {
		display: grid;
		gap: 6px;
		max-width: 420px;
		padding: 12px 14px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-surface);
	}
	.opt {
		position: relative;
		display: flex;
		align-items: center;
		gap: 8px;
		overflow: hidden;
		border: 1px solid var(--ess-border);
		background: var(--ess-surface);
		border-radius: var(--ess-radius-sm);
		padding: 8px 12px;
		font: inherit;
		color: var(--ess-text);
		cursor: pointer;
		text-align: left;
	}
	.opt.mine {
		border-color: var(--ess-primary);
	}
	.bar {
		position: absolute;
		inset: 0 auto 0 0;
		background: var(--ess-primary-soft);
		transition: width var(--ess-t);
	}
	.lbl {
		position: relative;
		flex: 1;
	}
	.n {
		position: relative;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.meta {
		font-size: 11.5px;
		color: var(--ess-text-muted);
	}
	.actions {
		position: absolute;
		top: -12px;
		right: 18px;
		display: none;
		gap: 2px;
		padding: 2px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-sm);
		background: var(--ess-modal-bg);
		box-shadow: var(--ess-elev-2);
	}
	.msg:hover .actions,
	.msg:focus-within .actions {
		display: flex;
	}
	.actions button {
		border: 0;
		background: none;
		width: 28px;
		height: 26px;
		display: grid;
		place-items: center;
		border-radius: 6px;
		color: var(--ess-text-secondary);
		cursor: pointer;
	}
	.actions button:hover,
	.actions button.on {
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}
	.picker {
		position: absolute;
		top: 30px;
		right: 0;
		display: flex;
		gap: 2px;
		padding: 4px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-sm);
		background: var(--ess-modal-bg);
		box-shadow: var(--ess-elev-3);
		z-index: 3;
	}
	.picker button {
		width: 30px;
		font-size: 16px;
	}
	@media (hover: none) {
		.actions {
			display: flex;
			position: static;
			grid-column: 2;
			width: max-content;
			margin-top: 4px;
			box-shadow: none;
		}
	}
</style>
