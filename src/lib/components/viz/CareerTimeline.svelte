<script module lang="ts">
	import type { ConfidenceTier } from '#lib/types.ts';

	/** A potential alias offered for overlay. Always a separate `staff.id`. */
	export interface CandidateOption {
		sid: string;
		name: string;
		original?: string | null;
		tier: ConfidenceTier;
		score: number;
	}
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import ChartCard from './ChartCard.svelte';
	import NamePair from '../identity/NamePair.svelte';
	import AliasChip from '../identity/AliasChip.svelte';
	import YearSpan from '../identity/YearSpan.svelte';
	import RatingTag from '../identity/RatingTag.svelte';
	import RoleMark from '../people/RoleMark.svelte';
	import RolePills from '../people/RolePills.svelte';
	import StaffVnsButton from '../people/StaffVnsButton.svelte';
	import EpistemicGlyph from '../epistemic/EpistemicGlyph.svelte';
	import EpistemicBadge from '../epistemic/EpistemicBadge.svelte';
	import type { StaffBrandTrack, StaffTimelineEvent, StaffTransition } from '#lib/types.ts';
	import { ALIAS_USED_HINT, LEGEND_ROLES, legendRole, roleMeta } from '#lib/roles.ts';
	import { tierLabel } from '#lib/relations.ts';
	import { vndbHref, yearDelta } from '#lib/util.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';
	import {
		MARK,
		SWITCH_BAND_H,
		ALIAS_ROW_H,
		ALIAS_BAR_H,
		buildStints,
		eventsToCredits,
		distinctPenNames,
		layoutTimeline,
		stepCell,
		type Connector,
		type Credit,
		type LaneSort,
		type PenName,
		type TimelineCell
	} from '#lib/viz/timeline.ts';

	/**
	 * Career timeline across brands (DESIGN §6.1). Time runs left to right, each
	 * lane is a brand. Squares are development credits, circles are voice
	 * credits. In investigative mode a candidate record's credits are drawn as
	 * hollow dashed marks: a separate VNDB record, never merged with this one.
	 */
	interface Props {
		id?: string;
		title?: string;
		events: StaffTimelineEvent[];
		tracks: StaffBrandTrack[];
		transitions: StaffTransition[];
		personName: string;
		candidates?: CandidateOption[];
		overlaySid?: string | null;
		note?: string;
		/** No sheet of its own: for a timeline embedded in another row or card. */
		bare?: boolean;
		/** Optional callback to open the Aliases tab when "+N more names" is clicked. */
		onShowAliases?: () => void;
	}
	let {
		id = 'timeline',
		title = 'Career timeline',
		events,
		tracks,
		transitions,
		personName,
		candidates = [],
		overlaySid = $bindable(null),
		note,
		bare = false,
		onShowAliases
	}: Props = $props();

	const uidBase = $props.id();
	const ZOOMS = [14, 20, 28, 40];

	let view = $state<'chart' | 'table'>('chart');
	let sort = $state<LaneSort>('first');
	let showAllTransitions = $state(false);
	let showAllLanes = $state(false);
	let activeRoles = $state<string[]>([]);
	let zoom = $state<number | null>(null);
	let hoverKey = $state<string | null>(null);
	let focusKey = $state<string | null>(null);
	let hoverConn = $state<string | null>(null);
	let expandedRowChars = $state<Record<string, boolean>>({});
	let expandedStints = $state<Record<string, boolean>>({});
	let scroller = $state<HTMLDivElement | null>(null);
	let plotAvail = $state(0);

	// ── Potential-alias overlay: fetched live from the Hono API ──
	interface OverlayData {
		sid: string;
		name: string;
		events: StaffTimelineEvent[];
		tracks: StaffBrandTrack[];
	}
	const overlayCache = new Map<string, OverlayData>();
	let overlay = $state<OverlayData | null>(null);
	let overlayLoading = $state(false);
	let overlayError = $state<string | null>(null);
	/** Bumped by Retry: a dependency of the fetch effect, so it runs again. */
	let overlayAttempt = $state(0);

	$effect(() => {
		const sid = overlaySid;
		void overlayAttempt;
		if (!sid) {
			overlay = null;
			overlayError = null;
			overlayLoading = false;
			return;
		}
		const cached = overlayCache.get(sid);
		if (cached) {
			overlay = cached;
			overlayError = null;
			overlayLoading = false;
			return;
		}
		const controller = new AbortController();
		overlayLoading = true;
		overlayError = null;
		fetch(`/api/staff/${encodeURIComponent(sid)}`, { signal: controller.signal })
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then((body) => {
				const data: OverlayData = {
					sid,
					name: String(body?.staff?.name ?? sid),
					events: (body?.timelineEvents ?? []) as StaffTimelineEvent[],
					tracks: (body?.brandTracks ?? []) as StaffBrandTrack[]
				};
				overlayCache.set(sid, data);
				overlay = data;
				overlayLoading = false;
			})
			.catch((err: unknown) => {
				if ((err as Error)?.name === 'AbortError') return;
				overlay = null;
				overlayLoading = false;
				overlayError = `Could not load ${overlayDisplayName} for the overlay.`;
			});
		return () => controller.abort();
	});

	const activeOverlay = $derived(overlay && overlay.sid === overlaySid ? overlay : null);
	const overlayCandidate = $derived(candidates.find((c) => c.sid === overlaySid) ?? null);
	const overlayDisplayName = $derived(
		overlayCandidate
			? shownName(overlayCandidate.name, overlayCandidate.original)
			: (activeOverlay?.name ?? 'candidate')
	);

	const layout = $derived(
		layoutTimeline(events, tracks, transitions, {
			dumpYear: page.data.dumpYear ?? 0,
			yearW: zoom ?? undefined,
			fitWidth: plotAvail,
			maxLanes: showAllLanes ? 9999 : 14,
			sort,
			activeRoles,
			showAllTransitions,
			// Reads the reader's name order, so the strip re-lays itself on Aa / あ.
			shown: shownName,
			overlay: activeOverlay
		})
	);
	// The table twin and the narrow-screen list carry the overlay too.
	const stints = $derived(buildStints(tracks, transitions, events, activeOverlay));
	const candidateStintCount = $derived(stints.filter((s) => s.candidate).length);
	const creditsByStintKey = $derived.by(() => {
		const map = new Map<string, Credit[]>();
		const push = (key: string, c: Credit) => {
			let list = map.get(key);
			if (!list) {
				list = [];
				map.set(key, list);
			}
			list.push(c);
		};
		for (const c of eventsToCredits(events, false)) {
			if (c.pid) push(`p|${c.pid}`, c);
		}
		if (activeOverlay) {
			for (const c of eventsToCredits(activeOverlay.events, true)) {
				if (c.pid) push(`c|${c.pid}`, c);
			}
		}
		for (const list of map.values()) {
			list.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title));
		}
		return map;
	});
	const cellByKey = $derived(new Map(layout.cells.map((c) => [c.key, c])));
	const laneById = $derived(new Map(layout.lanes.map((l) => [l.id, l])));
	const hovered = $derived(hoverKey ? (cellByKey.get(hoverKey) ?? null) : null);
	const selected = $derived(focusKey ? (cellByKey.get(focusKey) ?? null) : null);
	let hoverSwitchYear = $state<number | null>(null);
	let pinnedSwitchYear = $state<number | null>(null);
	let pinnedConnKey = $state<string | null>(null);
	const activeConn = $derived(
		(hoverConn ?? pinnedConnKey)
			? (layout.connectors.find((c) => c.key === (hoverConn ?? pinnedConnKey)) ?? null)
			: null
	);
	const activeSwitch = $derived(
		(hoverSwitchYear ?? pinnedSwitchYear) != null
			? (layout.switches.find((s) => s.year === (hoverSwitchYear ?? pinnedSwitchYear)) ?? null)
			: null
	);

	const presentRoles = $derived.by(() => {
		const set = new Set<string>();
		for (const c of eventsToCredits(events)) for (const r of c.roles) set.add(legendRole(r));
		return LEGEND_ROLES.filter((r) => set.has(r));
	});
	const hasAliasMarks = $derived(events.some((e) => e.isNonPrimaryAlias));
	const totalCredits = $derived(layout.cells.reduce((n, c) => n + c.credits.length, 0));
	const description = $derived(
		`${personName}: ${totalCredits} dated credits at ${layout.totalLaneCount} brand${layout.totalLaneCount === 1 ? '' : 's'}, ${layout.minYear + 1} to ${layout.maxYear - 1}. The Table view lists the same stints.`
	);

	function toggleRole(role: string, additive: boolean) {
		if (additive) {
			activeRoles = activeRoles.includes(role)
				? activeRoles.filter((r) => r !== role)
				: [...activeRoles, role];
		} else {
			activeRoles = activeRoles.length === 1 && activeRoles[0] === role ? [] : [role];
		}
	}

	function setZoom(dir: 1 | -1) {
		const cur = ZOOMS.indexOf(layout.yearW);
		const base = cur === -1 ? ZOOMS.findIndex((z) => z >= layout.yearW) : cur;
		const next = Math.max(0, Math.min(ZOOMS.length - 1, (base === -1 ? 1 : base) + dir));
		zoom = ZOOMS[next];
	}

	function reveal(cell: TimelineCell) {
		const el = scroller;
		if (!el) return;
		const left = cell.cx - 60;
		const right = cell.cx + 60;
		if (left < el.scrollLeft) el.scrollLeft = Math.max(0, left);
		else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
	}

	function onKeydown(e: KeyboardEvent) {
		const map: Record<string, 'left' | 'right' | 'up' | 'down' | 'home' | 'end'> = {
			ArrowLeft: 'left',
			ArrowRight: 'right',
			ArrowUp: 'up',
			ArrowDown: 'down',
			Home: 'home',
			End: 'end'
		};
		const dir = map[e.key];
		if (dir) {
			e.preventDefault();
			const next = stepCell(layout.cells, focusKey, dir);
			if (next) {
				focusKey = next.key;
				reveal(next);
			}
			return;
		}
		if (e.key === 'Enter' && selected && selected.credits.length === 1) {
			e.preventDefault();
			void goto(`/vn/${selected.credits[0].vid}`);
		} else if (e.key === 'Escape') {
			focusKey = null;
		} else if (e.key === '+' || e.key === '=') {
			setZoom(1);
		} else if (e.key === '-') {
			setZoom(-1);
		}
	}

	/**
	 * A pen name in the reader's name order. Romanised first keeps the label that
	 * tells two names with one romanisation apart (`Himari (ヒマリ)`).
	 */
	function penShown(p: PenName): string {
		const shown = shownName(p.name, p.original);
		return shown === p.name ? p.label : shown;
	}

	function clickCell(cell: TimelineCell) {
		pinnedConnKey = null;
		pinnedSwitchYear = null;
		focusKey = focusKey === cell.key ? null : cell.key;
	}

	/** Fill and stroke for one role inside a credit tile. */
	function tileStyle(role: string): { fill: string; stroke: string } {
		const m = roleMeta(role);
		return m.fill === 'hollow' ? { fill: 'none', stroke: m.color } : { fill: m.color, stroke: 'none' };
	}

	function connectorText(c: Connector): string {
		const when =
			c.gapYears == null || c.gapYears <= 0
				? `${c.toYear ?? '?'}, same year`
				: `${c.fromYear ?? '?'} → ${c.toYear ?? '?'} (${c.gapYears}y later)`;
		const aliasPart = c.aliasChanged
			? c.aliasFrom && c.aliasTo && c.aliasFrom !== c.aliasTo
				? ` · name changed: ${c.aliasFrom} → ${c.aliasTo}`
				: ' · name changed'
			: '';
		return `${shownName(c.fromName, c.fromOriginal)} → ${shownName(c.toName, c.toOriginal)} (${when})${aliasPart}`;
	}

	function switchText(sw: (typeof layout.switches)[number]): string {
		const brands =
			sw.withBrandChange && sw.fromBrand && sw.toBrand && sw.fromBrand !== sw.toBrand
				? ` (${sw.fromBrand} → ${sw.toBrand})`
				: sw.toBrand
					? ` (${sw.toBrand})`
					: '';
		return `Most-used alias changed in ${sw.year}${brands}: ${sw.from} → ${sw.to}`;
	}
</script>

{#snippet mark(credit: Credit, cx: number, cy: number)}
	{@const half = MARK / 2}
	{#if credit.candidate}
		{#if credit.kind === 'seiyuu'}
			<circle {cx} {cy} r={half - 0.75} fill="var(--surface)" stroke="var(--inferred)" stroke-width="1.5" stroke-dasharray="2.5 1.8" />
		{:else}
			<rect x={cx - half + 0.75} y={cy - half + 0.75} width={MARK - 1.5} height={MARK - 1.5} rx="2" fill="var(--surface)" stroke="var(--inferred)" stroke-width="1.5" stroke-dasharray="2.5 1.8" />
		{/if}
	{:else if credit.kind === 'seiyuu'}
		<circle {cx} {cy} r={half} fill="var(--role-seiyuu)" />
	{:else if credit.roles.length === 2}
		{@const a = tileStyle(credit.roles[0])}
		{@const b = tileStyle(credit.roles[1])}
		<rect x={cx - half + (a.fill === 'none' ? 0.75 : 0)} y={cy - half + (a.fill === 'none' ? 0.75 : 0)} width={MARK - (a.fill === 'none' ? 1.5 : 0)} height={5.5 - (a.fill === 'none' ? 0.75 : 0)} rx="1.5" fill={a.fill} stroke={a.stroke} stroke-width="1.5" />
		<rect x={cx - half + (b.fill === 'none' ? 0.75 : 0)} y={cy + 0.5} width={MARK - (b.fill === 'none' ? 1.5 : 0)} height={5.5 - (b.fill === 'none' ? 0.75 : 0)} rx="1.5" fill={b.fill} stroke={b.stroke} stroke-width="1.5" />
	{:else}
		{@const s = tileStyle(credit.roles[0] ?? 'staff')}
		<rect x={cx - half + (s.fill === 'none' ? 0.75 : 0)} y={cy - half + (s.fill === 'none' ? 0.75 : 0)} width={MARK - (s.fill === 'none' ? 1.5 : 0)} height={MARK - (s.fill === 'none' ? 1.5 : 0)} rx="2" fill={s.fill} stroke={s.stroke} stroke-width="1.5" />
		{#if credit.roles.length >= 3}
			<rect x={cx - 2} y={cy - half - 2.5} width="4" height="1" fill="var(--ink)" />
		{/if}
	{/if}
	{#if credit.isNonPrimaryAlias && !credit.candidate}
		<rect x={cx - half} y={cy + half + 1} width={MARK} height="1.5" fill="var(--ink)" />
	{/if}
{/snippet}

<!-- Name-switch mark: two opposed arrows. Diamonds stay reserved for the inferred
     register and for individual producers. -->
{#snippet swapMark(cx: number, cy: number)}
	<rect x={cx - 6} y={cy - 6} width="12" height="12" rx="2" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="1" />
	<path
		d="M{cx - 3.5},{cy - 2} H{cx + 3.5} M{cx + 1.5},{cy - 4} L{cx + 3.5},{cy - 2} M{cx + 3.5},{cy + 2} H{cx - 3.5} M{cx - 1.5},{cy + 4} L{cx - 3.5},{cy + 2}"
		fill="none"
		stroke="var(--ink)"
		stroke-width="1.2"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
{/snippet}

{#snippet creditRow(c: Credit)}
	{@const charExp = !!expandedRowChars[c.key]}
	{@const shownChars = charExp ? c.characters : c.characters.slice(0, 3)}
	<li class="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
		{#if c.candidate}
			<span class="inline-flex items-center gap-1">
				{#each c.roles.slice(0, 4) as r (r)}
					<span class="inline-flex items-center gap-1 font-mono text-2xs text-ink-2">
						<RoleMark role={r} size={8} variant="candidate" />{roleMeta(r).code}
					</span>
				{/each}
			</span>
		{:else}
			<RolePills roles={c.roles} max={4} />
		{/if}
		<NamePair name={c.title} original={c.original} href="/vn/{c.vid}" variant="inline" class="text-sm" />
		{#if c.isNonPrimaryAlias}
			<!-- Two pen names can share a romanisation: the labels carry the script then. -->
			{@const pens = distinctPenNames(c.aliases)}
			{#if pens.length}
				<AliasChip aliases={pens.map((a) => a.label)} bare />
			{/if}
		{/if}
		{#if c.characters.length}
			<span class="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-2">
				<span class="text-ink-3">voicing</span>
				{#each shownChars as ch, i (ch.cid)}<span><a class="link-quiet inline-flex items-center gap-0.5" href={vndbHref(ch.cid)} target="_blank" rel="noopener noreferrer">{shownName(ch.name, ch.original)}<ArrowUpRight size={9} class="text-ink-3" /></a>{#if i < shownChars.length - 1},{/if}</span>{/each}
				{#if c.characters.length > 3}
					<button
						type="button"
						class="tnum inline-flex h-[18px] items-center rounded-xs border border-rule-strong bg-surface-sunken px-1.5 font-mono text-2xs text-ink-2 transition-colors duration-[120ms] hover:border-rule-hover hover:bg-control-hover hover:text-ink"
						aria-expanded={charExp}
						onclick={() => (expandedRowChars[c.key] = !charExp)}
					>
						{charExp ? 'less' : `+${c.characters.length - 3}`}
					</button>
				{/if}
			</span>
		{/if}
		<RatingTag hasEro={c.hasEro} hasAllAges={c.hasAllAges} />
	</li>
{/snippet}

<ChartCard {id} {title} bind:view chartLabel="Timeline" pending={overlayLoading} {note} {bare} narrowTable>
	{#snippet controls()}
		<!-- Lane order, transitions and zoom shape the swimlanes only: they are
		     hidden in the Table view and below `md`, where the stint list stands in. -->
		{#if view === 'chart'}
			<label class="hidden items-center gap-1.5 text-xs text-ink-3 md:flex" title="Order brand swimlanes">
				<span>Lanes</span>
				<select class="field h-7 pr-6 text-xs" bind:value={sort}>
					<option value="first">First appearance</option>
					<option value="credits">Most credits</option>
					<option value="tenure">Longest tenure</option>
				</select>
			</label>
			<label
				class="hidden h-7 cursor-pointer items-center gap-1.5 text-xs text-ink-2 md:flex"
				title="Show full chronological chain across concurrent studios (default shows clean studio handoffs only)"
			>
				<input type="checkbox" class="accent-(--ink)" bind:checked={showAllTransitions} />
				Show all hops
			</label>
		{/if}
		{#if candidates.length > 0}
			<label class="flex items-center gap-1.5 text-xs text-ink-3">
				<EpistemicGlyph kind="alias-potential" size={11} />
				<span>Overlay</span>
				<select
					class="field h-7 max-w-[15rem] border-dashed border-inferred pr-6 text-xs text-ink"
					value={overlaySid ?? ''}
					onchange={(e) => (overlaySid = e.currentTarget.value || null)}
				>
					<option value="">None</option>
					{#each candidates as c (c.sid)}
						<option value={c.sid}>{shownName(c.name, c.original)} · {tierLabel(c.tier)} {c.score}</option>
					{/each}
				</select>
			</label>
		{/if}
		{#if view === 'chart'}
			<div class="hidden overflow-hidden rounded-sm border border-rule-strong bg-control md:inline-flex" role="group" aria-label="Zoom">
				<button type="button" class="inline-flex size-7 items-center justify-center text-ink-2 hover:bg-surface-hover hover:text-ink disabled:opacity-40" aria-label="Zoom out" disabled={layout.yearW <= ZOOMS[0]} onclick={() => setZoom(-1)}><Minus size={13} /></button>
				<button type="button" class="inline-flex size-7 items-center justify-center border-l border-rule-strong text-ink-2 hover:bg-surface-hover hover:text-ink disabled:opacity-40" aria-label="Zoom in" disabled={layout.yearW >= ZOOMS[ZOOMS.length - 1]} onclick={() => setZoom(1)}><Plus size={13} /></button>
			</div>
		{/if}
	{/snippet}

	<!-- Above both views, on every screen width: the overlay's warning, its
	     Remove button and a failed fetch must never go away with the chart. -->
	{#snippet toolbar()}
		{#if overlaySid && !bare}
			<div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-dashed border-inferred/60 bg-inferred-tint px-4 py-1.5 text-xs" role="note">
				<EpistemicBadge register="inferred" glyph="alias-potential" />
				<span class="text-ink-2">
					Overlay:
					{#if overlayCandidate}
						<a class="link font-medium text-ink" href="/staff/{overlayCandidate.sid}">
							<NamePair name={overlayCandidate.name} original={overlayCandidate.original} variant="compact" />
						</a>
					{:else}
						<span class="font-medium text-ink">{overlayDisplayName}</span>
					{/if}
					<span class="ml-1 text-ink-3 italic">(separate record, unconfirmed)</span>
				</span>
				{#if overlayLoading}<span class="text-ink-3">Loading…</span>{/if}
				<button type="button" class="btn-ghost ml-auto text-xs" onclick={() => (overlaySid = null)}>
					<X size={12} /> Remove
				</button>
			</div>
		{/if}
		{#if overlayError}
			<p class="border-b border-rule border-l-2 border-l-danger px-4 py-2 text-xs text-ink-2" role="alert">
				{overlayError}
				<button type="button" class="btn-ghost ml-2 text-xs" onclick={() => (overlayAttempt += 1)}>Retry</button>
			</p>
		{/if}
	{/snippet}

	{#snippet chart()}
		{#if layout.cells.length === 0}
			<p class="px-4 py-6 text-sm text-ink-3">
				{activeRoles.length
					? 'No credits match the selected roles. Clear the role filter in the legend.'
					: 'No dated credits recorded in VNDB for this person.'}
			</p>
		{:else}
			<!-- Below `md` ChartCard shows the stint list instead (`narrowTable`). -->
			<div class="flex">
				<!-- Lane labels: pinned while the plot scrolls. -->
				<div class="w-52 shrink-0 border-r border-rule bg-surface">
					<div class="flex flex-col justify-center px-3" style="height: {layout.aliasStripH}px">
						{#if layout.aliasStripH > 0}
							<span class="term w-fit text-xs font-medium text-ink-3" title={ALIAS_USED_HINT}>Alias used</span>
							{#if layout.aliasOverflow > 0 && onShowAliases}
								<button type="button" class="link w-fit text-left text-2xs" onclick={onShowAliases}>
									+{layout.aliasOverflow} more {layout.aliasOverflow === 1 ? 'name' : 'names'}
								</button>
							{/if}
						{/if}
					</div>
					<div style="height: {layout.axisH}px"></div>
					{#each layout.lanes as lane (lane.id)}
						<div
							class="flex flex-col justify-center border-t border-rule px-3 {lane.candidateOnly ? 'bg-inferred-tint/70' : ''} {activeConn && (activeConn.fromLane === lane.id || activeConn.toLane === lane.id) ? 'bg-surface-sunken' : ''}"
							style="height: {lane.h}px"
						>
							<div class="flex items-baseline justify-between gap-2">
								<span class="min-w-0 truncate text-sm font-medium">
									{#if lane.pid}
										<NamePair name={lane.name} original={lane.original} href="/producer/{lane.pid}" variant="compact" />
									{:else}
										<span class="text-ink-2">{lane.name}</span>
									{/if}
								</span>
								<span class="tnum inline-flex shrink-0 items-center gap-0.5 font-mono text-2xs text-ink-3">
									{#if lane.pid && lane.vnCount > 0}
										{@const laneCredits = creditsByStintKey.get(`p|${lane.pid}`) ?? []}
										<StaffVnsButton
											count={lane.vnCount}
											title="{personName} at {shownName(lane.name, lane.original)}"
											subtitle="Visual novels credited here"
											localVns={laneCredits.map((c) => ({
												vid: c.vid,
												title: c.title,
												original: c.original,
												year: c.year,
												roles: c.roles,
												hasEro: c.hasEro,
												hasAllAges: c.hasAllAges
											}))}
											align="left"
											class="text-2xs text-ink-3"
										/>
									{:else}
										{lane.vnCount}
									{/if}
									{#if lane.candidateVnCount}
										{@const candCredits = lane.pid ? (creditsByStintKey.get(`c|${lane.pid}`) ?? []) : []}
										{#if candCredits.length > 0}
											<StaffVnsButton
												count={lane.candidateVnCount}
												label="+{lane.candidateVnCount}"
												title="{overlayDisplayName} at {shownName(lane.name, lane.original)}"
												subtitle="Candidate record VNs (unconfirmed)"
												localVns={candCredits.map((c) => ({
													vid: c.vid,
													title: c.title,
													original: c.original,
													year: c.year,
													roles: c.roles,
													hasEro: c.hasEro,
													hasAllAges: c.hasAllAges
												}))}
												align="left"
												class="text-2xs text-inferred"
											/>
										{:else}
											<span class="text-inferred">+{lane.candidateVnCount}</span>
										{/if}
									{/if}
								</span>
							</div>
							{#if lane.candidateOnly}
								<span class="text-2xs text-ink-3 italic">candidate record only</span>
							{:else if lane.penNames.length}
								{@const pens = lane.penNames.map(penShown).join(', ')}
								<span class="truncate text-xs text-ink-3" title="Credited here as {pens}">as {pens}</span>
							{/if}
						</div>
					{/each}
					{#if layout.bottomAxisH > 0}
						<!-- Beside the repeated year axis: closes the last lane like the plot does. -->
						<div class="border-t border-rule" style="height: {layout.bottomAxisH + 4}px"></div>
					{/if}
				</div>

				<!-- The plot is one keyboard-driven tab stop (role="application") with a table twin. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
				<div
					bind:this={scroller}
					bind:clientWidth={plotAvail}
					class="scroll-x relative min-w-0 flex-1 focus-visible:outline-offset-[-2px]"
					role="application"
					tabindex="0"
					aria-label="Career timeline plot. Arrow keys move between credits, Enter opens a visual novel, plus and minus zoom."
					aria-describedby="{uidBase}-desc {uidBase}-live"
					onkeydown={onKeydown}
				>
					<svg width={layout.plotW} height={layout.plotH} class="block" aria-hidden="true">
						<!-- Gridlines are solid hairlines: dashes are reserved for inference. -->
						{#each layout.ticks as t (t.year)}
							{#if t.label || t.major}
								<line x1={t.x} x2={t.x} y1={layout.lanesTop - 5} y2={layout.lanesBottom + 4} stroke={t.major ? 'var(--rule-strong)' : 'var(--rule)'} stroke-width="1" />
							{/if}
							{#if t.label}
								<text x={t.x} y={layout.aliasStripH + 14} text-anchor="middle" class="mono" font-size="11" fill="var(--ink-3)">{t.year}</text>
								<!-- A tall chart repeats the years under its last lane. -->
								{#if layout.bottomAxisH > 0}
									<text x={t.x} y={layout.lanesBottom + 17} text-anchor="middle" class="mono" font-size="11" fill="var(--ink-3)">{t.year}</text>
								{/if}
							{/if}
						{/each}
						{#if layout.bottomAxisH > 0}
							<line x1="0" x2={layout.plotW} y1={layout.lanesBottom} y2={layout.lanesBottom} stroke="var(--rule)" stroke-width="1" />
						{/if}

						<!-- Alias strip: confirmed aliases, so solid outlines. -->
						<!-- Each bar spans exactly the years the name was used. A label too
						     long for its bar is printed beside it, never by stretching the bar. -->
						{#each layout.aliasSegments as seg (seg.key)}
							{@const left = seg.labelSide === 'left'}
							<g>
								<rect x={seg.x1} y={seg.row * ALIAS_ROW_H + 3} width={seg.x2 - seg.x1} height={ALIAS_BAR_H} rx="4" fill="var(--surface-sunken)" stroke="var(--ink-3)" stroke-width="1" />
								<svg x={left ? seg.labelX - seg.labelW : seg.labelX} y={seg.row * ALIAS_ROW_H + 3} width={seg.labelW} height={ALIAS_BAR_H}>
									<text x={left ? seg.labelW : 0} y="13" text-anchor={left ? 'end' : 'start'} font-size="12" fill="var(--ink)">{seg.alias}</text>
								</svg>
								<title>{seg.alias}: {seg.firstYear === seg.lastYear ? seg.firstYear : `${seg.firstYear}–${seg.lastYear}`}, {seg.count} {seg.count === 1 ? 'credit' : 'credits'}</title>
							</g>
						{/each}

						{#each layout.lanes as lane (lane.id)}
							<line x1="0" x2={layout.plotW} y1={lane.y} y2={lane.y} stroke="var(--rule)" stroke-width="1" />
							{#if lane.candidateOnly}
								<rect x="0" y={lane.y + 0.5} width={layout.plotW} height={lane.h - 1} fill="var(--inferred-tint)" />
							{:else if activeConn && (activeConn.fromLane === lane.id || activeConn.toLane === lane.id)}
								<rect x="0" y={lane.y + 0.5} width={layout.plotW} height={lane.h - 1} fill="var(--surface-sunken)" />
							{/if}
							{#if lane.tenure}
								<rect x={lane.tenure.x1} y={lane.tenure.y} width={Math.max(4, lane.tenure.x2 - lane.tenure.x1)} height="4" rx="2" fill="var(--surface-sunken)" stroke="var(--rule)" stroke-width="0.5" />
							{/if}
							{#if lane.candidateTenure}
								<line x1={lane.candidateTenure.x1} x2={lane.candidateTenure.x2} y1={lane.candidateTenure.y - 3} y2={lane.candidateTenure.y - 3} stroke="var(--inferred)" stroke-width="1.5" stroke-dasharray="6 4" />
							{/if}
						{/each}

						<!-- Name switches: guides through the lanes. They start under the year
						     axis, so a guide never strikes through a year label, and only years
						     with a credit in a drawn lane get one: elsewhere the mark in the
						     alias strip stands alone. -->
						{#if layout.switches.length <= 16}
							{#each layout.switches as sw (sw.year)}
								{#if sw.inLanes}
									<line
										x1={sw.x}
										x2={sw.x}
										y1={layout.lanesTop - 5}
										y2={layout.lanesBottom + 4}
										stroke={hoverSwitchYear === sw.year || pinnedSwitchYear === sw.year ? 'var(--ink)' : 'var(--ink-4)'}
										stroke-width={hoverSwitchYear === sw.year || pinnedSwitchYear === sw.year ? '1.5' : '1'}
									/>
								{/if}
							{/each}
						{/if}

						<!-- Transition connectors: observed ordering of credits, so solid. -->
						{#each layout.connectors as c (c.key)}
							{@const hot = hoverConn === c.key || pinnedConnKey === c.key}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<g
								role="presentation"
								class="cursor-pointer"
								onmouseenter={() => (hoverConn = c.key)}
								onmouseleave={() => (hoverConn = null)}
								onclick={() => {
									focusKey = null;
									pinnedConnKey = pinnedConnKey === c.key ? null : c.key;
								}}
							>
								<title>{connectorText(c)}</title>
								<path d={c.path} fill="none" stroke="transparent" stroke-width="10" />
								<path d={c.path} fill="none" stroke={hot ? 'var(--ink)' : 'var(--ink-3)'} stroke-width={hot ? '2' : '1.5'} opacity={hot ? 1 : c.first ? 0.55 : 0.3} />
								<path d={c.arrow} fill="none" stroke={hot ? 'var(--ink)' : 'var(--ink-3)'} stroke-width={hot ? '2' : '1.5'} stroke-linecap="round" stroke-linejoin="round" opacity={hot ? 1 : c.first ? 0.7 : 0.35} />
							</g>
						{/each}

						<!-- Credits -->
						{#each layout.cells as cell (cell.key)}
							{@const single = cell.credits.length === 1}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<g
								role="presentation"
								class="cursor-pointer"
								opacity={focusKey && focusKey !== cell.key && hoverKey !== cell.key ? 0.55 : 1}
								onmouseenter={() => (hoverKey = cell.key)}
								onmouseleave={() => (hoverKey = null)}
								onclick={() => clickCell(cell)}
							>
								<rect x={cell.cx - Math.max(12, layout.yearW / 2)} y={cell.y} width={Math.max(24, layout.yearW)} height={cell.h} fill="transparent" />
								{#each cell.marks as m (m.credit.key)}
									{@render mark(m.credit, m.cx, m.cy)}
								{/each}
								{#if cell.tile}
									<rect x={cell.tile.cx - 8} y={cell.tile.cy - 6} width="16" height="12" rx="2" fill="var(--surface-sunken)" stroke={cell.sub === 'candidate' ? 'var(--inferred)' : 'var(--rule-strong)'} stroke-width="1" stroke-dasharray={cell.sub === 'candidate' ? '2.5 1.8' : undefined} />
									<text x={cell.tile.cx} y={cell.tile.cy + 3.5} text-anchor="middle" class="mono" font-size="9.5" fill="var(--ink)">{single ? '' : cell.marks.length ? '+' : ''}{cell.tile.count}</text>
								{/if}
								{#if focusKey === cell.key}
									<rect x={cell.cx - 11} y={cell.y + 1} width="22" height={cell.h - 2} rx="3" fill="none" stroke="var(--ink)" stroke-width="2" />
								{:else if hoverKey === cell.key}
									<rect x={cell.cx - 10} y={cell.y + 1.5} width="20" height={cell.h - 3} rx="3" fill="none" stroke="var(--ink-3)" stroke-width="1" />
								{/if}
							</g>
						{/each}

						<!-- Name-switch marks strictly on the alias strip / year guide (clickable to pin) -->
						{#each layout.switches as sw (sw.year)}
							{@const hotSw = hoverSwitchYear === sw.year || pinnedSwitchYear === sw.year}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<g
								role="presentation"
								class="cursor-pointer"
								opacity={hotSw ? 1 : 0.9}
								onmouseenter={() => (hoverSwitchYear = sw.year)}
								onmouseleave={() => (hoverSwitchYear = null)}
								onclick={() => {
									focusKey = null;
									pinnedConnKey = null;
									pinnedSwitchYear = pinnedSwitchYear === sw.year ? null : sw.year;
								}}
							>
								<title>{switchText(sw)}</title>
								<circle cx={sw.x} cy={layout.aliasStripH - SWITCH_BAND_H / 2} r="9" fill="transparent" />
								{@render swapMark(sw.x, layout.aliasStripH - SWITCH_BAND_H / 2)}
							</g>
						{/each}
					</svg>
				</div>
			</div>

			<p id="{uidBase}-desc" class="sr-only">{description}</p>

			<!-- Lower inspection panel: click pins full VN/credit list; hover shows a non-clipping 1-line preview. -->
			<div id="{uidBase}-live" class="border-t border-rule px-4 py-2.5" aria-live="polite">
				{#if selected}
					{@const lane = laneById.get(selected.laneId)}
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<p class="text-xs text-ink-2">
							<span class="tnum mr-1.5 font-mono text-ink">{selected.year}</span>
							<span class="mr-1.5">{lane ? shownName(lane.name, lane.original) : 'Unknown brand'}</span>
							<span>{selected.credits.length} credit{selected.credits.length === 1 ? '' : 's'}</span>
							{#if selected.sub === 'candidate'}
								<span class="ml-1.5 inline-flex items-center gap-1 italic"><EpistemicGlyph kind="alias-potential" size={10} />{overlayDisplayName} (unconfirmed)</span>
							{/if}
						</p>
						<button type="button" class="btn-ghost text-xs text-ink-3" onclick={() => (focusKey = null)}>Clear</button>
					</div>
					<ul class="mt-1 divide-y divide-rule">
						{#each selected.credits as c (c.key)}{@render creditRow(c)}{/each}
					</ul>
				{:else if hovered}
					{@const lane = laneById.get(hovered.laneId)}
					<div class="flex flex-wrap items-baseline justify-between gap-2 text-xs">
						<p class="min-w-0 truncate text-ink-2">
							<span class="tnum mr-1.5 font-mono font-medium text-ink">{hovered.year}</span>
							<span class="mr-1.5">{lane ? shownName(lane.name, lane.original) : ''}</span>
							<span class="text-ink">
								{hovered.credits.slice(0, 3).map((c) => shownName(c.title, c.original)).join(' · ')}{hovered.credits.length > 3 ? ` +${hovered.credits.length - 3}` : ''}
							</span>
						</p>
						<span class="shrink-0 text-2xs text-ink-3">Click mark to pin</span>
					</div>
				{:else if activeSwitch}
					<div class="flex flex-wrap items-baseline justify-between gap-2 text-xs">
						<p class="text-ink-2">{switchText(activeSwitch)}</p>
						{#if pinnedSwitchYear != null}
							<button type="button" class="btn-ghost text-xs text-ink-3" onclick={() => (pinnedSwitchYear = null)}>Clear</button>
						{/if}
					</div>
				{:else if activeConn}
					<div class="flex flex-wrap items-baseline justify-between gap-2 text-xs">
						<p class="text-ink-2">{connectorText(activeConn)}</p>
						{#if pinnedConnKey}
							<button type="button" class="btn-ghost text-xs text-ink-3" onclick={() => (pinnedConnKey = null)}>Clear</button>
						{/if}
					</div>
				{:else}
					<p class="text-xs text-ink-3">Click any mark or ⇄ arrow to inspect VNs &amp; alias changes.</p>
				{/if}
			</div>

			{#if layout.hiddenLaneCount > 0 || showAllLanes}
				<div class="border-t border-rule px-4 py-2">
					<button type="button" class="btn-ghost text-xs" onclick={() => (showAllLanes = !showAllLanes)}>
						{showAllLanes ? 'Show the 14 busiest lanes' : `Show all ${layout.totalLaneCount} lanes`}
					</button>
				</div>
			{/if}
			{#if layout.undated.length > 0}
				<p class="border-t border-rule px-4 py-2 text-xs text-ink-3">
					{layout.undated.length} credit{layout.undated.length === 1 ? ' has' : 's have'} no release date in VNDB and
					{layout.undated.length === 1 ? 'is' : 'are'} not plotted. See the credits table below.
				</p>
			{/if}
		{/if}
	{/snippet}

	{#snippet legend()}
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
			<span class="text-2xs text-ink-3">Filter role</span>
			{#each presentRoles as role (role)}
				{@const m = roleMeta(role)}
				{@const isOn = activeRoles.includes(role)}
				{@const dim = activeRoles.length > 0 && !isOn}
				<button
					type="button"
					class="inline-flex h-6 items-center gap-1.5 rounded-xs border px-2 font-mono text-2xs transition-colors duration-[120ms] {isOn
						? 'border-ink bg-surface-hover font-medium text-ink'
						: dim
							? 'border-rule bg-transparent text-ink-3 line-through hover:border-rule-hover hover:text-ink'
							: 'border-rule-strong bg-surface-sunken text-ink hover:border-rule-hover hover:bg-control-hover'}"
					aria-pressed={isOn}
					title="{m.label} · click to filter"
					onclick={(e) => toggleRole(role, e.shiftKey)}
				>
					<RoleMark {role} size={9} />{m.code}
				</button>
			{/each}
			{#if activeRoles.length}
				<button type="button" class="btn-ghost text-xs" onclick={() => (activeRoles = [])}>Show all roles</button>
			{/if}
			<span class="h-3 w-px bg-rule-strong" aria-hidden="true"></span>
			{#if hasAliasMarks}
				<span class="inline-flex items-center gap-1.5"><svg width="12" height="4" aria-hidden="true"><rect width="12" height="1.5" y="1" fill="var(--ink)" /></svg>credited under an alias</span>
			{/if}
			{#if layout.switches.length}
				<span class="inline-flex items-center gap-1.5"><svg width="13" height="13" viewBox="-6.5 -6.5 13 13" aria-hidden="true">{@render swapMark(0, 0)}</svg>name switch</span>
			{/if}
			{#if layout.connectors.length > 0}
				<span class="inline-flex items-center gap-1.5">
					<svg width="18" height="8" viewBox="0 0 18 8" aria-hidden="true"><path d="M1 1 C8 1 8 6 14 6" fill="none" stroke="var(--ink-3)" stroke-width="1.5" /><path d="M11.5 3.5 15 6 11.5 8" fill="none" stroke="var(--ink-3)" stroke-width="1.5" /></svg>
					{showAllTransitions ? 'chronological hop' : 'studio handoff'}
				</span>
			{/if}
			<span class="inline-flex items-center gap-1.5"><svg width="16" height="4" aria-hidden="true"><rect width="16" height="4" rx="2" fill="var(--surface-sunken)" stroke="var(--rule-strong)" stroke-width="0.5" /></svg>tenure</span>
			<span class="inline-flex items-center gap-1.5"><svg width="16" height="12" aria-hidden="true"><rect x="0.5" y="0.5" width="15" height="11" rx="2" fill="var(--surface-sunken)" stroke="var(--rule-strong)" /></svg>several credits in one year</span>
			{#if overlaySid}
				<span class="inline-flex items-center gap-1.5">
					<RoleMark role="director" size={10} variant="candidate" /><RoleMark role="seiyuu" size={10} variant="candidate" />
					<span class="italic">{overlayDisplayName} (unconfirmed)</span>
				</span>
			{/if}
		</div>
	{/snippet}

	{#snippet table()}
		{@render stintList()}
		{#if stints.length > 0}
			<!-- The table has no legend of its own: say what the rows are, and what a highlighted one is. -->
			<p class="border-t border-rule px-4 py-2 text-xs text-ink-3">
				Click a stint to list its VNs.
				{#if candidateStintCount > 0}
					<span class="italic">≟ rows belong to {overlayDisplayName} (unconfirmed).</span>
				{/if}
			</p>
		{/if}
	{/snippet}
</ChartCard>

{#snippet stintList()}
	{#if stints.length === 0}
		<p class="px-4 py-6 text-sm text-ink-3">No brand stints recorded for this person.</p>
	{:else}
		<div class="scroll-x">
			<table class="ledger">
				<caption class="sr-only">
					Stints of {personName} by brand, in order of first credit{candidateStintCount > 0
						? `, with ${candidateStintCount} stints of candidate ${overlayDisplayName}`
						: ''}
				</caption>
				<thead>
					<tr>
						<th scope="col">Brand</th>
						<th scope="col">Years</th>
						<th scope="col">Roles</th>
						<th scope="col" title={ALIAS_USED_HINT}><span class="term">Alias used</span></th>
						<th scope="col" class="num">VNs</th>
						<th scope="col" title="Prior studio & year gap"><span class="term">Arrived from</span></th>
					</tr>
				</thead>
				<tbody>
					{#each stints as s (s.key)}
						{@const stintCredits = creditsByStintKey.get(s.key) ?? []}
						{@const isExp = !!expandedStints[s.key]}
						<tr
							class="{s.candidate ? 'bg-inferred-tint/70 italic' : ''} {stintCredits.length > 0 ? 'cursor-pointer' : ''}"
							onclick={(e) => {
								if (stintCredits.length === 0 || (e.target as HTMLElement).closest('a, button')) return;
								expandedStints[s.key] = !isExp;
							}}
						>
							<td class="max-w-[18rem]">
								<span class="flex items-center gap-1.5">
									{#if stintCredits.length > 0}
										<button
											type="button"
											class="inline-flex size-5 shrink-0 items-center justify-center rounded-xs text-ink-3 hover:bg-surface-hover hover:text-ink"
											aria-expanded={isExp}
											aria-label="{isExp ? 'Collapse' : 'Expand'} titles for {s.name}"
											onclick={() => (expandedStints[s.key] = !isExp)}
										>
											<ChevronRight size={12} class="transition-transform duration-[150ms] {isExp ? 'rotate-90' : ''}" />
										</button>
									{/if}
									<NamePair name={s.name} original={s.original} href="/producer/{s.pid}" />
									{#if s.candidate}
										<span class="inline-flex shrink-0 items-center gap-1 rounded-xs border border-dashed border-inferred bg-surface px-1 text-2xs text-inferred not-italic" title="Candidate record (unconfirmed)">
											<EpistemicGlyph kind="alias-potential" size={10} />candidate
										</span>
									{/if}
								</span>
							</td>
							<td><YearSpan from={s.firstYear} to={s.lastYear} /></td>
							<td><RolePills roles={s.seiyuuVnCount > 0 && !s.roles.includes('seiyuu') ? [...s.roles, 'seiyuu'] : s.roles} /></td>
							<td>
								{#if s.penNames.length}
									<AliasChip aliases={s.penNames} bare />
								{:else if s.candidate && s.aliases.length}
									<AliasChip aliases={s.aliases} bare />
								{:else}
									<span class="text-ink-4">—</span>
								{/if}
							</td>
							<td class="num font-mono">
								{#if stintCredits.length > 0}
									<button
										type="button"
										class="tnum rounded-xs px-1 py-0.5 underline decoration-dotted decoration-rule-hover underline-offset-3 hover:bg-surface-hover hover:text-ink"
										aria-expanded={isExp}
										onclick={() => (expandedStints[s.key] = !isExp)}
									>
										{s.vnCount}
									</button>
								{:else}
									{s.vnCount}
								{/if}
							</td>
							<td class="text-xs text-ink-2">
								{#if s.arrivedFrom}
									{shownName(s.arrivedFrom.name, s.arrivedFrom.original)}
									<span class="font-mono text-2xs text-ink-3">
										{s.arrivedFrom.gapYears != null && s.arrivedFrom.gapYears <= 0 ? 'same year' : yearDelta(s.arrivedFrom.gapYears, 'plus')}
									</span>
									{#if s.arrivedFrom.aliasChanged}<span class="text-2xs text-ink" title="Name changed">⇄ name</span>{/if}
								{:else}
									<span class="text-ink-4">—</span>
								{/if}
							</td>
						</tr>
						{#if isExp && stintCredits.length > 0}
							<tr class={s.candidate ? 'bg-inferred-tint/60' : 'bg-surface-sunken/50'}>
								<td colspan="6" class="py-2! pl-9!">
									<ul class="divide-y divide-rule">
										{#each stintCredits as c (c.key)}
											{@const pens = c.isNonPrimaryAlias ? distinctPenNames(c.aliases) : []}
											{@const stintCharExp = !!expandedRowChars[`stint|${c.key}`]}
											{@const shownStintChars = stintCharExp ? c.characters : c.characters.slice(0, 3)}
											<li class="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-xs">
												<span class="tnum w-[4ch] shrink-0 font-mono text-2xs text-ink-3">{c.year ?? '—'}</span>
												{#if c.candidate}
													<span class="inline-flex items-center gap-1">
														{#each c.roles.slice(0, 4) as r (r)}
															<span class="inline-flex items-center gap-1 font-mono text-2xs text-ink-2">
																<RoleMark role={r} size={8} variant="candidate" />{roleMeta(r).code}
															</span>
														{/each}
													</span>
												{:else}
													<RolePills roles={c.roles} max={4} />
												{/if}
												<NamePair name={c.title} original={c.original} href="/vn/{c.vid}" variant="inline" class="text-sm not-italic" />
												{#if pens.length > 0}
													<AliasChip aliases={pens.map((a) => a.label)} bare />
												{/if}
												{#if c.characters.length > 0}
													<span class="inline-flex flex-wrap items-center gap-x-1 text-2xs text-ink-2 not-italic">
														<span class="text-ink-3">voicing</span>
														{#each shownStintChars as ch, ci (ch.cid)}{ci > 0 ? ', ' : ''}<a class="link-quiet" href={vndbHref(ch.cid)} target="_blank" rel="noopener noreferrer">{shownName(ch.name, ch.original)}</a>{/each}
														{#if c.characters.length > 3}
															<button
																type="button"
																class="tnum ml-1 inline-flex h-[18px] items-center rounded-xs border border-rule-strong bg-surface px-1.5 font-mono text-2xs text-ink-2 hover:border-rule-hover hover:text-ink"
																aria-expanded={stintCharExp}
																onclick={() => (expandedRowChars[`stint|${c.key}`] = !stintCharExp)}
															>
																{stintCharExp ? 'less' : `+${c.characters.length - 3}`}
															</button>
														{/if}
													</span>
												{/if}
												<RatingTag hasEro={c.hasEro} hasAllAges={c.hasAllAges} />
											</li>
										{/each}
									</ul>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/snippet}
