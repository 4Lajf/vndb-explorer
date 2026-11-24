<script lang="ts">
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import Search from '@lucide/svelte/icons/search';
	import { afterNavigate, goto } from '$app/navigation';
	import type { PageData } from './$types';
	import SectionHeader from '#lib/components/shell/SectionHeader.svelte';
	import Tabs from '#lib/components/controls/Tabs.svelte';
	import SegmentedControl from '#lib/components/controls/SegmentedControl.svelte';
	import EmptyState from '#lib/components/feedback/EmptyState.svelte';
	import NamePair from '#lib/components/identity/NamePair.svelte';
	import StatInline from '#lib/components/identity/StatInline.svelte';
	import ExternalLinks from '#lib/components/identity/ExternalLinks.svelte';
	import RichText from '#lib/components/identity/RichText.svelte';
	import AliasChip from '#lib/components/identity/AliasChip.svelte';
	import YearSpan from '#lib/components/identity/YearSpan.svelte';
	import RatingTag from '#lib/components/identity/RatingTag.svelte';
	import DisciplineBadge from '#lib/components/identity/DisciplineBadge.svelte';
	import ProducerShape from '#lib/components/identity/ProducerShape.svelte';
	import SwapMark from '#lib/components/identity/SwapMark.svelte';
	import EpistemicZone from '#lib/components/epistemic/EpistemicZone.svelte';
	import EpistemicGlyph from '#lib/components/epistemic/EpistemicGlyph.svelte';
	import PotentialAliasCard from '#lib/components/epistemic/PotentialAliasCard.svelte';
	import PotentialAliasFlag from '#lib/components/epistemic/PotentialAliasFlag.svelte';
	import RelationBadge from '#lib/components/epistemic/RelationBadge.svelte';
	import RoleMark from '#lib/components/people/RoleMark.svelte';
	import RolePills from '#lib/components/people/RolePills.svelte';
	import StaffVnsButton from '#lib/components/people/StaffVnsButton.svelte';
	import CareerTimeline, {
		type CandidateOption
	} from '#lib/components/viz/CareerTimeline.svelte';
	import ShareBar from '#lib/components/viz/ShareBar.svelte';
	import { EXPLICIT_META, toScore } from '#lib/relations.ts';
	import {
		ALIAS_USED_HINT,
		CO_MOVER_HINT,
		TENURE_HINT,
		primaryRole,
		roleMeta,
		sortRoles
	} from '#lib/roles.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';
	import { externalLinks, matchesText, num, pct, vndbHref, yearSpan } from '#lib/util.ts';
	import { creditYearsByBrand, distinctPenNames, primaryMoves, transitionAliasPair } from '#lib/viz/timeline.ts';

	let { data }: { data: PageData } = $props();

	const s = $derived(data?.staff);
	const links = $derived(externalLinks(data?.extlinks ?? []));
	const isDual = $derived(!!s && (s.primaryDiscipline === 'dual' || (s.isSeiyuu && s.isCoreStaff)));
	// The discipline badge already says "Seiyuu" (or "Dual"): the header's role
	// pills list only what it does not, the development roles.
	const headerRoles = $derived(
		!s
			? []
			: s.primaryDiscipline === 'seiyuu' || s.primaryDiscipline === 'dual'
				? s.roles.filter((r) => r !== 'seiyuu')
				: s.roles
	);
	// Collaborators are counted within the person's dominant discipline: voice
	// casts for someone who mostly voices, staff lists otherwise.
	const collabIsCast = $derived(data?.collabKind === 'seiyuu');

	// ── Potential aliases: always separate staff.id records, never merged ──
	let overlaySid = $state<string | null>(null);
	const candidates = $derived<CandidateOption[]>(
		!s
			? []
			: (data?.potentialAliases ?? []).map((c) => {
					const selfIsA = c.sidA === s.id;
					return {
						sid: selfIsA ? c.sidB : c.sidA,
						name: selfIsA ? c.nameB : c.nameA,
						original: (selfIsA ? c.originalB : c.originalA) ?? null,
						tier: c.confidenceTier,
						score: toScore(c.confidence)
					};
				})
	);
	const candidateSids = $derived(new Set(candidates.map((c) => c.sid)));

	function overlay(sid: string | null) {
		overlaySid = sid;
		if (sid) mainTab = 'timeline';
	}

	// The overlay is shareable: ?overlay=s123 restores it, and choosing one updates the URL.
	// URL → state on every real navigation: the first load, Back and Forward, and a
	// link to this same page with another `?overlay=`. The shallow writes made
	// below are this page's own and are not read back.
	let overlayReady = false;
	afterNavigate((nav) => {
		if (nav.shallow && nav.type === 'goto') return;
		const url = nav.to?.url ?? new URL(window.location.href);
		if (!url.pathname.startsWith('/staff/')) return;
		const wanted = url.searchParams.get('overlay');
		overlaySid = wanted && candidateSids.has(wanted) ? wanted : null;
		overlayReady = true;
	});
	// State → URL.
	$effect(() => {
		const sid = overlaySid;
		const currentId = s?.id;
		if (!overlayReady || !currentId) return;
		// The address bar is the reference: a shallow update leaves `page.url` alone.
		const url = new URL(window.location.href);
		if (url.pathname !== `/staff/${currentId}`) return;
		if ((url.searchParams.get('overlay') ?? null) === sid) return;
		if (sid) url.searchParams.set('overlay', sid);
		else url.searchParams.delete('overlay');
		void goto(`${url.pathname}${url.search}${url.hash}`, { shallow: true, replace: true });
	});

	// ── Confirmed aliases: a name switch that lines up with a change of brand ──
	let expandedAliasBrands = $state<Record<number, boolean>>({});
	let expandedCollabBrands = $state<Record<string, boolean>>({});
	let expandedCreditChars = $state<Record<string, boolean>>({});

	function filterCreditsByAlias(name: string) {
		creditKind = 'all';
		creditRole = 'all';
		creditBrand = 'all';
		creditRating = 'all';
		creditQuery = '';
		creditAlias = name;
		creditLimit = Math.max(creditLimit, 80);
		mainTab = 'credits';
	}
	function filterCreditsByBrand(pid: string) {
		creditKind = 'all';
		creditRole = 'all';
		creditBrand = pid;
		creditRating = 'all';
		creditQuery = '';
		creditAlias = '';
		creditLimit = Math.max(creditLimit, 80);
		mainTab = 'credits';
	}
	const compactAliases = $derived(
		(data?.potentialAliases?.length ?? 0) === 0 && (data?.confirmedAliases?.length ?? 0) <= 1
	);

	const switchedByAid = $derived.by(() => {
		const out = new Map<number, string>();
		const transitions = data?.transitions ?? [];
		for (const a of data?.confirmedAliases ?? []) {
			if (a.isMain) continue;
			const pids = new Set(a.brands.map((b) => b.pid));
			const t = transitions.find(
				(x) => x.aliasChanged && pids.has(x.toPid) && !pids.has(x.fromPid)
			);
			if (t) {
				out.set(
					a.aid,
					`Switched: ${shownName(t.fromName, t.fromOriginal)} → ${shownName(t.toName, t.toOriginal)} (${t.toFirstYear ?? '?'})`
				);
			}
		}
		return out;
	});

	// ── Affinity ──
	const affinity = $derived([...(data?.brandTracks ?? [])].sort((a, b) => b.vnCount - a.vnCount));
	let affinityAll = $state(false);
	let transitionsAll = $state(false);
	// Every move runs forward in time: it leaves the last credit at A that is not
	// later than the first credit at B, exactly as the timeline draws it.
	const moves = $derived.by(() => {
		const transitions = data?.transitions ?? [];
		const events = data?.timelineEvents ?? [];
		const resolved = primaryMoves(transitions, creditYearsByBrand(events));
		return transitions
			.filter((t) => resolved.has(t))
			.map((t) => ({ ...t, fromYear: resolved.get(t)!.anchorYear }));
	});
	const transitionsShown = $derived(transitionsAll ? moves : moves.slice(0, 10));
	const affinityShown = $derived(affinityAll ? affinity : affinity.slice(0, 12));
	/** Exact VNs for one studio from the already-loaded timelineEvents (zero network wait). */
	const vnsByBrandPid = $derived.by(() => {
		const map = new Map<
			string,
			Array<{
				vid: string;
				title: string;
				original: string | null;
				year: number | null;
				roles: string[];
				penNames: string[];
				hasEro: boolean;
				hasAllAges: boolean;
			}>
		>();
		for (const e of data?.timelineEvents ?? []) {
			if (!e.pid) continue;
			let list = map.get(e.pid);
			if (!list) {
				list = [];
				map.set(e.pid, list);
			}
			list.push({
				vid: e.vid,
				title: e.vnTitle,
				original: e.vnOriginal,
				year: e.year,
				roles: e.roles,
				penNames: e.isNonPrimaryAlias ? distinctPenNames(e.aliases).map((a) => a.label) : [],
				hasEro: e.hasEro,
				hasAllAges: e.hasAllAges
			});
		}
		for (const list of map.values()) {
			list.sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || a.title.localeCompare(b.title));
		}
		return map;
	});

	/** Names other than the primary one used at a brand: the server decides by VNDB alias id. */
	function penNamesAt(track: (typeof data.brandTracks)[number]): string[] {
		return track.penNames;
	}

	// ── Collaborators ──
	type CollabMode = 'collab' | 'comovers';
	let collabMode = $state<CollabMode>('collab');
	const collabRows = $derived.by(() => {
		const list = data?.collaborators ?? [];
		const base = collabMode === 'comovers' ? list.filter((c) => c.sharedBrands >= 2) : list;
		return [...base].sort((a, b) =>
			collabMode === 'comovers'
				? b.sharedBrands - a.sharedBrands || b.sharedVns - a.sharedVns
				: b.sharedVns - a.sharedVns || b.sharedBrands - a.sharedBrands
		);
	});
	const coMoverCount = $derived((data?.collaborators ?? []).filter((c) => c.sharedBrands >= 2).length);

	// ── Full credits ──
	type KindFilter = 'all' | 'core' | 'seiyuu';
	type RatingFilter = 'all' | 'allages' | 'ero';
	let creditKind = $state<KindFilter>('all');
	let creditRole = $state('all');
	let creditBrand = $state('all');
	let creditRating = $state<RatingFilter>('all');
	let creditAlias = $state('');
	let creditQuery = $state('');
	let creditLimit = $state(80);

	const creditRoles = $derived(sortRoles((data?.timelineEvents ?? []).flatMap((e) => e.roles)));
	const creditBrands = $derived.by(() => {
		const m = new Map<string, { name: string; original: string | null; n: number }>();
		for (const e of data?.timelineEvents ?? []) {
			if (!e.pid) continue;
			const cur = m.get(e.pid);
			if (cur) cur.n++;
			else m.set(e.pid, { name: e.producerName ?? e.pid, original: e.producerOriginal, n: 1 });
		}
		return [...m.entries()]
			.map(([pid, v]) => ({ pid, ...v }))
			.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
	});
	const creditsFiltered = $derived(
		(data?.timelineEvents ?? [])
			.filter((e) => {
				const hasDev = e.roles.some((r) => r !== 'seiyuu');
				if (creditKind === 'core' && !hasDev) return false;
				if (creditKind === 'seiyuu' && !e.isSeiyuu) return false;
				if (creditRole !== 'all' && !e.roles.includes(creditRole)) return false;
				if (creditBrand !== 'all' && e.pid !== creditBrand) return false;
				if (creditAlias && !e.aliases.some((a) => a.name === creditAlias)) return false;
				if (creditRating === 'ero' && !e.hasEro) return false;
				// Same reading as the brand page: an all-ages release and no 18+ one.
				if (creditRating === 'allages' && !(e.hasAllAges && !e.hasEro)) return false;
				return matchesText(
					creditQuery,
					e.vnTitle,
					e.vnOriginal,
					e.producerName,
					e.producerOriginal,
					...e.aliases.flatMap((a) => [a.name, a.original]),
					...e.characters.flatMap((c) => [c.name, c.original])
				);
			})
			.sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || a.vnTitle.localeCompare(b.vnTitle))
	);
	const creditsShown = $derived(creditsFiltered.slice(0, creditLimit));
	const hasCharacters = $derived((data?.timelineEvents ?? []).some((e) => e.characters.length > 0));
	function resetCredits() {
		creditKind = 'all';
		creditRole = 'all';
		creditBrand = 'all';
		creditRating = 'all';
		creditAlias = '';
		creditQuery = '';
	}

	type StaffMainTab = 'credits' | 'timeline' | 'aliases' | 'collaborators';
	function initialStaffTab(): StaffMainTab {
		if (typeof window === 'undefined') return 'credits';
		const h = window.location.hash.replace(/^#/, '');
		if (h === 'timeline' || h === 'affinity') return 'timeline';
		if (h === 'aliases') return 'aliases';
		if (h === 'collaborators') return 'collaborators';
		return 'credits';
	}
	let mainTab = $state<StaffMainTab>(initialStaffTab());
</script>

<svelte:head>
	<title>{s?.name ?? 'Staff'} · career tracker · VNDB Explorer</title>
</svelte:head>

{#if s}
<header id="overview" class="pt-4 pb-3">
	<div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
		<div class="min-w-0">
			<p class="flex flex-wrap items-center gap-2">
				<DisciplineBadge kind={s.primaryDiscipline} />
				{#if s.lang}<span class="font-mono text-2xs text-ink-3" title="Primary language">{s.lang}</span>{/if}
			</p>
			<h1 class="mt-1">
				<NamePair name={s.name} original={s.original} lang={s.lang} variant="stacked" />
			</h1>
		</div>
		<a class="btn btn-primary btn-sm shrink-0 no-underline" href="/?trace={s.id}">
			Trace VN path on Atlas →
		</a>
	</div>

	<div class="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-sm">
		{#if headerRoles.length > 0}<RolePills roles={headerRoles} max={6} full />{/if}
		<span class="tnum font-mono text-xs text-ink-3">{yearSpan(s.firstYear, s.lastYear)}</span>
		<span class="tnum text-ink-2"><span class="font-medium text-ink">{num(s.brandCount)}</span> {s.brandCount === 1 ? 'brand' : 'brands'}</span>
		<StaffVnsButton
			count={s.vnCount}
			label="{num(s.vnCount)} {s.vnCount === 1 ? 'VN' : 'VNs'}"
			title={shownName(s.name, s.original)}
			subtitle="Visual novels credited on"
			endpoint="/api/proof/staff-vns?sid={encodeURIComponent(s.id)}"
			onMoreClick={() => (mainTab = 'credits')}
			moreLabel="Open Credits tab →"
			align="left"
			class="font-medium text-ink"
		/>
		{#if s.seiyuuVnCount > 0 && s.seiyuuVnCount !== s.vnCount}
			<StaffVnsButton
				count={s.seiyuuVnCount}
				label="{num(s.seiyuuVnCount)} voiced"
				title={shownName(s.name, s.original)}
				subtitle="Visual novels voiced"
				endpoint="/api/proof/staff-vns?sid={encodeURIComponent(s.id)}&mode=seiyuu"
				align="left"
				class="text-xs text-ink-2"
			/>
		{/if}
		<a class="link inline-flex items-center gap-0.5 text-xs text-ink-3" href={vndbHref(s.id)} target="_blank" rel="noopener noreferrer">
			VNDB<ArrowUpRight size={10} />
		</a>
		<ExternalLinks {links} max={1} class="text-xs" />
		{#if s.personalProducer}
			<span class="flex items-center gap-1.5 text-xs text-ink-2">
				<span class="text-ink-3">Own label:</span>
				<a href="/producer/{s.personalProducer.id}" class="link font-medium">
					{shownName(s.personalProducer.name, s.personalProducer.original)}
				</a>
			</span>
		{/if}
	</div>

	<RichText text={s.description} class="mt-2" />
</header>

<div class="mt-2 border-b border-rule">
	<Tabs
		label="Person sections"
		idBase="staff-main"
		value={mainTab}
		onchange={(v) => (mainTab = v)}
		bare
		class="-mb-px"
		tabs={[
			{ value: 'credits', label: 'Credits & VNs', count: data.timelineEvents.length },
			{ value: 'timeline', label: 'Timeline & Studios', count: data.brandTracks.length },
			{
				value: 'aliases',
				label: 'Aliases',
				count: data.confirmedAliases.length + data.potentialAliases.length,
				register: data.potentialAliases.length > 0 ? 'inferred' : undefined
			},
			{ value: 'collaborators', label: collabIsCast ? 'Co-stars' : 'Collaborators', count: data.collaborators.length }
		]}
	/>
</div>

{#if mainTab === 'aliases'}
<!-- Aliases -->
<section class="mt-4" aria-labelledby="aliases">
	{#if compactAliases}
		<div id="aliases" class="sheet flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 text-sm">
			<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-2">
				<EpistemicGlyph kind="alias-confirmed" size={12} label="Confirmed alias" />
				<span class="font-medium text-ink">Primary name only</span>
				{#if data.confirmedAliases[0]}
					<span class="text-ink-3">·</span>
					<NamePair name={data.confirmedAliases[0].name} original={data.confirmedAliases[0].original} lang={s.lang} variant="inline" />
				{/if}
			</p>
			<p class="flex items-center gap-1.5 text-xs text-ink-3">
				<EpistemicGlyph kind="alias-potential" size={11} />
				<span>No potential aliases flagged.</span>
			</p>
		</div>
	{:else}
		<div class="grid items-start gap-5 lg:grid-cols-2">
			<EpistemicZone
				register="confirmed"
				title="Confirmed aliases"
				count={data.confirmedAliases.length}
			>
				{#if data.confirmedAliases.length === 0}
					<EmptyState message="No alias names recorded in VNDB." />
				{:else}
					<ul>
						{#each data.confirmedAliases as a (a.aid)}
							{@const switched = switchedByAid.get(a.aid)}
							<li class="border-b border-rule px-4 py-2.5 last:border-b-0">
								<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
									<EpistemicGlyph kind="alias-confirmed" size={12} label="Confirmed alias" />
									<span class="min-w-0 text-sm font-medium">
										<NamePair name={a.name} original={a.original} lang={s.lang} />
									</span>
									{#if a.isMain}<span class="text-xs text-ink-3">primary name</span>{/if}
									{#if switched}
										<span class="inline-flex items-center gap-1 text-2xs text-ink-2" title={switched}>
											<SwapMark size={10} class="text-ink" />
											switched
										</span>
									{/if}
									{#if a.brands.length > 0}
										<button
											type="button"
											class="btn-ghost ml-auto h-6 px-2 text-2xs"
											title="Filter Credits & VNs to {shownName(a.name, a.original)}"
											onclick={() => filterCreditsByAlias(a.name)}
										>
											Filter credits
										</button>
									{/if}
								</div>
								<p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-5 text-xs text-ink-2">
									{#if a.brands.length === 0}
										<span class="text-ink-3">unused in credits</span>
									{:else}
										{@const isExp = !!expandedAliasBrands[a.aid]}
										{@const visibleBrands = isExp ? a.brands : a.brands.slice(0, 3)}
										{#each visibleBrands as b, i (b.pid)}
											{#if i > 0}<span class="text-ink-4" aria-hidden="true">·</span>{/if}
											<span>
												<NamePair name={b.name} original={b.original} href="/producer/{b.pid}" variant="compact" />
												<span class="tnum font-mono text-2xs text-ink-3">{yearSpan(b.firstYear, b.lastYear, true)}</span>
											</span>
										{/each}
										{#if a.brandCount > 3}
											{#if !isExp}
												<button
													type="button"
													class="tnum inline-flex h-[18px] items-center rounded-xs border border-rule-strong bg-surface-sunken px-1.5 font-mono text-2xs text-ink-2 transition-colors duration-[120ms] hover:border-rule-hover hover:bg-control-hover hover:text-ink"
													aria-expanded={false}
													onclick={() => (expandedAliasBrands[a.aid] = true)}
												>
													+{num(a.brandCount - 3)} more
												</button>
											{:else}
												{#if a.brandCount > a.brands.length}
													<button
														type="button"
														class="link text-2xs"
														onclick={() => filterCreditsByAlias(a.name)}
													>
														+{num(a.brandCount - a.brands.length)} more in credits →
													</button>
												{/if}
												<button
													type="button"
													class="tnum inline-flex h-[18px] items-center rounded-xs border border-rule-strong bg-surface-sunken px-1.5 font-mono text-2xs text-ink-2 transition-colors duration-[120ms] hover:border-rule-hover hover:bg-control-hover hover:text-ink"
													aria-expanded={true}
													onclick={() => (expandedAliasBrands[a.aid] = false)}
												>
													less
												</button>
											{/if}
										{/if}
									{/if}
								</p>
							</li>
						{/each}
					</ul>
				{/if}
			</EpistemicZone>

			<EpistemicZone
				register="inferred"
				glyph="alias-potential"
				title="Potential aliases"
				count={data.potentialAliases.length}
				note="Unconfirmed separate VNDB records"
			>
				{#if data.potentialAliases.length === 0}
					<EmptyState message="No potential aliases found for this record." />
				{:else}
					<!-- Flat rows: the zone is the only frame. -->
					{#each data.potentialAliases as c (c.sidA + c.sidB)}
						{@const otherSid = c.sidA === s.id ? c.sidB : c.sidA}
						<PotentialAliasCard
							candidate={c}
							selfSid={s.id}
							overlayActive={overlaySid === otherSid}
							onoverlay={overlay}
						/>
					{/each}
				{/if}
			</EpistemicZone>
		</div>
	{/if}
</section>
{:else if mainTab === 'timeline'}
<!-- Career timeline -->
<div class="mt-4">
	{#if data.timelineEvents.length === 0}
		<SectionHeader title="Career timeline" id="timeline" />
		<EmptyState message="No credits recorded in VNDB for this person." />
	{:else}
		<CareerTimeline
			events={data.timelineEvents}
			tracks={data.brandTracks}
			transitions={data.transitions}
			personName={s.name}
			{candidates}
			bind:overlaySid
			onShowAliases={() => (mainTab = 'aliases')}
		/>
	{/if}
</div>

<!-- Affinity and transitions -->
<div class="mt-10 grid items-start gap-x-8 gap-y-10 lg:grid-cols-[3fr_2fr] xl:mt-14">
	<section aria-labelledby="affinity">
		<SectionHeader title="Studios worked at" id="affinity" count={affinity.length} />
		{#if affinity.length === 0}
			<EmptyState message="No brand credits recorded." />
		{:else}
			<div>
				<div class="scroll-x rounded-sm">
					<table class="ledger">
						<caption class="sr-only">Brands {s.name} is credited at, by number of visual novels</caption>
						<thead>
							<tr>
								<th scope="col">Studio</th>
								<th scope="col" class="num">VNs</th>
								<th scope="col" title={TENURE_HINT}><span class="term">Tenure</span></th>
								<th scope="col">Roles</th>
								<th scope="col" title={ALIAS_USED_HINT}><span class="term">Alias used</span></th>
								<th scope="col" title="% of career VNs"><span class="term">Share</span></th>
								<th scope="col"><span class="sr-only">Filter credits</span></th>
							</tr>
						</thead>
						<tbody>
							{#each affinityShown as t (t.pid)}
								{@const pens = penNamesAt(t)}
								<tr>
									<td class="max-w-[13rem]">
										<span class="flex items-center gap-2">
											<ProducerShape type={t.type} size={10} />
											<NamePair name={t.name} original={t.original} href="/producer/{t.pid}" />
										</span>
									</td>
									<td class="num font-mono font-medium">
										<StaffVnsButton
											count={t.vnCount}
											title="{shownName(s.name, s.original)} at {shownName(t.name, t.original)}"
											subtitle="Visual novels credited at this studio"
											localVns={vnsByBrandPid.get(t.pid) ?? []}
											moreLabel="Filter Credits & VNs to this studio →"
											onMoreClick={() => filterCreditsByBrand(t.pid)}
										/>
									</td>
									<td class="whitespace-nowrap"><YearSpan from={t.firstYear} to={t.lastYear} tight /></td>
									<td class="whitespace-nowrap"><RolePills roles={t.seiyuuVnCount > 0 && !t.roles.includes('seiyuu') ? [...t.roles, 'seiyuu'] : t.roles} max={3} /></td>
									<td class="max-w-[14rem]">
										{#if pens.length}<AliasChip aliases={pens} bare />{:else}<span class="text-ink-4" title="Credited under primary name">—</span>{/if}
									</td>
									<td><ShareBar value={t.shareOfCareer} label="Share of career" /></td>
									<td class="text-right">
										<button
											type="button"
											class="btn-ghost h-6 px-1.5 text-2xs"
											title="Filter Credits & VNs to {shownName(t.name, t.original)}"
											onclick={() => filterCreditsByBrand(t.pid)}
										>
											Credits
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if affinity.length > 12}
					<div class="border-t border-rule py-2">
						<button type="button" class="btn-ghost text-xs" onclick={() => (affinityAll = !affinityAll)}>
							{affinityAll ? 'Show fewer' : `Show all ${affinity.length} studios`}
						</button>
					</div>
				{/if}
			</div>
		{/if}
	</section>

	<section aria-labelledby="transitions">
		<SectionHeader title="Brand transitions" id="transitions" count={moves.length} note="A → B: the last credit at A before the first credit at B." />
		{#if moves.length === 0}
			<EmptyState message="No brand-to-brand moves recorded: credits at a single brand, or undated." />
		{:else}
			<ul class="divide-y divide-rule border-y border-rule">
				{#each transitionsShown as t (t.fromPid + '>' + t.toPid)}
					<li class="py-2.5">
						<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
							<NamePair name={t.fromName} original={t.fromOriginal} href="/producer/{t.fromPid}" variant="compact" class="font-medium" />
							<span class="shrink-0 text-ink-3" aria-label="then">→</span>
							<NamePair name={t.toName} original={t.toOriginal} href="/producer/{t.toPid}" variant="compact" class="font-medium" />
							{#if t.explicitRelation}
								{@const m = EXPLICIT_META[t.explicitRelation]}
								<RelationBadge kind={m.kind} register="confirmed" label={m.code} dense title={m.sentence(shownName(t.toName, t.toOriginal), shownName(t.fromName, t.fromOriginal))} />
							{/if}
						</p>
						<p class="tnum mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-2xs text-ink-3">
							{#if t.toFirstYear != null && t.fromYear < t.toFirstYear}
								<span class="tnum text-ink-2">{t.fromYear} → {t.toFirstYear}</span>
								<span>{t.toFirstYear - t.fromYear}y later</span>
							{:else}
								<span class="tnum text-ink-2">{t.toFirstYear ?? '?'}</span>
								<span>same year</span>
							{/if}
							{#if t.fromLastYear != null && t.toFirstYear != null && t.fromLastYear > t.toFirstYear}
								<span title="Active through {t.fromLastYear}">still active at {shownName(t.fromName, t.fromOriginal)}</span>
							{/if}
							{#if t.aliasChanged}
								{@const pair = transitionAliasPair(data?.timelineEvents ?? [], t.fromPid, t.fromYear, t.toPid, t.toFirstYear, shownName)}
								<span
									class="term inline-flex items-center gap-1 text-ink"
									title={pair && pair.from !== pair.to ? `Alias changed: ${pair.from} → ${pair.to}` : 'Credited under a different alias after moving'}
								>
									<SwapMark size={10} />
									name changed
								</span>
							{/if}
							<a class="link ml-auto font-sans text-xs" href="/compare?a={t.fromPid}&b={t.toPid}">Compare</a>
						</p>
					</li>
				{/each}
				{#if moves.length > 10}
					<li class="py-2">
						<button type="button" class="btn-ghost text-xs" onclick={() => (transitionsAll = !transitionsAll)}>
							{transitionsAll ? 'Show fewer' : `Show all ${moves.length} transitions`}
						</button>
					</li>
				{/if}
			</ul>
		{/if}
	</section>
</div>
{:else if mainTab === 'collaborators'}
<!-- Collaborators -->
<section id="collaborators" class="mt-4" aria-label={collabIsCast ? 'Co-stars and co-movers' : 'Collaborators and co-movers'}>
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<SegmentedControl
			label="Collaborator list"
			size="sm"
			bind:value={collabMode}
			options={[
				{
					value: 'collab',
					label: collabIsCast ? 'Co-stars' : 'Collaborators',
					count: data.collaborators.length,
					title: collabIsCast ? 'Same VN casts' : 'Same VNs'
				},
				{
					value: 'comovers',
					label: 'Co-movers',
					count: coMoverCount,
					title: CO_MOVER_HINT
				}
			]}
		/>
	</div>
	{#if collabRows.length === 0}
		<EmptyState message={collabMode === 'comovers' ? 'No one shares two or more brands with this person in the top collaborators.' : 'No shared credits recorded.'} />
	{:else}
		<div class="scroll-x rounded-sm">
			<table class="ledger">
				<caption class="sr-only">{collabMode === 'comovers' ? 'Co-movers' : 'Most frequent collaborators'} of {s.name}</caption>
				<thead>
					<tr>
						<th scope="col">Person</th>
						<th scope="col">Roles</th>
						<th scope="col" class="num">Shared VNs</th>
						<th scope="col" class="num">Shared brands</th>
						<th scope="col">Together at</th>
					</tr>
				</thead>
				<tbody>
					{#each collabRows as c (c.sid)}
						{@const isCandidate = candidateSids.has(c.sid)}
						{@const isExp = !!expandedCollabBrands[c.sid]}
						{@const visibleBrands = isExp ? c.brands : c.brands.slice(0, 3)}
						<tr class={isCandidate ? 'bg-inferred-tint/60' : ''}>
							<td class="max-w-[20rem]">
								<span class="flex items-center gap-2">
									<RoleMark role={c.primaryDiscipline === 'seiyuu' ? 'seiyuu' : primaryRole(c.roles)} size={8} />
									<NamePair name={c.name} original={c.original} href="/staff/{c.sid}" />
									{#if isCandidate}
										<!-- A candidate of this person must never read as merely a close colleague. -->
										<span class="inline-flex items-center gap-1 rounded-xs border border-dashed border-inferred/70 bg-inferred-tint px-1 text-2xs text-inferred" title="Unconfirmed alias candidate">
											<EpistemicGlyph kind="alias-potential" size={10} inherit /> candidate
										</span>
									{:else}
										<PotentialAliasFlag count={c.potentialAliasCount} sid={c.sid} />
									{/if}
								</span>
							</td>
							<td><RolePills roles={c.roles} max={3} /></td>
							<td class="num font-mono font-medium">
								<StaffVnsButton
									count={c.sharedVns}
									title="{shownName(s.name, s.original)} & {shownName(c.name, c.original)}"
									subtitle={collabIsCast ? 'Visual novels where both are in the voice cast' : 'Visual novels where both have development credits'}
									endpoint="/api/proof/collab-vns?a={encodeURIComponent(s.id)}&b={encodeURIComponent(c.sid)}&kind={data.collabKind}"
								/>
							</td>
							<td class="num font-mono">{c.sharedBrands}</td>
							<td class="max-w-[24rem] text-xs text-ink-2">
								{#if c.brands.length === 0}
									<span class="text-ink-4">—</span>
								{:else}
									<span class="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
										{#each visibleBrands as b, i (b.pid)}<span><a class="link-quiet" href="/producer/{b.pid}" title={b.original ? `${b.name} · ${b.original}` : undefined}>{shownName(b.name, b.original)}</a>{#if i < visibleBrands.length - 1},{/if}</span>{/each}
										{#if c.brands.length > 3}
											<button
												type="button"
												class="tnum inline-flex h-[18px] shrink-0 items-center rounded-xs border border-rule-strong bg-surface-sunken px-1.5 font-mono text-2xs text-ink-2 transition-colors duration-[120ms] hover:border-rule-hover hover:bg-control-hover hover:text-ink"
												aria-expanded={isExp}
												onclick={() => (expandedCollabBrands[c.sid] = !isExp)}
											>
												{isExp ? 'less' : `+${c.brands.length - 3}`}
											</button>
										{/if}
									</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
{:else}
<!-- Full credits -->
<section id="credits" class="mt-4" aria-label={hasCharacters ? 'Full credits and voiced characters' : 'Full credits'}>
	<div>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3">
			{#if isDual}
				<SegmentedControl
					label="Credit kind"
					size="sm"
					bind:value={creditKind}
					options={[
						{ value: 'all', label: 'All' },
						{ value: 'core', label: 'Dev', shape: 'square' },
						{ value: 'seiyuu', label: 'Voice', shape: 'circle' }
					]}
				/>
			{/if}
			{#if creditRoles.length > 1}
				<label class="flex items-center gap-1.5 text-xs text-ink-3">
					<span>Role</span>
					<select class="field h-7 pr-6 text-xs" bind:value={creditRole}>
						<option value="all">All</option>
						{#each creditRoles as r (r)}<option value={r}>{roleMeta(r).label}</option>{/each}
					</select>
				</label>
			{/if}
			{#if creditBrands.length > 1}
				<label class="flex items-center gap-1.5 text-xs text-ink-3">
					<span>Studio</span>
					<select class="field h-7 max-w-[14rem] pr-6 text-xs" bind:value={creditBrand}>
						<option value="all">All</option>
						{#each creditBrands as b (b.pid)}<option value={b.pid}>{shownName(b.name, b.original)} ({b.n})</option>{/each}
					</select>
				</label>
			{/if}
			<SegmentedControl
				label="Age rating"
				size="sm"
				bind:value={creditRating}
				options={[
					{ value: 'all', label: 'All' },
					{ value: 'allages', label: 'All-ages only', title: 'No 18+ release' },
					{ value: 'ero', label: 'Has 18+', title: 'Includes 18+ release' }
				]}
			/>
			{#if creditAlias}
				<span class="inline-flex h-7 items-center gap-1.5 rounded-sm border border-rule-strong bg-surface-sunken px-2 text-xs text-ink">
					<span class="text-ink-3">Alias:</span>
					<span>{creditAlias}</span>
					<button
						type="button"
						class="ml-0.5 text-ink-3 hover:text-ink"
						aria-label="Clear alias filter"
						onclick={() => (creditAlias = '')}
					>
						×
					</button>
				</span>
			{/if}
			<label class="relative ml-auto">
				<span class="sr-only">Filter credits by title, studio, alias or character</span>
				<Search size={13} class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-3" />
				<input type="search" class="field h-7 w-48 pl-7 text-xs" placeholder="Filter credits" bind:value={creditQuery} />
			</label>
		</div>

		{#if data.timelineEvents.length === 0}
			<EmptyState message="No credits recorded in VNDB for this person." />
		{:else if creditsFiltered.length === 0}
			<EmptyState message="No credits match these filters.">
				{#snippet actions()}
					<button type="button" class="btn-ghost" onclick={resetCredits}>Clear filters</button>
				{/snippet}
			</EmptyState>
		{:else}
			<div class="scroll-x rounded-sm">
				<table class="ledger">
					<caption class="sr-only">Credits of {s.name}, newest first</caption>
					<thead>
						<tr>
							<th scope="col">Year</th>
							<th scope="col">Title</th>
							<th scope="col">Brand</th>
							<th scope="col">Roles</th>
							<th scope="col" title={ALIAS_USED_HINT}><span class="term">Alias used</span></th>
							{#if hasCharacters}<th scope="col">Voiced character</th>{/if}
							<th scope="col">Rating</th>
						</tr>
					</thead>
					<tbody>
						{#each creditsShown as e (e.vid + '|' + (e.pid ?? '') + (e.isEdition ? '|ed' : ''))}
							<tr>
								<td class="tnum font-mono text-ink-2">{e.year ?? '—'}</td>
								<td class="max-w-[24rem]"><NamePair name={e.vnTitle} original={e.vnOriginal} href="/vn/{e.vid}" /></td>
								<td class="max-w-[14rem]">
									{#if e.pid}
										<NamePair name={e.producerName ?? e.pid} original={e.producerOriginal} href="/producer/{e.pid}" variant="compact" class="block truncate" />
									{:else if e.isEdition}
										<span class="text-2xs text-ink-3" title="Port or localisation credit">later edition</span>
									{:else}
										<span class="text-ink-4">—</span>
									{/if}
								</td>
								<td><RolePills roles={e.roles} max={4} /></td>
								<td>
									{#if e.isNonPrimaryAlias}
									<!-- Every pen name used on this title: a voice part and a song can carry two. -->
									<span class="flex flex-wrap gap-1">
										{#each distinctPenNames(e.aliases) as a (a.key)}
											<AliasChip alias={a.label} original={a.original} bare />
										{/each}
									</span>
								{:else}
									<span class="text-ink-4" title="Credited under primary name">—</span>
								{/if}
								</td>
								{#if hasCharacters}
									{@const charRowKey = e.vid + '|' + (e.pid ?? '') + (e.isEdition ? '|ed' : '')}
									{@const charExp = !!expandedCreditChars[charRowKey]}
									{@const shownChars = charExp ? e.characters : e.characters.slice(0, 2)}
									<td class="max-w-[18rem] text-xs text-ink-2">
										{#if e.characters.length}
											<span class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
												<RoleMark role="seiyuu" size={7} />
												<span class="min-w-0">
													{#each shownChars as ch, i (ch.cid)}{i > 0 ? ', ' : ''}<a class="link-quiet inline-flex items-center gap-0.5" href={vndbHref(ch.cid)} target="_blank" rel="noopener noreferrer">{shownName(ch.name, ch.original)}<ArrowUpRight size={9} class="text-ink-3" /></a>{/each}
												</span>
												{#if e.characters.length > 2}
													<button
														type="button"
														class="tnum inline-flex h-[18px] shrink-0 items-center rounded-xs border border-rule-strong bg-surface-sunken px-1.5 font-mono text-2xs text-ink-2 transition-colors duration-[120ms] hover:border-rule-hover hover:bg-control-hover hover:text-ink"
														aria-expanded={charExp}
														onclick={() => (expandedCreditChars[charRowKey] = !charExp)}
													>
														{charExp ? 'less' : `+${e.characters.length - 2}`}
													</button>
												{/if}
											</span>
										{:else}
											<span class="text-ink-4">—</span>
										{/if}
									</td>
								{/if}
								<td><RatingTag hasEro={e.hasEro} hasAllAges={e.hasAllAges} showAllAges /></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="flex flex-wrap items-center justify-between gap-2 border-t border-rule py-2 text-xs text-ink-3">
				<p>Showing {num(creditsShown.length)} of {num(creditsFiltered.length)} {creditsFiltered.length === 1 ? 'credit' : 'credits'}.</p>
				{#if creditsFiltered.length > 80}
					<button
						type="button"
						class="btn-ghost text-xs"
						onclick={() => (creditLimit = creditsShown.length < creditsFiltered.length ? creditsFiltered.length : 80)}
					>
						{creditsShown.length < creditsFiltered.length ? `Show all ${num(creditsFiltered.length)}` : 'Show fewer'}
					</button>
				{/if}
			</div>
		{/if}
	</div>
</section>
{/if}
{/if}
