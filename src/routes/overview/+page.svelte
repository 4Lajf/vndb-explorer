<script lang="ts">
	import type { PageData } from './$types';
	import SectionHeader from '#lib/components/shell/SectionHeader.svelte';
	import StatTile from '#lib/components/viz/StatTile.svelte';
	import SegmentedControl from '#lib/components/controls/SegmentedControl.svelte';
	import EpistemicGlyph from '#lib/components/epistemic/EpistemicGlyph.svelte';
	import EpistemicBadge from '#lib/components/epistemic/EpistemicBadge.svelte';
	import ConfidenceMeter from '#lib/components/epistemic/ConfidenceMeter.svelte';
	import PotentialAliasFlag from '#lib/components/epistemic/PotentialAliasFlag.svelte';
	import NamePair from '#lib/components/identity/NamePair.svelte';
	import YearSpan from '#lib/components/identity/YearSpan.svelte';
	import RoleMark from '#lib/components/people/RoleMark.svelte';
	import RolePills from '#lib/components/people/RolePills.svelte';
	import MobilityIndicator from '#lib/components/people/MobilityIndicator.svelte';
	import StaffVnsButton from '#lib/components/people/StaffVnsButton.svelte';
	import ClassEdge from '#lib/components/relations/ClassEdge.svelte';
	import ProducerPicker, {
		type PickedProducer
	} from '#lib/components/relations/ProducerPicker.svelte';
	import { INFERRED_META, INFERRED_TYPES, inferredLabel, inferredOrientation, inferredTitle, toScore } from '#lib/relations.ts';
	import { CORE_ROLES_TEXT, CORE_STAFF_HINT, primaryRole } from '#lib/roles.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';
	import { aliasPairHref, compareHref, num, numShort, plural } from '#lib/util.ts';

	let { data }: { data: PageData } = $props();

	const stats = $derived(data.stats);
	const indexBuilt = $derived(stats.inferredBrandLinks > 0 || stats.potentialAliasCount > 0);

	let pickA = $state<PickedProducer | null>(null);
	let pickB = $state<PickedProducer | null>(null);
	const canCompare = $derived(!!pickA && !!pickB && pickA.id !== pickB.id);

	type PopularFilter = 'creators' | 'seiyuu';
	let popularFilter = $state<PopularFilter>('creators');
	const popularPeople = $derived(
		popularFilter === 'creators' ? data.popularCreators : data.popularSeiyuu
	);

	type MoverFilter = 'all' | 'core' | 'seiyuu';
	let moverFilter = $state<MoverFilter>('all');
	interface Mover {
		id: string;
		name: string;
		original: string | null;
		roles: string[];
		brandCount: number;
		vnCount: number;
		firstYear: number | null;
		lastYear: number | null;
		aliasCount: number;
		potentialAliasCount: number;
		seiyuu: boolean;
	}
	const movers = $derived.by<Mover[]>(() => {
		const pick = (m: (typeof data.topMovers)[number] | (typeof data.topSeiyuu)[number], seiyuu: boolean): Mover => ({
			id: m.id,
			name: m.name,
			original: m.original,
			roles: m.roles,
			brandCount: m.brandCount,
			vnCount: m.vnCount,
			firstYear: m.firstYear,
			lastYear: m.lastYear,
			aliasCount: m.aliasCount,
			potentialAliasCount: m.potentialAliasCount,
			seiyuu
		});
		const core = data.topMovers.map((m) => pick(m, false));
		const cv = data.topSeiyuu.map((m) => pick(m, true));
		if (moverFilter === 'core') return core;
		if (moverFilter === 'seiyuu') return cv;
		const out: Mover[] = [];
		for (let i = 0; i < Math.max(core.length, cv.length); i++) {
			if (core[i]) out.push(core[i]);
			if (cv[i]) out.push(cv[i]);
		}
		return out.slice(0, 10);
	});

	const BRANDS_HINT: Record<MoverFilter, string> = {
		all: 'Distinct studios credited at',
		core: 'Distinct studios credited at',
		seiyuu: 'Distinct studios voiced at'
	};

	function arrowFor(link: (typeof data.hiddenBrands)[number]): 'left' | 'right' | 'none' {
		const { head } = inferredOrientation(link.inferredType, link.direction);
		return head === 'A' ? 'left' : head === 'B' ? 'right' : 'none';
	}
</script>

<svelte:head>
	<title>Overview · corpus stats &amp; highlights · VNDB Explorer</title>
</svelte:head>

<section class="pt-4 pb-3">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h1 class="text-xl font-semibold tracking-tight text-ink">Corpus overview</h1>
		<span class="font-mono text-2xs text-ink-3">VNDB dump {data.dumpDate}</span>
	</div>
</section>

<section aria-label="Corpus" class="border-y border-rule">
	<div class="grid grid-cols-2 gap-px bg-rule sm:grid-cols-3 lg:grid-cols-6">
		<StatTile
			label="Producers"
			value={stats.producersTotal}
			sub="{num(stats.commercialProducers)} companies"
		/>
		<StatTile
			label="VNDB brand links"
			title="VNDB explicit producer links"
			value={stats.explicitRelationPairs}
			sub="explicit relation pairs"
		/>
		<StatTile
			label="Inferred links"
			title="Inferred from staff & links"
			value={indexBuilt ? stats.inferredBrandLinks : null}
			inferred
			href="/discover/brands?explicitStatus=all&producerType=all&minConfidence=0&includeSeiyuu=1"
			sub="{num(stats.unlinkedInferredBrandLinks)} not in VNDB"
		/>
		<StatTile
			label="Staff"
			value={stats.staffTotal}
			sub={[`${num(stats.seiyuuTotal)} seiyuu`, `${numShort(stats.aliasesTotal)} names`]}
		/>
		<StatTile
			label="Potential aliases"
			title="Unconfirmed separate staff entries"
			value={indexBuilt ? stats.potentialAliasCount : null}
			inferred
			glyph="alias-potential"
			href="/discover/aliases"
			sub="candidate pairs"
		/>
		<StatTile
			label="Visual novels"
			value={stats.vnsTotal}
			sub="dump of {data.dumpDate}"
		/>
	</div>
</section>

<section aria-label="Start here" class="mt-4 grid gap-4 md:grid-cols-3">
	<a
		href="/discover/brands"
		class="sheet zone-inferred group flex flex-col justify-between gap-3 px-4 py-3.5 no-underline"
	>
		<div>
			<p class="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-ink-3">
				<EpistemicBadge register="inferred" /> Hidden brand links
			</p>
			<p class="mt-2 text-md font-medium text-ink">
				Relationships the staff lists imply but VNDB does not record.
			</p>
			<p class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
				{#each INFERRED_TYPES as t (t)}
					<span class="inline-flex items-center gap-1.5" title={inferredTitle({ inferredType: t })}>
						<svg width="14" height="4" aria-hidden="true"><line x1="0" x2="14" y1="2" y2="2" stroke={INFERRED_META[t].color} stroke-width="1.5" stroke-dasharray="4 2.5" /></svg>
						<span>{INFERRED_META[t].word}</span>
					</span>
				{/each}
			</p>
		</div>
		<p class="flex min-h-7 items-center justify-between border-t border-dashed border-inferred/25 pt-2.5 text-sm">
			<span class="tnum text-xs text-ink-3">{indexBuilt ? `${plural(stats.unlinkedInferredBrandLinks, 'unlinked pair')}` : 'Inference index not built'}</span>
			<span class="font-medium text-ink underline decoration-rule-strong underline-offset-4 group-hover:decoration-ink">Explore</span>
		</p>
	</a>

	<a
		href="/discover/aliases"
		class="sheet zone-inferred group flex flex-col justify-between gap-3 px-4 py-3.5 no-underline"
	>
		<div>
			<p class="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-ink-3">
				<EpistemicBadge register="inferred" glyph="alias-potential" /> Potential aliases
			</p>
			<p class="mt-2 text-md font-medium text-ink">
				Separate staff entries that may be one person. None are confirmed.
			</p>
			<p class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
				<span class="inline-flex items-center gap-1.5"><RoleMark role="seiyuu" size={8} />Seiyuu <span class="tnum font-mono">{num(stats.potentialSeiyuuAliasCount)}</span></span>
				<span class="inline-flex items-center gap-1.5"><RoleMark role="dev" size={8} />Staff and mixed <span class="tnum font-mono">{num(stats.potentialStaffAliasCount)}</span></span>
			</p>
		</div>
		<p class="flex min-h-7 items-center justify-between border-t border-dashed border-inferred/25 pt-2.5 text-sm">
			<span class="tnum text-xs text-ink-3">{indexBuilt ? `${plural(stats.potentialAliasCount, 'candidate pair')}` : 'Inference index not built'}</span>
			<span class="font-medium text-ink underline decoration-rule-strong underline-offset-4 group-hover:decoration-ink">Review</span>
		</p>
	</a>

	<form method="GET" action="/compare" class="sheet flex flex-col justify-between gap-3 px-4 py-3.5">
		<div>
			<p class="flex min-h-5 items-center text-xs font-medium text-ink-3">Brand compare</p>
			<p class="mt-2 text-md font-medium text-ink">Are two brands secretly one studio?</p>
			<div class="mt-2 grid gap-1.5">
				<ProducerPicker side="A" name="a" bind:value={pickA} placeholder="Pick brand A…" />
				<ProducerPicker side="B" name="b" bind:value={pickB} placeholder="Pick brand B…" />
			</div>
		</div>
		<p class="flex min-h-7 items-center justify-between gap-3 border-t border-rule pt-2.5">
			<span class="truncate text-xs text-ink-3">
				{#if pickA && pickB && pickA.id === pickB.id}Pick two different brands.{:else if pickA && !pickB}A = {shownName(pickA.name, pickA.original)}. Pick B.{:else}Search by name or ID.{/if}
			</span>
			<button type="submit" class="btn btn-primary btn-sm" disabled={!canCompare}>Compare</button>
		</p>
	</form>
</section>

<div class="mt-8 grid gap-x-8 gap-y-8 lg:grid-cols-2">
	<section aria-labelledby="home-links">
		<SectionHeader title="Top hidden brand links" id="home-links" register="inferred">
			{#snippet actions()}
				<a class="btn-ghost" href="/discover/brands">See all</a>
			{/snippet}
		</SectionHeader>
		{#if data.hiddenBrands.length === 0}
			<p class="rounded-md border border-dashed border-rule-strong bg-surface-sunken/40 px-4 py-3 text-sm text-ink-2">Inference index not built.</p>
		{:else}
			<ul class="sheet zone-inferred divide-y divide-dashed divide-inferred/30">
				{#each data.hiddenBrands as link (link.pidA + link.pidB)}
					<li>
						<a
							href={compareHref(link.pidA, link.pidB)}
							class="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-1 px-4 py-2.5 text-sm text-ink no-underline hover:bg-surface-hover/60 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_auto]"
							aria-label="Inferred: {inferredLabel(link)} {link.nameA} and {link.nameB}, confidence {toScore(link.confidence)} of 100. Open Compare."
						>
							<span class="min-w-0 text-right font-medium"><NamePair name={link.nameA} original={link.originalA} lang={link.langA} variant="compact" class="block truncate" /></span>
							<ClassEdge type={link.inferredType} arrow={arrowFor(link)} seiyuuDriven={link.seiyuuDriven} coDevVns={link.coDevVns} />
							<span class="min-w-0 font-medium"><NamePair name={link.nameB} original={link.originalB} lang={link.langB} variant="compact" class="block truncate" /></span>
							<span class="col-span-2 sm:col-span-1"><ConfidenceMeter score={toScore(link.confidence)} tier={link.confidenceTier} dense /></span>
							<span class="tnum w-[11ch] text-right text-xs text-ink-3" title={CORE_STAFF_HINT}>{link.sharedCoreStaff} core staff</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section aria-labelledby="home-aliases">
		<SectionHeader title="Potential alias highlights" id="home-aliases" register="inferred" glyph="alias-potential">
			{#snippet actions()}
				<a class="btn-ghost" href="/discover/aliases">See all</a>
			{/snippet}
		</SectionHeader>
		{#if data.potentialAliases.length === 0}
			<p class="rounded-md border border-dashed border-rule-strong bg-surface-sunken/40 px-4 py-3 text-sm text-ink-2">Inference index not built.</p>
		{:else}
			<ul class="sheet zone-inferred divide-y divide-dashed divide-inferred/30">
				{#each data.potentialAliases as pair (pair.sidA + pair.sidB)}
					<li>
						<a
							href={aliasPairHref(pair.sidA, pair.sidB)}
							class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 px-4 py-2.5 text-sm text-ink no-underline hover:bg-surface-hover/60"
							aria-label="Potential alias, not confirmed: {pair.nameA} and {pair.nameB}, confidence {toScore(pair.confidence)} of 100. Open the pair's evidence and career comparison."
						>
							<RoleMark role={pair.category === 'seiyuu' ? 'seiyuu' : 'dev'} size={8} />
							<span class="flex min-w-0 items-center gap-1.5">
								<span class="min-w-0 truncate font-medium"><NamePair name={pair.nameA} original={pair.originalA} lang={pair.langA} variant="compact" class="block truncate" /></span>
								<EpistemicGlyph kind="alias-potential" size={12} class="shrink-0" />
								<span class="min-w-0 truncate font-medium"><NamePair name={pair.nameB} original={pair.originalB} lang={pair.langB} variant="compact" class="block truncate" /></span>
							</span>
							<ConfidenceMeter score={toScore(pair.confidence)} tier={pair.confidenceTier} dense />
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<section aria-labelledby="home-popular" class="mt-8">
	<SectionHeader title="Most popular creators & seiyuu" id="home-popular">
		{#snippet actions()}
			<div class="flex flex-wrap items-center gap-2">
				<SegmentedControl
					label="Most popular: population"
					size="sm"
					bind:value={popularFilter}
					options={[
						{ value: 'creators', label: 'Creators', shape: 'square', title: CORE_STAFF_HINT },
						{ value: 'seiyuu', label: 'Seiyuu', shape: 'circle' }
					]}
				/>
				<a class="btn-ghost" href="/popularity">See all rankings →</a>
			</div>
		{/snippet}
	</SectionHeader>
	<div class="scroll-x rounded-sm">
		<table class="ledger">
			<caption class="sr-only">Most popular creators and seiyuu by summed VNDB votes across credited visual novels</caption>
			<thead>
				<tr>
					<th scope="col" class="w-8 num">#</th>
					<th scope="col">Person</th>
					<th scope="col">Roles</th>
					<th scope="col">Top VN</th>
					<th scope="col" class="num" title="Sum of VNDB vote counts across distinct credited VNs"><span class="term">Votes</span></th>
					<th scope="col" class="num" title="Vote-weighted average VNDB rating across credited VNs"><span class="term">Rating</span></th>
					<th scope="col" class="num">VNs</th>
					<th scope="col" class="pl-5!">Active</th>
				</tr>
			</thead>
			<tbody>
				{#each popularPeople as p, i (p.id + popularFilter)}
					<tr>
						<td class="num font-mono text-xs text-ink-3">{i + 1}</td>
						<td class="max-w-[20rem]">
							<span class="flex items-center gap-2">
								<RoleMark role={popularFilter === 'seiyuu' ? 'seiyuu' : primaryRole(p.roles)} size={8} />
								<NamePair name={p.name} original={p.original} href="/staff/{p.id}" />
								<PotentialAliasFlag count={p.potentialAliasCount} sid={p.id} />
							</span>
						</td>
						<td><RolePills roles={popularFilter === 'seiyuu' ? ['seiyuu'] : p.roles} max={3} /></td>
						<td class="max-w-[16rem] truncate text-xs text-ink-2">
							{#if p.topVnId && p.topVnTitle}
								<NamePair name={p.topVnTitle} original={p.topVnOriginal} href="/vn/{p.topVnId}" variant="compact" class="block truncate" />
							{:else}
								<span class="text-ink-4">—</span>
							{/if}
						</td>
						<td class="num font-mono font-medium text-ink">{num(p.totalVotes)}</td>
						<td class="num font-mono text-ink-2">{p.weightedRating !== null ? p.weightedRating.toFixed(2) : '—'}</td>
						<td class="num font-mono">
							<StaffVnsButton
								count={p.vnCount}
								title={shownName(p.name, p.original)}
								subtitle={popularFilter === 'seiyuu' ? 'Visual novels voiced' : 'Visual novels credited on'}
								endpoint="/api/proof/staff-vns?sid={encodeURIComponent(p.id)}&mode={popularFilter === 'seiyuu' ? 'seiyuu' : 'all'}"
								moreHref="/staff/{p.id}#credits"
							/>
						</td>
						<td class="pl-5!"><YearSpan from={p.firstYear} to={p.lastYear} /></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<section aria-labelledby="home-movers" class="mt-8">
	<SectionHeader title="Top career movers" id="home-movers">
		{#snippet actions()}
			<SegmentedControl
				label="Career movers: population"
				size="sm"
				bind:value={moverFilter}
				options={[
					{ value: 'all', label: 'All' },
					{ value: 'core', label: 'Staff', shape: 'square', title: CORE_STAFF_HINT },
					{ value: 'seiyuu', label: 'Seiyuu', shape: 'circle' }
				]}
			/>
		{/snippet}
	</SectionHeader>
	<div class="scroll-x rounded-sm">
		<table class="ledger">
			<caption class="sr-only">Staff and seiyuu credited at the most brands</caption>
			<thead>
				<tr>
					<th scope="col">Person</th>
					<th scope="col">Roles</th>
					<th scope="col" class="num" title={BRANDS_HINT[moverFilter]}><span class="term">Brands</span></th>
					<th scope="col" class="num">VNs</th>
					<th scope="col" class="pl-5!">Active</th>
					<th scope="col" class="num" title="VNDB pen names / aliases"><span class="term">Confirmed aliases</span></th>
				</tr>
			</thead>
			<tbody>
				{#each movers as m (m.id + (m.seiyuu ? 'cv' : ''))}
					<tr>
						<td class="max-w-[22rem]">
							<span class="flex items-center gap-2">
								<RoleMark role={m.seiyuu ? 'seiyuu' : primaryRole(m.roles)} size={8} />
								<NamePair name={m.name} original={m.original} href="/staff/{m.id}" />
								<PotentialAliasFlag count={m.potentialAliasCount} sid={m.id} />
							</span>
						</td>
						<td><RolePills roles={m.seiyuu ? ['seiyuu'] : m.roles} max={3} /></td>
						<td class="num font-mono font-medium">
							<MobilityIndicator brandCount={m.brandCount} sid={m.id} personName={shownName(m.name, m.original)} numericOnly />
						</td>
						<td class="num font-mono">
							<StaffVnsButton
								count={m.vnCount}
								title={shownName(m.name, m.original)}
								subtitle={m.seiyuu ? 'Visual novels voiced' : 'Visual novels credited on'}
								endpoint="/api/proof/staff-vns?sid={encodeURIComponent(m.id)}&mode={m.seiyuu ? 'seiyuu' : 'all'}"
								moreHref="/staff/{m.id}#credits"
							/>
						</td>
						<td class="pl-5!"><YearSpan from={m.firstYear} to={m.lastYear} /></td>
						<td class="num font-mono text-ink-2">{m.aliasCount}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>
