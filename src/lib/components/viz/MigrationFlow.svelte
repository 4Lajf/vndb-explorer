<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChartCard from './ChartCard.svelte';
	import NamePair from '../identity/NamePair.svelte';
	import YearSpan from '../identity/YearSpan.svelte';
	import RelationBadge from '../epistemic/RelationBadge.svelte';
	import PersonPill from '../people/PersonPill.svelte';
	import RoleMark from '../people/RoleMark.svelte';
	import type {
		InferredBrandLink,
		MigrationPartner,
		MigrationSummary
	} from '#lib/types.ts';
	import { EXPLICIT_META, INFERRED_META, explicitTitle, inferredTitle } from '#lib/relations.ts';
	import { CORE_STAFF_HINT, SEIYUU_HINT } from '#lib/roles.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';
	import { compareHref, num, yearSpan } from '#lib/util.ts';
	import { layoutFlow, type FlowRow } from '#lib/viz/flow.ts';

	/**
	 * Staff migration flow (DESIGN §6.3): where this brand's people worked
	 * before they first appeared here, and where they went afterwards.
	 * One neutral colour: the chart shows magnitude, not categories.
	 */
	interface Props {
		id?: string;
		focusId: string;
		focusName: string;
		focusOriginal?: string | null;
		firstYear: number | null;
		lastYear: number | null;
		inflow: MigrationPartner[];
		outflow: MigrationPartner[];
		summary?: MigrationSummary | null;
		/** Inferred links of the focus brand, to badge rows that are also inferred relations. */
		inferred?: InferredBrandLink[];
		includeSeiyuu: boolean;
		pending?: boolean;
	}
	let {
		id = 'migration',
		focusId,
		focusName,
		focusOriginal = null,
		firstYear,
		lastYear,
		inflow,
		outflow,
		summary = null,
		inferred = [],
		includeSeiyuu,
		pending = false
	}: Props = $props();

	let view = $state<'chart' | 'table'>('chart');
	let width = $state(960);
	let hoverKey = $state<string | null>(null);
	let selectedKey = $state<string | null>(null);
	let expandedTableRows = $state<Record<string, boolean>>({});

	const layout = $derived(layoutFlow(inflow, outflow, summary, { width, includeSeiyuu }));
	const allRows = $derived([...layout.inflow, ...layout.outflow]);
	const selected = $derived(allRows.find((r) => r.key === selectedKey) ?? null);
	const inferredByPid = $derived(
		new Map(inferred.map((l) => [l.pidA === focusId ? l.pidB : l.pidA, l]))
	);
	const isEmpty = $derived(inflow.length === 0 && outflow.length === 0);
	// Names in sentences follow the reader's name order, like the row labels.
	const focusShown = $derived(shownName(focusName, focusOriginal));
	/** A row's label: a brand's name in the reader's order, or the row's own wording. */
	function rowShown(row: FlowRow): string {
		return row.partner ? shownName(row.partner.name, row.partner.original) : row.label;
	}
	// Moves that are neither a core move nor a voice move (QA, vocals, a core
	// credit at one end only): part of the head count, of neither sub-count.
	const selectedOther = $derived(
		selected ? Math.max(0, selected.count - selected.core - selected.seiyuu) : 0
	);
	const people = $derived(
		selected?.partner
			? [...selected.partner.people].sort(
					(a, b) => (a.toFirstYear ?? 9999) - (b.toFirstYear ?? 9999) || a.name.localeCompare(b.name)
				)
			: []
	);

	function gapChip(row: FlowRow): string {
		if (row.gap == null) return '';
		const g = Math.round(row.gap * 10) / 10;
		if (g < 0) return 'overlap';
		if (g === 0) return 'same yr';
		return `${row.side === 'in' ? '−' : '+'}${g}y`;
	}
	function gapTitle(row: FlowRow): string {
		if (row.gap == null) return '';
		const range =
			row.minGap != null && row.maxGap != null ? ` (${row.minGap}…${row.maxGap}y)` : '';
		return `Avg years between stints (≤0 = overlap)${range}`;
	}
	function ribbonOpacity(row: FlowRow, base: number): number {
		const key = hoverKey ?? selectedKey;
		if (!key) return base;
		return key === row.key ? Math.min(0.5, base + 0.2) : 0.06;
	}
	function toggle(row: FlowRow) {
		selectedKey = selectedKey === row.key ? null : row.key;
	}
	function years(p: MigrationPartner['people'][number]): string {
		if (p.fromLastYear != null && p.toFirstYear != null && p.fromLastYear > p.toFirstYear) {
			const spanFrom = yearSpan(p.fromFirstYear ?? p.fromLastYear, p.fromLastYear, true);
			const spanTo = yearSpan(p.toFirstYear, p.toLastYear ?? p.toFirstYear, true);
			return `${spanFrom} / ${spanTo}`;
		}
		return `${p.fromLastYear ?? '?'} → ${p.toFirstYear ?? '?'}`;
	}
</script>

{#snippet rowBadge(p: MigrationPartner)}
	{#if p.explicitRelation}
		{@const m = EXPLICIT_META[p.explicitRelation]}
		<RelationBadge kind={m.kind} register="confirmed" label={m.code} arrow={m.arrow} dense title={explicitTitle(p.explicitRelation)} />
	{:else if inferredByPid.has(p.pid)}
		{@const link = inferredByPid.get(p.pid)!}
		{@const m = INFERRED_META[link.inferredType]}
		<RelationBadge kind={m.kind} register="inferred" label={m.code} dense title={inferredTitle(link, { seiyuuDriven: link.seiyuuDriven })} />
	{/if}
{/snippet}

{#snippet rowButton(row: FlowRow)}
	{@const left = row.side === 'in'}
	<button
		type="button"
		class="absolute flex items-center gap-2 rounded-xs px-2 text-left transition-colors duration-[120ms] hover:bg-surface-hover {selectedKey === row.key ? 'bg-surface-sunken' : ''} {row.kind === 'residual' ? 'bg-surface-sunken/50 text-ink-2 italic' : ''} {left ? 'flex-row justify-end' : 'flex-row-reverse justify-end'}"
		style="top: {row.y - layout.rowH / 2 + 2}px; height: {layout.rowH - 4}px; {left ? `left: 0; width: ${layout.leftLabelEnd - 4}px;` : `left: ${layout.rightLabelStart + 4}px; right: 0;`}"
		aria-expanded={selectedKey === row.key}
		aria-controls="{id}-drawer"
		title={row.note}
		onmouseenter={() => (hoverKey = row.key)}
		onmouseleave={() => (hoverKey = null)}
		onfocus={() => (hoverKey = row.key)}
		onblur={() => (hoverKey = null)}
		onclick={() => toggle(row)}
	>
		<span class="flex min-w-0 flex-1 items-center gap-2 {left ? 'justify-end' : 'justify-start'}">
			{#if row.partner}
				{#if !left}{@render rowBadge(row.partner)}{/if}
				<span class="min-w-0 truncate text-sm {left ? 'text-right' : ''}">
					<NamePair name={row.partner.name} original={row.partner.original} variant="compact" />
				</span>
				{#if left}{@render rowBadge(row.partner)}{/if}
			{:else}
				<span class="truncate text-sm text-ink-2">{row.label}</span>
			{/if}
		</span>
		{#if gapChip(row)}
			<span class="tnum shrink-0 rounded-xs bg-surface-sunken px-1 font-mono text-2xs text-ink-2" title={gapTitle(row)}>{gapChip(row)}</span>
		{/if}
		<span class="tnum w-[4.5ch] shrink-0 font-mono text-sm font-semibold text-ink {left ? 'text-right' : 'text-left'}">
			{num(row.count)}
		</span>
	</button>
{/snippet}

{#snippet sideTable(title: string, rows: FlowRow[])}
	<div class="min-w-0 flex-1">
		<h3 class="px-4 pt-3 pb-2 text-xs font-medium text-ink-3">{title}</h3>
		<div class="scroll-x">
			<table class="ledger">
				<caption class="sr-only">{title} {focusShown}</caption>
				<thead>
					<tr>
						<th scope="col">Brand</th>
						<th scope="col">Relation</th>
						<th scope="col" class="num">People</th>
						<th scope="col" class="num" title={CORE_STAFF_HINT}><span class="term">Core</span></th>
						<th scope="col" class="num" title={SEIYUU_HINT}><span class="term">Seiyuu</span></th>
						<th scope="col" class="num" title="Avg years between stints"><span class="term">Avg gap</span></th>
						<th scope="col" title="Min–max year gap"><span class="term">Range</span></th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.key)}
						{@const canExpand = !!(row.partner && row.partner.people.length > 0)}
						{@const isExp = !!expandedTableRows[row.key]}
						<tr
							class="{row.kind === 'residual' ? 'bg-surface-sunken/50 italic' : ''} {canExpand ? 'cursor-pointer' : ''}"
							onclick={(e) => {
								if (!canExpand || (e.target as HTMLElement).closest('a, button')) return;
								expandedTableRows[row.key] = !isExp;
							}}
						>
							<td class="max-w-[16rem]">
								{#if row.partner}
									<span class="flex items-center gap-1.5">
										{#if canExpand}
											<button
												type="button"
												class="inline-flex size-5 shrink-0 items-center justify-center rounded-xs text-ink-3 hover:bg-surface-hover hover:text-ink"
												aria-expanded={isExp}
												aria-label="{isExp ? 'Collapse' : 'Expand'} people for {row.partner.name}"
												onclick={() => (expandedTableRows[row.key] = !isExp)}
											>
												<ChevronRight size={12} class="transition-transform duration-[150ms] {isExp ? 'rotate-90' : ''}" />
											</button>
										{/if}
										<NamePair name={row.partner.name} original={row.partner.original} href="/producer/{row.partner.pid}" />
									</span>
								{:else}
									<span class="text-ink-2" title={row.note}>{row.label}</span>
								{/if}
							</td>
							<td>{#if row.partner}{@render rowBadge(row.partner)}{/if}</td>
							<td class="num font-mono font-medium">
								{#if canExpand}
									<button
										type="button"
										class="tnum rounded-xs px-1 py-0.5 underline decoration-dotted decoration-rule-hover underline-offset-3 hover:bg-surface-hover hover:text-ink"
										aria-expanded={isExp}
										title="Click to see who moved"
										onclick={() => (expandedTableRows[row.key] = !isExp)}
									>
										{num(row.count)}
									</button>
								{:else}
									{num(row.count)}
								{/if}
							</td>
							<td class="num font-mono">{row.kind === 'residual' ? '—' : num(row.core)}</td>
							<td class="num font-mono">{row.kind === 'residual' ? '—' : num(row.seiyuu)}</td>
							<td class="num font-mono">{gapChip(row) || '—'}</td>
							<td class="font-mono text-xs text-ink-3">
								{row.minGap != null && row.maxGap != null ? `${row.minGap}…${row.maxGap}y` : '—'}
							</td>
						</tr>
						{#if isExp && row.partner}
							<tr class="bg-surface-sunken/50">
								<td colspan="7" class="py-2! pl-9!">
									<ul class="flex flex-wrap gap-1.5">
										{#each row.partner.people as p (p.sid)}
											<li class="max-w-full">
												<PersonPill
													sid={p.sid}
													name={p.name}
													original={p.original}
													isSeiyuu={p.isSeiyuu}
													role={p.isSeiyuu ? 'seiyuu' : 'dev'}
													years={years(p)}
													note={p.aliasChanged ? '⇄ name' : undefined}
												/>
											</li>
										{/each}
									</ul>
									{#if row.count > row.partner.people.length}
										<p class="mt-1.5 text-2xs text-ink-3">
											{row.count - row.partner.people.length} more not listed.
											<a class="link ml-1" href={compareHref(focusId, row.partner.pid)}>See all in Compare →</a>
										</p>
									{/if}
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{/snippet}

{#snippet tables()}
	<div class="flex flex-col divide-y divide-rule lg:flex-row lg:divide-x lg:divide-y-0">
		{@render sideTable('Came from', layout.inflow)}
		{@render sideTable('Went to', layout.outflow)}
	</div>
{/snippet}

<ChartCard
	{id}
	title="Staff migration"
	bind:view
	chartLabel="Flow"
	{pending}
	narrowTable
	note="Click any row to list who moved"
>
	{#snippet chart()}
		{#if isEmpty && !summary?.totalPeople}
			<p class="px-4 py-6 text-sm text-ink-3">No staff credits recorded for this brand's visual novels.</p>
		{:else}
			<!-- Below `md` ChartCard shows the two tables instead (`narrowTable`). -->
			<div>
				<div class="grid grid-cols-[1fr_auto_1fr] items-end gap-4 border-b border-rule px-4 py-2">
					<p class="text-right text-xs text-ink-3"><span class="font-medium">Came from</span></p>
					<p class="text-xs font-medium text-ink-3">This brand</p>
					<p class="text-xs text-ink-3"><span class="font-medium">Went to</span></p>
				</div>
				<div class="scroll-x px-4">
					<div class="relative min-w-[720px]" style="height: {layout.height}px" bind:clientWidth={width}>
						<svg class="absolute inset-0" width={layout.width} height={layout.height} aria-hidden="true">
							{#each allRows as row (row.key)}
								{#if row.path}
									<path d={row.path} fill="var(--ink)" opacity={ribbonOpacity(row, row.kind === 'residual' ? 0.07 : 0.14)} />
								{/if}
								{#if row.pathSeiyuu}
									<path d={row.pathSeiyuu} fill="var(--role-seiyuu)" opacity={ribbonOpacity(row, 0.26)} />
								{/if}
							{/each}
							<rect x={layout.pillar.x} y={layout.pillar.y} width={layout.pillar.w} height={layout.pillar.h} rx="6" fill="var(--surface-sunken)" stroke="var(--rule-strong)" stroke-width="1" />
						</svg>

						<div
							class="pointer-events-none absolute flex flex-col items-center justify-center gap-1 px-1 text-center"
							style="left: {layout.pillar.x}px; top: {layout.pillar.y}px; width: {layout.pillar.w}px; height: {layout.pillar.h}px"
						>
							<span class="line-clamp-3 text-sm leading-tight font-semibold text-ink">
								<NamePair name={focusName} original={focusOriginal} variant="compact" />
							</span>
							{#if summary}
								<span class="tnum font-mono text-xs text-ink-2">{num(summary.totalPeople)} {summary.totalPeople === 1 ? 'person' : 'people'}</span>
							{/if}
							<YearSpan from={firstYear} to={lastYear} class="text-2xs" />
						</div>

						{#each allRows as row (row.key)}
							{@render rowButton(row)}
						{/each}
					</div>
				</div>
			</div>

			<!-- People drawer: opens directly under the diagram. -->
			<div id="{id}-drawer" aria-live="polite">
				{#if selected}
					<div class="border-t border-rule px-4 py-3">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<p class="text-sm text-ink">
								{#if selected.side === 'in'}
									<span class="font-medium">{rowShown(selected)}</span> → {focusShown}
								{:else}
									{focusShown} → <span class="font-medium">{rowShown(selected)}</span>
								{/if}
								<span class="ml-1 font-mono text-xs text-ink-3">
									{num(selected.count)} {selected.count === 1 ? 'person' : 'people'}
									{#if includeSeiyuu && selected.kind === 'brand'}({selected.core} core, {selected.seiyuu} seiyuu{selectedOther > 0 ? `, ${selectedOther} other` : ''}){/if}
								</span>
							</p>
							<span class="flex items-center gap-4">
								{#if selected.partner}
									<a class="link text-sm" href={compareHref(focusId, selected.partner.pid)}>Compare {rowShown(selected)} vs {focusShown}</a>
									<a class="link text-sm" href="/producer/{selected.partner.pid}">Open brand</a>
								{/if}
								<button type="button" class="btn-ghost text-xs text-ink-3" onclick={() => (selectedKey = null)}>Close</button>
							</span>
						</div>
						{#if selected.partner}
							<ul class="mt-2.5 flex flex-wrap gap-1.5">
								{#each people as p (p.sid)}
									<li class="max-w-full">
										<PersonPill
											sid={p.sid}
											name={p.name}
											original={p.original}
											isSeiyuu={p.isSeiyuu}
											role={p.isSeiyuu ? 'seiyuu' : 'dev'}
											years={years(p)}
											note={p.aliasChanged ? '⇄ name' : undefined}
										/>
									</li>
								{/each}
							</ul>
							<p class="mt-2 text-xs text-ink-3">
								Years are the last credit at the earlier brand → the first credit at the later one.
								{#if people.some((p) => p.aliasChanged)}⇄ name: credited under a different name after the move.{/if}
								{#if selected.count > people.length}
									{selected.count - people.length} more not listed.
								{/if}
								{#if includeSeiyuu && selectedOther > 0}
									Other: a move that is neither between two core credits nor a voice credit.
								{/if}
							</p>
						{:else if selected.kind === 'other'}
							<ul class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
								{#each selected.folded as p (p.pid)}
									<li>
										<a class="link" href="/producer/{p.pid}" title={p.original ? `${p.name} · ${p.original}` : undefined}>{shownName(p.name, p.original)}</a>
										<span class="tnum font-mono text-xs text-ink-3">{p.count}</span>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="mt-2 text-sm text-ink-2">{selected.note}</p>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	{/snippet}

	{#snippet legend()}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1.5">
			<span class="inline-flex items-center gap-1.5"><span class="inline-block h-2.5 w-5 bg-ink/15"></span>ribbon thickness = people</span>
			{#if includeSeiyuu}
				<span class="inline-flex items-center gap-1.5"><span class="inline-block h-2.5 w-5 bg-role-seiyuu/30"></span><RoleMark role="seiyuu" size={8} />seiyuu band</span>
			{/if}
			<span class="text-ink-3">Up to 3 prior brands per person</span>
		</div>
	{/snippet}

	{#snippet table()}
		{#if isEmpty && !summary?.totalPeople}
			<p class="px-4 py-6 text-sm text-ink-3">No staff credits recorded for this brand's visual novels.</p>
		{:else}
			{@render tables()}
		{/if}
	{/snippet}
</ChartCard>
