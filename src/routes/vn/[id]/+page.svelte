<script lang="ts">
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import Search from '@lucide/svelte/icons/search';
	import type { PageData } from './$types';
	import SectionHeader from '#lib/components/shell/SectionHeader.svelte';
	import Tabs from '#lib/components/controls/Tabs.svelte';
	import SegmentedControl from '#lib/components/controls/SegmentedControl.svelte';
	import EmptyState from '#lib/components/feedback/EmptyState.svelte';
	import NamePair from '#lib/components/identity/NamePair.svelte';
	import StatInline from '#lib/components/identity/StatInline.svelte';
	import AliasChip from '#lib/components/identity/AliasChip.svelte';
	import RatingTag from '#lib/components/identity/RatingTag.svelte';
	import ProducerShape from '#lib/components/identity/ProducerShape.svelte';
	import ProducerTypeBadge from '#lib/components/identity/ProducerTypeBadge.svelte';
	import EpistemicGlyph from '#lib/components/epistemic/EpistemicGlyph.svelte';
	import PotentialAliasFlag from '#lib/components/epistemic/PotentialAliasFlag.svelte';
	import RoleMark from '#lib/components/people/RoleMark.svelte';
	import RolePill from '#lib/components/people/RolePill.svelte';
	import MobilityIndicator from '#lib/components/people/MobilityIndicator.svelte';
	import {
		ALIAS_USED_HINT,
		ALL_DEV_STAFF_HINT,
		EDITION_CREDIT_HINT,
		MOBILITY_HINT,
		SEIYUU_HINT,
		VNDB_SCORE_HINT,
		roleMeta
	} from '#lib/roles.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';
	import { VN_RELATION_LABELS, VN_RELATION_ORDER, compareHref, matchesText, num, vndbHref } from '#lib/util.ts';

	let { data }: { data: PageData } = $props();

	const v = $derived(data.vn);
	const developers = $derived(data.producers.filter((p) => p.isOriginalDev));
	const others = $derived(data.producers.filter((p) => !p.isOriginalDev));
	const devIds = $derived(new Set(developers.map((d) => d.pid)));
	let othersAll = $state(false);
	const othersShown = $derived(othersAll ? others : others.slice(0, 4));

	// ── Credits ──
	type CreditTab = 'staff' | 'cast';
	let tabChoice = $state<CreditTab | null>(null);
	const tab = $derived<CreditTab>(
		tabChoice ?? (data.staffCredits.length === 0 && data.seiyuuCredits.length > 0 ? 'cast' : 'staff')
	);
	type Edition = 'all' | 'original';
	let edition = $state<Edition>('all');
	let creditQuery = $state('');
	let expandedNotes = $state<Record<string, boolean>>({});
	const hasEditions = $derived(data.staffCredits.some((c) => c.isEditionCredit));
	const showCreditFilter = $derived(data.staffCredits.length + data.seiyuuCredits.length > 15);
	const hasPotentialAliasFlags = $derived(
		data.staffCredits.some((c) => c.potentialAliasCount > 0) ||
			data.seiyuuCredits.some((c) => c.potentialAliasCount > 0)
	);

	/** One row per person and role, grouped by role in precedence order. */
	const staffGroups = $derived.by(() => {
		const rows = data.staffCredits.filter(
			(c) =>
				(edition === 'all' || !c.isEditionCredit) &&
				matchesText(
					creditQuery,
					c.name,
					c.original,
					c.aliasUsed,
					c.aliasOriginal,
					c.note,
					roleMeta(c.role).label,
					roleMeta(c.role).code
				)
		);
		const byRole = new Map<string, typeof rows>();
		for (const c of rows) {
			const list = byRole.get(c.role) ?? [];
			// The same person can be credited once per edition: keep one row per role.
			if (!list.some((x) => x.sid === c.sid && x.aliasUsed === c.aliasUsed && x.note === c.note)) {
				list.push(c);
			}
			byRole.set(c.role, list);
		}
		return [...byRole.entries()]
			.sort((a, b) => roleMeta(a[0]).order - roleMeta(b[0]).order)
			.map(([role, list]) => ({ role, list }));
	});
	// Counted from the rows on screen, so the tab and the heading follow the
	// Edition filter: with Original only, people credited on a port alone drop out.
	const staffPeople = $derived(
		new Set(staffGroups.flatMap((g) => g.list.map((c) => c.sid))).size
	);

	/** Cast grouped by character, so several records for one character sit together. */
	const castGroups = $derived.by(() => {
		const byChar = new Map<
			string,
			{ cid: string; name: string; original: string | null; voices: typeof data.seiyuuCredits }
		>();
		for (const c of data.seiyuuCredits) {
			if (
				!matchesText(
					creditQuery,
					c.charName,
					c.charOriginal,
					c.name,
					c.original,
					c.aliasUsed,
					c.aliasOriginal,
					c.note
				)
			) {
				continue;
			}
			let g = byChar.get(c.cid);
			if (!g) {
				g = { cid: c.cid, name: c.charName, original: c.charOriginal, voices: [] };
				byChar.set(c.cid, g);
			}
			if (!g.voices.some((x) => x.sid === c.sid && x.aliasUsed === c.aliasUsed)) g.voices.push(c);
		}
		return [...byChar.values()].map((g) => ({
			...g,
			distinctRecords: new Set(g.voices.map((x) => x.sid)).size,
			// Only pencil-mark the row when the dump already lists candidates for a record.
			candidateSid: g.voices.find((x) => x.potentialAliasCount > 0)?.sid ?? null
		}));
	});

	// ── Related VNs, grouped by VNDB relation ──
	const relatedGroups = $derived.by(() => {
		const by = new Map<string, typeof data.relatedVns>();
		for (const r of data.relatedVns) by.set(r.relation, [...(by.get(r.relation) ?? []), r]);
		const rank = (k: string) => {
			const i = VN_RELATION_ORDER.indexOf(k);
			return i === -1 ? VN_RELATION_ORDER.length : i;
		};
		return [...by.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
	});
	function differentDev(r: (typeof data.relatedVns)[number]): boolean {
		return (
			devIds.size > 0 && r.developers.length > 0 && !r.developers.some((d) => devIds.has(d.pid))
		);
	}
	function noteNeedsToggle(note: string): boolean {
		let units = 0;
		for (const ch of note) units += ch.charCodeAt(0) > 0x7f ? 2 : 1;
		return units >= 100;
	}
</script>

<svelte:head>
	<title>{v.title} · visual novel · VNDB Explorer</title>
</svelte:head>

<header id="overview" class="pt-4 pb-3">
	<p class="flex flex-wrap items-center gap-2 text-xs font-medium text-ink-3">
		<span>Visual novel</span>
		{#if v.olang}<span class="font-mono font-normal" title="Original language">{v.olang}</span>{/if}
		<RatingTag hasEro={v.hasEro} hasAllAges={v.hasAllAges} showAllAges />
	</p>
	<h1 class="mt-1">
		<NamePair name={v.title} original={v.original} lang={v.olang} variant="stacked" />
	</h1>
	<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
		<StatInline
			items={[
				{ value: v.firstYear ?? 'Unreleased', label: v.firstYear ? 'first release' : undefined, mono: true },
				...(v.rating != null ? [{ value: v.rating.toFixed(2), label: 'VNDB score', title: VNDB_SCORE_HINT }] : []),
				{ value: num(v.votecount), label: v.votecount === 1 ? 'vote' : 'votes' }
			]}
		/>
		<span class="flex items-center gap-3 text-xs">
			<a class="link font-medium" href="/?vn={v.id}">Spotlight on Atlas →</a>
			<a class="link inline-flex items-center gap-0.5 text-ink-3" href={vndbHref(v.id)} target="_blank" rel="noopener noreferrer">
				VNDB<ArrowUpRight size={10} />
			</a>
		</span>
	</div>
</header>

<!-- Original developers vs ports and publishers: never mixed. -->
<div class="grid items-start gap-x-6 gap-y-4 border-t border-rule pt-4 lg:grid-cols-2">
	<section aria-labelledby="developed-by">
		<div class="flex items-center justify-between gap-2">
			<h2 id="developed-by" class="text-xs font-medium text-ink-3">Developed by</h2>
			{#if developers.length >= 2}
				<a class="link text-xs" href={compareHref(developers[0].pid, developers[1].pid)}>Compare co-developers →</a>
			{/if}
		</div>
		{#if developers.length === 0}
			<p class="mt-2 text-sm text-ink-3">No original developer recorded in VNDB.</p>
		{:else}
			<ul class="mt-2 divide-y divide-rule border-y border-rule">
				{#each developers as d (d.pid)}
					<li class="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2.5">
						<ProducerShape type={d.type} size={11} />
						<span class="min-w-0 text-md font-semibold">
							<NamePair name={d.name} original={d.original} lang={d.lang} href="/producer/{d.pid}" />
						</span>
						<ProducerTypeBadge type={d.type} lang={d.lang} />
						<a class="btn-ghost ml-auto" href="/producer/{d.pid}">Open brand</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section aria-labelledby="published-by">
		<h2 id="published-by" class="text-xs font-medium text-ink-3">Published / ported by</h2>
		{#if others.length === 0}
			<p class="mt-2 text-sm text-ink-3">No separate publisher or porting producer recorded.</p>
		{:else}
			<ul class="mt-2 divide-y divide-rule border-y border-rule">
				{#each othersShown as d (d.pid)}
					<li class="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2 text-ink-2">
						<ProducerShape type={d.type} size={10} class="text-ink-3" />
						<span class="min-w-0 text-sm">
							<NamePair name={d.name} original={d.original} lang={d.lang} href="/producer/{d.pid}" />
						</span>
						<span class="ml-auto shrink-0 text-xs text-ink-3">
							{d.isPublisher ? 'Publisher' : 'Port / other release'}{d.firstYear ? ` (${d.firstYear})` : ''}
						</span>
					</li>
				{/each}
			</ul>
			{#if others.length > 4}
				<button type="button" class="btn-ghost mt-2 text-xs" onclick={() => (othersAll = !othersAll)}>
					{othersAll ? 'Show fewer' : `Show all ${others.length} publishers and porters`}
				</button>
			{/if}
		{/if}
	</section>
</div>

<!-- Credits -->
<section class="mt-10 xl:mt-14" aria-labelledby="credits">
	<!-- The count is what the two tabs add up to: people credited, and characters voiced. -->
	<SectionHeader title="Credits" id="credits" count={staffPeople + castGroups.length}>
		{#snippet actions()}
			<div class="flex flex-wrap items-center gap-3">
				{#if showCreditFilter}
					<label class="relative">
						<span class="sr-only">Filter credits by person, role, alias or character</span>
						<Search size={13} class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-3" />
						<input
							type="search"
							class="field h-7 w-48 pl-7 text-xs"
							placeholder="Filter credits"
							bind:value={creditQuery}
						/>
					</label>
				{/if}
				{#if tab === 'staff' && hasEditions}
					<!-- A plain group: the segmented control is a radiogroup with its own label. -->
					<div class="flex items-center gap-2 text-xs text-ink-3">
						<span class="term" title={EDITION_CREDIT_HINT}>Edition</span>
						<SegmentedControl
							label="Edition credits"
							size="sm"
							bind:value={edition}
							options={[
								{ value: 'all', label: 'All editions', title: 'Original + ports' },
								{ value: 'original', label: 'Original only', title: 'Original release only' }
							]}
						/>
					</div>
				{/if}
			</div>
		{/snippet}
	</SectionHeader>

	{#if data.staffCredits.length === 0 && data.seiyuuCredits.length === 0}
		<!-- Missing source data, not a failed inference: plain, not hatched. -->
		<EmptyState message="No staff credits recorded in VNDB for this title." />
	{:else}
		<Tabs
			label="Credits"
			idBase="credits"
			value={tab}
			onchange={(t) => (tabChoice = t)}
			tabs={[
				{ value: 'staff', label: 'Staff', count: staffPeople, shape: 'square', title: ALL_DEV_STAFF_HINT },
				{ value: 'cast', label: 'Cast', count: castGroups.length, shape: 'circle', title: SEIYUU_HINT }
			]}
		/>

		<div class="mt-4 overflow-hidden rounded-sm" id="credits-panel-{tab}" role="tabpanel" aria-labelledby="credits-tab-{tab}" tabindex="-1">
			{#if tab === 'staff'}
				{#if staffGroups.length === 0 && creditQuery.trim()}
					<EmptyState message="No staff credits match “{creditQuery.trim()}”.">
						{#snippet actions()}
							<button type="button" class="btn-ghost" onclick={() => (creditQuery = '')}>Clear filter</button>
						{/snippet}
					</EmptyState>
				{:else if staffGroups.length === 0 && data.staffCredits.length > 0}
					<!-- Credits exist: the Edition filter is what hides them. -->
					<EmptyState message="Every staff credit on this title belongs to a later edition (a port or a localisation), and Original only hides those.">
						{#snippet actions()}
							<button type="button" class="btn-ghost" onclick={() => (edition = 'all')}>Show all {data.staffCredits.length === 1 ? 'credit' : `${data.staffCredits.length} credits`}</button>
						{/snippet}
					</EmptyState>
				{:else if staffGroups.length === 0}
					<EmptyState message="No staff credits recorded in VNDB for this title." />
				{:else}
					<div class="scroll-x">
						<table class="ledger">
							<caption class="sr-only">Staff credits of {v.title}, grouped by role</caption>
							<thead>
								<tr>
									<th scope="col" class="w-20">Role</th>
									<th scope="col">Person</th>
									<th scope="col" title={ALIAS_USED_HINT}><span class="term">Alias used</span></th>
									<th scope="col">Note</th>
									<th scope="col" title={MOBILITY_HINT}><span class="term">Mobility</span></th>
								</tr>
							</thead>
							<tbody>
								{#each staffGroups as group, gi (group.role)}
									{#each group.list as c, i (c.sid + c.aliasUsed + (c.note ?? '') + i)}
										{@const noteKey = `s|${group.role}|${c.sid}|${i}`}
										{@const noteExp = !!expandedNotes[noteKey]}
										<tr class={gi > 0 && i === 0 ? 'group-start' : ''}>
											<td>{#if i === 0}<RolePill role={group.role} />{/if}</td>
											<td class="max-w-[22rem]">
												<span class="flex items-center gap-2">
													<NamePair name={c.name} original={c.original} lang={c.lang} href="/staff/{c.sid}" />
													<PotentialAliasFlag count={c.potentialAliasCount} sid={c.sid} />
												</span>
											</td>
											<td>
												{#if c.isNonPrimaryAlias}<AliasChip alias={c.aliasUsed} original={c.aliasOriginal} bare />{:else}<span class="text-ink-4" title="Primary name">—</span>{/if}
											</td>
											<td class="max-w-[20rem] text-xs text-ink-2">
												{#if c.note}
													<span class={noteExp ? '' : 'line-clamp-2'}>{c.note}</span>
													{#if noteNeedsToggle(c.note)}
														<button
															type="button"
															class="ml-1 font-mono text-2xs text-ink-3 underline hover:text-ink"
															onclick={() => (expandedNotes[noteKey] = !noteExp)}
														>
															{noteExp ? 'less' : 'more'}
														</button>
													{/if}
												{:else if !c.isEditionCredit}
													<span class="text-ink-4">—</span>
												{/if}
												{#if c.isEditionCredit}<span class="text-2xs text-ink-3" title={EDITION_CREDIT_HINT}>{c.note ? ' · ' : ''}edition credit</span>{/if}
											</td>
											<td><MobilityIndicator brandCount={c.brandCount} sid={c.sid} personName={shownName(c.name, c.original)} /></td>
										</tr>
									{/each}
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			{:else if castGroups.length === 0 && creditQuery.trim()}
				<EmptyState message="No voice credits match “{creditQuery.trim()}”.">
					{#snippet actions()}
						<button type="button" class="btn-ghost" onclick={() => (creditQuery = '')}>Clear filter</button>
					{/snippet}
				</EmptyState>
			{:else if castGroups.length === 0}
				<EmptyState message="No voice cast recorded in VNDB for this title." />
			{:else}
				<div class="scroll-x">
					<table class="ledger">
						<caption class="sr-only">Voice cast of {v.title}, by character</caption>
						<thead>
							<tr>
								<th scope="col">Character</th>
								<th scope="col">Voiced by</th>
								<th scope="col" title={ALIAS_USED_HINT}><span class="term">Alias used</span></th>
								<th scope="col">Note</th>
							</tr>
						</thead>
						<tbody>
							{#each castGroups as g, gi (g.cid)}
								{#each g.voices as c, i (c.sid + c.aliasUsed + i)}
									{@const noteKey = `c|${g.cid}|${c.sid}|${i}`}
									{@const noteExp = !!expandedNotes[noteKey]}
									<tr class={gi > 0 && i === 0 ? 'group-start' : ''}>
										<td class="max-w-[18rem]">
											{#if i === 0}
												<span class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
													<a class="link-quiet inline-flex min-w-0 items-center gap-1" href={vndbHref(g.cid)} target="_blank" rel="noopener noreferrer">
														<NamePair name={g.name} original={g.original} />
														<ArrowUpRight size={10} class="shrink-0 text-ink-3" />
													</a>
													{#if g.distinctRecords > 1}
														{#if g.candidateSid}
															<!-- The one pencil mark on this page: two records credited for one character. -->
															<a
																href="/discover/aliases?q={g.candidateSid}"
																class="tnum inline-flex h-[18px] items-center gap-1 rounded-xs border border-dashed border-inferred/70 bg-inferred-tint px-1 text-2xs text-inferred no-underline transition-colors duration-[120ms] hover:border-ink"
																title="Multiple VNDB records · unconfirmed alias lead"
															>
																<EpistemicGlyph kind="alias-potential" size={10} inherit /> {g.distinctRecords} records
															</a>
														{:else}
															<span class="tnum text-2xs text-ink-3" title="Recast or multiple voice credits">
																{g.distinctRecords} records
															</span>
														{/if}
													{/if}
												</span>
											{/if}
										</td>
										<td class="max-w-[20rem]">
											<span class="flex items-center gap-2">
												<RoleMark role="seiyuu" size={8} />
												<NamePair name={c.name} original={c.original} lang={c.lang} href="/staff/{c.sid}" />
												<PotentialAliasFlag count={c.potentialAliasCount} sid={c.sid} />
											</span>
										</td>
										<td>
											{#if c.isNonPrimaryAlias}<AliasChip alias={c.aliasUsed} original={c.aliasOriginal} bare />{:else}<span class="text-ink-4" title="Primary name">—</span>{/if}
										</td>
										<td class="max-w-[18rem] text-xs text-ink-2">
											{#if c.note}
												<span class={noteExp ? '' : 'line-clamp-2'}>{c.note}</span>
												{#if noteNeedsToggle(c.note)}
													<button
														type="button"
														class="ml-1 font-mono text-2xs text-ink-3 underline hover:text-ink"
														onclick={() => (expandedNotes[noteKey] = !noteExp)}
													>
														{noteExp ? 'less' : 'more'}
													</button>
												{/if}
											{:else}
												<span class="text-ink-4">—</span>
											{/if}
										</td>
									</tr>
								{/each}
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
		{#if hasPotentialAliasFlags}
			<p class="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-3">
				<EpistemicGlyph kind="alias-potential" size={11} />
				<span>marks unconfirmed alias leads; credits above are from VNDB.</span>
			</p>
		{/if}
	{/if}
</section>

<!-- Related VNs -->
<section class="mt-10 xl:mt-14" aria-labelledby="related">
	<SectionHeader title="Related visual novels" id="related" count={data.relatedVns.length} />
	{#if data.relatedVns.length === 0}
		<EmptyState message="No related visual novels recorded in VNDB." />
	{:else}
		<div class="divide-y divide-rule border-y border-rule">
			{#each relatedGroups as [relation, rows] (relation)}
				<div class="grid gap-x-4 gap-y-1 py-3 md:grid-cols-[10rem_1fr]">
					<h3 class="pt-0.5 text-xs font-medium text-ink-3">{VN_RELATION_LABELS[relation] ?? relation}</h3>
					<ul class="grid gap-1.5">
						{#each rows as r (r.vid)}
							<li class="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-sm">
								<span class="tnum w-[4ch] shrink-0 font-mono text-xs text-ink-3">{r.firstYear ?? '—'}</span>
								<span class="min-w-0 max-w-full"><NamePair name={r.title} original={r.original} href="/vn/{r.vid}" /></span>
								{#if !r.official}<span class="text-2xs text-ink-3">unofficial</span>{/if}
								{#if r.developers.length > 0}
									<span class="text-xs text-ink-3">
										{#each r.developers as d, i (d.pid)}{i > 0 ? ', ' : ''}<NamePair name={d.name} original={d.original} href="/producer/{d.pid}" variant="compact" />{/each}
									</span>
								{/if}
								{#if differentDev(r)}
									<span class="rounded-xs border border-rule-strong px-1.5 text-2xs text-ink-2" title="Series developed by another studio">Different studio</span>
									{#if developers[0] && r.developers[0]}
										<a class="link text-xs" href={compareHref(developers[0].pid, r.developers[0].pid)}>Compare</a>
									{/if}
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	{/if}
</section>
