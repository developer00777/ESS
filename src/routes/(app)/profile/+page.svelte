<script lang="ts">
	import User from '@lucide/svelte/icons/user';
	import Briefcase from '@lucide/svelte/icons/briefcase';
	import Banknote from '@lucide/svelte/icons/banknote';
	import FileText from '@lucide/svelte/icons/file-text';
	import Users from '@lucide/svelte/icons/users';
	import Phone from '@lucide/svelte/icons/phone';
	import Shield from '@lucide/svelte/icons/shield';
	import GraduationCap from '@lucide/svelte/icons/graduation-cap';
	import Mail from '@lucide/svelte/icons/mail';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Building from '@lucide/svelte/icons/building-2';
	import UserRound from '@lucide/svelte/icons/user-round';
	import PenLine from '@lucide/svelte/icons/pen-line';
	import Lock from '@lucide/svelte/icons/lock';
	import LockKeyhole from '@lucide/svelte/icons/lock-keyhole';
	import Clock from '@lucide/svelte/icons/clock';
	import Info from '@lucide/svelte/icons/info';
	import Check from '@lucide/svelte/icons/check';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ProfileCard from '$lib/components/ProfileCard.svelte';
	import AvatarUpload from '$lib/components/AvatarUpload.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { enhance } from '$app/forms';
	import { tenureFrom } from '$lib/tenure';

	let { data } = $props();

	// Recomputed whenever the profile changes, so tenure never goes stale
	// against a freshly loaded joining date.
	const tenure = $derived(tenureFrom(data.profile?.dateOfJoining));

	let editing = $state(false);
	let saving = $state(false);
	let saveError = $state('');
	let phone = $state(data.profile?.phone ?? '');
	let personalEmail = $state(data.profile?.personalEmail ?? '');
	let address = $state(data.profile?.address ?? '');
	let permanentAddress = $state(data.profile?.permanentAddress ?? '');
	let emergencyContactName = $state(data.profile?.emergencyContactName ?? '');
	let emergencyContactRelationship = $state(data.profile?.emergencyContactRelationship ?? '');
	let emergencyContactPhone = $state(data.profile?.emergencyContactPhone ?? '');
	let fatherName = $state(data.profile?.fatherName ?? '');
	let motherName = $state(data.profile?.motherName ?? '');
	let maritalStatus = $state(data.profile?.maritalStatus ?? '');
	let spouseName = $state(data.profile?.spouseName ?? '');
	let bankAccountNumber = $state(data.profile?.bankAccountNumber ?? '');
	let bankAccountHolderName = $state(data.profile?.bankAccountHolderName ?? '');
	let bankName = $state(data.profile?.bankName ?? '');
	let bankIfsc = $state(data.profile?.bankIfsc ?? '');
	let aadharNumber = $state(data.profile?.aadharNumber ?? '');
	let panNumber = $state(data.profile?.panNumber ?? '');
	let uanNumber = $state(data.profile?.uanNumber ?? '');
	let underGraduate = $state(data.profile?.underGraduate ?? '');
	let graduate = $state(data.profile?.graduate ?? '');
	let masters = $state(data.profile?.masters ?? '');
	let diplomaOthers = $state(data.profile?.diplomaOthers ?? '');
	let totalExperience = $state(data.profile?.totalExperience ?? '');

	/* ---------- tabs ----------
	   Every tab's fields stay in the one form (hidden, not removed), so edits
	   made on one tab are saved together with the others. */
	type Tab = 'personal' | 'employment' | 'bank' | 'family' | 'education';
	const TABS: { id: Tab; label: string }[] = [
		{ id: 'personal', label: 'Personal' },
		{ id: 'employment', label: 'Employment' },
		{ id: 'bank', label: 'Bank & IDs' },
		{ id: 'family', label: 'Family' },
		{ id: 'education', label: 'Education' }
	];
	let tab = $state<Tab>('personal');

	/* ---------- completion ----------
	   A section counts as complete when its main fields are on file. */
	const p = $derived(data.profile);
	const sections = $derived([
		{ id: 'personal' as Tab, label: 'Personal information', done: Boolean(p?.phone && p?.address) },
		{ id: 'employment' as Tab, label: 'Employment information', done: Boolean(p?.employeeCode && p?.designation) },
		{ id: 'bank' as Tab, label: 'Bank details', done: Boolean(p?.bankAccountNumber && p?.bankName && p?.bankIfsc) },
		{ id: 'family' as Tab, label: 'Family information', done: Boolean(p?.fatherName || p?.motherName) },
		{ id: 'education' as Tab, label: 'Education information', done: Boolean(p?.underGraduate || p?.graduate || p?.masters || p?.diplomaOthers) },
		{ id: 'personal' as Tab, label: 'Emergency contact', done: Boolean(p?.emergencyContactName && p?.emergencyContactPhone) }
	]);
	const doneCount = $derived(sections.filter((s) => s.done).length);
	const completion = $derived(Math.round((doneCount / sections.length) * 100));

	const mask = (value: string | null | undefined, keep = 4) => (value ? '•••• •••• ' + String(value).slice(-keep) : 'Not added');
	const maskShort = (value: string | null | undefined, keep = 4) => (value ? '••••••' + String(value).slice(-keep) : 'Not added');

	const location = $derived([p?.floorDetails, p?.teamAndFloor].filter(Boolean).join(' · ') || null);
	const lastUpdated = $derived(
		p?.updatedAt ? new Date(p.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null
	);
	const quals = $derived([p?.underGraduate, p?.graduate, p?.masters, p?.diplomaOthers].filter(Boolean) as string[]);

	function resetDraft() {
		phone = data.profile?.phone ?? '';
		personalEmail = data.profile?.personalEmail ?? '';
		address = data.profile?.address ?? '';
		permanentAddress = data.profile?.permanentAddress ?? '';
		emergencyContactName = data.profile?.emergencyContactName ?? '';
		emergencyContactRelationship = data.profile?.emergencyContactRelationship ?? '';
		emergencyContactPhone = data.profile?.emergencyContactPhone ?? '';
		fatherName = data.profile?.fatherName ?? '';
		motherName = data.profile?.motherName ?? '';
		maritalStatus = data.profile?.maritalStatus ?? '';
		spouseName = data.profile?.spouseName ?? '';
		bankAccountNumber = data.profile?.bankAccountNumber ?? '';
		bankAccountHolderName = data.profile?.bankAccountHolderName ?? '';
		bankName = data.profile?.bankName ?? '';
		bankIfsc = data.profile?.bankIfsc ?? '';
		aadharNumber = data.profile?.aadharNumber ?? '';
		panNumber = data.profile?.panNumber ?? '';
		uanNumber = data.profile?.uanNumber ?? '';
		underGraduate = data.profile?.underGraduate ?? '';
		graduate = data.profile?.graduate ?? '';
		masters = data.profile?.masters ?? '';
		diplomaOthers = data.profile?.diplomaOthers ?? '';
		totalExperience = data.profile?.totalExperience ?? '';
		saveError = '';
	}

	function startEditing() {
		resetDraft();
		editing = true;
	}

	function cancel() {
		resetDraft();
		editing = false;
	}
</script>

<svelte:head>
	<title>My profile — Champ HR</title>
</svelte:head>

<PageHeader
	crumb={['Profile', tab === 'bank' ? 'Bank and identity details' : 'Your details']}
	title={tab === 'bank' ? 'Keep your essentials up to date.' : 'Your details, in one place.'}
	sub={tab === 'bank' ? 'Your bank and identity details are used for salary processing and official records.' : 'View and manage your personal and employment information.'}
	compact
/>

<form
	method="POST"
	action="?/updateSelfService"
	use:enhance={({ cancel }) => {
		if (saving) { cancel(); return; }
		saving = true;
		saveError = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'success') {
					await update({ reset: false });
					editing = false;
				} else if (result.type === 'redirect') {
					await update();
				} else {
					saveError = 'Could not save your changes. Your edits are still here; please try again.';
				}
			} catch {
				saveError = 'Could not confirm the save. Refresh your profile before trying again.';
			} finally {
				saving = false;
			}
		};
	}}
>
	{#if saveError}<p class="ess-error" role="alert">{saveError}</p>{/if}
	<!-- Identity header -->
	<section class="ess-card identity">
		<div class="identity-main">
			<AvatarUpload userId={data.userRow.id} fullName={data.userRow.fullName} hasPicture={data.hasProfilePicture} pictureVersion={data.profilePictureVersion} compact />
			<div class="identity-text">
				<h2 class="name">{data.userRow.fullName}</h2>
				{#if p?.designation}<p class="designation">{p.designation}</p>{/if}
				{#if p?.employeeCode}<p class="code">{p.employeeCode}</p>{/if}
			</div>
		</div>
		<div class="identity-facts">
			<div class="fact">
				<UserRound size={18} strokeWidth={1.75} />
				<div>
					<span class="fact-label">Manager</span>
					<span class="fact-value">
						{#if data.managers?.direct}
							<span class="manager">{data.managers.direct.display}</span>
							{#if data.managers.direct.unlinked}<span class="unlinked">not in system</span>{/if}
						{:else}—{/if}
					</span>
				</div>
			</div>
			<div class="fact">
				<Building size={18} strokeWidth={1.75} />
				<div>
					<span class="fact-label">Location</span>
					<span class="fact-value">{location ?? '—'}</span>
				</div>
			</div>
		</div>
		<div class="identity-actions">
			{#if editing}
				<button type="button" class="ess-btn ess-btn--secondary" onclick={cancel} disabled={saving}>Cancel</button>
				<button type="submit" class="ess-btn ess-btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
			{:else}
				<button type="button" class="ess-btn ess-btn--primary" onclick={startEditing}>
					<PenLine size={16} /> Edit details
				</button>
			{/if}
		</div>
	</section>

	<div class="ess-split layout">
		<div class="main">
			<div class="ess-tabs tabs" role="tablist" aria-label="Profile sections">
				{#each TABS as t (t.id)}
					<button type="button" role="tab" class="ess-tab" aria-selected={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
				{/each}
			</div>

			<!-- ===== Personal ===== -->
			<div class="panel ess-stack" hidden={tab !== 'personal'} role="tabpanel">
				<ProfileCard icon={User} title="Contact information">
					<div class="fields">
						<div class="ess-field">
							<label class="ess-label" for="pf-phone">Phone number</label>
							{#if editing}
								<div class="ess-search"><Phone size={16} /><input id="pf-phone" class="ess-input" name="phone" bind:value={phone} /></div>
							{:else}
								<p class="value"><Phone size={16} /> {p?.phone || 'No phone on file'}</p>
							{/if}
							<span class="ess-help">Used for official communication</span>
						</div>
						<div class="ess-field">
							<label class="ess-label" for="pf-email">Personal email</label>
							{#if editing}
								<div class="ess-search"><Mail size={16} /><input id="pf-email" class="ess-input" name="personalEmail" bind:value={personalEmail} /></div>
							{:else}
								<p class="value"><Mail size={16} /> {p?.personalEmail || data.userRow.email}</p>
							{/if}
							<span class="ess-help">Used for account recovery and personal updates</span>
						</div>
						<div class="ess-field">
							<label class="ess-label" for="pf-address">Current address</label>
							{#if editing}
								<textarea id="pf-address" class="ess-textarea" name="address" rows="3" bind:value={address}></textarea>
							{:else}
								<p class="value value--multi"><MapPin size={16} /> {p?.address || 'No address on file'}</p>
							{/if}
						</div>
						<div class="ess-field">
							<label class="ess-label" for="pf-paddress">Permanent address</label>
							{#if editing}
								<textarea id="pf-paddress" class="ess-textarea" name="permanentAddress" rows="3" bind:value={permanentAddress}></textarea>
							{:else}
								<p class="value value--multi"><MapPin size={16} /> {p?.permanentAddress || p?.address || 'No address on file'}</p>
							{/if}
						</div>
					</div>
					{#if !editing && (p?.dobActual || p?.dobDocuments || p?.gender || p?.bloodGroup || p?.religion || p?.motherTongue)}
						<dl class="ess-kv extra">
							{#if p?.dobActual || p?.dobDocuments}<dt>Date of birth</dt><dd>{p.dobActual || p.dobDocuments}</dd>{/if}
							{#if p?.gender}<dt>Gender</dt><dd>{p.gender}</dd>{/if}
							{#if p?.bloodGroup}<dt>Blood group</dt><dd>{p.bloodGroup}</dd>{/if}
							{#if p?.religion}<dt>Religion</dt><dd>{p.religion}</dd>{/if}
							{#if p?.motherTongue}<dt>Mother tongue</dt><dd>{p.motherTongue}</dd>{/if}
						</dl>
					{/if}
				</ProfileCard>

				<ProfileCard icon={Briefcase} title="Employment information" note="Maintained by HR.">
					<div class="kv-cols">
						<dl class="ess-kv">
							<dt>Employee ID</dt><dd class="mono">{p?.employeeCode || '—'}</dd>
							<dt>Department</dt><dd>{p?.subProcessDepartment || '—'}</dd>
							<dt>Job title</dt><dd>{p?.designation || '—'}</dd>
							<dt>Date of joining</dt><dd>{p?.dateOfJoining || '—'}</dd>
						</dl>
						<dl class="ess-kv">
							<dt>Work location</dt><dd>{location ?? '—'}</dd>
							<dt>Team</dt><dd>{p?.teamAndFloor || '—'}</dd>
							<dt>Work email</dt><dd class="official-email">{data.userRow.email}</dd>
							<dt>Reporting manager</dt>
							<dd>
								{#if data.managers?.direct}
									<span class="manager">{data.managers.direct.display}</span>
									{#if data.managers.direct.unlinked}<span class="unlinked">not in system</span>{/if}
								{:else}—{/if}
							</dd>
						</dl>
					</div>
				</ProfileCard>

				<ProfileCard icon={Lock} title="Security">
					<a href="/change-password" class="security-row">
						<span class="ess-tile ess-tile--sm ess-tile--neutral"><LockKeyhole size={16} /></span>
						<span class="ess-row__body">
							<span class="ess-row__title">Password</span>
							<span class="ess-row__meta">Keep your account secure with a strong password.</span>
						</span>
						<span class="ess-btn ess-btn--soft ess-btn--sm">Change password <ChevronRight size={14} /></span>
					</a>
				</ProfileCard>
			</div>

			<!-- ===== Employment ===== -->
			<div class="panel ess-stack" hidden={tab !== 'employment'} role="tabpanel">
				<ProfileCard icon={Briefcase} title="Job information" note="These fields are maintained by HR and cannot be edited here.">
					<div class="kv-cols">
						<dl class="ess-kv">
							<dt>Employee code</dt><dd class="mono">{p?.employeeCode || '—'}</dd>
							<dt>Official email</dt><dd class="official-email">{data.userRow.email}</dd>
							<dt>Designation</dt><dd>{p?.designation || '—'}</dd>
							<dt>Department</dt><dd>{p?.subProcessDepartment || '—'}</dd>
							<dt>Team</dt><dd>{p?.teamAndFloor || '—'}</dd>
							<dt>Floor</dt><dd>{p?.floorDetails || '—'}</dd>
						</dl>
						<dl class="ess-kv">
							<dt>Joined</dt><dd>{p?.dateOfJoining || '—'}</dd>
							{#if tenure}<dt>Tenure</dt><dd>{tenure}</dd>{/if}
							<dt>Confirmed</dt><dd>{p?.dateOfConfirmation || '—'}</dd>
							<dt>Shift</dt><dd>{p?.shiftType || '—'} ({p?.officeTimings || '—'})</dd>
							<dt>Reports to</dt>
							<dd>
								{#if data.managers?.direct}
									<span class="manager">{data.managers.direct.display}</span>
									{#if data.managers.direct.unlinked}<span class="unlinked">not in system</span>{/if}
								{:else}—{/if}
							</dd>
							<!-- Only shown when there is a second manager to name; the server
							     suppresses a dotted line that repeats the direct one. -->
							{#if data.managers?.dotted}
								<dt>Dotted line</dt>
								<dd>
									<span class="manager">{data.managers.dotted.display}</span>
									{#if data.managers.dotted.unlinked}<span class="unlinked">not in system</span>{/if}
								</dd>
							{/if}
						</dl>
					</div>
				</ProfileCard>

				<ProfileCard icon={Shield} title="Benefits">
					<p class="plain">Insurance, PF, ESI, Gratuity</p>
				</ProfileCard>
			</div>

			<!-- ===== Bank & IDs ===== -->
			<div class="panel ess-stack" hidden={tab !== 'bank'} role="tabpanel">
				<ProfileCard icon={Banknote} title="Bank details" note="Your salary will be credited to this account.">
					<div class="form-rows">
						<label class="form-row">
							<span>Account holder name</span>
							{#if editing}<input class="ess-input" name="bankAccountHolderName" bind:value={bankAccountHolderName} />{:else}<span class="ro">{p?.bankAccountHolderName || data.userRow.fullName}</span>{/if}
						</label>
						<label class="form-row">
							<span>Bank name</span>
							{#if editing}<input class="ess-input" name="bankName" bind:value={bankName} />{:else}<span class="ro">{p?.bankName || 'Not added'}</span>{/if}
						</label>
						<label class="form-row">
							<span>Account number</span>
							{#if editing}<input class="ess-input" name="bankAccountNumber" bind:value={bankAccountNumber} inputmode="numeric" />{:else}<span class="ro">{mask(p?.bankAccountNumber)}</span>{/if}
						</label>
						<label class="form-row">
							<span>IFSC code</span>
							{#if editing}<input class="ess-input" name="bankIfsc" bind:value={bankIfsc} />{:else}<span class="ro">{p?.bankIfsc ? p.bankIfsc.slice(0, 4) + '•••• ••••' : 'Not added'}</span>{/if}
						</label>
					</div>
				</ProfileCard>

				<ProfileCard icon={FileText} title="Identity details" note="These details are used for statutory and compliance purposes.">
					<div class="form-rows">
						<label class="form-row">
							<span>Aadhaar number</span>
							{#if editing}<input class="ess-input" name="aadharNumber" bind:value={aadharNumber} inputmode="numeric" />{:else}<span class="ro">{mask(p?.aadharNumber)}</span>{/if}
						</label>
						<label class="form-row">
							<span>PAN number</span>
							{#if editing}<input class="ess-input" name="panNumber" bind:value={panNumber} />{:else}<span class="ro">{maskShort(p?.panNumber)}</span>{/if}
						</label>
						<label class="form-row">
							<span>UAN number</span>
							{#if editing}<input class="ess-input" name="uanNumber" bind:value={uanNumber} inputmode="numeric" />{:else}<span class="ro">{maskShort(p?.uanNumber)}</span>{/if}
						</label>
					</div>
				</ProfileCard>
			</div>

			<!-- ===== Family ===== -->
			<div class="panel ess-stack" hidden={tab !== 'family'} role="tabpanel">
				<ProfileCard icon={Users} title="Family details">
					<div class="fields">
						<div class="ess-field">
							<label class="ess-label" for="pf-father">Father's name</label>
							{#if editing}<input id="pf-father" class="ess-input" name="fatherName" bind:value={fatherName} />{:else}
								<p class="value">{p?.fatherName || 'Not added'}{#if p?.fatherContact}<span class="muted"> · {p.fatherContact}</span>{/if}</p>{/if}
						</div>
						<div class="ess-field">
							<label class="ess-label" for="pf-mother">Mother's name</label>
							{#if editing}<input id="pf-mother" class="ess-input" name="motherName" bind:value={motherName} />{:else}
								<p class="value">{p?.motherName || 'Not added'}{#if p?.motherContact}<span class="muted"> · {p.motherContact}</span>{/if}</p>{/if}
						</div>
						<div class="ess-field">
							<label class="ess-label" for="pf-marital">Marital status</label>
							{#if editing}<input id="pf-marital" class="ess-input" name="maritalStatus" bind:value={maritalStatus} />{:else}<p class="value">{p?.maritalStatus || 'Not added'}</p>{/if}
						</div>
						<div class="ess-field">
							<label class="ess-label" for="pf-spouse">Spouse name</label>
							{#if editing}<input id="pf-spouse" class="ess-input" name="spouseName" bind:value={spouseName} />{:else}<p class="value">{p?.spouseName || 'Not added'}</p>{/if}
						</div>
					</div>
					{#if !editing && (p?.anniversaryDate || p?.children?.length)}
						<dl class="ess-kv extra">
							{#if p?.anniversaryDate}<dt>Anniversary</dt><dd>{p.anniversaryDate}</dd>{/if}
							{#if p?.children?.length}
								<dt>Children</dt>
								<dd>{p.children.map((c) => (c.dob ? `${c.name} (${c.dob})` : c.name)).join(', ')}</dd>
							{/if}
						</dl>
					{/if}
				</ProfileCard>
			</div>

			<!-- ===== Education ===== -->
			<div class="panel ess-stack" hidden={tab !== 'education'} role="tabpanel">
				<ProfileCard icon={GraduationCap} title="Education & experience">
					{#if editing}
						<div class="fields">
							<div class="ess-field"><label class="ess-label" for="pf-ug">Under graduate</label><input id="pf-ug" class="ess-input" name="underGraduate" bind:value={underGraduate} /></div>
							<div class="ess-field"><label class="ess-label" for="pf-g">Graduate</label><input id="pf-g" class="ess-input" name="graduate" bind:value={graduate} /></div>
							<div class="ess-field"><label class="ess-label" for="pf-m">Masters</label><input id="pf-m" class="ess-input" name="masters" bind:value={masters} /></div>
							<div class="ess-field"><label class="ess-label" for="pf-d">Diploma / others</label><input id="pf-d" class="ess-input" name="diplomaOthers" bind:value={diplomaOthers} /></div>
							<div class="ess-field"><label class="ess-label" for="pf-exp">Total experience</label><input id="pf-exp" class="ess-input" name="totalExperience" bind:value={totalExperience} /></div>
						</div>
					{:else}
						<dl class="ess-kv">
							<dt>Under graduate</dt><dd>{p?.underGraduate || '—'}</dd>
							<dt>Graduate</dt><dd>{p?.graduate || '—'}</dd>
							<dt>Masters</dt><dd>{p?.masters || '—'}</dd>
							<dt>Diploma / others</dt><dd>{p?.diplomaOthers || '—'}</dd>
							<dt>Total experience</dt><dd>{p?.totalExperience || '—'}</dd>
						</dl>
						{#if quals.length === 0}<p class="muted">No qualifications added yet.</p>{/if}
					{/if}
				</ProfileCard>
			</div>
		</div>

		<!-- ===== Aside ===== -->
		<aside class="ess-stack aside">
			{#if tab === 'bank'}
				<section class="ess-card">
					<h3 class="ess-h2 aside-h">Visibility &amp; updates</h3>
					<div class="privacy">
						<span class="ess-tile ess-tile--lg ess-tile--round"><Lock size={24} strokeWidth={1.75} /></span>
						<strong>Only you and authorised HR can view these details.</strong>
						<p>Your bank and identity information is kept confidential and is accessible only to you and the designated HR team for legitimate work purposes.</p>
					</div>
					{#if lastUpdated}
						<div class="aside-row">
							<Clock size={18} strokeWidth={1.75} />
							<div><span class="fact-label">Last updated</span><span class="fact-value">{lastUpdated}</span></div>
						</div>
					{/if}
					<div class="aside-row">
						<Info size={18} strokeWidth={1.75} />
						<p class="aside-note">To update any of these details, choose <strong>Edit details</strong> and save the changes.</p>
					</div>
				</section>
			{:else}
				<section class="ess-card">
					<div class="completion-head">
						<h3 class="ess-h2 aside-h">Profile completion</h3>
						<span class="pct">{completion}%</span>
					</div>
					<div class="ess-meter" role="progressbar" aria-valuenow={completion} aria-valuemin="0" aria-valuemax="100"><span style="width:{completion}%"></span></div>
					<p class="muted">{doneCount} of {sections.length} sections complete</p>
					<div class="checklist">
						<strong>Complete your profile</strong>
						<ul>
							{#each sections as s (s.label)}
								<li>
									<button type="button" class="check-row" onclick={() => (tab = s.id)}>
										<span class="check" class:done={s.done}>{#if s.done}<Check size={12} strokeWidth={3} />{/if}</span>
										<span>{s.label}</span>
										{#if !s.done}<ChevronRight size={16} class="chev" />{/if}
									</button>
								</li>
							{/each}
						</ul>
					</div>
				</section>

				<section class="ess-card">
					<h3 class="ess-h2 aside-h">Emergency contact</h3>
					<div class="form-rows form-rows--narrow">
						<label class="form-row">
							<span>Name</span>
							{#if editing}<input class="ess-input" name="emergencyContactName" bind:value={emergencyContactName} />{:else}<span class="ro">{p?.emergencyContactName || 'Not added'}</span>{/if}
						</label>
						<label class="form-row">
							<span>Relationship</span>
							{#if editing}<input class="ess-input" name="emergencyContactRelationship" bind:value={emergencyContactRelationship} />{:else}<span class="ro">{p?.emergencyContactRelationship || '—'}</span>{/if}
						</label>
						<label class="form-row">
							<span>Phone number</span>
							{#if editing}<input class="ess-input" name="emergencyContactPhone" bind:value={emergencyContactPhone} />{:else}<span class="ro">{p?.emergencyContactPhone || '—'}</span>{/if}
						</label>
					</div>
				</section>
			{/if}

			{#if editing}
				<div class="footer-actions">
					<button type="button" class="ess-btn ess-btn--secondary" onclick={cancel} disabled={saving}>Cancel</button>
					<button type="submit" class="ess-btn ess-btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
				</div>
			{/if}
		</aside>
	</div>
</form>

<style>
	/* ---------- identity header ---------- */
	.identity {
		display: flex;
		align-items: center;
		gap: 28px;
		padding: 22px 24px;
		margin-bottom: 20px;
		flex-wrap: wrap;
	}
	.identity-main {
		display: flex;
		align-items: center;
		gap: 22px;
		min-width: 0;
	}
	.identity-text {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.name {
		font-family: var(--ess-font-display);
		font-size: 30px;
		font-weight: 600;
		line-height: 1.1;
		color: var(--ess-text);
	}
	.designation {
		font-size: 16px;
		color: var(--ess-text-secondary);
	}
	.code {
		font-family: var(--ess-font-mono);
		font-size: 13px;
		letter-spacing: 0.03em;
		color: var(--ess-text-muted);
	}
	.identity-facts {
		display: grid;
		gap: 12px;
		padding-left: 28px;
		border-left: 1px solid var(--ess-border);
	}
	.fact,
	.aside-row {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		color: var(--ess-text-muted);
	}
	.fact > div,
	.aside-row > div {
		display: grid;
		gap: 1px;
	}
	.fact-label {
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}
	.fact-value {
		font-size: 14.5px;
		font-weight: 500;
		color: var(--ess-text);
	}
	.identity-actions {
		margin-left: auto;
		display: flex;
		gap: 10px;
		flex: none;
	}

	/* ---------- layout ---------- */
	.layout {
		--ess-aside-width: 420px;
	}
	.main {
		display: grid;
		gap: 20px;
		align-content: start;
	}
	.tabs {
		align-self: flex-start;
	}
	.panel[hidden] {
		display: none;
	}

	/* ---------- fields ---------- */
	.fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px 24px;
	}
	.value {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 42px;
		padding: 9px 12px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-sm);
		background: var(--ess-sunken);
		font-size: 14px;
		color: var(--ess-text);
		overflow-wrap: anywhere;
	}
	.value--multi {
		align-items: flex-start;
		min-height: 70px;
		white-space: pre-line;
	}
	.value :global(svg) {
		flex: none;
		color: var(--ess-text-muted);
		margin-top: 1px;
	}
	.extra {
		padding-top: 12px;
		border-top: 1px solid var(--ess-border-subtle);
	}
	.kv-cols {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px 32px;
	}
	.kv-cols .ess-kv {
		row-gap: 12px;
	}
	.plain {
		color: var(--ess-text-secondary);
	}
	.mono {
		font-family: var(--ess-font-mono);
		letter-spacing: 0.02em;
	}
	.official-email {
		overflow-wrap: anywhere;
	}
	/* "Deepak Guduru(CIPL0225)" is one unit — without this the code wraps onto
	   its own line in a narrow column and reads as a separate field. */
	.manager {
		display: inline-block;
	}
	/* Marks a manager who exists only as a name in the HR sheet, so a missing
	   employee code reads as "we don't have them" rather than an error. */
	.unlinked {
		font-size: 11px;
		color: var(--ess-text-muted);
		border: 1px solid var(--ess-border);
		border-radius: 999px;
		padding: 1px 7px;
		margin-left: 6px;
		white-space: nowrap;
	}
	.muted {
		font-size: 13px;
		color: var(--ess-text-muted);
	}

	/* Label on the left, value box on the right (Bank & IDs, emergency contact). */
	.form-rows {
		display: grid;
		gap: 12px;
	}
	.form-row {
		display: grid;
		grid-template-columns: 200px minmax(0, 1fr);
		align-items: center;
		gap: 16px;
		font-size: 14px;
		color: var(--ess-text-secondary);
	}
	.form-rows--narrow .form-row {
		grid-template-columns: 110px minmax(0, 1fr);
	}
	.ro {
		display: flex;
		align-items: center;
		min-height: 42px;
		padding: 9px 14px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-sm);
		background: var(--ess-sunken);
		color: var(--ess-text);
		font-size: 14.5px;
		letter-spacing: 0.02em;
	}

	.security-row {
		display: flex;
		align-items: center;
		gap: 14px;
		color: var(--ess-text);
	}

	/* ---------- aside ---------- */
	.aside-h {
		font-size: 20px;
		margin-bottom: 14px;
	}
	.completion-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.pct {
		font-family: var(--ess-font-display);
		font-size: 24px;
		font-weight: 600;
	}
	.completion-head + .ess-meter {
		margin-bottom: 8px;
	}
	.checklist {
		margin-top: 16px;
		padding: 16px 18px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-primary-softer);
	}
	.checklist strong {
		font-family: var(--ess-font-display);
		font-size: 17px;
		font-weight: 600;
	}
	.checklist ul {
		list-style: none;
		margin: 10px 0 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.check-row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 6px 4px;
		border: none;
		border-radius: var(--ess-radius-sm);
		background: transparent;
		font: inherit;
		font-size: 14px;
		color: var(--ess-text);
		text-align: left;
		cursor: pointer;
	}
	.check-row:hover {
		background: var(--ess-primary-soft);
	}
	.check-row :global(.chev) {
		margin-left: auto;
		color: var(--ess-text-muted);
	}
	.check {
		flex: none;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 2px solid var(--ess-border-strong);
		background: var(--ess-surface);
		color: #fff;
	}
	.check.done {
		background: var(--ess-success);
		border-color: var(--ess-success);
	}

	.privacy {
		display: grid;
		justify-items: center;
		text-align: center;
		gap: 10px;
		padding: 8px 0 18px;
		border-bottom: 1px solid var(--ess-border-subtle);
		margin-bottom: 14px;
	}
	.privacy strong {
		font-family: var(--ess-font-display);
		font-size: 19px;
		font-weight: 600;
		line-height: 1.25;
	}
	.privacy p {
		font-size: 14px;
		color: var(--ess-text-secondary);
	}
	.aside-row {
		padding: 10px 0;
		border-bottom: 1px solid var(--ess-border-subtle);
	}
	.aside-row:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}
	.aside-note {
		font-size: 13.5px;
		color: var(--ess-text-secondary);
	}
	.aside-note strong {
		color: var(--ess-text);
	}

	.footer-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}

	@media (max-width: 900px) {
		.identity {
			align-items: flex-start;
		}
		.identity-facts {
			padding-left: 0;
			border-left: none;
		}
		.identity-actions {
			margin-left: 0;
			width: 100%;
		}
		.fields,
		.kv-cols {
			grid-template-columns: 1fr;
		}
		.form-row {
			grid-template-columns: 1fr;
			gap: 6px;
		}
		.tabs {
			align-self: stretch;
		}
		.tabs .ess-tab {
			min-width: 0;
			flex: 1;
		}
	}
</style>
