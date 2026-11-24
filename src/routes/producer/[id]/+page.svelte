<script lang="ts">
	import { goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Search from '@lucide/svelte/icons/search';
	import type { PageData } from './$types';
	import SectionHeader from '#lib/components/shell/SectionHeader.svelte';
	import SegmentedControl from '#lib/components/controls/SegmentedControl.svelte';
	import Tabs from '#lib/components/controls/Tabs.svelte';
	import EmptyState from '#lib/components/feedback/EmptyState.svelte';
	import NamePair from '#lib/components/identity/NamePair.svelte';
	import ExternalLinks from '#lib/components/identity/ExternalLinks.svelte';
	import RichText from '#lib/components/identity/RichText.svelte';
	import AliasChip from '#lib/components/identity/AliasChip.svelte';
	import YearSpan from '#lib/components/identity/YearSpan.svelte';
	import RatingTag from '#lib/components/identity/RatingTag.svelte';
	import ProducerShape from '#lib/components/identity/ProducerShape.svelte';
	import EpistemicZone from '#lib/components/epistemic/EpistemicZone.svelte';
	import PotentialAliasFlag from '#lib/components/epistemic/PotentialAliasFlag.svelte';
	import RoleMark from '#lib/components/people/RoleMark.svelte';
	import RolePills from '#lib/components/people/RolePills.svelte';
	import MobilityIndicator from '#lib/components/people/MobilityIndicator.svelte';
	import StaffVnsButton from '#lib/components/people/StaffVnsButton.svelte';
	import InferredRelationCard from '#lib/components/relations/InferredRelationCard.svelte';
	import ExplicitRelationRow from '#lib/components/relations/ExplicitRelationRow.svelte';
	import ProducerPicker, {
		type PickedProducer
	} from '#lib/components/relations/ProducerPicker.svelte';
	import RelationGraph from '#lib/components/viz/RelationGraph.svelte';
	import MigrationFlow from '#lib/components/viz/MigrationFlow.svelte';
	import {
		CONFIDENCE_HINT,
		EXPLICIT_META,
		EXPLICIT_ORDER,
		explicitTitle,
		inferredLabel,
		inferredTitle,
		toScore
	} from '#lib/relations.ts';
	import {
		ALIAS_USED_HINT,
		ALL_DEV_STAFF_HINT,
		CORE_STAFF_HINT,
		LENS_MEANING,
		MOBILITY_HINT,
		SEIYUU_HINT,
		TENURE_HINT,
		VNDB_SCORE_HINT,
		primaryRole,
		roleMeta,
		sortRoles
	} from '#lib/roles.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';
	import {
		PRODUCER_TYPE_WORD,
		compareHref,
		externalLinks,
		matchesText,
		num,
		plural,
		vndbHref,
		yearSpan
	} from '#lib/util.ts';

	/** Same name once case, spacing and punctuation are ignored. */
	function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
		const norm = (v: string) => v.normalize('NFKC').toLowerCase().replace(/[\s\-_.'’"·・,()]/g, '');
		return !!a && !!b && norm(a) === norm(b);
	}

	let { data }: { data: PageData } = $props();

	const p = $derived(data.producer);
	const pending = $derived(navigating.to?.url.pathname === page.url.pathname);
	const links = $derived(externalLinks(data.extlinks));

	// ── Lens: who is counted ──
	function setSeiyuu(next: boolean) {
		const url = new URL(page.url.href);
		if (next) url.searchParams.set('includeSeiyuu', '1');
		else url.searchParams.delete('includeSeiyuu');
		void goto(`${url.pathname}${url.search}`, { reset: false, replace: true });
	}

	// A staff record carrying the brand's own name (VNDB keeps one for credits made
	// "as the brand") is not a person behind a personal label: only a creator with
	// a distinct name is.
	const brandNames = $derived([p.name, p.original, ...p.alias]);
	const labelOwners = $derived(
		data.linkedCreators.filter(
			(c) => !brandNames.some((n) => sameName(c.name, n) || sameName(c.original, n))
		)
	);
	let expandedBrandAliases = $state(false);
	$effect(() => {
		void p.id;
		expandedBrandAliases = false;
	});

	// ── Compare with… ──
	let compareOpen = $state(false);
	let comparePick = $state<PickedProducer | null>(null);
	let compareBox = $state<HTMLDivElement | null>(null);
	let compareButton = $state<HTMLButtonElement | null>(null);
	function closeCompare(refocus = false) {
		if (!compareOpen) return;
		compareOpen = false;
		if (refocus) compareButton?.focus();
	}
	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && compareOpen) {
			e.preventDefault();
			closeCompare(true);
		}
	}
	function onWindowPointerdown(e: PointerEvent) {
		if (compareOpen && compareBox && !compareBox.contains(e.target as Node)) closeCompare();
	}
	const neighbours = $derived.by(() => {
		const seen = new Set<string>();
		const out: Array<{
			id: string;
			name: string;
			original: string | null;
			hint: string;
			/** What the code in `hint` stands for, on hover. */
			title: string;
			inferred: boolean;
		}> = [];
		for (const r of data.explicitRelations.slice(0, 4)) {
			if (seen.has(r.pid)) continue;
			seen.add(r.pid);
			out.push({
				id: r.pid,
				name: r.name,
				original: r.original ?? null,
				hint: EXPLICIT_META[r.relation].label,
				title: explicitTitle(r.relation),
				inferred: false
			});
		}
		for (const l of data.inferredRelations) {
			if (l.explicitRelation) continue;
			const isA = l.pidA === p.id;
			const id = isA ? l.pidB : l.pidA;
			if (seen.has(id)) continue;
			seen.add(id);
			out.push({
				id,
				name: isA ? l.nameB : l.nameA,
				original: (isA ? l.originalB : l.originalA) ?? null,
				hint: inferredLabel(l),
				title: inferredTitle(l, { seiyuuDriven: l.seiyuuDriven }),
				inferred: true
			});
			if (out.length >= 6) break;
		}
		return out.slice(0, 6);
	});
	const allInferredHref = $derived(
		`/discover/brands?explicitStatus=all&producerType=all&minConfidence=0${data.includeSeiyuu ? '&includeSeiyuu=1' : ''}&q=${encodeURIComponent(p.id)}`
	);

	// ── Hidden links: exclude pairs VNDB already explicitly links so we never contradict ground truth ──
	let minConfidence = $state(0);
	let showAllInferred = $state(false);
	const hiddenLinks = $derived(data.inferredRelations.filter((l) => !l.explicitRelation));
	const inferredFiltered = $derived(
		hiddenLinks.filter((l) => toScore(l.confidence) >= minConfidence)
	);
	const inferredShown = $derived(showAllInferred ? inferredFiltered : inferredFiltered.slice(0, 12));
	const explicitGroups = $derived.by(() => {
		const groups = new Map<string, typeof data.explicitRelations>();
		for (const code of EXPLICIT_ORDER) {
			const rows = data.explicitRelations.filter((r) => r.relation === code);
			if (!rows.length) continue;
			const g = EXPLICIT_META[code].group;
			groups.set(g, [...(groups.get(g) ?? []), ...rows]);
		}
		return [...groups.entries()];
	});

	// ── Roster ──
	type RosterTab = 'core' | 'seiyuu';
	type RosterSort = 'vns' | 'first' | 'name' | 'mobility';
	// The tab the reader chose on this brand. Until they choose, the roster opens
	// on Staff, or on Seiyuu when the brand has a voice cast and no development
	// credits: an empty first tab would hide the only people there are.
	let rosterTabPick = $state<{ pid: string; tab: RosterTab } | null>(null);
	const rosterTab = $derived<RosterTab>(
		rosterTabPick?.pid === p.id
			? rosterTabPick.tab
			: data.rosterTotals.dev === 0 && data.rosterTotals.seiyuu > 0
				? 'seiyuu'
				: 'core'
	);
	let rosterQuery = $state('');
	let rosterRole = $state('all');
	let onlyPenNames = $state(false);
	let rosterSort = $state<RosterSort>('vns');
	let rosterLimit = $state(50);

	// Dual-role people appear in both lists, each with its own count: development
	// credits here, voice credits there. One is never derived from the other.
	const staffRows = $derived(data.roster.filter((r) => r.devVnCountAtBrand > 0));
	const seiyuuRows = $derived(data.roster.filter((r) => r.seiyuuVnCountAtBrand > 0));
	// Each list is capped on its own; headings and tabs state the true totals from
	// the database, never the length of what was loaded.
	const staffTruncated = $derived(data.rosterTotals.dev > staffRows.length);
	const seiyuuTruncated = $derived(data.rosterTotals.seiyuu > seiyuuRows.length);
	const rosterTruncated = $derived(staffTruncated || seiyuuTruncated);
	const rosterNote = $derived.by(() => {
		const parts = [
			staffTruncated ? `${num(staffRows.length)} of ${num(data.rosterTotals.dev)} staff` : '',
			seiyuuTruncated ? `${num(seiyuuRows.length)} of ${num(data.rosterTotals.seiyuu)} seiyuu` : ''
		].filter(Boolean);
		return parts.length ? `Top ${parts.join(' & ')} loaded.` : undefined;
	});
	const inferredTruncated = $derived(data.inferredTotal > data.inferredRelations.length);
	const rosterRoles = $derived(
		sortRoles(staffRows.flatMap((r) => r.roles)).filter((r) => r !== 'seiyuu')
	);
	const rosterFiltered = $derived.by(() => {
		const base = rosterTab === 'core' ? staffRows : seiyuuRows;
		const list = base.filter((r) => {
			if (onlyPenNames && !r.usedNonPrimaryAlias) return false;
			if (rosterTab === 'core' && rosterRole !== 'all' && !r.roles.includes(rosterRole)) return false;
			return matchesText(rosterQuery, r.name, r.original, ...r.aliasesAtBrand, r.sid);
		});
		const count = (r: (typeof list)[number]) =>
			rosterTab === 'core' ? r.devVnCountAtBrand : r.seiyuuVnCountAtBrand;
		const sorted = [...list];
		if (rosterSort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
		else if (rosterSort === 'first')
			sorted.sort((a, b) => (a.firstYear ?? 9999) - (b.firstYear ?? 9999) || count(b) - count(a));
		else if (rosterSort === 'mobility') sorted.sort((a, b) => a.totalBrands - b.totalBrands || count(b) - count(a));
		else sorted.sort((a, b) => count(b) - count(a) || (a.firstYear ?? 9999) - (b.firstYear ?? 9999));
		return sorted;
	});
	const rosterShown = $derived(rosterFiltered.slice(0, rosterLimit));
	const brandSpan = $derived(
		p.firstYear != null && p.lastYear != null && p.lastYear > p.firstYear
			? { from: p.firstYear, len: p.lastYear - p.firstYear }
			: null
	);
	/** Names other than the primary one used here: the server decides by VNDB alias id. */
	function penNames(r: (typeof data.roster)[number]): string[] {
		return r.penNames;
	}
	function tenureBar(r: (typeof data.roster)[number]): { left: number; width: number } | null {
		if (!brandSpan || r.firstYear == null || r.lastYear == null) return null;
		const left = Math.max(0, Math.min(1, (r.firstYear - brandSpan.from) / brandSpan.len));
		const right = Math.max(0, Math.min(1, (r.lastYear - brandSpan.from) / brandSpan.len));
		return { left: left * 100, width: Math.max(3, (right - left) * 100) };
	}

	// ── Games ──
	type GamesTab = 'developed' | 'published';
	type RatingFilter = 'all' | 'allages' | 'ero';
	let gamesTabChoice = $state<GamesTab | null>(null);
	let ratingFilter = $state<RatingFilter>('all');
	let gamesLimit = $state(40);
	const developed = $derived(data.games.filter((g) => g.isOriginalDev));
	const published = $derived(data.games.filter((g) => !g.isOriginalDev));
	// Publisher-only brands open on the Published / ported tab.
	const gamesTab = $derived<GamesTab>(
		gamesTabChoice ??
			(data.gamesTotals.developed === 0 && data.gamesTotals.published > 0 ? 'published' : 'developed')
	);
	// Both lists are capped on their own; the heading and the tabs state true totals.
	const gamesNote = $derived.by(() => {
		const t = data.gamesTotals;
		const parts = [
			t.developed > developed.length
				? `${num(developed.length)} of ${num(t.developed)} developed`
				: '',
			t.published > published.length
				? `${num(published.length)} of ${num(t.published)} published`
				: ''
		].filter(Boolean);
		return parts.length ? `Latest ${parts.join(' & ')} loaded.` : undefined;
	});
	const gamesFiltered = $derived(
		(gamesTab === 'developed' ? developed : published).filter((g) =>
			ratingFilter === 'all' ? true : ratingFilter === 'ero' ? g.hasEro : g.hasAllAges && !g.hasEro
		)
	);
	const gamesShown = $derived(gamesFiltered.slice(0, gamesLimit));

	type BrandSectionTab = 'vndb' | 'hidden' | 'games' | 'roster' | 'migration' | 'graph';
	function initialBrandTab(): BrandSectionTab {
		const fallback: BrandSectionTab = data.explicitRelations.length > 0 ? 'vndb' : 'hidden';
		if (typeof window === 'undefined') return fallback;
		const h = window.location.hash.replace(/^#/, '');
		if (h === 'roster' || h === 'games' || h === 'migration' || h === 'graph') return h;
		if (h === 'hidden' || h === 'inferred') return 'hidden';
		if (h === 'vndb' || h === 'explicit' || h === 'relationships') return fallback;
		return fallback;
	}
	let mainTab = $state<BrandSectionTab>(initialBrandTab());
</script>

<svelte:head>
	<title>{p.name} · brand intelligence · VNDB Explorer</title>
</svelte:head>

<svelte:window onkeydown={onWindowKeydown} onpointerdown={onWindowPointerdown} />

<header id="overview" class="pt-3.5 pb-2.5">
	<div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
		<div class="min-w-0">
			<div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
				<h1 class="inline-flex items-center gap-2 text-xl font-semibold tracking-tight text-ink">
					<ProducerShape type={p.type} size={12} />
					<NamePair name={p.name} original={p.original} lang={p.lang} variant="inline" />
				</h1>
				{#if p.alias.length > 0}
					{@const shownAliases = expandedBrandAliases ? p.alias : p.alias.slice(0, 2)}
					<span class="inline-flex flex-wrap items-center gap-1 text-xs text-ink-3">
						<span>aka {shownAliases.join(', ')}</span>
						{#if p.alias.length > 2}
							<button
								type="button"
								class="tnum inline-flex h-[18px] items-center rounded-xs border border-rule-strong bg-surface-sunken px-1.5 font-mono text-2xs text-ink-2 hover:border-rule-hover hover:text-ink"
								aria-expanded={expandedBrandAliases}
								onclick={() => (expandedBrandAliases = !expandedBrandAliases)}
							>
								{expandedBrandAliases ? 'less' : `+${p.alias.length - 2}`}
							</button>
						{/if}
					</span>
				{/if}
			</div>
			<div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
				<span>{PRODUCER_TYPE_WORD[p.type] ?? 'Producer'}{#if p.lang} · <span class="font-mono">{p.lang}</span>{/if}</span>
				<span class="tnum font-mono">{yearSpan(p.firstYear, p.lastYear)}</span>
				<StaffVnsButton
					count={p.vnCount}
					label={plural(p.vnCount, 'VN')}
					title={shownName(p.name, p.original)}
					subtitle="Visual novels"
					endpoint="/api/proof/producer-vns?pid={encodeURIComponent(p.id)}&role=all"
					onMoreClick={() => (mainTab = 'games')}
					moreLabel="Open Games tab →"
					align="left"
					class="text-xs font-medium text-ink"
				/>
				<span class="tnum text-ink-2" title={CORE_STAFF_HINT}><span class="font-medium text-ink">{num(p.staffCount)}</span> core</span>
				<span class="tnum text-ink-2" title={SEIYUU_HINT}><span class="font-medium text-ink">{num(p.seiyuuCount)}</span> seiyuu</span>
				<a class="link inline-flex items-center gap-0.5" href={vndbHref(p.id)} target="_blank" rel="noopener noreferrer">
					VNDB<ArrowUpRight size={10} />
				</a>
				<ExternalLinks {links} max={1} class="text-xs" />
				{#if labelOwners.length > 0}
					<span class="text-ink-2">
						Label of {#each labelOwners as c, i (c.id)}{i > 0 ? ', ' : ''}<a class="link" href="/staff/{c.id}">{shownName(c.name, c.original)}</a>{/each}
					</span>
				{/if}
			</div>
		</div>

		<div class="relative flex shrink-0 items-center gap-2" bind:this={compareBox}>
			<a class="btn btn-sm no-underline" href="/?focus={p.id}">Focus on Atlas →</a>
			<button
				type="button"
				class="btn btn-sm"
				bind:this={compareButton}
				aria-expanded={compareOpen}
				aria-controls="compare-with"
				onclick={() => (compareOpen = !compareOpen)}
			>
				Compare… <ChevronDown size={13} class="transition-transform duration-[180ms] {compareOpen ? 'rotate-180' : ''}" />
			</button>
			{#if compareOpen}
				<div
					id="compare-with"
					class="absolute top-9 left-0 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-rule-strong bg-surface-raised p-3 shadow-pop sm:right-0 sm:left-auto"
				>
					<p class="text-xs font-medium text-ink-3">Compare {shownName(p.name, p.original)} (A) with</p>
					<ProducerPicker
						side="B"
						bind:value={comparePick}
						class="mt-2"
						placeholder="Pick brand B…"
						onpick={(b) => void goto(compareHref(p.id, b.id))}
					/>
					{#if neighbours.length > 0}
						<p class="mt-3 text-xs font-medium text-ink-3">Closest neighbours</p>
						<ul class="mt-1">
							{#each neighbours as n (n.id)}
								<li>
									<a
										href={compareHref(p.id, n.id)}
										class="flex h-8 items-center gap-2 rounded-xs px-1.5 text-sm text-ink no-underline hover:bg-surface-hover"
									>
										<span class="min-w-0 flex-1 truncate" title={n.original ? `${n.name} · ${n.original}` : undefined}>{shownName(n.name, n.original)}</span>
										<span
											class="shrink-0 rounded-xs border px-1.5 text-2xs {n.inferred
												? 'border-dashed border-inferred text-inferred italic'
												: 'border-solid border-confirmed text-confirmed'}"
											title={n.title}>{n.hint}</span
										>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
					<div class="mt-2.5 border-t border-rule pt-2 text-xs">
						<a class="link font-medium" href="/compare?a={p.id}">Open Compare workbench →</a>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<RichText text={p.description} class="mt-2" />
</header>

<!-- Flat Top-Level Tabs (zero nested sub-tabs!) -->
<div class="mt-1 flex flex-wrap items-center justify-between gap-2 border-b border-rule">
	<Tabs
		label="Brand sections"
		idBase="brand-main"
		value={mainTab}
		onchange={(v) => (mainTab = v)}
		bare
		class="-mb-px"
		tabs={[
			{ value: 'vndb', label: 'VNDB Links', count: data.explicitRelations.length, register: 'confirmed' },
			{ value: 'hidden', label: 'Hidden Links', count: hiddenLinks.length, register: 'inferred' },
			{ value: 'games', label: 'Games', count: num(data.gamesTotal) },
			{ value: 'roster', label: 'Staff', count: num(data.rosterTotals.all) },
			{ value: 'migration', label: 'Migration' },
			{ value: 'graph', label: 'Graph' }
		]}
	/>
	{#if mainTab === 'hidden' || mainTab === 'migration' || mainTab === 'graph'}
		<div class="flex items-center gap-2 pb-1.5">
			<SegmentedControl
				label="Population counted in overlap"
				size="sm"
				value={data.includeSeiyuu ? 'seiyuu' : 'core'}
				onchange={(v) => setSeiyuu(v === 'seiyuu')}
				options={[
					{ value: 'core', label: 'Core staff', shape: 'square', title: LENS_MEANING.core },
					{ value: 'seiyuu', label: '+ Seiyuu', shape: 'circle', title: LENS_MEANING.seiyuu }
				]}
			/>
		</div>
	{/if}
</div>

<!-- VNDB Explicit Links (ground truth first) -->
{#if mainTab === 'vndb'}
<section class="mt-4" aria-label="VNDB explicit links">
	{#if data.explicitRelations.length === 0}
		<EmptyState message="No explicit relations in VNDB.">
			{#snippet actions()}
				{#if hiddenLinks.length > 0}
					<button type="button" class="btn-ghost" onclick={() => (mainTab = 'hidden')}>View {hiddenLinks.length} hidden links →</button>
				{/if}
			{/snippet}
		</EmptyState>
	{:else}
		<div class="grid gap-3.5">
			{#each explicitGroups as [group, rows] (group)}
				<EpistemicZone register="confirmed" title={group} count={rows.length}>
					<ul>
						{#each rows as relation (relation.pid + relation.relation)}
							<ExplicitRelationRow {relation} focusId={p.id} focusName={p.name} focusOriginal={p.original} />
						{/each}
					</ul>
				</EpistemicZone>
			{/each}
		</div>
	{/if}
</section>
{:else if mainTab === 'hidden'}
<!-- Hidden / Unlinked Inferred Links (never contradicts VNDB's own explicit links) -->
<section class="mt-4 transition-opacity duration-150 {pending ? 'opacity-60' : ''}" aria-label="Hidden inferred links">
	{#if hiddenLinks.length === 0}
		{#if p.staffCount < 3}
			<EmptyState kind="sparse" message="Too few credits to infer relationships ({p.staffCount} credited staff)." />
		{:else}
			<EmptyState
				kind="inferred"
				message={data.includeSeiyuu
					? 'No unlinked inferred relations for this brand.'
					: 'No unlinked inferred relations with core development staff only.'}
			>
				{#snippet actions()}
					{#if !data.includeSeiyuu}
						<button type="button" class="btn-ghost" onclick={() => setSeiyuu(true)}>Include seiyuu</button>
					{/if}
				{/snippet}
			</EmptyState>
		{/if}
	{:else}
		<div class="mb-2.5 flex flex-wrap items-center justify-between gap-2">
			<span class="text-xs text-ink-3">Pairs not directly linked in VNDB</span>
			<label class="flex items-center gap-1.5 text-xs text-ink-3">
				<span class="term" title={CONFIDENCE_HINT}>Min conf</span>
				<select class="field h-7 pr-6 text-xs" bind:value={minConfidence}>
					<option value={0}>Any</option>
					<option value={25}>25</option>
					<option value={50}>50</option>
					<option value={75}>75</option>
				</select>
			</label>
		</div>
		<EpistemicZone
			register="inferred"
			title="Hidden links"
			count={inferredFiltered.length}
			headless
			note={inferredTruncated ? `Top ${hiddenLinks.length} loaded.` : undefined}
		>
			{#if inferredFiltered.length === 0}
				<EmptyState kind="inferred" message="No hidden links at confidence ≥ {minConfidence}.">
					{#snippet actions()}
						<button type="button" class="btn-ghost" onclick={() => (minConfidence = 0)}>Show all</button>
					{/snippet}
				</EmptyState>
			{:else}
				{#each inferredShown as link (link.pidA + link.pidB)}
					<InferredRelationCard {link} focusId={p.id} focusName={p.name} focusOriginal={p.original} includeSeiyuu={data.includeSeiyuu} />
				{/each}
				{#if inferredFiltered.length > 12 || inferredTruncated}
					<div class="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-inferred/30 px-4 py-2">
						{#if inferredFiltered.length > 12}
							<button type="button" class="btn-ghost text-xs" onclick={() => (showAllInferred = !showAllInferred)}>
								{showAllInferred ? 'Show fewer' : `Show all ${inferredFiltered.length}`}
							</button>
						{/if}
						{#if inferredTruncated}
							<a class="link ml-auto text-xs" href={allInferredHref}>
								Browse all {num(data.inferredTotal)} →
							</a>
						{/if}
					</div>
				{/if}
			{/if}
		</EpistemicZone>
	{/if}
</section>
{:else if mainTab === 'graph'}
<div class="mt-4">
	<RelationGraph
		focusId={p.id}
		focusName={p.name}
		nodes={data.graph.nodes}
		edges={data.graph.edges}
		inferred={data.inferredRelations}
		inferredTotal={data.inferredTotal}
		includeSeiyuu={data.includeSeiyuu}
		onSeiyuuChange={setSeiyuu}
		{pending}
	/>
</div>
{:else if mainTab === 'migration'}
<div class="mt-4">
	<MigrationFlow
		focusId={p.id}
		focusName={p.name}
		focusOriginal={p.original}
		firstYear={p.firstYear}
		lastYear={p.lastYear}
		inflow={data.inflow}
		outflow={data.outflow}
		summary={data.migrationSummary}
		inferred={data.inferredRelations}
		includeSeiyuu={data.includeSeiyuu}
		{pending}
	/>
</div>
{:else if mainTab === 'roster'}
<section id="roster" class="mt-4" aria-label="Roster">
	{#if rosterNote}
		<p class="mb-2 text-xs text-ink-3">{rosterNote}</p>
	{/if}
	<div>
		<div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule pb-2">
			<Tabs
				label="Roster population"
				idBase="roster"
				bind:value={() => rosterTab, (tab) => (rosterTabPick = { pid: p.id, tab })}
				onchange={() => (rosterLimit = 50)}
				bare
				class="-mb-2 min-w-[16rem] flex-1"
				tabs={[
					{
						value: 'core',
						label: 'All dev staff',
						count: num(data.rosterTotals.dev),
						shape: 'square',
						title: ALL_DEV_STAFF_HINT
					},
					{
						value: 'seiyuu',
						label: 'Seiyuu',
						count: num(data.rosterTotals.seiyuu),
						shape: 'circle',
						title: SEIYUU_HINT
					}
				]}
			/>
			{#if rosterTab === 'core' && rosterRoles.length > 1}
				<label class="flex items-center gap-1.5 text-xs text-ink-3">
					<span>Role</span>
					<select class="field h-7 pr-6 text-xs" bind:value={rosterRole}>
						<option value="all">All</option>
						{#each rosterRoles as r (r)}<option value={r}>{roleMeta(r).label}</option>{/each}
					</select>
				</label>
			{/if}
			<label class="flex h-7 cursor-pointer items-center gap-1.5 text-xs text-ink-2">
				<input type="checkbox" class="accent-(--ink)" bind:checked={onlyPenNames} />
				Only pen-name credits
			</label>
			<label class="flex items-center gap-1.5 text-xs text-ink-3">
				<span>Sort</span>
				<select class="field h-7 pr-6 text-xs" bind:value={rosterSort}>
					<option value="vns">VNs</option>
					<option value="first">First year</option>
					<option value="mobility">Fewest brands</option>
					<option value="name">Name</option>
				</select>
			</label>
			<label class="relative">
				<span class="sr-only">Filter the roster by name or alias</span>
				<Search size={13} class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-3" />
				<input type="search" class="field h-7 w-44 pl-7 text-xs" placeholder="Filter roster" bind:value={rosterQuery} />
			</label>
		</div>

		<div id="roster-panel-{rosterTab}" role="tabpanel" aria-labelledby="roster-tab-{rosterTab}" tabindex="-1">
			{#if data.roster.length === 0}
				<EmptyState message="No staff credits recorded for this brand's VNs." />
			{:else if rosterFiltered.length === 0}
				<EmptyState
					message={rosterTab === 'seiyuu' && data.rosterTotals.seiyuu === 0
						? "No voice cast recorded for this brand's VNs."
						: rosterTab === 'core' && data.rosterTotals.dev === 0
							? "No development staff recorded for this brand's VNs."
							: (rosterTab === 'core' ? staffTruncated : seiyuuTruncated)
								? `No match among the ${num(rosterTab === 'core' ? staffRows.length : seiyuuRows.length)} most-credited rows loaded here (of ${num(rosterTab === 'core' ? data.rosterTotals.dev : data.rosterTotals.seiyuu)} total).`
								: 'No one matches these filters.'}
				/>
			{:else}
				<div class="scroll-x rounded-sm">
					<table class="ledger">
						<caption class="sr-only">{rosterTab === 'core' ? 'Development staff' : 'Voice cast'} credited at {p.name}</caption>
						<thead>
							<tr>
								<th scope="col">Person</th>
								<th scope="col" title={ALIAS_USED_HINT}><span class="term">Alias used</span></th>
								<th scope="col">Roles</th>
								<th scope="col" title={TENURE_HINT}><span class="term">Tenure</span></th>
								<th scope="col" class="num" title={rosterTab === 'seiyuu' ? 'Visual novels voiced here' : 'Visual novels with a development credit here'}><span class="term">VNs</span></th>
								<th scope="col" title={MOBILITY_HINT}><span class="term">Mobility</span></th>
							</tr>
						</thead>
						<tbody>
							{#each rosterShown as r (r.sid)}
								{@const pens = penNames(r)}
								{@const bar = tenureBar(r)}
								{@const markRole = rosterTab === 'seiyuu' ? 'seiyuu' : primaryRole(r.roles)}
								<tr>
									<td class="max-w-[20rem]">
										<span class="flex items-center gap-2">
											<RoleMark role={markRole} size={8} />
											<NamePair name={r.name} original={r.original} href="/staff/{r.sid}" />
											<PotentialAliasFlag count={r.potentialAliasCount} sid={r.sid} />
										</span>
									</td>
									<td class="max-w-[16rem]">
										{#if pens.length}
											<AliasChip aliases={pens} bare />
										{:else}
											<span class="text-ink-4" title="Primary name">—</span>
										{/if}
									</td>
									<td>
										{#if rosterTab === 'seiyuu'}
											<RolePills roles={['seiyuu']} />
										{:else}
											<RolePills roles={r.roles.filter((x) => x !== 'seiyuu')} />
										{/if}
									</td>
									<td>
										<span class="flex items-center gap-2.5">
											<YearSpan from={r.firstYear} to={r.lastYear} tight class="w-[9.5ch] shrink-0" />
											{#if bar}
												<span class="relative hidden h-1.5 w-16 rounded-full bg-surface-hover md:inline-block" aria-hidden="true" title="Tenure within the brand's active years">
													<span class="absolute inset-y-0 rounded-full" style="left: {bar.left.toFixed(1)}%; width: {Math.min(bar.width, 100 - bar.left).toFixed(1)}%; background: {roleMeta(markRole).color}"></span>
												</span>
											{/if}
										</span>
									</td>
									<td class="num font-mono">
										<StaffVnsButton
											count={rosterTab === 'seiyuu' ? r.seiyuuVnCountAtBrand : r.devVnCountAtBrand}
											title="{shownName(r.name, r.original)} at {shownName(p.name, p.original)}"
											subtitle={rosterTab === 'seiyuu' ? 'Visual novels voiced here' : 'Visual novels with a development credit here'}
											endpoint="/api/proof/staff-vns?sid={encodeURIComponent(r.sid)}&pid={encodeURIComponent(p.id)}&mode={rosterTab === 'seiyuu' ? 'seiyuu' : 'dev'}"
											moreHref="/staff/{r.sid}#credits"
										/>
									</td>
									<td><MobilityIndicator brandCount={r.totalBrands} sid={r.sid} personName={shownName(r.name, r.original)} /></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="flex flex-wrap items-center justify-between gap-2 border-t border-rule py-2 text-xs text-ink-3">
					<p>
						Showing {num(rosterShown.length)} of {num(rosterFiltered.length)}{(rosterTab === 'core' ? staffTruncated : seiyuuTruncated) ? ' listed' : ''}.
					</p>
					{#if rosterFiltered.length > 50}
						<button
							type="button"
							class="btn-ghost text-xs"
							onclick={() => (rosterLimit = rosterShown.length < rosterFiltered.length ? rosterFiltered.length : 50)}
						>
							{rosterShown.length < rosterFiltered.length ? `Show all ${num(rosterFiltered.length)}` : 'Show fewer'}
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</section>
{:else}
<!-- Games -->
<section id="games" class="mt-4" aria-label="Games">
	{#if gamesNote}
		<p class="mb-2 text-xs text-ink-3">{gamesNote}</p>
	{/if}
	<div>
		<div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule pb-2">
			<Tabs
				label="Catalog"
				idBase="games"
				value={gamesTab}
				onchange={(v) => {
					gamesTabChoice = v;
					gamesLimit = 40;
				}}
				bare
				class="-mb-2 min-w-[18rem] flex-1"
				tabs={[
					{
						value: 'developed',
						label: 'Developed',
						count: num(data.gamesTotals.developed),
						title: 'Original developer'
					},
					{
						value: 'published',
						label: 'Published / ported',
						count: num(data.gamesTotals.published),
						title: 'Publisher, localiser, or port'
					}
				]}
			/>
			<SegmentedControl
				label="Age rating"
				size="sm"
				bind:value={ratingFilter}
				options={[
					{ value: 'all', label: 'All' },
					{ value: 'allages', label: 'All-ages only', title: 'No 18+ release' },
					{ value: 'ero', label: 'Has 18+', title: 'Includes 18+ release' }
				]}
			/>
		</div>
		<div id="games-panel-{gamesTab}" role="tabpanel" aria-labelledby="games-tab-{gamesTab}" tabindex="-1">
			{#if gamesFiltered.length === 0}
				<EmptyState
					message={gamesTab === 'developed'
						? 'No visual novels developed by this brand match.'
						: 'No published or ported visual novels match.'}
				/>
			{:else}
				<div class="scroll-x rounded-sm">
					<table class="ledger">
						<caption class="sr-only">
							Visual novels {gamesTab === 'developed' ? 'developed' : 'published or ported'} by {p.name}
						</caption>
						<thead>
							<tr>
								<th scope="col">Year</th>
								<th scope="col">Title</th>
								{#if gamesTab === 'published'}<th scope="col">Role</th>{/if}
								<th scope="col">Rating</th>
								<th scope="col" class="num" title={VNDB_SCORE_HINT}><span class="term">VNDB score</span></th>
								<th scope="col" class="num">Votes</th>
							</tr>
						</thead>
						<tbody>
							{#each gamesShown as g (g.id)}
								<tr class={gamesTab === 'published' ? 'text-ink-2' : ''}>
									<td class="tnum font-mono text-ink-2">{g.firstYear ?? '—'}</td>
									<td class="max-w-[30rem]">
										<NamePair name={g.title} original={g.original} lang={g.olang} href="/vn/{g.id}" />
									</td>
									{#if gamesTab === 'published'}
										<td class="text-xs">{g.isPublisher ? 'Publisher' : 'Port / other release'}</td>
									{/if}
									<td><RatingTag hasEro={g.hasEro} hasAllAges={g.hasAllAges} showAllAges /></td>
									<td class="num font-mono">{g.rating != null ? g.rating.toFixed(2) : '—'}</td>
									<td class="num font-mono text-ink-3">{num(g.votecount)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if gamesFiltered.length > 40}
					<div class="border-t border-rule py-2">
						<button
							type="button"
							class="btn-ghost text-xs"
							onclick={() => (gamesLimit = gamesShown.length < gamesFiltered.length ? gamesFiltered.length : 40)}
						>
							{gamesShown.length < gamesFiltered.length ? `Show all ${num(gamesFiltered.length)}` : 'Show fewer'}
						</button>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</section>
{/if}
