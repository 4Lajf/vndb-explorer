<script lang="ts">
	import { page } from '$app/state';
	import ChartCard from './ChartCard.svelte';
	import SlotTag from '../relations/SlotTag.svelte';
	import StaffVnsButton from '../people/StaffVnsButton.svelte';
	import { num } from '#lib/util.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';
	import { timelineTag } from '#lib/relations.ts';
	import {
		MOVE_LINE_H,
		SHARED_LEVELS,
		barPath,
		layoutCompare,
		type SharedSpan,
		type YearPoint
	} from '#lib/viz/compare.ts';

	/**
	 * Side-by-side activity timeline (DESIGN §6.4): mirrored yearly bars on one
	 * shared scale (not a dual axis), with a crossover band counting people
	 * credited at both brands and an overlap bracket naming the shared window.
	 */
	interface BrandRef {
		id: string;
		name: string;
		firstYear: number | null;
		lastYear: number | null;
	}
	interface Props {
		id?: string;
		a: BrandRef;
		b: BrandRef;
		series: YearPoint[];
		shared: SharedSpan[];
		pending?: boolean;
	}
	let { id = 'activity', a, b, series, shared, pending = false }: Props = $props();

	const uidBase = $props.id();
	let view = $state<'chart' | 'table'>('chart');
	let width = $state(960);
	let hoverYear = $state<number | null>(null);
	let focusYear = $state<number | null>(null);
	let selectedYear = $state<number | null>(null);
	let pinnedAll = $state(false);
	let pinnedAllVnsA = $state(false);
	let pinnedAllVnsB = $state(false);
	let expandedTableYears = $state<Record<number, boolean>>({});
	$effect(() => {
		void selectedYear;
		pinnedAll = false;
		pinnedAllVnsA = false;
		pinnedAllVnsB = false;
	});

	const layout = $derived(
		layoutCompare(
			series,
			shared,
			{ first: a.firstYear, last: a.lastYear },
			{ first: b.firstYear, last: b.lastYear },
			{
				width: Math.max(520, width),
				dumpYear: page.data.dumpYear ?? 0,
				// Reads the reader's name order: the hover preview follows Aa / あ.
				shown: shownName
			}
		)
	);
	const activeYear = $derived(hoverYear ?? focusYear ?? selectedYear);
	const active = $derived(layout.years.find((y) => y.year === activeYear) ?? null);
	const hoveredYear = $derived(hoverYear ?? focusYear);
	const hovered = $derived(hoveredYear != null ? (layout.years.find((y) => y.year === hoveredYear) ?? null) : null);
	const pinned = $derived(
		selectedYear != null ? (layout.years.find((y) => y.year === selectedYear) ?? null) : null
	);
	const bracketLabel = $derived.by(() => {
		const br = layout.bracket;
		if (!br) return '';
		if (br.kind === 'concurrent') {
			// Same wording as the evidence tag: a single shared year is a hand-off only
			// when one span ends where the other begins.
			const tag = timelineTag({
				firstYearA: a.firstYear,
				lastYearA: a.lastYear,
				firstYearB: b.firstYear,
				lastYearB: b.lastYear
			});
			if (tag.kind === 'handoff') {
				const aFirst = (a.firstYear ?? 0) < (b.firstYear ?? 0);
				return `Handoff ${br.from} (${aFirst ? 'A → B' : 'B → A'})`;
			}
			return br.years === 1
				? `Concurrent ${br.from} (1y)`
				: `Concurrent ${br.from}–${br.to} (${br.years}y)`;
		}
		const [first, second] = br.first === 'A' ? ['A', 'B'] : ['B', 'A'];
		return `${first} ends ${br.endYear} → ${second} starts ${br.startYear} (${br.gap}y gap)`;
	});
	const description = $derived(
		`Visual novels per year for ${a.name} (above) and ${b.name} (below), ${layout.minYear + 1} to ${layout.maxYear - 1}. ${bracketLabel}. ${shared.length} people are credited at both. The Table view lists every year.`
	);
	const tableYears = $derived(
		layout.years.filter((y) => y.countA || y.countB || y.movesDown || y.movesUp)
	);

	function onKeydown(e: KeyboardEvent) {
		const ys = layout.years;
		if (!ys.length) return;
		const i = focusYear == null ? -1 : ys.findIndex((y) => y.year === focusYear);
		let next = i;
		if (e.key === 'ArrowRight') next = Math.min(ys.length - 1, i + 1);
		else if (e.key === 'ArrowLeft') next = Math.max(0, i === -1 ? 0 : i - 1);
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = ys.length - 1;
		else if (e.key === 'Enter' || e.key === ' ') {
			if (focusYear != null) {
				e.preventDefault();
				selectedYear = selectedYear === focusYear ? null : focusYear;
			}
			return;
		} else if (e.key === 'Escape') {
			focusYear = null;
			selectedYear = null;
			return;
		} else return;
		e.preventDefault();
		focusYear = ys[Math.max(0, next)].year;
	}

	function yearAtPointer(e: MouseEvent): number | null {
		const svg = e.currentTarget as SVGSVGElement;
		const rect = svg.getBoundingClientRect();
		const x = ((e.clientX - rect.left) / rect.width) * layout.width;
		const idx = Math.floor((x - layout.plotLeft) / layout.yearW);
		return idx >= 0 && idx < layout.years.length ? layout.years[idx].year : null;
	}

	function onMove(e: MouseEvent) {
		hoverYear = yearAtPointer(e);
	}

	function onClickPlot(e: MouseEvent) {
		const y = yearAtPointer(e);
		if (y == null) return;
		selectedYear = selectedYear === y ? null : y;
	}
</script>

{#snippet plot()}
	<div
		class="scroll-x"
		bind:clientWidth={width}
	>
		<!-- The plot is one keyboard-driven tab stop (role="application") with a table twin. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			class="relative focus-visible:outline-offset-[-2px]"
			style="width: {layout.width}px"
			role="application"
			tabindex="0"
			aria-label="Activity timeline. Left and right arrow keys step through the years; Enter pins a year's shared staff."
			aria-describedby="{uidBase}-desc {uidBase}-live"
			onkeydown={onKeydown}
		>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<svg
				width={layout.width}
				height={layout.height}
				class="block cursor-pointer"
				aria-hidden="true"
				role="presentation"
				onmousemove={onMove}
				onmouseleave={() => (hoverYear = null)}
				onclick={onClickPlot}
			>
				<!-- Scale: one linear scale for both halves; ticks printed once per half. -->
				{#each layout.yTicks as t (t)}
					<line x1={layout.plotLeft} x2={layout.plotRight} y1={layout.baseA - layout.scale(t)} y2={layout.baseA - layout.scale(t)} stroke="var(--rule)" stroke-width="1" />
					<line x1={layout.plotLeft} x2={layout.plotRight} y1={layout.baseB + layout.scale(t)} y2={layout.baseB + layout.scale(t)} stroke="var(--rule)" stroke-width="1" />
					<text x={layout.plotLeft - 6} y={layout.baseA - layout.scale(t) + 3.5} text-anchor="end" class="mono" font-size="11" fill="var(--ink-3)">{t}</text>
					<text x={layout.plotLeft - 6} y={layout.baseB + layout.scale(t) + 3.5} text-anchor="end" class="mono" font-size="11" fill="var(--ink-3)">{t}</text>
				{/each}
				<text x={layout.plotLeft - 6} y={layout.baseA + 3.5} text-anchor="end" class="mono" font-size="11" fill="var(--ink-3)">0</text>
				<text x={layout.plotLeft - 6} y={layout.baseB + 3.5} text-anchor="end" class="mono" font-size="11" fill="var(--ink-3)">0</text>

				<!-- Overlap bracket -->
				{#if layout.bracket}
					{@const br = layout.bracket}
					{#if br.kind === 'concurrent'}
						<path d="M{br.x1},{12} V{6} H{br.x2} V{12}" fill="none" stroke="var(--ink)" stroke-width="1" />
					{:else}
						<path d="M{br.x1},{6} H{br.x2} M{br.x2 - 5},{2.5} L{br.x2},{6} L{br.x2 - 5},{9.5}" fill="none" stroke="var(--ink)" stroke-width="1" />
					{/if}
					<text
						x={Math.max(layout.plotLeft + 110, Math.min(layout.plotRight - 110, (br.x1 + br.x2) / 2))}
						y="24"
						text-anchor="middle"
						font-size="11"
						font-weight="500"
						fill="var(--ink)">{bracketLabel}</text
					>
				{/if}

				<!-- Pinned year highlight -->
				{#if pinned}
					<rect
						x={pinned.x - layout.yearW / 2}
						y={layout.bracketH}
						width={layout.yearW}
						height={layout.height - layout.bracketH - 20}
						fill="var(--surface-hover)"
						stroke="var(--ink)"
						stroke-width="1"
						stroke-dasharray="3 2"
					/>
				{/if}

				<!-- Crosshair -->
				{#if active && active.year !== selectedYear}
					<rect x={active.x - layout.yearW / 2} y={layout.bracketH} width={layout.yearW} height={layout.height - layout.bracketH - 20} fill="var(--surface-hover)" opacity="0.7" />
				{/if}

				{#each layout.years as y (y.year)}
					{#if y.countA > 0}
						<path d={barPath(y.x, layout.baseA, layout.barW, layout.scale(y.countA), true)} fill="var(--cmp-a)" />
					{/if}
					{#if y.countB > 0}
						<path d={barPath(y.x, layout.baseB, layout.barW, layout.scale(y.countB), false)} fill="var(--cmp-b)" />
					{/if}
					<!-- Crossover band, row 1: shared people active this year -->
					{#if y.sharedLevel > 0}
						<rect
							x={y.x - layout.yearW / 2 + 0.5}
							y={layout.baseA + 2}
							width={Math.max(1, layout.yearW - 1)}
							height="12"
							fill="var(--ink)"
							opacity={SHARED_LEVELS[y.sharedLevel].opacity}
						/>
					{/if}
					<!-- Row 2: first crossings A→B (↓) and B→A (↑). -->
					{#each y.moveLines as line, i (i)}
						<text x={y.x} y={layout.baseA + 27 + i * MOVE_LINE_H} text-anchor="middle" class="mono" font-size="11" fill="var(--ink-2)">{line}</text>
					{/each}
					{#if y.peakA}
						<text x={y.x} y={layout.baseA - layout.scale(y.countA) - 4} text-anchor="middle" class="mono" font-size="10.5" fill="var(--ink)">{y.countA}</text>
					{/if}
					{#if y.peakB}
						<text x={y.x} y={layout.baseB + layout.scale(y.countB) + 12} text-anchor="middle" class="mono" font-size="10.5" fill="var(--ink)">{y.countB}</text>
					{/if}
				{/each}

				<!-- Baselines -->
				<line x1={layout.plotLeft} x2={layout.plotRight} y1={layout.baseA} y2={layout.baseA} stroke="var(--rule-strong)" stroke-width="1" />
				<line x1={layout.plotLeft} x2={layout.plotRight} y1={layout.baseB} y2={layout.baseB} stroke="var(--rule-strong)" stroke-width="1" />

				{#each layout.xTicks as t (t.year)}
					<text x={t.x} y={layout.height - 5} text-anchor="middle" class="mono" font-size="11" fill="var(--ink-3)">{t.year}</text>
				{/each}
			</svg>

			<!-- Direct labels at the right ends -->
			<div class="pointer-events-none absolute flex items-center gap-1 text-xs text-ink" style="left: {layout.plotRight + 6}px; top: {layout.baseA - 22}px; width: {layout.rightPad - 10}px" title={a.name}>
				<SlotTag side="A" /><span class="min-w-0 truncate">{a.name}</span>
			</div>
			<div class="pointer-events-none absolute flex items-center gap-1 text-xs text-ink" style="left: {layout.plotRight + 6}px; top: {layout.baseB + 6}px; width: {layout.rightPad - 10}px" title={b.name}>
				<SlotTag side="B" /><span class="min-w-0 truncate">{b.name}</span>
			</div>
		</div>
	</div>
	<p id="{uidBase}-desc" class="sr-only">{description}</p>
	<p id="{uidBase}-live" class="sr-only" aria-live="polite">
		{#if active && focusYear != null}
			{active.year}: {a.name} {active.countA} visual novels, {b.name} {active.countB}. {active.shared} shared people active. {active.movesDown} first moves A to B, {active.movesUp} B to A.
		{/if}
	</p>
{/snippet}

<ChartCard
	{id}
	title="Activity timeline"
	bind:view
	{pending}
	note="Original-developer VNs per year · click any year for titles & staff"
>
	{#snippet chart()}
		{#if series.length === 0}
			<p class="px-4 py-6 text-sm text-ink-3">No dated releases as original developer for either brand.</p>
		{:else}
			<div class="px-4 pt-3 pb-1">{@render plot()}</div>
			{#if pinned}
				<div class="border-t border-rule bg-surface-sunken/60 px-4 py-3 text-xs" aria-live="polite">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink">
							<span class="tnum font-mono text-sm font-semibold">{pinned.year}</span>
							<span class="tnum text-ink-2">
								<SlotTag side="A" class="mr-1" />{pinned.countA} {pinned.countA === 1 ? 'VN' : 'VNs'}
							</span>
							<span class="tnum text-ink-2">
								<SlotTag side="B" class="mr-1" />{pinned.countB} {pinned.countB === 1 ? 'VN' : 'VNs'}
							</span>
							<span class="tnum text-ink-2">{pinned.shared} shared {pinned.shared === 1 ? 'person' : 'people'} active</span>
						</p>
						<button type="button" class="btn-ghost h-6 px-2 text-xs" onclick={() => (selectedYear = null)}>Clear</button>
					</div>
					{#if pinned.vnsA.length > 0 || pinned.vnsB.length > 0}
						<div class="mt-2 grid gap-1.5 border-t border-rule pt-2 md:grid-cols-2">
							{#if pinned.vnsA.length > 0}
								{@const listA = pinnedAllVnsA ? pinned.vnsA : pinned.vnsA.slice(0, 8)}
								<p class="text-ink-2">
									<span class="mr-1 inline-flex items-center gap-1 font-medium text-ink"><SlotTag side="A" /> {a.name} VNs:</span>
									{#each listA as v, i (v.id)}{i > 0 ? ' · ' : ''}<a class="link" href="/vn/{v.id}">{shownName(v.title, v.original)}</a>{/each}
									{#if pinned.vnsA.length > 8}
										<button
											type="button"
											class="ml-1.5 inline-flex h-[18px] items-center rounded-xs border border-rule-strong bg-surface px-1.5 font-mono text-2xs text-ink-2 hover:border-rule-hover hover:text-ink"
											onclick={() => (pinnedAllVnsA = !pinnedAllVnsA)}
										>
											{pinnedAllVnsA ? 'less' : `+${pinned.vnsA.length - 8}`}
										</button>
									{/if}
								</p>
							{/if}
							{#if pinned.vnsB.length > 0}
								{@const listB = pinnedAllVnsB ? pinned.vnsB : pinned.vnsB.slice(0, 8)}
								<p class="text-ink-2">
									<span class="mr-1 inline-flex items-center gap-1 font-medium text-ink"><SlotTag side="B" /> {b.name} VNs:</span>
									{#each listB as v, i (v.id)}{i > 0 ? ' · ' : ''}<a class="link" href="/vn/{v.id}">{shownName(v.title, v.original)}</a>{/each}
									{#if pinned.vnsB.length > 8}
										<button
											type="button"
											class="ml-1.5 inline-flex h-[18px] items-center rounded-xs border border-rule-strong bg-surface px-1.5 font-mono text-2xs text-ink-2 hover:border-rule-hover hover:text-ink"
											onclick={() => (pinnedAllVnsB = !pinnedAllVnsB)}
										>
											{pinnedAllVnsB ? 'less' : `+${pinned.vnsB.length - 8}`}
										</button>
									{/if}
								</p>
							{/if}
						</div>
					{/if}
					{#if pinned.movesDownPeople.length > 0 || pinned.movesUpPeople.length > 0}
						<div class="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
							{#if pinned.movesDownPeople.length > 0}
								<p class="text-ink-2">
									<span class="font-mono font-medium text-ink">↓ A→B ({pinned.movesDown}):</span>
									{#each pinned.movesDownPeople as p, i (p.sid)}{i > 0 ? ', ' : ' '}<a class="link" href="/staff/{p.sid}">{p.name}</a>{/each}
								</p>
							{/if}
							{#if pinned.movesUpPeople.length > 0}
								<p class="text-ink-2">
									<span class="font-mono font-medium text-ink">↑ B→A ({pinned.movesUp}):</span>
									{#each pinned.movesUpPeople as p, i (p.sid)}{i > 0 ? ', ' : ' '}<a class="link" href="/staff/{p.sid}">{p.name}</a>{/each}
								</p>
							{/if}
						</div>
					{/if}
					{#if pinned.sharedPeople.length > 0}
						{@const shownPinned = pinnedAll ? pinned.sharedPeople : pinned.sharedPeople.slice(0, 18)}
						<p class="mt-2 text-ink-2">
							<span class="font-medium text-ink">Active shared people:</span>
							{#each shownPinned as p, i (p.sid)}{i > 0 ? ' · ' : ' '}<a class="link" href="/staff/{p.sid}">{p.name}</a>{/each}
							{#if pinned.sharedPeople.length > 18}
								<button
									type="button"
									class="ml-2 inline-flex h-[18px] items-center rounded-xs border border-rule-strong bg-surface px-1.5 font-mono text-2xs text-ink-2 hover:border-rule-hover hover:text-ink"
									onclick={() => (pinnedAll = !pinnedAll)}
								>
									{pinnedAll ? 'Show fewer' : `Show all ${pinned.sharedPeople.length}`}
								</button>
							{/if}
						</p>
					{/if}
				</div>
			{:else}
				<div class="flex flex-wrap items-center justify-between gap-2 border-t border-rule bg-surface-sunken/35 px-4 py-2 text-xs text-ink-3" aria-live="polite">
					{#if hovered}
						<p class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-ink-2">
							<span class="tnum font-mono font-semibold text-ink">{hovered.year}</span>
							<span class="tnum"><SlotTag side="A" class="mr-1" />{hovered.countA} {hovered.countA === 1 ? 'VN' : 'VNs'}</span>
							<span class="tnum"><SlotTag side="B" class="mr-1" />{hovered.countB} {hovered.countB === 1 ? 'VN' : 'VNs'}</span>
							<span class="tnum">{hovered.shared} shared active</span>
							{#if hovered.movesDown || hovered.movesUp}
								<span class="tnum font-mono">↓{hovered.movesDown} ↑{hovered.movesUp}</span>
							{/if}
						</p>
						<span class="text-2xs text-ink-3">Click year to inspect VNs &amp; staff</span>
					{:else}
						<span>Click any year bar to inspect its VNs and active shared staff.</span>
					{/if}
				</div>
			{/if}
		{/if}
	{/snippet}

	{#snippet legend()}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1.5">
			<span class="inline-flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-t-[2px] bg-cmp-a"></span><SlotTag side="A" />{a.name}</span>
			<span class="inline-flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-b-[2px] bg-cmp-b"></span><SlotTag side="B" />{b.name}</span>
			<span class="h-3 w-px bg-rule-strong" aria-hidden="true"></span>
			<span class="inline-flex items-center gap-1.5">
				Shared people active
				{#each SHARED_LEVELS.slice(1) as lv (lv.level)}
					<span class="inline-flex items-center gap-1">
						<span class="inline-block h-2.5 w-3.5 border border-rule" style="background: color-mix(in oklab, var(--ink) {lv.opacity * 100}%, transparent)"></span>
						<span class="tnum font-mono text-2xs">{lv.label}</span>
					</span>
				{/each}
			</span>
			<span class="h-3 w-px bg-rule-strong" aria-hidden="true"></span>
			<span class="term" title="First credit at B after earlier credit at A"><span class="font-mono">↓</span> A→B ({layout.totalMovesDown})</span>
			<span class="term" title="First credit at A after earlier credit at B"><span class="font-mono">↑</span> B→A ({layout.totalMovesUp})</span>
		</div>
	{/snippet}

	{#snippet table()}
		{#if tableYears.length === 0}
			<p class="px-4 py-6 text-sm text-ink-3">No dated releases for either brand.</p>
		{:else}
			<div class="scroll-x max-h-[28rem] overflow-y-auto">
				<table class="ledger">
					<caption class="sr-only">Visual novels per year for {a.name} and {b.name}, with shared people and first moves</caption>
					<thead>
						<tr>
							<th scope="col">Year</th>
							<th scope="col" class="num">A: {a.name}</th>
							<th scope="col" class="num">B: {b.name}</th>
							<th scope="col" class="num" title="Shared staff active this year"><span class="term">Shared active</span></th>
							<th scope="col" class="num" title="First credit at B after A"><span class="term">A→B moves</span></th>
							<th scope="col" class="num" title="First credit at A after B"><span class="term">B→A moves</span></th>
							<th scope="col">Active shared people</th>
						</tr>
					</thead>
					<tbody>
						{#each tableYears as y (y.year)}
							<tr>
								<td class="tnum font-mono">{y.year}</td>
								<td class="num font-mono">
									{#if y.vnsA.length > 0}
										<StaffVnsButton
											count={y.countA}
											title="{a.name} ({y.year})"
											subtitle="{y.countA} original-developer {y.countA === 1 ? 'release' : 'releases'}"
											localVns={y.vnsA.map((v) => ({ vid: v.id, title: v.title, original: v.original, year: y.year }))}
										/>
									{:else}
										<span class="text-ink-4">0</span>
									{/if}
								</td>
								<td class="num font-mono">
									{#if y.vnsB.length > 0}
										<StaffVnsButton
											count={y.countB}
											title="{b.name} ({y.year})"
											subtitle="{y.countB} original-developer {y.countB === 1 ? 'release' : 'releases'}"
											localVns={y.vnsB.map((v) => ({ vid: v.id, title: v.title, original: v.original, year: y.year }))}
										/>
									{:else}
										<span class="text-ink-4">0</span>
									{/if}
								</td>
								<td class="num font-mono">{num(y.shared)}</td>
								<td class="num font-mono">{y.movesDown || '—'}</td>
								<td class="num font-mono">{y.movesUp || '—'}</td>
								<td class="max-w-[24rem] text-xs text-ink-2">
									{#if y.sharedPeople.length === 0}
										<span class="text-ink-4">—</span>
									{:else}
										{@const isExp = !!expandedTableYears[y.year]}
										{@const shownList = isExp ? y.sharedPeople : y.sharedPeople.slice(0, 6)}
										{#each shownList as p, i (p.sid)}{i > 0 ? ', ' : ''}<a class="link" href="/staff/{p.sid}">{p.name}</a>{/each}
										{#if y.sharedPeople.length > 6}
											<button
												type="button"
												class="ml-1.5 inline-flex h-[18px] items-center rounded-xs border border-rule-strong bg-surface-sunken px-1.5 font-mono text-2xs text-ink-2 hover:border-rule-hover hover:text-ink"
												aria-expanded={isExp}
												onclick={() => (expandedTableYears[y.year] = !isExp)}
											>
												{isExp ? 'less' : `+${y.sharedPeople.length - 6}`}
											</button>
										{/if}
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/snippet}
</ChartCard>
