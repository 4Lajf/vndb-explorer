<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import { onDestroy, untrack } from 'svelte';
	import Download from '@lucide/svelte/icons/download';
	import Search from '@lucide/svelte/icons/search';
	import type { PageData } from './$types';
	import SegmentedControl from '#lib/components/controls/SegmentedControl.svelte';
	import Pagination from '#lib/components/controls/Pagination.svelte';
	import EmptyState from '#lib/components/feedback/EmptyState.svelte';
	import EpistemicBadge from '#lib/components/epistemic/EpistemicBadge.svelte';
	import AliasPairRow from '#lib/components/relations/AliasPairRow.svelte';
	import { downloadCsv, toCsv } from '#lib/csv.ts';
	import { TIER_COLOR, TIER_SCALE, tierRange, toScore } from '#lib/relations.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';
	import { buildQuery, plural } from '#lib/util.ts';

	let { data }: { data: PageData } = $props();

	const DEFAULTS: Filters = { category: 'all', tier: 'all', signal: 'all', q: '', pair: '', page: 1 };
	type Filters = PageData['filters'];

	const f = $derived(data?.filters ?? DEFAULTS);
	const result = $derived(data?.result ?? { items: [], total: 0, page: 1, limit: 30 });
	const pending = $derived(navigating.to?.url.pathname === '/discover/aliases');

	// Any filter change leaves the single-pair view: `pair` only survives when asked for.
	function hrefFor(patch: Partial<Filters>): string {
		const next = { ...f, page: 1, pair: '', ...patch };
		return `/discover/aliases${buildQuery(next, DEFAULTS)}`;
	}
	const isDefault = $derived(hrefFor({ page: f.page, pair: f.pair }) === '/discover/aliases');
	const pairKey = (p: { sidA: string; sidB: string }) => `${p.sidA}-${p.sidB}`;
	/** `?pair=` accepts either order; rows are keyed in stored order. */
	const isFocusPair = (p: { sidA: string; sidB: string }) =>
		!!f.pair && (f.pair === pairKey(p) || f.pair === `${p.sidB}-${p.sidA}`);
	/** Filters live in the URL so a finding can be shared. */
	function apply(patch: Partial<Filters>) {
		// Another control fired while a typed search was still waiting. The search
		// goes out with this change: left to its timer it would fire afterwards,
		// from the filters as they were, and undo what was just chosen.
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

	let q = $state(untrack(() => data?.filters?.q ?? ''));
	let qTimer: ReturnType<typeof setTimeout> | undefined;
	/** The search this page last sent to the URL, until that navigation lands. */
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
	// A search still waiting to fire must not pull the reader back after they left.
	onDestroy(() => clearTimeout(qTimer));
	$effect(() => {
		if (!data?.filters) return;
		const urlQ = data.filters.q;
		untrack(() => {
			const typing = qTimer !== undefined || (qSent !== null && urlQ !== qSent);
			if (!typing && urlQ !== q.trim()) q = urlQ;
		});
	});
	afterNavigate((nav) => {
		if (nav.to?.url.pathname !== '/discover/aliases' || !data?.filters) {
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

	function tierColor(tier: Filters['tier']): string {
		return tier === 'high' || tier === 'medium' || tier === 'speculative'
			? TIER_COLOR[tier]
			: 'transparent';
	}
	const TIERS: Array<{ value: Filters['tier']; label: string; hint: string }> = [
		{ value: 'all', label: 'All tiers', hint: TIER_SCALE },
		{ value: 'high', label: 'High', hint: `High (${tierRange('high')})` },
		{ value: 'medium', label: 'Medium', hint: `Medium (${tierRange('medium')})` },
		{ value: 'speculative', label: 'Speculative', hint: `Speculative (${tierRange('speculative')})` }
	];
	function exportCsv() {
		const head = [
			'record_a_id', 'record_a', 'record_b_id', 'record_b', 'category', 'confidence', 'tier',
			'shared_characters', 'same_vn_shared_characters', 'shared_links', 'bio_crossref', 'name_match',
			'shared_brands', 'co_credited_vns', 'separate_entries_on', 'ero_split'
		];
		const rows = result.items.map((c) => [
			c.sidA, c.nameA, c.sidB, c.nameB, c.category, toScore(c.confidence), c.confidenceTier,
			c.sharedChars, c.sameVnSharedChars, c.sharedExtlinks, c.bioCrossref ? 'yes' : 'no',
			c.nameMatchKind ?? '', c.sharedBrands, c.coCreditVns, (c.listedApart ?? []).join(' '),
			c.eroSplit ?? ''
		]);
		downloadCsv(
			`vndb-explorer-potential-aliases-p${result.page}.csv`,
			toCsv(
				head,
				rows,
				`Inferred by VNDB Explorer; not stated in VNDB. Separate VNDB records, not confirmed as the same person. Dump of ${data.dumpDate}.`
			)
		);
	}

	const SIGNALS: Array<{ value: Filters['signal']; label: string; hint?: string }> = [
		{ value: 'all', label: 'Any signal' },
		{ value: 'shared_chars', label: 'Shared character', hint: 'Both voice the same character' },
		{ value: 'shared_extlinks', label: 'Shared link', hint: 'Same external website or account' },
		{ value: 'bio_crossref', label: 'Bio cross-ref', hint: 'One bio mentions the other' },
		{ value: 'name_match', label: 'Name match', hint: 'Matching or swapped name' }
	];
</script>

<svelte:head>
	<title>Potential aliases · VNDB Explorer</title>
</svelte:head>

<!-- Selected mark of a filter chip. -->
{#snippet chipTick()}
	<svg width="10" height="10" viewBox="0 0 10 10" class="shrink-0" aria-hidden="true">
		<path d="M1.6 5.3 4 7.6 8.4 2.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
	</svg>
{/snippet}

<header class="pt-4 pb-3">
	<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
		<div class="flex items-center gap-2.5">
			<h1 class="text-xl font-semibold tracking-tight text-ink">Potential aliases</h1>
			<EpistemicBadge register="inferred" glyph="alias-potential" />
		</div>
		<p class="tnum text-xs text-ink-2 transition-opacity {pending ? 'opacity-60' : ''}" aria-live="polite">
			<span class="font-medium text-ink">{plural(result.total, 'candidate pair')}</span>
		</p>
	</div>
</header>

<section aria-label="Filters" class="mb-4 grid gap-y-2 border-y border-rule py-2.5 text-xs">
	<div class="flex flex-wrap items-center gap-x-5 gap-y-2.5">
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-ink-3">Who</span>
			<SegmentedControl
				label="Record category"
				size="sm"
				value={f.category}
				onchange={(v) => apply({ category: v })}
				options={[
					{ value: 'all', label: 'All' },
					{ value: 'seiyuu', label: 'Seiyuu', shape: 'circle', title: 'Voice actors' },
					{ value: 'staff', label: 'Staff', shape: 'square', title: 'Dev staff' },
					{ value: 'mixed', label: 'Mixed', title: 'One voice, one dev record' }
				]}
			/>
		</div>
		<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Confidence tier">
			<span class="term mr-1 text-ink-3" title={TIER_SCALE}>Tier</span>
			{#each TIERS as t (t.value)}
				<button type="button" class="fchip min-h-8 md:min-h-7" aria-pressed={f.tier === t.value} title={t.hint} onclick={() => apply({ tier: t.value })}>
					{#if f.tier === t.value}{@render chipTick()}{/if}
					{#if t.value !== 'all'}
						<span class="inline-block h-3 w-[3px] rounded-[1.5px]" style="background: {tierColor(t.value)}" aria-hidden="true"></span>
					{/if}
					{t.label}
				</button>
			{/each}
		</div>
	</div>
	<div class="flex flex-wrap items-center gap-x-5 gap-y-2.5">
		<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Evidence signal">
			<span class="mr-1 text-ink-3">Signal</span>
			{#each SIGNALS as sig (sig.value)}
				<button type="button" class="fchip min-h-8 md:min-h-7" aria-pressed={f.signal === sig.value} title={sig.hint} onclick={() => apply({ signal: sig.value })}>
					{#if f.signal === sig.value}{@render chipTick()}{/if}
					{sig.label}
				</button>
			{/each}
		</div>
		<label class="relative">
			<span class="sr-only">Search by name or pen name</span>
			<Search size={13} class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-3" />
			<input type="search" class="field h-7 w-56 pl-7 text-xs" placeholder="Filter by name or pen name" value={q} oninput={(e) => onQuery(e.currentTarget.value)} />
		</label>
		<span class="ml-auto flex items-center gap-3">
			{#if !isDefault}
				<a class="btn-ghost text-xs" href="/discover/aliases" data-sveltekit-replacestate>Reset</a>
			{/if}
			<button type="button" class="btn btn-sm" onclick={exportCsv} disabled={result.items.length === 0}>
				<Download size={12} /> CSV
			</button>
		</span>
	</div>
</section>

{#if f.pair}
	{@const focusRow = result.items[0]}
	<p class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
		<span>
			Showing one pair:
			{#if focusRow}
				<span class="font-medium text-ink">{shownName(focusRow.nameA, focusRow.originalA)} ≟ {shownName(focusRow.nameB, focusRow.originalB)}</span>
			{:else}
				<span class="text-ink">selected pair</span>
			{/if}
		</span>
		<a class="link" href="/discover/aliases" data-sveltekit-replacestate>Show all candidates</a>
	</p>
{/if}

<section
	aria-label="Potential alias candidate pairs, inferred and not confirmed"
	class="sheet zone-inferred relative overflow-hidden"
>
	{#if pending}<div class="refetch-bar absolute inset-x-0 top-0 z-10" aria-hidden="true"></div>{/if}
	<div class="transition-opacity duration-150 {pending ? 'opacity-60' : ''}" aria-busy={pending}>
		{#if result.items.length === 0 && f.pair}
			<EmptyState
				kind="inferred"
				message="These two records are not a candidate pair in this build. The evidence may be too weak, or a VNDB bio may state that they are different people."
			>
				{#snippet actions()}
					<a class="btn-ghost" href="/discover/aliases" data-sveltekit-replacestate>Show all candidates</a>
				{/snippet}
			</EmptyState>
		{:else if result.items.length === 0}
			<EmptyState kind="inferred" message="No candidates match. Include Speculative, clear the signal filter or search by another name.">
				{#snippet actions()}
					{#if f.tier !== 'all'}<button type="button" class="btn-ghost" onclick={() => apply({ tier: 'all' })}>All tiers</button>{/if}
					{#if f.signal !== 'all'}<button type="button" class="btn-ghost" onclick={() => apply({ signal: 'all' })}>Any signal</button>{/if}
					{#if f.q}<button type="button" class="btn-ghost" onclick={() => apply({ q: '' })}>Clear search</button>{/if}
				{/snippet}
			</EmptyState>
		{:else}
			{#each result.items as pair (pairKey(pair))}
				<!-- A pair opened by link arrives with its career comparison expanded. -->
				<AliasPairRow {pair} expanded={isFocusPair(pair)} />
			{/each}
		{/if}
	</div>
	<div class="border-t border-rule px-4 py-2.5">
		<Pagination page={result.page} pageSize={result.limit} total={result.total} href={(n) => hrefFor({ page: n })} />
	</div>
</section>
