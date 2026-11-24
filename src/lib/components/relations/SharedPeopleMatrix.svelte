<script module lang="ts">
	import type { StaffDiscipline } from '#lib/types.ts';

	export interface SharedPersonRow {
		sid: string;
		name: string;
		original: string | null;
		primaryDiscipline: StaffDiscipline;
		brandCount: number;
		potentialAliasCount: number;
		isSharedCore: boolean;
		isSharedSeiyuu: boolean;
		vnsA: number;
		vnsB: number;
		firstYearA: number | null;
		lastYearA: number | null;
		firstYearB: number | null;
		lastYearB: number | null;
		rolesA: string[];
		rolesB: string[];
		aliasesA: string[];
		aliasesB: string[];
		/** The names at each brand that are not the primary one, by VNDB alias id. */
		penNamesA?: string[];
		penNamesB?: string[];
		/** No alias in common between the two tenures, by alias id over every alias. */
		aliasSwitched: boolean;
	}
</script>

<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import SegmentedControl from '../controls/SegmentedControl.svelte';
	import NamePair from '../identity/NamePair.svelte';
	import AliasChip from '../identity/AliasChip.svelte';
	import YearSpan from '../identity/YearSpan.svelte';
	import PotentialAliasFlag from '../epistemic/PotentialAliasFlag.svelte';
	import RoleMark from '../people/RoleMark.svelte';
	import RolePills from '../people/RolePills.svelte';
	import MobilityIndicator from '../people/MobilityIndicator.svelte';
	import StaffVnsButton from '../people/StaffVnsButton.svelte';
	import SlotTag from './SlotTag.svelte';
	import { shownName } from '#lib/stores/prefs.svelte.ts';
	import {
		ALIAS_USED_HINT,
		CORE_ROLES_TEXT,
		MOBILITY_HINT,
		MOBILITY_RANGE_LABEL,
		MOBILITY_THRESHOLDS,
		mobilityLevel,
		primaryRole
	} from '#lib/roles.ts';
	import { matchesText, num } from '#lib/util.ts';

	/**
	 * Shared staff and seiyuu matrix (DESIGN §8.4): one row per person credited
	 * at both brands, with mirrored A and B column groups. Rows where the name
	 * used at A differs from the name used at B are the only tinted rows: pen-name
	 * switches between the two brands are the rows to look at.
	 */
	interface Props {
		rows: SharedPersonRow[];
		pidA: string;
		pidB: string;
		nameA: string;
		nameB: string;
	}
	let { rows, pidA, pidB, nameA, nameB }: Props = $props();

	type Population = 'all' | 'core' | 'seiyuu' | 'other';
	type MobilityFilter = 'any' | 'anchored' | 'mobile' | 'itinerant';
	type SortKey = 'weight' | 'year' | 'name';

	const ITINERANT = MOBILITY_THRESHOLDS.mobileMax;
	const PAGE = 60;

	let population = $state<Population>('all');
	let mobility = $state<MobilityFilter>('any');
	let onlySwitched = $state(false);
	let query = $state('');
	let sort = $state<SortKey>('weight');
	let limit = $state(PAGE);

	const coreCount = $derived(rows.filter((r) => r.isSharedCore).length);
	const seiyuuCount = $derived(rows.filter((r) => r.isSharedSeiyuu).length);
	// Credited at both brands, but in a core role at one only, or in a non-core
	// role (vocals, QA), or as staff at one and a voice at the other.
	const otherCount = $derived(rows.filter((r) => !r.isSharedCore && !r.isSharedSeiyuu).length);
	// In both of the first two groups, so the three groups can exceed the total.
	const bothCount = $derived(rows.filter((r) => r.isSharedCore && r.isSharedSeiyuu).length);
	const populationOptions = $derived([
		{ value: 'all' as const, label: 'All', count: rows.length },
		{
			value: 'core' as const,
			label: 'Core',
			count: coreCount,
			shape: 'square' as const,
			title: `Core dev (${CORE_ROLES_TEXT})`
		},
		{
			value: 'seiyuu' as const,
			label: 'Seiyuu',
			count: seiyuuCount,
			shape: 'circle' as const,
			title: 'Voice actors'
		},
		...(otherCount > 0
			? [
					{
						value: 'other' as const,
						label: 'Other',
						count: otherCount,
						title: 'Non-core or mixed roles'
					}
				]
			: [])
	]);
	const switchedCount = $derived(rows.filter((r) => r.aliasSwitched).length);

	const filtered = $derived.by(() => {
		let list = rows.filter((r) => {
			if (population === 'core' && !r.isSharedCore) return false;
			if (population === 'seiyuu' && !r.isSharedSeiyuu) return false;
			if (population === 'other' && (r.isSharedCore || r.isSharedSeiyuu)) return false;
			if (mobility !== 'any' && mobilityLevel(r.brandCount).level !== mobility) return false;
			if (onlySwitched && !r.aliasSwitched) return false;
			return matchesText(query, r.name, r.original, ...r.aliasesA, ...r.aliasesB, r.sid);
		});
		if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
		else if (sort === 'year')
			list = [...list].sort(
				(a, b) =>
					Math.max(a.firstYearA ?? 9999, a.firstYearB ?? 9999) -
					Math.max(b.firstYearA ?? 9999, b.firstYearB ?? 9999)
			);
		// 'weight' keeps the server order (shared core first, low mobility first),
		// with itinerant people listed last.
		else
			list = [
				...list.filter((r) => r.brandCount <= ITINERANT),
				...list.filter((r) => r.brandCount > ITINERANT)
			];
		return list;
	});
	const shown = $derived(filtered.slice(0, limit));

	function isPrimary(alias: string, r: SharedPersonRow): boolean {
		return alias === r.name || alias === r.original || alias.toLowerCase() === r.name.toLowerCase();
	}
	/** Names to show on one side: always when the pair differs, otherwise only pen names. */
	function sideAliases(r: SharedPersonRow, which: 'A' | 'B'): string[] {
		const list = which === 'A' ? r.aliasesA : r.aliasesB;
		if (r.aliasSwitched) return list;
		// The server decides primary or not by alias id; a row without that list
		// (an older payload) falls back to comparing the strings.
		const pens = which === 'A' ? r.penNamesA : r.penNamesB;
		return pens ?? list.filter((a) => !isPrimary(a, r));
	}
	function markRole(r: SharedPersonRow): string {
		if (r.isSharedSeiyuu && !r.isSharedCore) return 'seiyuu';
		return primaryRole([...r.rolesA, ...r.rolesB]);
	}
	function reset() {
		population = 'all';
		mobility = 'any';
		onlySwitched = false;
		query = '';
	}
</script>

{#snippet side(r: SharedPersonRow, which: 'A' | 'B')}
	{@const aliases = sideAliases(r, which)}
	{@const roles = which === 'A' ? r.rolesA : r.rolesB}
	<td class="border-l border-rule-strong {aliases.length ? 'max-w-[9.5rem]' : 'w-[1%] whitespace-nowrap'}">
		{#if aliases.length}
			<AliasChip {aliases} bare differs={which === 'B' && r.aliasSwitched} />
		{:else}
			<span class="text-ink-4" title="Primary name">—</span>
		{/if}
	</td>
	<td class="whitespace-nowrap"><RolePills {roles} max={3} /></td>
	<td class="whitespace-nowrap"><YearSpan from={which === 'A' ? r.firstYearA : r.firstYearB} to={which === 'A' ? r.lastYearA : r.lastYearB} tight /></td>
	<td class="num font-mono">
		<StaffVnsButton
			count={which === 'A' ? r.vnsA : r.vnsB}
			title="{shownName(r.name, r.original)} at {which === 'A' ? nameA : nameB}"
			subtitle="Visual novels credited here"
			endpoint="/api/proof/staff-vns?sid={encodeURIComponent(r.sid)}&pid={encodeURIComponent(which === 'A' ? pidA : pidB)}"
			moreHref="/staff/{r.sid}#credits"
		/>
	</td>
{/snippet}

<div class="sheet overflow-hidden">
	<div class="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-rule px-3 py-2">
		<SegmentedControl
			label="Population"
			size="sm"
			bind:value={population}
			onchange={() => (limit = PAGE)}
			options={populationOptions}
		/>
		<label class="flex items-center gap-1 text-xs text-ink-3" title={MOBILITY_HINT}>
			<span class="term">Mobility</span>
			<select class="field h-7 pr-6 text-xs" bind:value={mobility} onchange={() => (limit = PAGE)}>
				<option value="any">Any</option>
				<option value="anchored">Anchored ({MOBILITY_RANGE_LABEL.anchored})</option>
				<option value="mobile">Mobile ({MOBILITY_RANGE_LABEL.mobile})</option>
				<option value="itinerant">Itinerant ({MOBILITY_RANGE_LABEL.itinerant})</option>
			</select>
		</label>
		<label class="flex h-7 cursor-pointer items-center gap-1 text-xs text-ink-2" title="Different name at A vs B">
			<input type="checkbox" class="accent-(--ink)" bind:checked={onlySwitched} disabled={switchedCount === 0} />
			Switched
			<span class="tnum font-mono text-2xs text-ink-3">{switchedCount}</span>
		</label>
		<label class="flex items-center gap-1 text-xs text-ink-3" title="Weight puts anchored core staff first">
			<span class="term">Sort</span>
			<select class="field h-7 pr-6 text-xs" bind:value={sort}>
				<option value="weight">Weight</option>
				<option value="year">First year</option>
				<option value="name">Name</option>
			</select>
		</label>
		<label class="relative ml-auto">
			<span class="sr-only">Filter people by name or alias</span>
			<Search size={13} class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-3" />
			<input type="search" class="field h-7 w-36 pl-7 text-xs" placeholder="Filter people" bind:value={query} />
		</label>
	</div>

	{#if rows.length === 0}
		<p class="px-4 py-6 text-sm text-ink-3">No one is credited at both brands.</p>
	{:else if filtered.length === 0}
		<div class="px-4 py-6 text-sm text-ink-3">
			<p>No shared people match these filters.</p>
			<button type="button" class="btn-ghost mt-1.5 text-xs" onclick={reset}>Clear filters</button>
		</div>
	{:else}
		<div class="scroll-x">
			<table class="ledger">
				<caption class="sr-only">
					People credited at both {nameA} (A) and {nameB} (B), with the name used at each
				</caption>
				<thead>
					<tr>
						<th scope="col" rowspan="2" class="sticky-col align-bottom">Person</th>
						<th scope="colgroup" colspan="4" class="border-l border-rule-strong">
							<span class="flex items-center gap-1.5"><SlotTag side="A" /><span class="truncate text-ink">{nameA}</span></span>
						</th>
						<th scope="colgroup" colspan="4" class="border-l border-rule-strong">
							<span class="flex items-center gap-1.5"><SlotTag side="B" /><span class="truncate text-ink">{nameB}</span></span>
						</th>
						<th scope="col" rowspan="2" class="border-l border-rule-strong align-bottom" title={MOBILITY_HINT}><span class="term">Mobility</span></th>
					</tr>
					<tr>
						<th scope="col" class="border-l border-rule-strong" title={ALIAS_USED_HINT}><span class="term">Alias used</span></th>
						<th scope="col">Roles</th>
						<th scope="col">Years</th>
						<th scope="col" class="num">VNs</th>
						<th scope="col" class="border-l border-rule-strong" title={ALIAS_USED_HINT}><span class="term">Alias used</span></th>
						<th scope="col">Roles</th>
						<th scope="col">Years</th>
						<th scope="col" class="num">VNs</th>
					</tr>
				</thead>
				<tbody>
					{#each shown as r (r.sid)}
						<tr class={r.aliasSwitched ? 'bg-surface-sunken' : ''}>
							<td class="sticky-col max-w-[9.5rem] sm:max-w-[17rem]">
								<span class="flex items-center gap-2">
									<RoleMark role={markRole(r)} size={8} />
									<NamePair name={r.name} original={r.original} href="/staff/{r.sid}" />
									<PotentialAliasFlag count={r.potentialAliasCount} sid={r.sid} />
								</span>
							</td>
							{@render side(r, 'A')}
							{@render side(r, 'B')}
							<td class="border-l border-rule-strong"><MobilityIndicator brandCount={r.brandCount} sid={r.sid} personName={shownName(r.name, r.original)} /></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="flex flex-wrap items-center justify-between gap-2 border-t border-rule px-4 py-2 text-xs text-ink-3">
			<p class="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
				<span class="tnum font-mono">{num(shown.length)} / {num(filtered.length)}</span>
				{#if bothCount > 0}
					<span>{bothCount} dual</span>
				{/if}
				{#if switchedCount > 0}<span>tinted = name switch (≠)</span>{/if}
			</p>
			{#if filtered.length > PAGE}
				<button
					type="button"
					class="btn-ghost text-xs"
					onclick={() => (limit = shown.length < filtered.length ? filtered.length : PAGE)}
				>
					{shown.length < filtered.length ? `Show all ${num(filtered.length)}` : 'Show fewer'}
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* The Person column stays put while the A and B groups scroll sideways.
	   It needs an opaque ground of its own: a tinted or hatched row would
	   otherwise show the scrolling cells through it. Only the colour is set
	   here, so the cell can carry its row's hatch (`hatch-muted`) on top, and
	   each row state is mirrored: hover, then the name-switch tint. */
	.sticky-col {
		position: sticky;
		left: 0;
		z-index: 10;
		background-color: var(--surface);
		box-shadow: 1px 0 0 var(--rule);
	}
	thead .sticky-col {
		z-index: 11;
		background-color: var(--surface-sunken);
	}
	/* The ledger's row hover is a wash over the surface: the same mix, opaque. */
	tbody tr:hover .sticky-col {
		background-color: color-mix(in oklab, var(--surface-hover) 55%, var(--surface));
	}
	tbody tr.bg-surface-sunken .sticky-col {
		background-color: var(--surface-sunken);
	}
</style>
