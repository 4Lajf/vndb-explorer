<script lang="ts">
	import type { PageData } from './$types';
	import SectionHeader from '#lib/components/shell/SectionHeader.svelte';
	import SectionNav from '#lib/components/shell/SectionNav.svelte';
	import StatTile from '#lib/components/viz/StatTile.svelte';
	import SegmentedControl from '#lib/components/controls/SegmentedControl.svelte';
	import NamePair from '#lib/components/identity/NamePair.svelte';
	import ProducerShape from '#lib/components/identity/ProducerShape.svelte';
	import RatingTag from '#lib/components/identity/RatingTag.svelte';
	import YearSpan from '#lib/components/identity/YearSpan.svelte';
	import RoleMark from '#lib/components/people/RoleMark.svelte';
	import RolePills from '#lib/components/people/RolePills.svelte';
	import StaffVnsButton from '#lib/components/people/StaffVnsButton.svelte';
	import PotentialAliasFlag from '#lib/components/epistemic/PotentialAliasFlag.svelte';
	import { CORE_STAFF_HINT, primaryRole } from '#lib/roles.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';
	import { num, numShort } from '#lib/util.ts';

	let { data }: { data: PageData } = $props();
	const rankings = $derived(data.rankings);

	let peopleGroup = $state<'creators' | 'seiyuu'>('creators');
	let peopleMetric = $state<'votes' | 'rating'>('votes');
	let studioMetric = $state<'votes' | 'rating'>('votes');
	let vnMetric = $state<'votes' | 'rating'>('votes');

	const peopleList = $derived(
		peopleGroup === 'creators'
			? peopleMetric === 'votes'
				? rankings.popularCreators
				: rankings.topRatedCreators
			: peopleMetric === 'votes'
				? rankings.popularSeiyuu
				: rankings.topRatedSeiyuu
	);
	const maxPeopleVotes = $derived(Math.max(1, ...peopleList.map((p) => p.totalVotes)));

	const studioList = $derived(
		studioMetric === 'votes' ? rankings.popularStudios : rankings.topRatedStudios
	);
	const maxStudioVotes = $derived(Math.max(1, ...studioList.map((s) => s.totalVotes)));

	const vnList = $derived(
		vnMetric === 'votes' ? rankings.topVnsByVotes : rankings.topVnsByRating
	);
	const maxVnVotes = $derived(Math.max(1, ...vnList.map((v) => v.votes)));

	const maxDecadeVns = $derived(Math.max(1, ...rankings.decades.map((d) => d.vnCount)));
	const maxDecadeVotes = $derived(Math.max(1, ...rankings.decades.map((d) => d.totalVotes)));

	const SECTIONS = [
		{ id: 'people', label: 'Creators & Seiyuu' },
		{ id: 'studios', label: 'Studios' },
		{ id: 'vns', label: 'Visual novels' },
		{ id: 'records', label: 'Career records' },
		{ id: 'decades', label: 'By decade' }
	];
</script>

<svelte:head>
	<title>Popularity &amp; rankings · VNDB Explorer</title>
</svelte:head>

<section class="pt-4 pb-3">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-ink">Popularity &amp; rankings</h1>
			<p class="mt-1 text-sm text-ink-2">
				Most-voted and highest-rated creators, voice actors, studios, and visual novels across the VNDB corpus.
			</p>
		</div>
		<span class="font-mono text-2xs text-ink-3">VNDB dump {data.dumpDate}</span>
	</div>
</section>

<section aria-label="Popularity summary" class="border-y border-rule">
	<div class="grid grid-cols-2 gap-px bg-rule lg:grid-cols-4">
		<StatTile
			label="Total VNDB votes"
			value={rankings.summary.totalVotes}
			sub="across {num(rankings.summary.ratedVns)} rated VNs"
		/>
		<StatTile
			label="Weighted avg rating"
			value={rankings.summary.weightedAvgRating}
			display={rankings.summary.weightedAvgRating !== null ? rankings.summary.weightedAvgRating.toFixed(2) : '—'}
			title="Vote-weighted average VNDB rating across all rated visual novels"
			sub="out of 10.00"
		/>
		<StatTile
			label="Credited creators"
			value={rankings.summary.creatorsTotal}
			title={CORE_STAFF_HINT}
			sub="{num(rankings.summary.seiyuuTotal)} seiyuu"
		/>
		<StatTile
			label="18+ catalog share"
			value={rankings.summary.eroPct}
			display="{rankings.summary.eroPct.toFixed(1)}%"
			sub="of all visual novels"
		/>
	</div>
</section>

<div class="mt-4">
	<SectionNav sections={SECTIONS} label="Popularity sections" />
</div>

<!-- 1. Creators & Seiyuu -->
<section id="people" aria-labelledby="pop-people" class="mt-6">
	<SectionHeader title="Creators & seiyuu" id="pop-people">
		{#snippet actions()}
			<div class="flex flex-wrap items-center gap-2">
				<SegmentedControl
					label="People category"
					size="sm"
					bind:value={peopleGroup}
					options={[
						{ value: 'creators', label: 'Creators', shape: 'square', title: CORE_STAFF_HINT },
						{ value: 'seiyuu', label: 'Seiyuu', shape: 'circle' }
					]}
				/>
				<SegmentedControl
					label="People sort metric"
					size="sm"
					bind:value={peopleMetric}
					options={[
						{ value: 'votes', label: 'Most votes' },
						{ value: 'rating', label: 'Highest rated' }
					]}
				/>
			</div>
		{/snippet}
	</SectionHeader>
	<p class="mb-2.5 text-xs text-ink-3">
		{#if peopleMetric === 'votes'}
			Ranked by summed VNDB vote counts across each person's distinct {peopleGroup === 'creators' ? 'core-credited' : 'voiced'} visual novels.
		{:else}
			Ranked by vote-weighted average VNDB rating (minimum {peopleGroup === 'creators' ? '3 core VNs & 1,500 votes' : '5 voiced VNs & 2,500 votes'}).
		{/if}
	</p>
	<div class="scroll-x rounded-sm">
		<table class="ledger">
			<caption class="sr-only">Ranked visual novel creators and seiyuu</caption>
			<thead>
				<tr>
					<th scope="col" class="w-8 num">#</th>
					<th scope="col">Person</th>
					<th scope="col">Roles</th>
					<th scope="col">Signature VN</th>
					<th scope="col" class="num">Total votes</th>
					<th scope="col" class="num">Rating</th>
					<th scope="col" class="num">VNs</th>
					<th scope="col" class="pl-5!">Active</th>
					<th scope="col" class="text-right">Map</th>
				</tr>
			</thead>
			<tbody>
				{#each peopleList as p, i (p.id + peopleGroup + peopleMetric)}
					<tr>
						<td class="num font-mono text-xs text-ink-3">{i + 1}</td>
						<td class="max-w-[18rem]">
							<span class="flex items-center gap-2">
								<RoleMark role={peopleGroup === 'seiyuu' ? 'seiyuu' : primaryRole(p.roles)} size={8} />
								<NamePair name={p.name} original={p.original} href="/staff/{p.id}" />
								<PotentialAliasFlag count={p.potentialAliasCount} sid={p.id} />
							</span>
						</td>
						<td><RolePills roles={peopleGroup === 'seiyuu' ? ['seiyuu'] : p.roles} max={3} /></td>
						<td class="max-w-[15rem] truncate text-xs text-ink-2">
							{#if p.topVnId && p.topVnTitle}
								<NamePair name={p.topVnTitle} original={p.topVnOriginal} href="/vn/{p.topVnId}" variant="compact" class="block truncate" />
							{:else}
								<span class="text-ink-4">—</span>
							{/if}
						</td>
						<td class="num">
							<div class="inline-flex items-center justify-end gap-2">
								<span class="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-sunken sm:inline-block" aria-hidden="true">
									<span
										class="block h-full rounded-full bg-confirmed/70"
										style="width: {Math.max(4, Math.round((p.totalVotes / maxPeopleVotes) * 100))}%"
									></span>
								</span>
								<span class="tnum font-mono font-medium text-ink">{num(p.totalVotes)}</span>
							</div>
						</td>
						<td class="num font-mono {peopleMetric === 'rating' ? 'font-semibold text-ink' : 'text-ink-2'}">
							{p.weightedRating !== null ? p.weightedRating.toFixed(2) : '—'}
						</td>
						<td class="num font-mono">
							<StaffVnsButton
								count={p.vnCount}
								title={shownName(p.name, p.original)}
								subtitle={peopleGroup === 'seiyuu' ? 'Visual novels voiced' : 'Visual novels credited on'}
								endpoint="/api/proof/staff-vns?sid={encodeURIComponent(p.id)}&mode={peopleGroup === 'seiyuu' ? 'seiyuu' : 'all'}"
								moreHref="/staff/{p.id}#credits"
							/>
						</td>
						<td class="pl-5!"><YearSpan from={p.firstYear} to={p.lastYear} /></td>
						<td class="text-right">
							<a href="/?trace={p.id}" class="link text-xs whitespace-nowrap">Trace →</a>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<!-- 2. Studios -->
<section id="studios" aria-labelledby="pop-studios" class="mt-9">
	<SectionHeader title="Top studios" id="pop-studios">
		{#snippet actions()}
			<SegmentedControl
				label="Studio sort metric"
				size="sm"
				bind:value={studioMetric}
				options={[
					{ value: 'votes', label: 'Most votes' },
					{ value: 'rating', label: 'Highest rated' }
				]}
			/>
		{/snippet}
	</SectionHeader>
	<p class="mb-2.5 text-xs text-ink-3">
		{#if studioMetric === 'votes'}
			Ranked by summed VNDB vote counts across each studio's originally developed visual novels.
		{:else}
			Ranked by vote-weighted average VNDB rating (minimum 3 developed VNs &amp; 2,000 votes).
		{/if}
	</p>
	<div class="scroll-x rounded-sm">
		<table class="ledger">
			<caption class="sr-only">Ranked visual novel studios by votes and rating</caption>
			<thead>
				<tr>
					<th scope="col" class="w-8 num">#</th>
					<th scope="col">Studio</th>
					<th scope="col">Signature VN</th>
					<th scope="col" class="num">Total votes</th>
					<th scope="col" class="num">Rating</th>
					<th scope="col" class="num">VNs</th>
					<th scope="col" class="num">Staff</th>
					<th scope="col" class="pl-5!">Active</th>
					<th scope="col" class="text-right">Map</th>
				</tr>
			</thead>
			<tbody>
				{#each studioList as s, i (s.id + studioMetric)}
					<tr>
						<td class="num font-mono text-xs text-ink-3">{i + 1}</td>
						<td class="max-w-[18rem]">
							<span class="flex items-center gap-2">
								<ProducerShape type={s.type} size={10} />
								<NamePair name={s.name} original={s.original} lang={s.lang} href="/producer/{s.id}" />
							</span>
						</td>
						<td class="max-w-[15rem] truncate text-xs text-ink-2">
							{#if s.topVnId && s.topVnTitle}
								<NamePair name={s.topVnTitle} original={s.topVnOriginal} href="/vn/{s.topVnId}" variant="compact" class="block truncate" />
							{:else}
								<span class="text-ink-4">—</span>
							{/if}
						</td>
						<td class="num">
							<div class="inline-flex items-center justify-end gap-2">
								<span class="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-sunken sm:inline-block" aria-hidden="true">
									<span
										class="block h-full rounded-full bg-confirmed/70"
										style="width: {Math.max(4, Math.round((s.totalVotes / maxStudioVotes) * 100))}%"
									></span>
								</span>
								<span class="tnum font-mono font-medium text-ink">{num(s.totalVotes)}</span>
							</div>
						</td>
						<td class="num font-mono {studioMetric === 'rating' ? 'font-semibold text-ink' : 'text-ink-2'}">
							{s.weightedRating !== null ? s.weightedRating.toFixed(2) : '—'}
						</td>
						<td class="num font-mono text-ink-2">{num(s.vnCount)}</td>
						<td class="num font-mono text-ink-2">{num(s.staffCount)}</td>
						<td class="pl-5!"><YearSpan from={s.firstYear} to={s.lastYear} /></td>
						<td class="text-right">
							<a href="/?focus={s.id}" class="link text-xs whitespace-nowrap">Focus →</a>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<!-- 3. Visual Novels -->
<section id="vns" aria-labelledby="pop-vns" class="mt-9">
	<SectionHeader title="Top visual novels" id="pop-vns">
		{#snippet actions()}
			<SegmentedControl
				label="Visual novel sort metric"
				size="sm"
				bind:value={vnMetric}
				options={[
					{ value: 'votes', label: 'Most votes' },
					{ value: 'rating', label: 'Highest rated' }
				]}
			/>
		{/snippet}
	</SectionHeader>
	<p class="mb-2.5 text-xs text-ink-3">
		{#if vnMetric === 'votes'}
			Most widely voted titles in the VNDB dump.
		{:else}
			Highest-rated titles with at least 1,000 VNDB votes.
		{/if}
	</p>
	<div class="scroll-x rounded-sm">
		<table class="ledger">
			<caption class="sr-only">Ranked visual novels by votes and rating</caption>
			<thead>
				<tr>
					<th scope="col" class="w-8 num">#</th>
					<th scope="col">Visual novel</th>
					<th scope="col">Developer</th>
					<th scope="col" class="num">Year</th>
					<th scope="col">Age</th>
					<th scope="col" class="num">Rating</th>
					<th scope="col" class="num">Votes</th>
					<th scope="col" class="text-right">Map</th>
				</tr>
			</thead>
			<tbody>
				{#each vnList as v, i (v.id + vnMetric)}
					<tr>
						<td class="num font-mono text-xs text-ink-3">{i + 1}</td>
						<td class="max-w-[20rem]">
							<NamePair name={v.title} original={v.original} href="/vn/{v.id}" />
						</td>
						<td class="max-w-[14rem] truncate text-xs text-ink-2">
							{#if v.developerId && v.developerName}
								<NamePair name={v.developerName} original={v.developerOriginal} href="/producer/{v.developerId}" variant="compact" class="block truncate" />
							{:else}
								<span class="text-ink-4">—</span>
							{/if}
						</td>
						<td class="num font-mono text-xs text-ink-2">{v.firstYear ?? '—'}</td>
						<td><RatingTag hasEro={v.hasEro} hasAllAges={v.hasAllAges} showAllAges /></td>
						<td class="num font-mono {vnMetric === 'rating' ? 'font-semibold text-ink' : 'text-ink-2'}">
							{v.rating !== null ? v.rating.toFixed(2) : '—'}
						</td>
						<td class="num">
							<div class="inline-flex items-center justify-end gap-2">
								<span class="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-sunken sm:inline-block" aria-hidden="true">
									<span
										class="block h-full rounded-full bg-confirmed/70"
										style="width: {Math.max(4, Math.round((v.votes / maxVnVotes) * 100))}%"
									></span>
								</span>
								<span class="tnum font-mono font-medium text-ink">{num(v.votes)}</span>
							</div>
						</td>
						<td class="text-right">
							<a href="/?vn={v.id}" class="link text-xs whitespace-nowrap">Map →</a>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<!-- 4. Career records -->
<section id="records" aria-labelledby="pop-records" class="mt-9">
	<SectionHeader title="Career records" id="pop-records" />
	<div class="grid gap-6 lg:grid-cols-2">
		<div class="sheet overflow-hidden">
			<div class="border-b border-rule px-4 py-3">
				<h3 class="text-sm font-semibold text-ink">Longest active careers</h3>
				<p class="text-xs text-ink-3">Span from first to latest credited VN (min 10 VNs).</p>
			</div>
			<ul class="divide-y divide-rule">
				{#each rankings.longestCareers as c, i (c.id)}
					<li class="flex items-center justify-between gap-3 px-4 py-2 text-sm">
						<span class="flex min-w-0 items-center gap-2">
							<span class="w-5 shrink-0 text-right font-mono text-xs text-ink-3">{i + 1}</span>
							<RoleMark role={c.isSeiyuu ? 'seiyuu' : primaryRole(c.roles)} size={8} />
							<span class="min-w-0 truncate">
								<NamePair name={c.name} original={c.original} href="/staff/{c.id}" variant="compact" class="block truncate" />
							</span>
						</span>
						<span class="flex shrink-0 items-center gap-3 text-xs">
							<YearSpan from={c.firstYear} to={c.lastYear} />
							<span class="tnum w-11 text-right font-mono font-semibold text-ink">{c.spanYears}y</span>
						</span>
					</li>
				{/each}
			</ul>
		</div>

		<div class="sheet overflow-hidden">
			<div class="border-b border-rule px-4 py-3">
				<h3 class="text-sm font-semibold text-ink">Most confirmed pen names</h3>
				<p class="text-xs text-ink-3">VNDB aliases under one staff record (min 5 VNs).</p>
			</div>
			<ul class="divide-y divide-rule">
				{#each rankings.mostAliases as c, i (c.id)}
					<li class="flex items-center justify-between gap-3 px-4 py-2 text-sm">
						<span class="flex min-w-0 items-center gap-2">
							<span class="w-5 shrink-0 text-right font-mono text-xs text-ink-3">{i + 1}</span>
							<RoleMark role={c.isSeiyuu ? 'seiyuu' : primaryRole(c.roles)} size={8} />
							<span class="min-w-0 truncate">
								<NamePair name={c.name} original={c.original} href="/staff/{c.id}" variant="compact" class="block truncate" />
							</span>
							<PotentialAliasFlag count={c.potentialAliasCount} sid={c.id} />
						</span>
						<span class="flex shrink-0 items-center gap-3 text-xs">
							<span class="tnum font-mono text-ink-3">{num(c.vnCount)} VNs</span>
							<span class="tnum w-16 text-right font-mono font-semibold text-ink">{c.aliasCount} names</span>
						</span>
					</li>
				{/each}
			</ul>
		</div>
	</div>
</section>

<!-- 5. Decade breakdown -->
<section id="decades" aria-labelledby="pop-decades" class="mt-9">
	<SectionHeader title="Output & votes by decade" id="pop-decades" />
	<div class="sheet divide-y divide-rule">
		{#each rankings.decades as d (d.decade)}
			<div class="grid gap-3 px-4 py-3 sm:grid-cols-[4.5rem_1fr_1fr_auto] sm:items-center">
				<span class="font-mono text-sm font-semibold text-ink">{d.label}</span>
				<div>
					<div class="flex items-baseline justify-between text-xs">
						<span class="text-ink-3">Visual novels</span>
						<span class="tnum font-mono font-medium text-ink">{num(d.vnCount)}</span>
					</div>
					<div class="mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken">
						<div
							class="h-full rounded-full bg-confirmed/75"
							style="width: {Math.max(2, Math.round((d.vnCount / maxDecadeVns) * 100))}%"
						></div>
					</div>
				</div>
				<div>
					<div class="flex items-baseline justify-between text-xs">
						<span class="text-ink-3">VNDB votes</span>
						<span class="tnum font-mono font-medium text-ink">{numShort(d.totalVotes)}</span>
					</div>
					<div class="mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken">
						<div
							class="h-full rounded-full bg-inferred/75"
							style="width: {Math.max(2, Math.round((d.totalVotes / maxDecadeVotes) * 100))}%"
						></div>
					</div>
				</div>
				<div class="flex items-center gap-4 text-xs sm:justify-end">
					<span class="tnum font-mono text-ink-2" title="Vote-weighted average rating">
						★ {d.weightedRating !== null ? d.weightedRating.toFixed(2) : '—'}
					</span>
					<span class="tnum w-16 text-right font-mono text-ink-3" title="Share of titles with 18+ releases">
						{d.eroPct.toFixed(0)}% 18+
					</span>
				</div>
			</div>
		{/each}
	</div>
</section>
