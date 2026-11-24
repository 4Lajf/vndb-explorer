<script lang="ts">
	import { goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import type { PageData } from './$types';
	import Tabs from '#lib/components/controls/Tabs.svelte';
	import EmptyState from '#lib/components/feedback/EmptyState.svelte';
	import NamePair from '#lib/components/identity/NamePair.svelte';
	import ProducerTypeBadge from '#lib/components/identity/ProducerTypeBadge.svelte';
	import YearSpan from '#lib/components/identity/YearSpan.svelte';
	import ConfidenceMeter from '#lib/components/epistemic/ConfidenceMeter.svelte';
	import StaffVnsButton from '#lib/components/people/StaffVnsButton.svelte';
	import ClassEdge from '#lib/components/relations/ClassEdge.svelte';
	import VerdictCard from '#lib/components/relations/VerdictCard.svelte';
	import SharedPeopleMatrix from '#lib/components/relations/SharedPeopleMatrix.svelte';
	import ProducerPicker, {
		type PickedProducer
	} from '#lib/components/relations/ProducerPicker.svelte';
	import CompareTimeline from '#lib/components/viz/CompareTimeline.svelte';
	import type { InferredBrandLink, ProducerSummary } from '#lib/types.ts';
	import { inferredLabel, inferredOrientation, toScore } from '#lib/relations.ts';
	import { CORE_STAFF_HINT, SEIYUU_HINT } from '#lib/roles.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';
	import { compareHref, num, plural } from '#lib/util.ts';

	let { data }: { data: PageData } = $props();

	const pending = $derived(navigating.to?.url.pathname === '/compare');
	const cmp = $derived(data.comparison);
	const same = $derived(!!data.a && data.a === data.b);
	type CompareTab = 'shared' | 'timeline' | 'codev';
	let activeTab = $state<CompareTab>('shared');
	let showAllCoDev = $state(false);
	$effect(() => {
		void data.a;
		void data.b;
		activeTab = 'shared';
		showAllCoDev = false;
	});
	const missing = $derived(
		[
			data.a && !data.pickedA ? data.a : null,
			data.b && !data.pickedB ? data.b : null
		].filter((x): x is string => x !== null)
	);

	function toPicked(p: ProducerSummary | null): PickedProducer | null {
		return p ? { id: p.id, name: p.name, original: p.original ?? null, type: p.type } : null;
	}
	const pickedA = $derived(toPicked(data.pickedA));
	const pickedB = $derived(toPicked(data.pickedB));

	function navigate(a: string, b: string) {
		const sp = new URLSearchParams();
		if (a) sp.set('a', a);
		if (b) sp.set('b', b);
		const q = sp.toString();
		void goto(q ? `/compare?${q}` : '/compare', { reset: false });
	}

	const single = $derived(pickedA && !pickedB ? pickedA : pickedB && !pickedA ? pickedB : null);
	const emptySlot = $derived<'A' | 'B'>(pickedA && !pickedB ? 'B' : 'A');

	function arrowFor(link: InferredBrandLink, leftIsA = true): 'left' | 'right' | 'none' {
		const { head } = inferredOrientation(link.inferredType, link.direction);
		if (!head) return 'none';
		return (head === 'A') === leftIsA ? 'left' : 'right';
	}
</script>

<svelte:head>
	<title>
		{cmp ? `${cmp.producerA.name} vs ${cmp.producerB.name}` : 'Compare brands'} · VNDB Explorer
	</title>
</svelte:head>

<header class="pt-4 pb-3">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold tracking-tight text-ink">Compare brands</h1>
		{#if cmp && !same}
			<a class="btn-ghost text-xs" href="/?compare={cmp.producerA.id}-{cmp.producerB.id}">Spotlight on Atlas →</a>
		{/if}
	</div>

	<div class="mt-2.5 grid items-start gap-2 md:grid-cols-[1fr_auto_1fr]">
		<div class="min-w-0">
			<ProducerPicker
				side="A"
				value={pickedA}
				placeholder="Pick brand A…"
				onpick={(p) => navigate(p.id, data.b)}
				onclear={() => navigate('', data.b)}
			/>
			{#if cmp && !same}
				<p class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 px-0.5 text-xs text-ink-3">
					<ProducerTypeBadge type={cmp.producerA.type} lang={cmp.producerA.lang} />
					<YearSpan from={cmp.producerA.firstYear} to={cmp.producerA.lastYear} />
					<StaffVnsButton
						count={cmp.producerA.vnCount}
						label={plural(cmp.producerA.vnCount, 'VN')}
						title={shownName(cmp.producerA.name, cmp.producerA.original)}
						subtitle="Visual novels"
						endpoint="/api/proof/producer-vns?pid={encodeURIComponent(cmp.producerA.id)}&role=all"
						moreHref="/producer/{cmp.producerA.id}#games"
						moreLabel="Open studio →"
						align="left"
						class="text-xs text-ink-2"
					/>
					<span class="term" title={CORE_STAFF_HINT}>{num(cmp.producerA.staffCount)} core</span>
					<span class="term" title={SEIYUU_HINT}>{num(cmp.producerA.seiyuuCount)} seiyuu</span>
					<a class="link ml-auto font-medium" href="/producer/{cmp.producerA.id}">Brand →</a>
				</p>
			{/if}
		</div>
		<button
			type="button"
			class="btn mx-auto size-9 px-0"
			aria-label="Swap A and B"
			title="Swap A and B"
			disabled={!data.a && !data.b}
			onclick={() => navigate(data.b, data.a)}
		>
			<ArrowLeftRight size={15} class="rotate-90 md:rotate-0" />
		</button>
		<div class="min-w-0">
			<ProducerPicker
				side="B"
				value={pickedB}
				placeholder="Pick brand B…"
				onpick={(p) => navigate(data.a, p.id)}
				onclear={() => navigate(data.a, '')}
			/>
			{#if cmp && !same}
				<p class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 px-0.5 text-xs text-ink-3">
					<ProducerTypeBadge type={cmp.producerB.type} lang={cmp.producerB.lang} />
					<YearSpan from={cmp.producerB.firstYear} to={cmp.producerB.lastYear} />
					<StaffVnsButton
						count={cmp.producerB.vnCount}
						label={plural(cmp.producerB.vnCount, 'VN')}
						title={shownName(cmp.producerB.name, cmp.producerB.original)}
						subtitle="Visual novels"
						endpoint="/api/proof/producer-vns?pid={encodeURIComponent(cmp.producerB.id)}&role=all"
						moreHref="/producer/{cmp.producerB.id}#games"
						moreLabel="Open studio →"
						align="left"
						class="text-xs text-ink-2"
					/>
					<span class="term" title={CORE_STAFF_HINT}>{num(cmp.producerB.staffCount)} core</span>
					<span class="term" title={SEIYUU_HINT}>{num(cmp.producerB.seiyuuCount)} seiyuu</span>
					<a class="link ml-auto font-medium" href="/producer/{cmp.producerB.id}">Brand →</a>
				</p>
			{/if}
		</div>
	</div>

	{#if same}
		<p class="mt-2 border-l-2 border-ink-3 pl-3 text-xs text-ink-2">Pick two different brands.</p>
	{/if}
	{#if missing.length > 0}
		<p class="mt-2 border-l-2 border-danger pl-3 text-xs text-ink-2" role="alert">
			{#each missing as id, i (id)}{i > 0 ? ' and ' : ''}<span class="tnum font-mono text-ink">{id}</span>{/each}
			not found in this dump.
		</p>
	{/if}
</header>

<div class="transition-opacity duration-150 {pending ? 'opacity-60' : ''}" aria-busy={pending}>
	{#if cmp && !same}
		{@const A = cmp.producerA}
		{@const B = cmp.producerB}
		{@const shownA = shownName(A.name, A.original)}
		{@const shownB = shownName(B.name, B.original)}

		{#key `${A.id}-${B.id}`}
			<VerdictCard a={A} b={B} explicitPath={cmp.explicitPath} inferred={cmp.inferred} />

			<div class="mt-5">
				<Tabs
					label="Compare views"
					idBase="cmp"
					value={activeTab}
					onchange={(v) => (activeTab = v)}
					tabs={[
						{ value: 'shared', label: 'Shared People', count: cmp.sharedTotals.all },
						{ value: 'timeline', label: 'Activity Timeline' },
						{ value: 'codev', label: 'Co-dev & Links', count: cmp.coDevVns.length + cmp.sharedExtlinks.length }
					]}
				/>
			</div>

			<div class="mt-4">
				{#if activeTab === 'shared'}
					{#if cmp.sharedPeople.length === 0}
						<EmptyState message="No one is credited at both brands." />
					{:else}
						<SharedPeopleMatrix rows={cmp.sharedPeople} pidA={A.id} pidB={B.id} nameA={shownA} nameB={shownB} />
					{/if}
				{:else if activeTab === 'timeline'}
					<CompareTimeline
						a={{ id: A.id, name: shownA, firstYear: A.firstYear, lastYear: A.lastYear }}
						b={{ id: B.id, name: shownB, firstYear: B.firstYear, lastYear: B.lastYear }}
						series={cmp.timelineSeries}
						shared={cmp.sharedPeople}
						{pending}
					/>
				{:else}
					<div class="grid gap-4 md:grid-cols-2">
						<div class="sheet zone-confirmed px-4 py-3">
							<h3 class="text-xs font-medium text-ink-3">
								Co-developed VNs <span class="tnum font-mono">{cmp.coDevVns.length}</span>
							</h3>
							{#if cmp.coDevVns.length === 0}
								<p class="mt-1.5 text-xs text-ink-3">None.</p>
							{:else}
								<ul class="mt-2 grid gap-1">
									{#each showAllCoDev ? cmp.coDevVns : cmp.coDevVns.slice(0, 15) as v (v.id)}
										<li class="flex items-baseline gap-2.5 text-sm">
											<span class="tnum w-[4ch] shrink-0 font-mono text-xs text-ink-3">{v.firstYear ?? '—'}</span>
											<span class="min-w-0"><NamePair name={v.title} original={v.original} href="/vn/{v.id}" /></span>
										</li>
									{/each}
								</ul>
								{#if cmp.coDevVns.length > 15}
									<button type="button" class="btn-ghost mt-2 text-xs" onclick={() => (showAllCoDev = !showAllCoDev)}>
										{showAllCoDev ? 'Show fewer' : `Show all ${cmp.coDevVns.length}`}
									</button>
								{/if}
							{/if}
						</div>

						<div class="sheet zone-confirmed px-4 py-3">
							<h3 class="text-xs font-medium text-ink-3">
								Shared external links <span class="tnum font-mono">{cmp.sharedExtlinks.length}</span>
							</h3>
							{#if cmp.sharedExtlinks.length === 0}
								<p class="mt-1.5 text-xs text-ink-3">None.</p>
							{:else}
								<ul class="mt-2 grid gap-1">
									{#each cmp.sharedExtlinks as l (l.site + l.value)}
										<li class="flex items-baseline gap-2.5 text-sm">
											<span class="w-20 shrink-0 text-xs text-ink-3">{l.site}</span>
											{#if l.url && /^https?:\/\//i.test(l.url)}
												<a class="link inline-flex min-w-0 items-center gap-0.5 truncate font-mono text-xs" href={l.url} target="_blank" rel="noopener noreferrer">{l.value}<ArrowUpRight size={10} /></a>
											{:else}
												<span class="min-w-0 truncate font-mono text-xs text-ink">{l.value}</span>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/key}
	{:else if single && !same}
		<section class="mt-2">
			<h2 class="mb-2 text-xs font-medium text-ink-3">Closest neighbours for slot {emptySlot}</h2>
			{#if data.neighbours.length === 0}
				<EmptyState kind="inferred" message="No inferred neighbours found. Search above." />
			{:else}
				<ul class="sheet zone-inferred divide-y divide-dashed divide-inferred/30">
					{#each data.neighbours as link (link.pidA + link.pidB)}
						{@const otherIsB = link.pidA === single.id}
						{@const other = otherIsB ? { id: link.pidB, name: link.nameB, original: link.originalB, lang: link.langB } : { id: link.pidA, name: link.nameA, original: link.originalA, lang: link.langA }}
						<li>
							<a
								href={emptySlot === 'B' ? compareHref(single.id, other.id) : compareHref(other.id, single.id)}
								class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm text-ink no-underline hover:bg-surface-hover/60"
							>
								<ClassEdge type={link.inferredType} arrow={arrowFor(link, otherIsB)} seiyuuDriven={link.seiyuuDriven} coDevVns={link.coDevVns} />
								<span class="min-w-0 font-medium"><NamePair name={other.name} original={other.original} lang={other.lang} variant="inline" /></span>
								<span class="ml-auto flex items-center gap-3">
									<span class="tnum text-xs text-ink-3" title={CORE_STAFF_HINT}>{link.sharedCoreStaff} core</span>
									<ConfidenceMeter score={toScore(link.confidence)} tier={link.confidenceTier} dense />
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{:else if !same}
		<section class="mt-2">
			<div class="mb-2 flex items-center justify-between">
				<h2 class="text-xs font-medium text-ink-3">Suggested unlinked pairs</h2>
				<a class="link text-xs" href="/discover/brands">Browse all →</a>
			</div>
			{#if data.suggestedPairs.length === 0}
				<EmptyState kind="sparse" message="Pick two brands above." />
			{:else}
				<ul class="sheet zone-inferred divide-y divide-dashed divide-inferred/30">
					{#each data.suggestedPairs as link (link.pidA + link.pidB)}
						<li>
							<a
								href={compareHref(link.pidA, link.pidB)}
								class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm text-ink no-underline hover:bg-surface-hover/60 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_auto]"
								aria-label="Inferred: {inferredLabel(link)} {link.nameA} and {link.nameB}, confidence {toScore(link.confidence)} of 100."
							>
								<span class="min-w-0 text-right font-medium"><NamePair name={link.nameA} original={link.originalA} lang={link.langA} variant="compact" class="block truncate" /></span>
								<ClassEdge type={link.inferredType} arrow={arrowFor(link)} seiyuuDriven={link.seiyuuDriven} coDevVns={link.coDevVns} />
								<span class="min-w-0 font-medium"><NamePair name={link.nameB} original={link.originalB} lang={link.langB} variant="compact" class="block truncate" /></span>
								<ConfidenceMeter score={toScore(link.confidence)} tier={link.confidenceTier} dense class="col-span-2 md:col-span-1" />
								<span class="tnum text-right text-xs text-ink-3 md:w-[9ch]" title={CORE_STAFF_HINT}>{link.sharedCoreStaff} core</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>
