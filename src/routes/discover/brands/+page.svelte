<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import { onDestroy, untrack } from 'svelte';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Download from '@lucide/svelte/icons/download';
	import Search from '@lucide/svelte/icons/search';
	import type { PageData } from './$types';
	import SegmentedControl from '#lib/components/controls/SegmentedControl.svelte';
	import Pagination from '#lib/components/controls/Pagination.svelte';
	import EmptyState from '#lib/components/feedback/EmptyState.svelte';
	import NamePair from '#lib/components/identity/NamePair.svelte';
	import ProducerShape from '#lib/components/identity/ProducerShape.svelte';
	import YearSpan from '#lib/components/identity/YearSpan.svelte';
	import EpistemicBadge from '#lib/components/epistemic/EpistemicBadge.svelte';
	import EpistemicGlyph from '#lib/components/epistemic/EpistemicGlyph.svelte';
	import ConfidenceMeter from '#lib/components/epistemic/ConfidenceMeter.svelte';
	import RoleMark from '#lib/components/people/RoleMark.svelte';
	import ClassEdge from '#lib/components/relations/ClassEdge.svelte';
	import type { InferredBrandLink } from '#lib/types.ts';
	import {
		CONFIDENCE_HINT,
		EXPLICIT_META,
		INFERRED_META,
		inferredTitle,
		INFERRED_TYPES,
		inferredOrientation,
		timelineTag,
		toScore,
		TIER_SCALE,
		TIMELINE_HINT,
		TWO_HOP_MEANING,
		UNLINKED_MEANING,
		vndbStatus
	} from '#lib/relations.ts';
	import { CORE_STAFF_HINT, SEIYUU_HINT } from '#lib/roles.ts';
	import { downloadCsv, toCsv } from '#lib/csv.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';
	import { PRODUCER_TYPE_WORD, buildQuery, compareHref, num, pct } from '#lib/util.ts';

	let { data }: { data: PageData } = $props();

	const DEFAULTS = {
		inferredType: 'all',
		explicitStatus: 'unlinked',
		producerType: 'co',
		lang: 'all',
		minConfidence: '0.45',
		includeSeiyuu: false,
		sort: 'confidence',
		q: '',
		page: 1
	};
	const LANG_LABELS: Record<string, string> = {
		ja: 'Japanese (ja)',
		en: 'English (en)',
		zh: 'Chinese (zh)',
		ko: 'Korean (ko)',
		ru: 'Russian (ru)',
		es: 'Spanish (es)',
		fr: 'French (fr)',
		de: 'German (de)',
		'pt-br': 'Portuguese (pt-br)',
		it: 'Italian (it)'
	};
	const LANGS = Object.keys(LANG_LABELS);

	function containmentHint(link: InferredBrandLink): string {
		const a = shownName(link.nameA, link.originalA);
		const b = shownName(link.nameB, link.originalB);
		if (link.containmentAInB >= link.containmentBInA) {
			return `${pct(link.containmentAInB)} of ${a} at ${b} (${pct(link.containmentBInA)} reverse)`;
		}
		return `${pct(link.containmentBInA)} of ${b} at ${a} (${pct(link.containmentAInB)} reverse)`;
	}

	type Filters = PageData['filters'];
	const FALLBACK_FILTERS: Filters = {
		inferredType: 'all',
		explicitStatus: 'unlinked',
		producerType: 'co',
		lang: 'all',
		minConfidence: 0.45,
		includeSeiyuu: false,
		sort: 'confidence',
		q: '',
		page: 1
	};
	const f = $derived(data?.filters ?? FALLBACK_FILTERS);
	const showVndbCol = $derived(f.explicitStatus !== 'unlinked');
	const showSeiyuuCount = $derived(f.sort === 'seiyuu' || f.includeSeiyuu);
	let mobileFiltersOpen = $state(false);
	const result = $derived(
		data?.result ?? { items: [], total: 0, page: 1, limit: 30, seiyuuBelowFloor: null }
	);
	const pending = $derived(navigating.to?.url.pathname === '/discover/brands');
	const isDefault = $derived(buildQuery(queryOf({}), DEFAULTS) === '');

	function queryOf(patch: Partial<Filters> & { page?: number }) {
		const next = { ...f, page: 1, ...patch };
		return {
			inferredType: next.inferredType,
			explicitStatus: next.explicitStatus,
			producerType: next.producerType,
			lang: next.lang,
			minConfidence: String(next.minConfidence),
			includeSeiyuu: next.includeSeiyuu,
			sort: next.sort,
			q: next.q,
			page: next.page
		};
	}
	function hrefFor(patch: Partial<Filters> & { page?: number }): string {
		return `/discover/brands${buildQuery(queryOf(patch), DEFAULTS)}`;
	}
	/** Filters live in the URL so a finding can be shared. */
	function apply(patch: Partial<Filters>) {
		if (qTimer !== undefined) {
			clearTimeout(qTimer);
			qTimer = undefined;
			if (patch.q === undefined) {
				qSent = q.trim();
				patch = { ...patch, q: qSent };
			}
		}
		void goto(hrefFor(patch), { reset: false, replace: true });
	}

	// Text search and the slider are local until they settle.
	let q = $state(untrack(() => data?.filters?.q ?? ''));
	let confidence = $state(untrack(() => Math.round((data?.filters?.minConfidence ?? 0.45) * 100)));
	let qTimer: ReturnType<typeof setTimeout> | undefined;
	let qSent: string | null = null;
	function onQuery(value: string) {
		q = value;
		clearTimeout(qTimer);
		qTimer = setTimeout(() => {
			qTimer = undefined;
			qSent = value.trim();
			apply({ q: qSent });
		}, 260);
	}
	onDestroy(() => clearTimeout(qTimer));
	$effect(() => {
		if (!data?.filters) return;
		const urlQ = data.filters.q;
		const urlConf = Math.round(data.filters.minConfidence * 100);
		untrack(() => {
			const typing = qTimer !== undefined || (qSent !== null && urlQ !== qSent);
			if (!typing && urlQ !== q.trim()) q = urlQ;
			if (urlConf !== confidence) confidence = urlConf;
		});
	});
	afterNavigate((nav) => {
		if (nav.to?.url.pathname !== '/discover/brands' || !data?.filters) {
			clearTimeout(qTimer);
			qTimer = undefined;
			qSent = null;
			return;
		}
		const urlQ = data.filters.q;
		const ownSearch = qSent !== null && urlQ === qSent;
		qSent = null;
		if (!ownSearch) {
			clearTimeout(qTimer);
			qTimer = undefined;
		}
		if (qTimer === undefined && urlQ !== q.trim()) q = urlQ;
	});

	// ── Summary: the count, and every filter that shaped it, in words ──
	const PAIR_NOUN: Record<string, string> = {
		co: 'company pair',
		ng: 'group pair',
		in: 'individual pair'
	};
	const STATUS_SCOPE: Record<Filters['explicitStatus'], string> = {
		unlinked: 'inferred and not in VNDB',
		twohop: 'inferred, two hops apart in VNDB',
		explicit: 'inferred, already linked in VNDB',
		all: 'inferred, any VNDB status'
	};
	const scopeNoun = $derived(
		`${PAIR_NOUN[f.producerType] ?? 'pair'}${result.total === 1 ? '' : 's'}`
	);
	const scopeFloor = $derived(Math.round(f.minConfidence * 100));
	const scopeExtras = $derived(
		[
			f.inferredType !== 'all' && f.inferredType in INFERRED_META
				? `class ${INFERRED_META[f.inferredType as keyof typeof INFERRED_META].word.toLowerCase()}`
				: '',
			f.lang !== 'all' ? `language ${f.lang}` : '',
			f.q ? `matching “${f.q}”` : '',
			f.includeSeiyuu ? 'seiyuu-driven pairs included' : ''
		].filter(Boolean)
	);
	const narrowed = $derived(
		f.explicitStatus === 'unlinked' && result.total < (data?.unlinkedTotal ?? 0)
	);
	const widestHref = $derived(
		hrefFor({
			inferredType: 'all',
			explicitStatus: 'unlinked',
			producerType: 'all',
			lang: 'all',
			minConfidence: 0,
			includeSeiyuu: true,
			q: ''
		})
	);

	function arrowFor(link: InferredBrandLink): 'left' | 'right' | 'none' {
		const { head } = inferredOrientation(link.inferredType, link.direction);
		return head === 'A' ? 'left' : head === 'B' ? 'right' : 'none';
	}
	const keyOf = (l: InferredBrandLink) => `${l.pidA}-${l.pidB}`;

	const castBelow = $derived(f.includeSeiyuu ? result.seiyuuBelowFloor : null);
	const castFloor = $derived(castBelow ? Math.floor((castBelow.minConfidence * 100) / 5) * 5 : 0);

	// ── Keyboard on rows: Enter / C opens Compare, O / Shift+O open brand A or B ──
	function onRowKey(e: KeyboardEvent, link: InferredBrandLink) {
		if (e.target !== e.currentTarget) return;
		const row = e.currentTarget as HTMLElement;
		if (e.key === 'Enter' || e.key === ' ' || e.key === 'c' || e.key === 'C') {
			e.preventDefault();
			void goto(compareHref(link.pidA, link.pidB));
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			(row.nextElementSibling as HTMLElement | null)?.focus();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			(row.previousElementSibling as HTMLElement | null)?.focus();
		} else if (e.key === 'o') {
			void goto(`/producer/${link.pidA}`);
		} else if (e.key === 'O') {
			void goto(`/producer/${link.pidB}`);
		}
	}

	function exportCsv() {
		const head = [
			'brand_a_id', 'brand_a', 'brand_b_id', 'brand_b', 'inferred_class', 'direction', 'confidence',
			'tier', 'shared_core_staff', 'weighted_core_score', 'containment_a_in_b', 'containment_b_in_a',
			'shared_seiyuu', 'co_developed_vns', 'timeline', 'vndb_status'
		];
		const rows = result.items.map((l) => [
			l.pidA, l.nameA, l.pidB, l.nameB, l.inferredType, l.direction, toScore(l.confidence),
			l.confidenceTier, l.sharedCoreStaff, l.weightedCoreScore, l.containmentAInB, l.containmentBInA,
			l.sharedSeiyuu, l.coDevVns, timelineTag(l).label, vndbStatus(l).label
		]);
		downloadCsv(
			`vndb-explorer-inferred-brand-links-p${result.page}.csv`,
			toCsv(
				head,
				rows,
				`Inferred by VNDB Explorer; not stated in VNDB. Dump of ${data.dumpDate}.`
			)
		);
	}
</script>

<svelte:head>
	<title>Hidden brand links · VNDB Explorer</title>
</svelte:head>

{#snippet chipTick()}
	<svg width="10" height="10" viewBox="0 0 10 10" class="shrink-0" aria-hidden="true">
		<path d="M1.6 5.3 4 7.6 8.4 2.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
	</svg>
{/snippet}

{#snippet brandCell(link: InferredBrandLink, side: 'A' | 'B', alignRight = false)}
	{@const isA = side === 'A'}
	{@const type = isA ? link.typeA : link.typeB}
	{@const lang = isA ? link.langA : link.langB}
	<span class="flex min-w-0 items-center gap-2 {alignRight ? 'justify-end' : ''}">
		{#if !alignRight}<ProducerShape {type} size={10} />{/if}
		<span class="min-w-0 font-medium {alignRight ? 'text-right' : ''}">
			<NamePair
				name={isA ? link.nameA : link.nameB}
				original={isA ? link.originalA : link.originalB}
				{lang}
				href="/producer/{isA ? link.pidA : link.pidB}"
			/>
		</span>
		{#if alignRight}<ProducerShape {type} size={10} />{/if}
	</span>
	<span class="mt-0.5 flex items-center gap-1.5 text-2xs text-ink-3 {alignRight ? 'justify-end pr-[18px]' : 'pl-[18px]'}">
		{#if f.producerType === 'all'}
			<span>{PRODUCER_TYPE_WORD[type] ?? type}</span>
			<span aria-hidden="true">·</span>
		{/if}
		{#if lang}
			<span class="font-mono" title="Primary language">{lang}</span>
			<span aria-hidden="true">·</span>
		{/if}
		<YearSpan from={isA ? link.firstYearA : link.firstYearB} to={isA ? link.lastYearA : link.lastYearB} class="text-2xs" />
	</span>
{/snippet}

{#snippet statusCell(link: InferredBrandLink)}
	{@const st = vndbStatus(link)}
	{#if st.confirmed}
		{@const ex = link.explicitRelation ? EXPLICIT_META[link.explicitRelation] : null}
		<span class="inline-flex items-center gap-1 font-mono text-2xs text-confirmed" title={ex ? `VNDB: ${ex.sentence(shownName(link.nameB, link.originalB), shownName(link.nameA, link.originalA))}` : link.explicitDist === 2 ? TWO_HOP_MEANING : `${link.explicitDist} hops apart in VNDB`}>
			<EpistemicGlyph kind="confirmed" size={10} />{st.label}
		</span>
	{:else}
		<span class="text-2xs text-ink-3" title={UNLINKED_MEANING}>unlinked</span>
	{/if}
{/snippet}

<header class="pt-4 pb-3">
	<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
		<div class="flex items-center gap-2.5">
			<h1 class="text-xl font-semibold tracking-tight text-ink">Hidden brand links</h1>
			<EpistemicBadge register="inferred" />
		</div>
		<p class="text-xs text-ink-2 transition-opacity {pending ? 'opacity-60' : ''}" aria-live="polite">
			<span class="tnum font-mono text-ink">{num(result.total)}</span>
			{scopeNoun}{#if scopeFloor > 0}{' '}≥ <span class="tnum font-mono text-ink">{scopeFloor}</span>{/if}
			{#if narrowed}
				· <a class="link text-ink-3" href={widestHref}>show all {num(data.unlinkedTotal)}</a>
			{/if}
		</p>
	</div>
</header>

<!-- Compact two-row filter bar -->
<section aria-label="Filters" class="mb-4 grid gap-y-2 border-y border-rule py-2.5 text-xs">
	<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
		<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Inferred class">
			<span class="mr-0.5 text-ink-3">Class</span>
			<button type="button" class="fchip min-h-8 md:min-h-7" aria-pressed={f.inferredType === 'all'} onclick={() => apply({ inferredType: 'all' })}>
				{#if f.inferredType === 'all'}{@render chipTick()}{/if}All
			</button>
			{#each INFERRED_TYPES as t (t)}
				<button type="button" class="fchip min-h-8 md:min-h-7" aria-pressed={f.inferredType === t} title={inferredTitle({ inferredType: t })} onclick={() => apply({ inferredType: t })}>
					{#if f.inferredType === t}{@render chipTick()}{/if}
					<svg width="14" height="4" aria-hidden="true"><line x1="0" x2="14" y1="2" y2="2" stroke={INFERRED_META[t].color} stroke-width="1.5" stroke-dasharray="4 2.5" /></svg>
					{INFERRED_META[t].word}
				</button>
			{/each}
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-ink-3">VNDB</span>
			<SegmentedControl
				label="VNDB status"
				size="sm"
				value={f.explicitStatus}
				onchange={(v) => apply({ explicitStatus: v })}
				options={[
					{ value: 'unlinked', label: 'Unlinked', title: UNLINKED_MEANING },
					{ value: 'twohop', label: 'Indirect (2-hop)', title: TWO_HOP_MEANING },
					{ value: 'explicit', label: 'Linked', title: 'Direct VNDB link' },
					{ value: 'all', label: 'All' }
				]}
			/>
		</div>
		<div class="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
			<label class="relative flex-1 sm:flex-initial">
				<span class="sr-only">Search by brand name</span>
				<Search size={13} class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-3" />
				<input type="search" class="field h-7 w-full pl-7 text-xs sm:w-48" placeholder="Filter by brand name" value={q} oninput={(e) => onQuery(e.currentTarget.value)} />
			</label>
			<button
				type="button"
				class="btn btn-sm shrink-0 md:hidden"
				aria-expanded={mobileFiltersOpen}
				onclick={() => (mobileFiltersOpen = !mobileFiltersOpen)}
			>
				{mobileFiltersOpen ? 'Fewer filters' : 'More filters'}
			</button>
		</div>
	</div>

	<div class="{mobileFiltersOpen ? 'flex' : 'hidden md:flex'} flex-wrap items-center gap-x-2.5 gap-y-2">
		<div class="flex flex-wrap items-center gap-1.5">
			<span class="text-ink-3">Brands</span>
			<SegmentedControl
				label="Producer type (both brands)"
				size="sm"
				value={f.producerType}
				onchange={(v) => apply({ producerType: v })}
				options={[
					{ value: 'co', label: 'Companies' },
					{ value: 'ng', label: 'Groups' },
					{ value: 'in', label: 'Individuals' },
					{ value: 'all', label: 'All' }
				]}
			/>
		</div>
		<label class="flex items-center gap-1">
			<span class="text-ink-3">Lang</span>
			<select class="field h-7 w-28 pr-6 text-xs" value={f.lang} onchange={(e) => apply({ lang: e.currentTarget.value })}>
				<option value="all">Any</option>
				{#each LANGS as l (l)}<option value={l}>{LANG_LABELS[l]}</option>{/each}
			</select>
		</label>
		<label class="flex items-center gap-1.5">
			<span class="term text-ink-3" title={CONFIDENCE_HINT}>Conf</span>
			<input
				type="range"
				min="0"
				max="95"
				step="5"
				class="w-16 accent-(--inferred-mark)"
				bind:value={confidence}
				onchange={() => apply({ minConfidence: confidence / 100 })}
			/>
			<span class="tnum w-[2ch] font-mono text-sm text-ink">{confidence}</span>
		</label>
		<label class="flex h-7 cursor-pointer items-center gap-1 text-ink-2" title="Include voice-cast-only pairs">
			<input type="checkbox" class="accent-(--ink)" checked={f.includeSeiyuu} onchange={(e) => apply({ includeSeiyuu: e.currentTarget.checked })} />
			<RoleMark role="seiyuu" size={8} /> + Seiyuu
		</label>
		<label class="flex items-center gap-1">
			<span class="text-ink-3">Sort</span>
			<select class="field h-7 pr-6 text-xs" value={f.sort} onchange={(e) => apply({ sort: e.currentTarget.value as Filters['sort'] })}>
				<option value="confidence">Confidence</option>
				<option value="shared_core">Shared core staff</option>
				<option value="containment">Staff overlap</option>
				<option value="seiyuu">Shared seiyuu</option>
			</select>
		</label>
		<span class="ml-auto flex items-center gap-2">
			{#if !isDefault}
				<a class="btn-ghost text-xs" href="/discover/brands">Reset</a>
			{/if}
			<button type="button" class="btn btn-sm" onclick={exportCsv} disabled={result.items.length === 0}>
				<Download size={12} /> CSV
			</button>
		</span>
	</div>
	{#if castBelow && castBelow.count > 0}
		<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-2" aria-live="polite">
			<RoleMark role="seiyuu" size={8} />
			<span>
				{num(castBelow.count)} seiyuu-driven {castBelow.count === 1 ? 'pair is' : 'pairs are'} under the
				confidence floor of {scopeFloor}: a shared cast alone never rates above Speculative.
			</span>
			<button type="button" class="btn-ghost text-xs" onclick={() => apply({ minConfidence: castFloor / 100 })}>
				Lower the floor to {castFloor}
			</button>
		</p>
	{/if}
</section>

<section aria-label="Inferred brand links" class="sheet zone-inferred relative overflow-hidden">
	{#if pending}<div class="refetch-bar absolute inset-x-0 top-0 z-10" aria-hidden="true"></div>{/if}
	<div class="transition-opacity duration-150 {pending ? 'opacity-60' : ''}" aria-busy={pending}>
		{#if result.items.length === 0}
			<EmptyState
				kind="inferred"
				message="No inferred links at confidence ≥ {Math.round(f.minConfidence * 100)} with these filters. Lower the threshold, include seiyuu-driven pairs or widen the VNDB status."
			>
				{#snippet actions()}
					{#if f.minConfidence > 0}<button type="button" class="btn-ghost" onclick={() => apply({ minConfidence: 0 })}>Lower the threshold to 0</button>{/if}
					{#if !f.includeSeiyuu}<button type="button" class="btn-ghost" onclick={() => apply({ includeSeiyuu: true })}>Include seiyuu</button>{/if}
					{#if f.explicitStatus !== 'all'}<button type="button" class="btn-ghost" onclick={() => apply({ explicitStatus: 'all' })}>Any VNDB status</button>{/if}
				{/snippet}
			</EmptyState>
		{:else}
			<!-- Narrow screens: one card per pair. -->
			<ul class="divide-y divide-dashed divide-inferred/30 md:hidden">
				{#each result.items as link (keyOf(link))}
					{@const tl = timelineTag(link)}
					<li class="px-4 py-3">
						<div class="text-sm">{@render brandCell(link, 'A')}</div>
						<div class="my-1.5 flex items-center gap-3 pl-[18px]">
							<ClassEdge type={link.inferredType} arrow={arrowFor(link)} seiyuuDriven={link.seiyuuDriven} coDevVns={link.coDevVns} />
							<ConfidenceMeter score={toScore(link.confidence)} tier={link.confidenceTier} dense />
						</div>
						<div class="text-sm">{@render brandCell(link, 'B')}</div>
						<p class="tnum mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[18px] text-2xs text-ink-3">
							<span class="term" title={CORE_STAFF_HINT}>{link.sharedCoreStaff} core staff</span>
							{#if showSeiyuuCount && link.sharedSeiyuu > 0}<span class="term" title={SEIYUU_HINT}>{link.sharedSeiyuu} seiyuu</span>{/if}
							<span class="term" title={containmentHint(link)}>{pct(link.maxContainment)} staff overlap</span>
							<span class="term" title={tl.hint}>{tl.label}</span>
							{#if showVndbCol}{@render statusCell(link)}{/if}
						</p>
						<p class="mt-2 flex gap-4 pl-[18px] text-sm">
							<a class="btn-ghost inline-flex items-center gap-1" href={compareHref(link.pidA, link.pidB)}>
								Compare <ArrowRight size={12} />
							</a>
						</p>
					</li>
				{/each}
			</ul>

			<div class="scroll-x hidden md:block">
				<table class="ledger [&_td]:px-2 [&_th]:px-2">
					<caption class="sr-only">
						Inferred brand links. Click a row or press Enter / C to open the full Compare page; O and Shift+O open brand A and B.
					</caption>
					<thead>
						<tr>
							<th scope="col" class="text-right!">Brand A</th>
							<th scope="col" class="text-center!">Class</th>
							<th scope="col">Brand B</th>
							<th scope="col" aria-sort={f.sort === 'confidence' ? 'descending' : undefined} title={TIER_SCALE}>
								<button type="button" class="inline-flex items-center gap-1 hover:text-ink {f.sort === 'confidence' ? 'text-ink' : ''}" onclick={() => apply({ sort: 'confidence' })}>
									<span class="underline decoration-dotted decoration-rule-hover underline-offset-3">Confidence</span>{#if f.sort === 'confidence'}<span aria-hidden="true">↓</span>{/if}
								</button>
							</th>
							<th scope="col" class="num" aria-sort={f.sort === 'shared_core' ? 'descending' : undefined} title="Shared core staff & weighted score (wt)">
								<button type="button" class="inline-flex items-center gap-1 hover:text-ink {f.sort === 'shared_core' ? 'text-ink' : ''}" onclick={() => apply({ sort: 'shared_core' })}>
									<span class="underline decoration-dotted decoration-rule-hover underline-offset-3">Shared staff</span>{#if f.sort === 'shared_core'}<span aria-hidden="true">↓</span>{/if}
								</button>
							</th>
							<th scope="col" aria-sort={f.sort === 'containment' ? 'descending' : undefined} title="Share of smaller brand's core staff at the other">
								<button type="button" class="inline-flex items-center gap-1 hover:text-ink {f.sort === 'containment' ? 'text-ink' : ''}" onclick={() => apply({ sort: 'containment' })}>
									<span class="underline decoration-dotted decoration-rule-hover underline-offset-3">Staff overlap</span>{#if f.sort === 'containment'}<span aria-hidden="true">↓</span>{/if}
								</button>
							</th>
							<th scope="col" title={TIMELINE_HINT}><span class="term">Timeline</span></th>
							{#if showVndbCol}
								<th scope="col" title="VNDB record">
									<span class="inline-flex items-center gap-1"><EpistemicGlyph kind="confirmed" size={10} />VNDB</span>
								</th>
							{/if}
							<th scope="col"><span class="sr-only">Compare</span></th>
						</tr>
					</thead>
					<tbody>
						{#each result.items as link (keyOf(link))}
							{@const tl = timelineTag(link)}
							{@const href = compareHref(link.pidA, link.pidB)}
							<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
							<tr
								tabindex="0"
								class="group cursor-pointer"
								aria-label="Inferred: {INFERRED_META[link.inferredType].label} {link.nameA} and {link.nameB}, confidence {toScore(link.confidence)} of 100. Open Compare."
								onkeydown={(e) => onRowKey(e, link)}
								onauxclick={(e) => {
									if (e.button === 1 && !(e.target as HTMLElement).closest('a, button')) {
										e.preventDefault();
										window.open(href, '_blank', 'noopener');
									}
								}}
								onclick={(e) => {
									if ((e.target as HTMLElement).closest('a, button')) return;
									if (e.metaKey || e.ctrlKey) window.open(href, '_blank', 'noopener');
									else void goto(href);
								}}
							>
								<td class="max-w-[11rem] py-2 xl:max-w-[13rem]">{@render brandCell(link, 'A', true)}</td>
								<td class="text-center"><ClassEdge type={link.inferredType} arrow={arrowFor(link)} seiyuuDriven={link.seiyuuDriven} coDevVns={link.coDevVns} /></td>
								<td class="max-w-[11rem] py-2 xl:max-w-[13rem]">{@render brandCell(link, 'B', false)}</td>
								<td><ConfidenceMeter score={toScore(link.confidence)} tier={link.confidenceTier} dense /></td>
								<td class="num whitespace-nowrap">
									<span class="font-mono text-ink">{link.sharedCoreStaff}</span>
									<span class="ml-1 inline-block w-[6ch] text-right font-mono text-2xs text-ink-3">wt {link.weightedCoreScore.toFixed(1)}</span>
									{#if showSeiyuuCount && link.sharedSeiyuu > 0}
										<span class="block font-mono text-2xs text-ink-3">{link.sharedSeiyuu} seiyuu</span>
									{/if}
								</td>
								<td title={containmentHint(link)}>
									<span class="flex items-center gap-1.5">
										<span class="inline-block h-1.5 w-8 overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
											<span class="block h-full rounded-full bg-ink-2" style="width: {(link.maxContainment * 100).toFixed(0)}%"></span>
										</span>
										<span class="tnum font-mono text-xs">{pct(link.maxContainment)}</span>
									</span>
								</td>
								<td class="tnum text-xs whitespace-nowrap text-ink-2" title={tl.hint}>{tl.label}</td>
								{#if showVndbCol}
									<td>{@render statusCell(link)}</td>
								{/if}
								<td class="text-right whitespace-nowrap">
									<a
										{href}
										class="btn-ghost inline-flex items-center gap-1 text-xs group-hover:text-ink"
										aria-label="Compare {link.nameA} and {link.nameB}"
									>
										Compare <ArrowRight size={12} />
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
	<div class="border-t border-rule px-4 py-2.5">
		<Pagination page={result.page} pageSize={result.limit} total={result.total} href={(n) => hrefFor({ page: n })} />
	</div>
</section>
<p class="mt-2 text-2xs text-ink-3">
	<span class="font-mono">wt</span> = weighted overlap (anchored staff count more than freelancers).
</p>
