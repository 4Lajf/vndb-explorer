<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import Download from '@lucide/svelte/icons/download';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Minimize2 from '@lucide/svelte/icons/minimize-2';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import ChartCard from './ChartCard.svelte';
	import NamePair from '../identity/NamePair.svelte';
	import ProducerTypeBadge from '../identity/ProducerTypeBadge.svelte';
	import ProducerShape from '../identity/ProducerShape.svelte';
	import YearSpan from '../identity/YearSpan.svelte';
	import EpistemicBadge from '../epistemic/EpistemicBadge.svelte';
	import EpistemicGlyph from '../epistemic/EpistemicGlyph.svelte';
	import RelationBadge from '../epistemic/RelationBadge.svelte';
	import ConfidenceMeter from '../epistemic/ConfidenceMeter.svelte';
	import EvidenceList from '../epistemic/EvidenceList.svelte';
	import RoleMark from '../people/RoleMark.svelte';
	import StaffVnsButton from '../people/StaffVnsButton.svelte';
	import type {
		BrandGraphEdge,
		BrandGraphNode,
		InferredBrandLink
	} from '#lib/types.ts';
	import {
		CONFIDENCE_HINT,
		EXPLICIT_META,
		INFERRED_META,
		inferredDirectionHint,
		inferredLabel,
		inferredTitle,
		explicitTitle,
		KIND_COLOR,
		KIND_LABEL,
		KIND_MEANING,
		explicitForFocus,
		linkAgreement,
		SEIYUU_DRIVEN_MEANING,
		toScore,
		type RelationKind
	} from '#lib/relations.ts';
	import { CORE_STAFF_HINT } from '#lib/roles.ts';
	import { brandEvidence } from '#lib/evidence.ts';
	import { shownName, shownPairNames } from '#lib/stores/prefs.svelte.ts';
	import { compareHref, plural, vndbHref } from '#lib/util.ts';
	import {
		RIM_BOTTOM,
		RIM_TOP,
		defaultGraphFilters,
		edgeLabelWidth,
		filterEdges,
		layoutGraph,
		nearestNode,
		nodeShapePath,
		type GraphFilters,
		type PlacedEdge
	} from '#lib/viz/graph.ts';
	import { exportTimelineSubgraphPng } from '#lib/viz/export-png.ts';

	/**
	 * Brand relationship graph (DESIGN §6.2): a deterministic compass-sector ego
	 * graph. Ownership runs vertically, lineage horizontally. Solid edges are
	 * VNDB relations; dashed edges are inferred; dotted are seiyuu-driven.
	 * Nodes are monochrome: colour belongs to edges.
	 */
	interface Props {
		id?: string;
		focusId: string;
		focusName: string;
		nodes: BrandGraphNode[];
		edges: BrandGraphEdge[];
		/** Full inferred links for the focus, so an edge can show its evidence. */
		inferred: InferredBrandLink[];
		/** Page-level Seiyuu lens: seiyuu-driven edges exist only while it is on. */
		includeSeiyuu: boolean;
		onSeiyuuChange?: (next: boolean) => void;
		/** Every inferred relation of the focus, of which the graph draws the strongest. */
		inferredTotal?: number;
		pending?: boolean;
	}
	let {
		id = 'graph',
		focusId,
		focusName,
		nodes,
		edges,
		inferred,
		includeSeiyuu,
		onSeiyuuChange,
		inferredTotal,
		pending = false
	}: Props = $props();

	const uidBase = $props.id();
	const KINDS: RelationKind[] = ['ownership', 'sister', 'lineage', 'partner'];

	let view = $state<'chart' | 'table'>('chart');
	let fullscreen = $state(false);
	// Interactive pan & zoom state for both inline and fullscreen timeline views
	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let panning = $state(false);
	let panMoved = false;
	let panStart = { x: 0, y: 0, ox: 0, oy: 0 };
	let fsScrollEl = $state<HTMLDivElement | null>(null);
	const isViewportMoved = $derived(zoom !== 1 || panX !== 0 || panY !== 0);

	function resetViewport() {
		zoom = 1;
		panX = 0;
		panY = 0;
		fsScrollEl?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
	}

	function zoomStep(factor: number, cx?: number, cy?: number) {
		const next = Math.max(0.55, Math.min(3.5, zoom * factor));
		const ratio = next / zoom;
		const px = cx ?? layout.width / 2;
		const py = cy ?? layout.height / 2;
		panX = px - (px - panX) * ratio;
		panY = py - (py - panY) * ratio;
		zoom = next;
	}

	function onSvgWheel(e: WheelEvent) {
		if (!e.ctrlKey && !fullscreen && Math.abs(e.deltaY) < 1) return;
		e.preventDefault();
		const svg = e.currentTarget as SVGSVGElement;
		const rect = svg.getBoundingClientRect();
		const mx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * layout.width;
		const my = ((e.clientY - rect.top) / Math.max(1, rect.height)) * layout.height;
		zoomStep(e.deltaY < 0 ? 1.16 : 1 / 1.16, mx, my);
	}

	function onSvgPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		const target = e.target as Element | null;
		if (target && target.closest('[data-interactive]')) return;
		panning = true;
		panMoved = false;
		panStart = { x: e.clientX, y: e.clientY, ox: panX, oy: panY };
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
	}

	function onSvgPointerMove(e: PointerEvent) {
		if (!panning) return;
		const dx = e.clientX - panStart.x;
		const dy = e.clientY - panStart.y;
		if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panMoved = true;
		panX = panStart.ox + dx;
		panY = panStart.oy + dy;
	}

	function onSvgPointerUp(e: PointerEvent) {
		if (!panning) return;
		panning = false;
		if ((e.currentTarget as Element).hasPointerCapture(e.pointerId)) {
			(e.currentTarget as Element).releasePointerCapture(e.pointerId);
		}
		if (!panMoved) select(null);
	}

	// Opens on the readable links (confidence ≥ 45), or on all of them when none reach that.
	const openingFilters = $derived(defaultGraphFilters(edges));
	let filters = $state<GraphFilters>(untrack(() => defaultGraphFilters(edges)));
	let width = $state(880);
	let fsWidth = $state(1200);
	let hoverId = $state<string | null>(null);
	let hoverEdge = $state<string | null>(null);
	let selectedId = $state<string | null>(null);
	let selectedEdge = $state<string | null>(null);
	let dockEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		void focusId;
		void fullscreen;
		resetViewport();
	});

	const activeWidth = $derived(fullscreen ? Math.max(720, fsWidth) : Math.max(560, width));
	const minHeight = $derived(fullscreen ? 520 : Math.max(320, Math.min(420, Math.round(width * 0.42))));
	const layout = $derived(
		layoutGraph(focusId, nodes, edges, filters, activeWidth, minHeight, page.data.dumpYear ?? 0, shownName)
	);

	function exportPng() {
		const bandGroup: Record<string, number> = {
			owners: 0,
			lineage: 1,
			focus: 2,
			children: 3,
			sisters: 4,
			partners: 5
		};
		const exportNodes = layout.nodes
			.filter((n) => !n.overflow)
			.map((n) => ({
				id: n.id,
				label: shownName(n.name, n.original),
				type: n.type,
				firstYear: n.firstYear,
				lastYear: n.lastYear,
				vnCount: n.vnCount,
				isFocus: n.isFocus,
				group: bandGroup[n.band] ?? 4
			}));
		const exportEdges = layout.edges.map((e) => {
			const src = e.source;
			let directed = e.arrow !== null;
			let sId = focusId;
			let tId = e.otherId;
			if (e.register === 'confirmed' && src.relationCode) {
				if (!EXPLICIT_META[src.relationCode].targetIsHead) {
					sId = e.otherId;
					tId = focusId;
				}
			} else if (e.register === 'inferred') {
				const isSourceA = src.source === focusId;
				if (src.inferredType === 'subbrand') {
					const headIsFocus = (src.direction === 'b_to_a') !== isSourceA;
					if (headIsFocus) {
						sId = e.otherId;
						tId = focusId;
					}
				} else if (src.inferredType === 'successor') {
					const headIsFocus = (src.direction === 'b_to_a') === isSourceA;
					if (headIsFocus) {
						sId = e.otherId;
						tId = focusId;
					}
				}
			}
			return {
				source: sId,
				target: tId,
				register: e.register,
				kind: e.kind,
				code: e.code,
				directed,
				seiyuuDriven: e.seiyuuDriven
			};
		});
		exportTimelineSubgraphPng({
			title: `${focusShown} — Relationship Timeline`,
			subtitle: `${exportNodes.length} studios · ${shownExplicit} VNDB · ${shownInferred} inferred · ${layout.minYear}–${layout.maxYear}`,
			filenameBase: focusShown,
			nodes: exportNodes,
			edges: exportEdges,
			dumpYear: page.data.dumpYear ?? 2026
		});
	}
	const nodeById = $derived(new Map(layout.nodes.map((n) => [n.id, n])));
	const visibleEdges = $derived(filterEdges(edges, filters));
	const inferredByOther = $derived(
		new Map(inferred.map((l) => [l.pidA === focusId ? l.pidB : l.pidA, l]))
	);
	const selectedNode = $derived(selectedId ? (nodeById.get(selectedId) ?? null) : null);
	const selectedEdges = $derived(
		selectedId && selectedId !== focusId
			? layout.edges.filter((e) => e.otherId === selectedId)
			: []
	);
	const seiyuuDrivenCount = $derived(edges.filter((e) => e.seiyuuDriven).length);
	// Voice-cast-only links never rate above Speculative, so the opening floor of
	// 45 hides nearly all of them: the toolbar says so and offers the floor that
	// shows them, instead of a chip that is ticked and draws nothing.
	const castBelowFloor = $derived(
		includeSeiyuu && filters.inferred && filters.seiyuuDriven
			? edges.filter((e) => e.seiyuuDriven && toScore(e.confidence) < filters.minConfidence)
			: []
	);
	const castFloor = $derived(
		castBelowFloor.length
			? Math.floor(Math.min(...castBelowFloor.map((e) => toScore(e.confidence))) / 5) * 5
			: 0
	);
	const explicitCount = $derived(edges.filter((e) => e.kind !== 'inferred').length);
	const inferredCount = $derived(edges.filter((e) => e.kind === 'inferred').length);
	const inferredHidden = $derived(Math.max(0, (inferredTotal ?? inferredCount) - inferredCount));
	const shownExplicit = $derived(layout.edges.filter((e) => e.register === 'confirmed').length);
	const shownInferred = $derived(layout.edges.length - shownExplicit);
	const focusNode = $derived(nodeById.get(focusId) ?? null);
	// Names in sentences follow the reader's name order, like the node labels.
	const focusShown = $derived(shownName(focusName, focusNode?.original));
	function nodeShown(nodeId: string): string {
		const n = nodeById.get(nodeId);
		return n ? shownName(n.name, n.original) : nodeId;
	}
	// The Relationships list above is capped: beyond it, the full set is on Discover.
	const listCapped = $derived((inferredTotal ?? 0) > inferred.length);
	// By id, not by name: a short name like "Key" is a substring of many others.
	const allInferredHref = $derived(
		`/discover/brands?explicitStatus=all&producerType=all&minConfidence=0${includeSeiyuu ? '&includeSeiyuu=1' : ''}&q=${encodeURIComponent(focusId)}`
	);
	// The idle Inspector lists the strongest links on the canvas as a way in:
	// VNDB relations first, then inferred links by confidence.
	const quickPicks = $derived(
		[...layout.edges]
			.sort(
				(a, b) =>
					Number(a.register === 'inferred') - Number(b.register === 'inferred') ||
					(b.score ?? 0) - (a.score ?? 0) ||
					a.key.localeCompare(b.key)
			)
			.slice(0, 6)
	);

	// A new focus brand is a new graph: back to its own opening filters, nothing selected.
	let filtersFor = untrack(() => focusId);
	$effect(() => {
		const brand = focusId;
		untrack(() => {
			if (brand === filtersFor) return;
			filtersFor = brand;
			filters = defaultGraphFilters(edges);
			select(null);
		});
	});

	const description = $derived(
		`Neighbourhood of ${focusName}: ${layout.nodes.length - 1} related brands shown, ${layout.edges.filter((e) => e.register === 'confirmed').length} VNDB relations and ${layout.edges.filter((e) => e.register === 'inferred').length} inferred. The Table view lists the same relations.`
	);

	function select(nodeId: string | null, edgeKey: string | null = null) {
		selectedId = nodeId;
		selectedEdge = edgeKey;
		if (nodeId && nodeId !== focusId) {
			requestAnimationFrame(() => dockEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
		}
	}

	/** Back to the defaults, including the page lens this graph can switch on. */
	function reset() {
		filters = defaultGraphFilters(edges);
		select(null);
		if (includeSeiyuu) onSeiyuuChange?.(false);
	}
	const isDefault = $derived(
		!includeSeiyuu && JSON.stringify(filters) === JSON.stringify(openingFilters)
	);

	function onKeydown(e: KeyboardEvent) {
		const dirs: Record<string, 'left' | 'right' | 'up' | 'down'> = {
			ArrowLeft: 'left',
			ArrowRight: 'right',
			ArrowUp: 'up',
			ArrowDown: 'down'
		};
		const dir = dirs[e.key];
		if (dir) {
			e.preventDefault();
			const next = nearestNode(
				layout.nodes.filter((n) => !n.overflow),
				selectedId ?? focusId,
				dir
			);
			if (next) select(next.id);
			return;
		}
		if (e.key === 'Enter' && selectedId && selectedId !== focusId && !selectedId.startsWith('__')) {
			e.preventDefault();
			void goto(`/producer/${selectedId}`);
		} else if (e.key === 'Escape') {
			select(null);
		} else if ((e.key === 'e' || e.key === 'E') && selectedEdges.length) {
			const i = selectedEdges.findIndex((x) => x.key === selectedEdge);
			selectedEdge = selectedEdges[(i + 1) % selectedEdges.length].key;
		}
	}

	function dimmed(nodeId: string): boolean {
		if (hoverId && hoverId !== focusId) return nodeId !== hoverId && nodeId !== focusId;
		if (hoverEdge) {
			const e = layout.edges.find((x) => x.key === hoverEdge);
			return !!e && nodeId !== e.otherId && nodeId !== focusId;
		}
		return false;
	}
	function edgeDimmed(e: PlacedEdge): boolean {
		if (hoverId && hoverId !== focusId) return e.otherId !== hoverId;
		if (hoverEdge) return e.key !== hoverEdge;
		return false;
	}

	/** Hover for an edge's code or badge: the term, then what it means. */
	function edgeTitle(e: PlacedEdge): string {
		const src = e.source;
		if (e.register === 'confirmed') return src.relationCode ? explicitTitle(src.relationCode) : e.label;
		return inferredTitle(
			{ inferredType: src.inferredType ?? 'sister', coDevVns: src.coDevVns },
			{ seiyuuDriven: e.seiyuuDriven }
		);
	}

	function edgeRowEvidence(e: BrandGraphEdge): string {
		if (e.kind !== 'inferred') return 'Stated in VNDB';
		const link = inferredByOther.get(e.source === focusId ? e.target : e.source);
		if (!link) return '';
		return brandEvidence(link, focusId, 'focus', shownPairNames(link))
			.slice(0, 2)
			.map((x) => `${x.label}${x.value ? ` ${x.value}` : ''}`)
			.join(', ');
	}

	const tableRows = $derived(
		[...visibleEdges]
			.map((e) => {
				const otherId = e.source === focusId ? e.target : e.source;
				return { e, otherId, node: nodes.find((n) => n.id === otherId) };
			})
			.filter((r) => r.node)
			.sort(
				(a, b) =>
					(a.e.kind === 'inferred' ? 1 : 0) - (b.e.kind === 'inferred' ? 1 : 0) ||
					toScore(b.e.confidence) - toScore(a.e.confidence)
			)
	);
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && fullscreen) {
			e.preventDefault();
			fullscreen = false;
		}
	}}
/>

<!-- Reusable timeline SVG canvas for both inline card and fullscreen modal -->
{#snippet timelineSvg()}
	{#if layout.nodes.length <= 1}
		<p class="px-4 py-10 text-sm text-ink-3">
			{edges.length === 0
				? 'No explicit or inferred relations to draw for this brand.'
				: 'No relations match the current filters. Lower the confidence threshold or turn a source back on.'}
		</p>
	{:else}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			role="application"
			tabindex="0"
			class="relative focus-visible:outline-offset-[-2px]"
			aria-label="Relationship timeline. Arrow keys move between brands, E cycles relations, Enter opens the brand, Escape clears."
			aria-describedby="{uidBase}-desc"
			onkeydown={onKeydown}
			onfocus={() => (selectedId ??= focusId)}
		>
			{#if isViewportMoved}
				<button
					type="button"
					class="btn btn-sm absolute top-9 right-3 z-10 h-7 gap-1 bg-surface-raised/95 px-2.5 text-xs shadow-sm backdrop-blur-xs"
					title="Recenter & reset zoom"
					onclick={resetViewport}
				>
					<RotateCcw size={12} /> Recenter
				</button>
			{/if}
			<svg
				viewBox="0 0 {layout.width} {layout.height}"
				width="100%"
				height={layout.height}
				class="block touch-none select-none {panning ? 'cursor-grabbing' : 'cursor-grab'}"
				aria-hidden="true"
				onwheel={onSvgWheel}
				onpointerdown={onSvgPointerDown}
				onpointermove={onSvgPointerMove}
				onpointerup={onSvgPointerUp}
				onpointercancel={onSvgPointerUp}
			>
				<g transform="translate({panX.toFixed(1)},{panY.toFixed(1)}) scale({zoom.toFixed(3)})">
				<!-- Top Year → ruler band -->
				<rect x="0" y="0" width={layout.width} height={RIM_TOP} fill="var(--surface-sunken)" opacity="0.65" />
				<line x1="0" x2={layout.width} y1={RIM_TOP} y2={RIM_TOP} stroke="var(--rule)" stroke-width="1" />
				<text x="14" y="17" class="mono" font-size="10" font-weight="500" fill="var(--ink-3)">Year →</text>

				<!-- Vertical year gridlines & tick labels -->
				{#each layout.yearTicks as tick (tick.year)}
					<line
						x1={tick.x}
						x2={tick.x}
						y1={RIM_TOP}
						y2={layout.height - RIM_BOTTOM}
						stroke="var(--rule)"
						stroke-width="1"
						opacity={tick.major ? 0.55 : 0.25}
					/>
					<text
						x={tick.x}
						y="17"
						text-anchor="middle"
						class="mono"
						font-size="10"
						font-weight={tick.major ? 600 : 400}
						fill={tick.major ? 'var(--ink)' : 'var(--ink-3)'}
					>{tick.year}</text>
				{/each}

				<!-- Dedicated non-overlapping band headers & subtle section dividers -->
				{#each layout.bands as b, bi (b.kind)}
					{#if b.kind === 'focus'}
						<rect
							x="0"
							y={b.y0}
							width={layout.width}
							height={b.y1 - b.y0}
							fill="var(--confirmed)"
							opacity="0.06"
						/>
					{/if}
					{#if bi > 0}
						<line
							x1="0"
							x2={layout.width}
							y1={b.y0 - 4}
							y2={b.y0 - 4}
							stroke="var(--rule)"
							stroke-width="1"
							stroke-dasharray={b.kind === 'sisters' || b.kind === 'partners' ? '3 3' : undefined}
							opacity="0.75"
						/>
					{/if}
					{#if b.kind !== 'focus'}
						<text
							x="14"
							y={b.headerY}
							font-size="9.5"
							font-weight="600"
							class="mono"
							fill="var(--ink-3)"
							opacity="0.9"
						>{b.label}</text>
					{/if}
				{/each}

				<!-- Studio lifelines (horizontal active-year bars) -->
				{#each layout.nodes as n (n.id)}
					{#if !n.overflow}
						{@const isDim = dimmed(n.id)}
						<line
							x1={n.x}
							x2={Math.max(n.x + 8, n.endX)}
							y1={n.y}
							y2={n.y}
							stroke={n.isFocus ? 'var(--confirmed)' : 'var(--ink-3)'}
							stroke-width={n.isFocus ? 3 : 2}
							stroke-linecap="round"
							opacity={isDim ? 0.14 : n.isFocus ? 0.94 : n.inactive ? 0.35 : 0.55}
						/>
					{/if}
				{/each}

				<!-- Relationship edges -->
				{#each layout.edges as e (e.key)}
					{@const hot = hoverEdge === e.key || selectedEdge === e.key || hoverId === e.otherId || selectedId === e.otherId}
					{@const color = KIND_COLOR[e.kind]}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<g
						data-interactive="true"
						role="presentation"
						class="cursor-pointer"
						opacity={edgeDimmed(e) ? 0.14 : hot ? 1 : e.opacity}
						onmouseenter={() => (hoverEdge = e.key)}
						onmouseleave={() => (hoverEdge = null)}
						onclick={() => select(e.otherId, e.key)}
					>
						<path d={e.path} fill="none" stroke="transparent" stroke-width="12" />
						<path
							d={e.path}
							fill="none"
							stroke={color}
							stroke-width={e.width + (hot ? 1.1 : 0)}
							stroke-dasharray={e.dash ?? undefined}
							stroke-linecap={e.roundCap ? 'round' : 'butt'}
						/>
						{#if e.path2}
							<path d={e.path2} fill="none" stroke={color} stroke-width={e.width + (hot ? 1 : 0)} />
						{/if}
						<circle cx={e.anchor.x} cy={e.anchor.y} r={hot ? 3.4 : 2.8} fill={color} stroke="var(--canvas)" stroke-width="1.2" />
						{#if !e.arrow}
							<circle cx={e.targetAnchor.x} cy={e.targetAnchor.y} r={hot ? 3.4 : 2.8} fill={color} stroke="var(--canvas)" stroke-width="1.2" />
						{:else}
							<polygon points={e.arrow} fill={color} stroke="var(--canvas)" stroke-width="2" stroke-linejoin="round" paint-order="stroke" />
						{/if}
						{#if (!e.labelHidden && e.length >= 44) || hot}
							{@const w = edgeLabelWidth(e.code, e.seiyuuDriven)}
							<rect x={e.mid.x - w / 2} y={e.mid.y - 8} width={w} height="16" rx="4" fill="var(--surface)" stroke={color} stroke-width="1" stroke-dasharray={e.register === 'inferred' ? '3 2' : undefined} />
							<text x={e.mid.x - (e.seiyuuDriven ? 4.5 : 0)} y={e.mid.y + 3.5} text-anchor="middle" class="mono" font-size="10" font-weight="500" fill="var(--ink)">{e.code}</text>
							{#if e.seiyuuDriven}
								<circle cx={e.mid.x + w / 2 - 7} cy={e.mid.y} r="2.5" fill="var(--role-seiyuu)" />
							{/if}
						{/if}
					</g>
				{/each}

				<!-- Studio nodes & clean left-gutter labels -->
				{#each layout.nodes as n (n.id)}
					{@const isSel = selectedId === n.id}
					{@const hot = hoverId === n.id}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<g
						data-interactive="true"
						role="presentation"
						class="cursor-pointer"
						opacity={dimmed(n.id) ? 0.2 : 1}
						onmouseenter={() => (hoverId = n.id)}
						onmouseleave={() => (hoverId = null)}
						onclick={() => (n.overflow ? (view = 'table') : select(n.id))}
						ondblclick={() => {
							if (!n.overflow && !n.isFocus) void goto(`/producer/${n.id}`);
						}}
					>
						{#if !n.overflow}
							<text
								x={layout.leftGutter - (n.inferredScore != null ? 36 : 14)}
								y={n.y + 3.5}
								text-anchor="end"
								font-size={n.isFocus ? 12 : 11.5}
								font-weight={n.isFocus || isSel || hot ? 600 : 500}
								fill={n.isFocus || isSel ? 'var(--ink)' : n.inactive ? 'var(--ink-3)' : 'var(--ink-2)'}
							>{n.label}</text>
							{#if n.inferredScore != null}
								<text
									x={layout.leftGutter - 12}
									y={n.y + 3.5}
									text-anchor="end"
									class="mono"
									font-size="9.5"
									fill="var(--inferred)"
								>{n.inferredScore}</text>
							{/if}
						{/if}
						<g transform="translate({n.x.toFixed(1)},{n.y.toFixed(1)})">
							{#if isSel}
								<path d={nodeShapePath(n.type, n.r + 5)} fill="none" stroke="var(--focus)" stroke-width="2" />
							{/if}
							{#if n.isFocus}
								<path d={nodeShapePath(n.type, n.r + 3)} fill="none" stroke="var(--confirmed)" stroke-width="1.5" />
							{/if}
							<path
								d={nodeShapePath(n.type, n.r)}
								fill={n.overflow ? 'var(--surface-sunken)' : n.isFocus ? 'var(--confirmed)' : 'var(--surface)'}
								stroke={n.isFocus ? 'var(--ink)' : n.inactive ? 'var(--ink-3)' : 'var(--ink)'}
								stroke-width={hot || n.isFocus ? 2 : 1.5}
								stroke-dasharray={n.undated && !n.overflow && !n.isFocus ? '2 2' : undefined}
							/>
							{#if n.overflow}
								<text x="16" y="3.5" text-anchor="start" class="mono" font-size="10" fill="var(--ink-2)">{n.label} (see Table)</text>
							{/if}
						</g>
						<title>{n.overflow ? `${n.overflow} more in this band` : `${n.name}${n.original ? ` · ${n.original}` : ''}${n.firstYear ? ` (${n.firstYear}${n.lastYear && n.lastYear !== n.firstYear ? `–${n.lastYear}` : ''})` : ''}`}</title>
					</g>
				{/each}
				</g>
			</svg>
		</div>
		<p id="{uidBase}-desc" class="sr-only">{description}</p>
	{/if}
{/snippet}

<!-- On/off state of a filter chip: a tick when on, an empty box when off. -->
{#snippet tick(on: boolean)}
	<svg width="10" height="10" viewBox="0 0 10 10" class="shrink-0" aria-hidden="true">
		{#if on}
			<path d="M1.6 5.3 4 7.6 8.4 2.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
		{:else}
			<rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1" />
		{/if}
	</svg>
{/snippet}

{#snippet edgeDetail(e: PlacedEdge)}
	{@const src = e.source}
	<div class="border-t border-rule px-3 py-3 {selectedEdge === e.key ? 'bg-surface-sunken/60' : ''}">
		{#if e.register === 'confirmed' && src.relationCode}
			{@const meta = EXPLICIT_META[src.relationCode]}
			<div class="flex flex-wrap items-center gap-2">
				<EpistemicBadge register="confirmed" />
				<RelationBadge kind={meta.kind} register="confirmed" label={meta.label} arrow={meta.arrow} title={explicitTitle(src.relationCode)} />
			</div>
			<p class="mt-2 text-sm text-ink">
				{meta.sentence(nodeShown(e.otherId), focusShown)}
			</p>
			<p class="mt-1.5 text-xs">
				<a class="link inline-flex items-center gap-0.5" href={vndbHref(focusId)} target="_blank" rel="noopener noreferrer">
					Open on VNDB<ArrowUpRight size={10} />
				</a>
			</p>
		{:else}
			{@const link = inferredByOther.get(e.otherId)}
			<div class="flex flex-wrap items-center gap-2">
				<EpistemicBadge register="inferred" />
				<RelationBadge kind={e.kind} register="inferred" label={e.label} title={edgeTitle(e)} />
				<ConfidenceMeter score={e.score ?? 0} tier={link?.confidenceTier} showTier />
			</div>
			{#if link}
				{@const dir = inferredDirectionHint(link, shownPairNames(link))}
				{#if dir}
					<p class="mt-1.5 text-xs text-ink-2 italic">{dir}</p>
				{/if}
				{#if e.seiyuuDriven}
					<p class="mt-1 flex items-center gap-1.5 text-xs text-ink-2">
						<RoleMark role="seiyuu" size={8} /> Voice-cast overlap only.
					</p>
				{/if}
				{@const explicit = explicitForFocus(link, focusId)}
				{#if explicit}
					<p class="mt-1 flex items-start gap-1.5 text-xs text-ink-2">
						<EpistemicGlyph kind="confirmed" size={10} class="mt-0.5" />
						<span>
							VNDB: {EXPLICIT_META[explicit].sentence(nodeShown(e.otherId), focusShown)}
							{linkAgreement(link, focusId) === 'corroborates' ? 'The inference agrees.' : 'The inference differs.'}
						</span>
					</p>
				{/if}
				<EvidenceList
					items={brandEvidence(link, focusId, 'focus', shownPairNames(link), shownName)}
					max={3}
					notes={link.evidence}
					proof={{ kind: 'brand', pidA: focusId, pidB: e.otherId, nameA: focusShown, nameB: nodeShown(e.otherId) }}
					class="mt-2"
				/>
			{/if}
		{/if}
	</div>
{/snippet}

<ChartCard
	{id}
	title="Relationship timeline"
	bind:view
	chartLabel="Timeline"
	{pending}
	note="Click a brand or edge to inspect"
	narrowTable
>
	{#snippet controls()}
		{#if view === 'chart' && layout.nodes.length > 1}
			<div class="hidden overflow-hidden rounded-sm border border-rule-strong bg-control md:inline-flex" role="group" aria-label="Zoom timeline">
				<button type="button" class="inline-flex size-7 items-center justify-center text-ink-2 hover:bg-surface-hover hover:text-ink" title="Zoom out" onclick={() => zoomStep(1 / 1.25)}><Minus size={12} /></button>
				<span class="tnum inline-flex h-7 min-w-[4.2ch] items-center justify-center border-x border-rule-strong px-1 font-mono text-2xs text-ink-3">{Math.round(zoom * 100)}%</span>
				<button type="button" class="inline-flex size-7 items-center justify-center text-ink-2 hover:bg-surface-hover hover:text-ink" title="Zoom in" onclick={() => zoomStep(1.25)}><Plus size={12} /></button>
				<button
					type="button"
					class="inline-flex h-7 items-center gap-1 border-l border-rule-strong px-2 text-xs text-ink-2 hover:bg-surface-hover hover:text-ink disabled:opacity-45"
					title="Recenter view & reset zoom"
					disabled={!isViewportMoved}
					onclick={resetViewport}
				>
					<RotateCcw size={11} /> Recenter
				</button>
			</div>
			<button
				type="button"
				class="btn btn-sm h-7 px-2 text-xs"
				title="Download spaced-out timeline as PNG"
				onclick={exportPng}
			>
				<Download size={12} /> PNG
			</button>
			<button
				type="button"
				class="btn btn-sm h-7 px-2 text-xs"
				title="Expand relationship timeline to fullscreen"
				onclick={() => (fullscreen = true)}
			>
				<Maximize2 size={12} /> Fullscreen
			</button>
		{/if}
	{/snippet}

	{#snippet toolbar()}
		<!-- Filter row: above the canvas, never inside it. It filters the table view too. -->
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-4 py-2.5 text-xs">
			<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Show sources">
				<span class="mr-1 text-ink-3">Show</span>
				<label class="chip {filters.explicit ? 'on' : ''}">
					<input type="checkbox" class="sr-only" bind:checked={filters.explicit} />
					{@render tick(filters.explicit)}
					<EpistemicGlyph kind="confirmed" size={10} />VNDB explicit
					<span class="tnum font-mono text-ink-3">{filters.explicit && shownExplicit < explicitCount ? `${shownExplicit}/` : ''}{explicitCount}</span>
				</label>
				<label class="chip dashed {filters.inferred ? 'on' : ''}">
					<input type="checkbox" class="sr-only" bind:checked={filters.inferred} />
					{@render tick(filters.inferred)}
					<EpistemicGlyph kind="inferred" size={10} />Inferred
					<span class="tnum font-mono text-ink-3">{filters.inferred && shownInferred < inferredCount ? `${shownInferred}/` : ''}{inferredCount}</span>
				</label>
				{#if includeSeiyuu}
					<!-- The lens has loaded voice-cast links: this chip shows or hides them here. -->
					<label class="chip dotted {filters.seiyuuDriven ? 'on' : ''}" title="Voice-cast overlap only">
						<input type="checkbox" class="sr-only" bind:checked={filters.seiyuuDriven} />
						{@render tick(filters.seiyuuDriven)}
						<RoleMark role="seiyuu" size={8} />Voice-cast links
						<span class="tnum font-mono text-ink-3">{seiyuuDrivenCount}</span>
					</label>
				{:else}
					<!-- They are not loaded under the Core lens: the chip switches the lens on. -->
					<button
						type="button"
						class="chip dotted"
						title="Switch to + Seiyuu lens"
						onclick={() => {
							filters.seiyuuDriven = true;
							onSeiyuuChange?.(true);
						}}
					>
						{@render tick(false)}
						<RoleMark role="seiyuu" size={8} />Include voice-cast links
					</button>
				{/if}
			</div>
			<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Relation kinds">
				<span class="mr-1 text-ink-3">Kind</span>
				{#each KINDS as k (k)}
					<label class="chip {filters.kinds[k] ? 'on' : ''}" title={KIND_MEANING[k]}>
						<input type="checkbox" class="sr-only" bind:checked={filters.kinds[k]} />
						{@render tick(filters.kinds[k])}
						<span class="inline-block h-1 w-3.5 rounded-[1px]" style="background: {KIND_COLOR[k]}"></span>
						{KIND_LABEL[k]}
					</label>
				{/each}
			</div>
			<label class="flex items-center gap-2 text-ink-2">
				<span class="term text-ink-3" title={CONFIDENCE_HINT}>Min confidence</span>
				<input type="range" min="0" max="90" step="5" class="w-24 accent-(--inferred-mark)" bind:value={filters.minConfidence} />
				<span class="tnum w-[2ch] font-mono text-ink">{filters.minConfidence}</span>
			</label>
			{#if !isDefault}
				<button type="button" class="btn-ghost ml-auto text-xs" onclick={reset}>Reset</button>
			{/if}
			{#if castBelowFloor.length > 0}
				<p class="flex basis-full flex-wrap items-center gap-x-2 gap-y-1 text-ink-2">
					<RoleMark role="seiyuu" size={8} />
					<span>
						{castBelowFloor.length} voice-cast {castBelowFloor.length === 1 ? 'link is' : 'links are'} under the
						confidence floor of {filters.minConfidence}: a shared cast alone never rates above Speculative.
					</span>
					<button type="button" class="btn-ghost text-xs" onclick={() => (filters.minConfidence = castFloor)}>
						Lower the floor to {castFloor}
					</button>
				</p>
			{:else if includeSeiyuu && seiyuuDrivenCount === 0 && inferredHidden > 0}
				<p class="flex basis-full items-center gap-x-2 text-ink-3">
					<RoleMark role="seiyuu" size={8} />
					None of the {inferredCount} strongest links drawn here rests on a voice cast alone.
				</p>
			{/if}
		</div>
	{/snippet}

	{#snippet chart()}
		<div>
			<div class="relative min-w-0 max-h-[34rem] overflow-y-auto" bind:clientWidth={width}>
				{@render timelineSvg()}
			</div>

			<!-- Horizontal detail dock directly below the canvas (zero side panels) -->
			<div bind:this={dockEl} class="border-t border-rule bg-surface-sunken/40" aria-label="Selection details" aria-live="polite">
				{#if !selectedNode || selectedNode.overflow}
					<div class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-xs">
						<p class="text-ink-2">
							{#if layout.edges.length === 0}
								Nothing is drawn with the current filters.
							{:else}
								<span class="tnum font-mono text-ink">{shownExplicit}</span> VNDB
								{shownExplicit === 1 ? 'relation' : 'relations'} and
								<span class="tnum font-mono text-ink">{shownInferred}</span> inferred shown. Click any brand or line to inspect:
							{/if}
						</p>
						{#if quickPicks.length > 0}
							<div class="flex flex-wrap items-center gap-1.5">
								{#each quickPicks as e (e.key)}
									{@const node = nodeById.get(e.otherId)}
									<button
										type="button"
										class="inline-flex h-6 items-center gap-1.5 rounded-xs border border-rule-strong bg-surface px-2 text-xs text-ink hover:border-rule-hover hover:bg-surface-hover"
										onmouseenter={() => (hoverEdge = e.key)}
										onmouseleave={() => (hoverEdge = null)}
										onclick={() => select(e.otherId, e.key)}
									>
										<span
											class="inline-flex h-4 items-center rounded-xs border px-1 font-mono text-2xs font-medium {e.register === 'inferred' ? 'border-dashed' : ''}"
											style="border-color: {KIND_COLOR[e.kind]}"
											title={edgeTitle(e)}>{e.code}</span
										>
										<span class="max-w-[11rem] truncate" title={node?.original ? `${node.name} · ${node.original}` : undefined}>{nodeShown(e.otherId)}</span>
										{#if e.register === 'inferred'}
											<span class="tnum font-mono text-2xs text-ink-3">{e.score ?? 0}</span>
										{:else}
											<EpistemicGlyph kind="confirmed" size={9} label="Stated in VNDB" />
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{:else}
					<div class="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:divide-x md:divide-rule">
						<div class="px-4 py-3">
							<div class="flex items-start justify-between gap-2">
								<p class="text-md font-semibold text-ink">
									<NamePair name={selectedNode.name} original={selectedNode.original} variant="inline" />
								</p>
								<button type="button" class="btn-ghost h-6 shrink-0 px-2 text-xs" onclick={() => select(null)}>Clear</button>
							</div>
							<p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
								<ProducerTypeBadge type={selectedNode.type} />
								<YearSpan from={selectedNode.firstYear} to={selectedNode.lastYear} />
								{#if selectedNode.vnCount}
									<StaffVnsButton
										count={selectedNode.vnCount}
										label={plural(selectedNode.vnCount, 'VN')}
										title={shownName(selectedNode.name, selectedNode.original)}
										subtitle="Visual novels"
										endpoint="/api/proof/producer-vns?pid={encodeURIComponent(selectedNode.id)}&role=all"
										moreHref="/producer/{selectedNode.id}#games"
										moreLabel="Open studio's games →"
										align="left"
										class="text-xs text-ink-3"
									/>
								{/if}
								{#if selectedNode.staffCount}<span class="term" title={CORE_STAFF_HINT}>{plural(selectedNode.staffCount, 'core staff', 'core staff')}</span>{/if}
							</p>
							{#if selectedNode.isFocus}
								<p class="mt-2 text-sm text-ink-2">The focus brand. Every line on the canvas starts here.</p>
							{:else}
								<p class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
									<a class="link font-medium" href={compareHref(focusId, selectedNode.id)}>Compare with {focusShown} →</a>
									<a class="link" href="/producer/{selectedNode.id}">Open brand</a>
								</p>
							{/if}
						</div>
						<div class="divide-y divide-rule">
							{#each selectedEdges as e (e.key)}
								{@render edgeDetail(e)}
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/snippet}

	{#snippet legend()}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
			<span class="inline-flex items-center gap-1.5"><svg width="20" height="6" aria-hidden="true"><line x1="0" x2="20" y1="3" y2="3" stroke="var(--ink)" stroke-width="2" /></svg>VNDB</span>
			<span class="inline-flex items-center gap-1.5 italic"><svg width="20" height="6" aria-hidden="true"><line x1="0" x2="20" y1="3" y2="3" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="6 4" /></svg>Inferred</span>
			<span class="inline-flex items-center gap-1.5 italic" title={SEIYUU_DRIVEN_MEANING}><svg width="20" height="6" aria-hidden="true"><line x1="1" x2="20" y1="3" y2="3" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="1 4" stroke-linecap="round" /></svg>Seiyuu-driven</span>
			<span class="h-3 w-px bg-rule-strong" aria-hidden="true"></span>
			{#each KINDS as k (k)}
				<span class="inline-flex items-center gap-1.5" title={KIND_MEANING[k]}><span class="inline-block h-[3px] w-3.5 rounded-[1px]" style="background: {KIND_COLOR[k]}"></span>{KIND_LABEL[k]}</span>
			{/each}
			<span class="h-3 w-px bg-rule-strong" aria-hidden="true"></span>
			<span class="inline-flex items-center gap-1.5"><ProducerShape type="co" size={9} />Company</span>
			<span class="inline-flex items-center gap-1.5"><ProducerShape type="ng" size={9} />Amateur</span>
			<span class="inline-flex items-center gap-1.5"><ProducerShape type="in" size={9} />Individual</span>
			<span class="ml-auto flex items-center gap-3">
				<a class="link" href="/?focus={focusId}">View on Atlas →</a>
				<a class="link" href="/key#relations">Edge labels help →</a>
			</span>
		</div>
		{#if layout.hiddenCount > 0 || inferredHidden > 0}
			<p class="mt-2 text-xs text-ink-3">
				{#if layout.hiddenCount > 0}{layout.hiddenCount} more in the Table view. {/if}
				{#if inferredHidden > 0}
					Showing top {inferredCount} inferred relations of {inferredTotal}{#if shownInferred < inferredCount && filters.inferred} ({shownInferred} match filters){/if}.
					{#if listCapped}
						<a class="link" href={allInferredHref}>Browse all {inferredTotal} in Hidden brand links</a>.
					{:else}
						<a class="link" href="#relationships">See all {inferredTotal} in Relationships</a>.
					{/if}
				{/if}
			</p>
		{/if}
	{/snippet}

	{#snippet table()}
		{#if tableRows.length === 0}
			<p class="px-4 py-6 text-sm text-ink-3">
				{edges.length === 0
					? 'No explicit or inferred relations recorded for this brand.'
					: 'No relations match the current filters.'}
			</p>
		{:else}
			<div class="scroll-x">
				<table class="ledger">
					<caption class="sr-only">Relations of {focusName}: VNDB explicit first, then inferred by confidence</caption>
					<thead>
						<tr>
							<th scope="col">Brand</th>
							<th scope="col">Relation</th>
							<th scope="col" title={CONFIDENCE_HINT}><span class="term">Confidence</span></th>
							<th scope="col">Top evidence</th>
							<th scope="col"><span class="sr-only">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						{#each tableRows as r (r.e.kind + r.otherId + (r.e.relationCode ?? r.e.inferredType ?? ''))}
							{@const inf = r.e.kind === 'inferred'}
							<tr>
								<td class="max-w-[18rem]">
									<span class="flex items-center gap-2">
										<ProducerShape type={r.node!.type} size={10} />
										<NamePair name={r.node!.name} original={r.node!.original} href="/producer/{r.otherId}" />
									</span>
								</td>
								<td>
									{#if inf}
										{@const m = INFERRED_META[r.e.inferredType ?? 'sister']}
										{@const cls = { inferredType: r.e.inferredType ?? ('sister' as const), coDevVns: r.e.coDevVns }}
										<RelationBadge kind={m.kind} register="inferred" label={inferredLabel(cls)} dense title={inferredTitle(cls, { seiyuuDriven: r.e.seiyuuDriven })} />
									{:else if r.e.relationCode}
										{@const m = EXPLICIT_META[r.e.relationCode]}
										<RelationBadge kind={m.kind} register="confirmed" label={m.label} arrow={m.arrow} dense title={explicitTitle(r.e.relationCode)} />
									{/if}
								</td>
								<td>
									{#if inf}<ConfidenceMeter score={toScore(r.e.confidence)} tier={inferredByOther.get(r.otherId)?.confidenceTier} dense />{:else}<span class="text-ink-4">—</span>{/if}
								</td>
								<td class="text-xs text-ink-2">{edgeRowEvidence(r.e)}</td>
								<td class="text-right whitespace-nowrap"><a class="link text-xs" href={compareHref(focusId, r.otherId)}>Compare</a></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/snippet}
</ChartCard>

{#if fullscreen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-3 backdrop-blur-sm sm:p-5"
		role="dialog"
		aria-modal="true"
		aria-label="{focusShown} relationship timeline fullscreen"
	>
		<div class="flex h-full w-full flex-col overflow-hidden rounded-xl border border-rule-strong bg-surface shadow-2xl">
			<div class="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
				<div class="min-w-0">
					<h2 class="truncate text-sm font-semibold text-ink">{focusShown} — Relationship timeline</h2>
					<p class="text-2xs text-ink-3">
						{shownExplicit} VNDB · {shownInferred} inferred · {layout.minYear}–{layout.maxYear}
					</p>
				</div>
				<div class="flex items-center gap-2">
					<div class="inline-flex overflow-hidden rounded-sm border border-rule-strong bg-control" role="group" aria-label="Zoom fullscreen timeline">
						<button type="button" class="inline-flex size-7 items-center justify-center text-ink-2 hover:bg-surface-hover hover:text-ink" title="Zoom out" onclick={() => zoomStep(1 / 1.25)}><Minus size={12} /></button>
						<span class="tnum inline-flex h-7 min-w-[4.2ch] items-center justify-center border-x border-rule-strong px-1 font-mono text-2xs text-ink-3">{Math.round(zoom * 100)}%</span>
						<button type="button" class="inline-flex size-7 items-center justify-center text-ink-2 hover:bg-surface-hover hover:text-ink" title="Zoom in" onclick={() => zoomStep(1.25)}><Plus size={12} /></button>
						<button
							type="button"
							class="inline-flex h-7 items-center gap-1 border-l border-rule-strong px-2 text-xs text-ink-2 hover:bg-surface-hover hover:text-ink disabled:opacity-45"
							title="Recenter view & reset zoom"
							disabled={!isViewportMoved}
							onclick={resetViewport}
						>
							<RotateCcw size={11} /> Recenter
						</button>
					</div>
					<button type="button" class="btn btn-sm h-7 px-2.5 text-xs" onclick={exportPng}>
						<Download size={12} /> Save PNG
					</button>
					<button type="button" class="btn btn-sm h-7 px-2.5 text-xs" onclick={() => (fullscreen = false)}>
						<Minimize2 size={12} /> Close
					</button>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-4 py-2 text-xs">
				<div class="flex flex-wrap items-center gap-1.5">
					<span class="mr-1 text-ink-3">Show</span>
					<label class="chip {filters.explicit ? 'on' : ''}">
						<input type="checkbox" class="sr-only" bind:checked={filters.explicit} />
						{@render tick(filters.explicit)}
						<EpistemicGlyph kind="confirmed" size={10} />VNDB explicit
					</label>
					<label class="chip dashed {filters.inferred ? 'on' : ''}">
						<input type="checkbox" class="sr-only" bind:checked={filters.inferred} />
						{@render tick(filters.inferred)}
						<EpistemicGlyph kind="inferred" size={10} />Inferred
					</label>
				</div>
				<div class="flex flex-wrap items-center gap-1.5">
					<span class="mr-1 text-ink-3">Kind</span>
					{#each KINDS as k (k)}
						<label class="chip {filters.kinds[k] ? 'on' : ''}" title={KIND_MEANING[k]}>
							<input type="checkbox" class="sr-only" bind:checked={filters.kinds[k]} />
							{@render tick(filters.kinds[k])}
							<span class="inline-block h-1 w-3.5 rounded-[1px]" style="background: {KIND_COLOR[k]}"></span>
							{KIND_LABEL[k]}
						</label>
					{/each}
				</div>
				<label class="flex items-center gap-2 text-ink-2">
					<span class="term text-ink-3" title={CONFIDENCE_HINT}>Min confidence</span>
					<input type="range" min="0" max="90" step="5" class="w-24 accent-(--inferred-mark)" bind:value={filters.minConfidence} />
					<span class="tnum w-[2ch] font-mono text-ink">{filters.minConfidence}</span>
				</label>
			</div>
			<div bind:this={fsScrollEl} class="min-h-0 flex-1 overflow-auto bg-canvas/30" bind:clientWidth={fsWidth}>
				{@render timelineSvg()}
			</div>
			{#if selectedNode && !selectedNode.overflow}
				<div class="max-h-52 overflow-y-auto border-t border-rule bg-surface-sunken/40">
					<div class="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:divide-x md:divide-rule">
						<div class="px-4 py-2.5">
							<div class="flex items-start justify-between gap-2">
								<p class="text-sm font-semibold text-ink">
									<NamePair name={selectedNode.name} original={selectedNode.original} variant="inline" />
								</p>
								<button type="button" class="btn-ghost h-6 shrink-0 px-2 text-xs" onclick={() => select(null)}>Clear</button>
							</div>
							<p class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
								<ProducerTypeBadge type={selectedNode.type} />
								<YearSpan from={selectedNode.firstYear} to={selectedNode.lastYear} />
								{#if !selectedNode.isFocus}
									<a class="link font-medium" href={compareHref(focusId, selectedNode.id)}>Compare →</a>
									<a class="link" href="/producer/{selectedNode.id}">Open brand</a>
								{/if}
							</p>
						</div>
						<div class="divide-y divide-rule">
							{#each selectedEdges as e (e.key)}
								{@render edgeDetail(e)}
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 26px;
		padding: 0 8px;
		border-radius: 6px;
		border: 1px solid var(--rule-strong);
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
		white-space: nowrap;
		transition:
			background-color 120ms,
			color 120ms;
	}
	.chip.dashed {
		border-style: dashed;
	}
	.chip.dotted {
		border-style: dotted;
	}
	/* Off is the dimmed state: an empty box and tertiary text. */
	.chip:not(.on) {
		color: var(--ink-3);
	}
	.chip:not(.on) :global(svg),
	.chip:not(.on) span {
		opacity: 0.6;
	}
	.chip:hover {
		color: var(--ink);
		border-color: var(--rule-hover);
	}
	/* On is the quiet default: a tonal fill, a firmer border and a tick. A solid
	   inverse pill here would shout, and would sink the kind swatches below 3:1. */
	.chip.on {
		background: var(--control-hover);
		border-color: var(--rule-hover);
		color: var(--ink);
	}
	.chip:focus-within {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
</style>
