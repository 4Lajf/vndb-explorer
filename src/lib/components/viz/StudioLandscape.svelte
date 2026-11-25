<script module lang="ts">
	export interface AtlasExternalTarget {
		key: string;
		kind: 'none' | 'focus' | 'trace' | 'vn' | 'compare' | 'hidden';
		id?: string;
		secondId?: string | null;
		mode?: 'all' | 'explicit' | 'hidden';
	}
</script>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import Compass from '@lucide/svelte/icons/compass';
	import Crosshair from '@lucide/svelte/icons/crosshair';
	import Download from '@lucide/svelte/icons/download';
	import GitCompareArrows from '@lucide/svelte/icons/git-compare-arrows';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Menu from '@lucide/svelte/icons/menu';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import Route from '@lucide/svelte/icons/route';
	import Search from '@lucide/svelte/icons/search';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import X from '@lucide/svelte/icons/x';
	import BrandMark from '../shell/BrandMark.svelte';
	import NameOrderSwitch from '../shell/NameOrderSwitch.svelte';
	import ThemeSwitch from '../shell/ThemeSwitch.svelte';
	import EpistemicBadge from '../epistemic/EpistemicBadge.svelte';
	import EpistemicGlyph from '../epistemic/EpistemicGlyph.svelte';
	import RelationBadge from '../epistemic/RelationBadge.svelte';
	import ConfidenceMeter from '../epistemic/ConfidenceMeter.svelte';
	import EvidenceList from '../epistemic/EvidenceList.svelte';
	import NamePair from '../identity/NamePair.svelte';
	import ProducerShape from '../identity/ProducerShape.svelte';
	import ProducerTypeBadge from '../identity/ProducerTypeBadge.svelte';
	import YearSpan from '../identity/YearSpan.svelte';
	import RatingTag from '../identity/RatingTag.svelte';
	import DisciplineBadge from '../identity/DisciplineBadge.svelte';
	import RolePills from '../people/RolePills.svelte';
	import StaffVnsButton from '../people/StaffVnsButton.svelte';
	import SegmentedControl from '../controls/SegmentedControl.svelte';
	import {
		CONFIDENCE_HINT,
		EXPLICIT_META,
		INFERRED_META,
		KIND_COLOR,
		KIND_LABEL,
		KIND_MEANING,
		explicitTitle,
		inferredDirectionHint,
		inferredLabel,
		inferredTitle,
		invertExplicit,
		toScore,
		type RelationKind
	} from '#lib/relations.ts';
	import { CORE_STAFF_HINT } from '#lib/roles.ts';
	import { brandEvidence } from '#lib/evidence.ts';
	import { fetchProof } from '#lib/proof-cache.ts';
	import { prefs, shownName, shownPairNames } from '#lib/stores/prefs.svelte.ts';
	import { VN_RELATION_LABELS, compareHref, matchesText, num, plural, vndbHref } from '#lib/util.ts';
	import type {
		ExplicitRelationCode,
		InferredBrandLink,
		PotentialAliasCandidate,
		ProducerSummary,
		SearchResult,
		StaffBrandTrack,
		StaffDiscipline,
		StaffTimelineEvent
	} from '#lib/types.ts';
	import {
		FULL_DETAIL_SCALE,
		buildCareerTrail,
		buildLandscapeLayout,
		cubicAt,
		edgeBounds,
		edgeCurvePoints,
		edgeLabelPoint,
		pointToEdgeDist,
		traceEdge,
		type CareerTrail,
		type CareerTrailStop,
		type FamilySortOrder,
		type LandscapeInputEdge,
		type LandscapeInputNode,
		type PlacedLandscapeEdge,
		type PlacedLandscapeNode
	} from '#lib/viz/landscape.ts';
	import { exportCareerTrailPng, exportTimelineSubgraphPng } from '#lib/viz/export-png.ts';

	interface StaffApiPayload {
		staff: {
			id: string;
			name: string;
			original: string | null;
			lang: string | null;
			primaryDiscipline: StaffDiscipline;
			roles: string[];
			brandCount: number;
			vnCount: number;
			firstYear: number | null;
			lastYear: number | null;
			aliasCount: number;
		};
		potentialAliases: PotentialAliasCandidate[];
		brandTracks: StaffBrandTrack[];
		timelineEvents: StaffTimelineEvent[];
	}

	interface VnApiPayload {
		vn: {
			id: string;
			title: string;
			original: string | null;
			olang: string | null;
			firstYear: number | null;
			rating: number | null;
			votecount: number;
			hasEro: boolean;
			hasAllAges: boolean;
		};
		producers: Array<{
			pid: string;
			name: string;
			original: string | null;
			isOriginalDev: boolean;
			isPublisher: boolean;
		}>;
		relatedVns: Array<{
			vid: string;
			title: string;
			original: string | null;
			relation: string;
			official: boolean;
			firstYear: number | null;
			developers: Array<{ pid: string; name: string; original: string | null }>;
		}>;
	}

	interface CompareApiPayload {
		producerA: ProducerSummary;
		producerB: ProducerSummary;
		inferred: InferredBrandLink | null;
		/** Shortest chain of stated VNDB relations from A to B (null when no path exists in VNDB). */
		explicitPath: Array<{ id: string; name: string; original?: string | null; relationFromPrev?: ExplicitRelationCode }> | null;
		sharedTotals: { all: number; core: number; seiyuu: number; other: number; both: number };
	}

	interface VnSpotlightNode {
		vid: string;
		title: string;
		original: string | null;
		year: number;
		pid: string | null;
		studioName: string;
		relation: string | null;
		x: number;
		y: number;
		isFocus: boolean;
		virtual: boolean;
	}

	interface Props {
		nodes: LandscapeInputNode[];
		edges: LandscapeInputEdge[];
		dumpYear: number;
		dumpDate: string;
		initialFocus?: string | null;
		initialTrace?: string | null;
		initialCompareTrace?: string | null;
		initialVn?: string | null;
		initialCompare?: string | null;
		initialMode?: 'all' | 'explicit' | 'hidden';
		producerType: 'co' | 'all';
		lang: string;
		minConfidence: number;
		pending?: boolean;
		/** When true, a floating detail sheet sits above the Atlas (suppresses mini-card, URL writes & global keys). */
		backdropMode?: boolean;
		/** External route-driven spotlight to sync the live Atlas behind an open floating sheet. */
		externalTarget?: AtlasExternalTarget | null;
		/** Previous floating/fullscreen sheet URL to return to when closing an Atlas overlay. */
		returnSheetUrl?: string | null;
		onReturnToSheet?: () => void;
		onScopeChange: (patch: { producerType?: 'co' | 'all'; lang?: string; minConfidence?: number }) => void;
	}

	let {
		nodes,
		edges,
		dumpYear,
		dumpDate,
		initialFocus = null,
		initialTrace = null,
		initialCompareTrace = null,
		initialVn = null,
		initialCompare = null,
		initialMode = 'all',
		producerType,
		lang,
		minConfidence,
		pending = false,
		backdropMode = false,
		externalTarget = null,
		returnSheetUrl = null,
		onReturnToSheet,
		onScopeChange
	}: Props = $props();

	const KINDS: RelationKind[] = ['ownership', 'lineage', 'sister', 'partner'];
	const LANGS = [
		{ value: 'all', label: 'Any language' },
		{ value: 'ja', label: 'Japanese (ja)' },
		{ value: 'en', label: 'English (en)' },
		{ value: 'zh', label: 'Chinese (zh)' },
		{ value: 'ko', label: 'Korean (ko)' },
		{ value: 'ru', label: 'Russian (ru)' }
	];

	// ── Filter, Menu & Map Mode state ──
	let mode = $state<'all' | 'explicit' | 'hidden'>(untrack(() => initialMode));
	let kinds = $state<Record<RelationKind, boolean>>({
		ownership: true,
		lineage: true,
		sister: true,
		partner: true
	});
	let minClusterSize = $state<number>(2);
	let familySort = $state<FamilySortOrder>('prominence');
	let localConfidence = $state<number>(untrack(() => Math.round(minConfidence * 100)));
	let filtersOpen = $state(false);
	let menuOpen = $state(false);
	let jumpOpen = $state(false);
	$effect(() => {
		localConfidence = Math.round(minConfidence * 100);
	});

	const FAMILY_SORT_LABEL: Record<FamilySortOrder, string> = {
		prominence: 'prominent & linked first',
		size: 'largest families first',
		oldest: 'oldest families first',
		alpha: 'alphabetical A–Z'
	};

	const showExplicit = $derived(mode !== 'hidden');
	const showInferred = $derived(mode !== 'explicit');

	const confirmedPairs = $derived.by(() => {
		const set = new Set<string>();
		for (const e of edges) {
			if (e.register === 'confirmed') {
				set.add(`${e.source}|${e.target}`);
				set.add(`${e.target}|${e.source}`);
			}
		}
		return set;
	});

	const activeEdges = $derived(
		edges.filter((e) => {
			if (e.register === 'confirmed' && !showExplicit) return false;
			if (e.register === 'inferred') {
				if (!showInferred) return false;
				// Ground truth wins: never draw a conflicting inferred link over an explicit VNDB link.
				if (confirmedPairs.has(`${e.source}|${e.target}`)) return false;
				if (toScore(e.confidence) < localConfidence) return false;
			}
			if (!kinds[e.kind]) return false;
			return true;
		})
	);

	const layout = $derived(buildLandscapeLayout(nodes, activeEdges, { minClusterSize, dumpYear, familySort }));

	const hasCustomFilters = $derived(
		producerType !== 'co' ||
			lang !== 'all' ||
			minClusterSize !== 2 ||
			familySort !== 'prominence' ||
			localConfidence !== 55 ||
			!KINDS.every((k) => kinds[k])
	);

	const hiddenQueue = $derived(
		layout.edges
			.filter((e) => e.register === 'inferred')
			.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || (b.sharedCoreStaff ?? 0) - (a.sharedCoreStaff ?? 0))
	);
	let hiddenIndex = $state(0);

	// ── Selection & Active Overlay Modes ──
	let selectedNodeId = $state<string | null>(null);
	let selectedEdgeId = $state<string | null>(null);
	/** When stepping from studio A → B via the inspector, keep A framed & highlighted for spatial orientation. */
	let steppedFromNodeId = $state<string | null>(null);
	let steppedEdgeId = $state<string | null>(null);
	let hoveredNodeId = $state<string | null>(null);
	let hoveredEdgeId = $state<string | null>(null);
	let hoveredStopKey = $state<string | null>(null);
	let hoveredAliasSegIdx = $state<number | null>(null);
	let pointerScreenPos = $state<{ x: number; y: number } | null>(null);

	interface UnmappedFocusState {
		id: string;
		loading: boolean;
		error: string | null;
		producer: ProducerSummary | null;
		explicitCount: number;
		inferredCount: number;
		maxInferredConfidence: number | null;
	}
	let unmappedFocus = $state<UnmappedFocusState | null>(null);

	let traceSid = $state<string | null>(null);
	let traceLoading = $state(false);
	let traceError = $state<string | null>(null);
	let traceData = $state<StaffApiPayload | null>(null);
	let activeStopIdx = $state<number>(0);
	let expandedStopChars = $state(false);
	$effect(() => {
		void activeStopIdx;
		void traceSid;
		expandedStopChars = false;
	});

	let compareTraceSid = $state<string | null>(null);
	let compareTraceLoading = $state(false);
	let compareTraceData = $state<StaffApiPayload | null>(null);
	/** When overlaying an unconfirmed potential alias, allow viewing both or isolating the inferred alias alone. */
	let trailAliasFilter = $state<'both' | 'inferred'>('both');
	/** On dense careers (>30 stops), hide crisscrossing all-stop lines by default and show only the active step's arrows. */
	let showAllTrailLines = $state(false);
	$effect(() => {
		if (!compareTraceSid) trailAliasFilter = 'both';
	});
	$effect(() => {
		void traceSid;
		showAllTrailLines = false;
	});

	/** When enabled on a focused studio, extend highlight & stepping across chained outgoing links (A → B → C). */
	let chainOutgoing = $state(false);
	let chainStepIdx = $state(0);
	$effect(() => {
		void selectedNodeId;
		void chainOutgoing;
		chainStepIdx = 0;
	});

	let spotlightVnId = $state<string | null>(null);
	let spotlightVnLoading = $state(false);
	let spotlightVnError = $state<string | null>(null);
	let spotlightVnData = $state<VnApiPayload | null>(null);

	let comparePair = $state<{ a: string; b: string } | null>(null);
	let compareLoading = $state(false);
	let compareError = $state<string | null>(null);
	let compareData = $state<CompareApiPayload | null>(null);

	let edgeProofLoading = $state(false);
	let edgeProofLink = $state<InferredBrandLink | null>(null);
	let edgeProofPairKey = $state<string | null>(null);

	const primaryTrail = $derived<CareerTrail | null>(
		traceData
			? buildCareerTrail(traceData.staff, traceData.timelineEvents, traceData.brandTracks, layout, 0)
			: null
	);
	const secondaryTrail = $derived<CareerTrail | null>(
		compareTraceData
			? buildCareerTrail(compareTraceData.staff, compareTraceData.timelineEvents, compareTraceData.brandTracks, layout, 32)
			: null
	);
	const showingInferredOnly = $derived(!!secondaryTrail && trailAliasFilter === 'inferred');
	const activeTrail = $derived<CareerTrail | null>(showingInferredOnly ? secondaryTrail : primaryTrail);
	const isDenseTrail = $derived((activeTrail?.stops.length ?? 0) > 30);
	const activeStop = $derived<CareerTrailStop | null>(
		activeTrail && activeTrail.stops.length > 0
			? activeTrail.stops[Math.min(activeStopIdx, activeTrail.stops.length - 1)]
			: null
	);
	const activeStopAliasSwitch = $derived.by<{ from: string; to: string } | null>(() => {
		if (!activeTrail || !activeStop || activeStop.index === 0) return null;
		const prev = activeTrail.stops[activeStop.index - 1];
		if (!prev || !prev.aliasUsed || !activeStop.aliasUsed) return null;
		if (prev.aliasUsed.toLowerCase() === activeStop.aliasUsed.toLowerCase()) return null;
		return { from: prev.aliasUsed, to: activeStop.aliasUsed };
	});

	const vnSpotlight = $derived.by<{ focus: VnSpotlightNode; related: VnSpotlightNode[] } | null>(() => {
		if (!spotlightVnData) return null;
		const v = spotlightVnData.vn;
		const devs = spotlightVnData.producers.filter((p) => p.isOriginalDev);
		const primaryDev = devs[0] ?? spotlightVnData.producers[0] ?? null;
		const devNode = primaryDev ? layout.nodeById.get(primaryDev.pid) : undefined;
		const focusYear = v.firstYear ?? dumpYear;
		const focusY = devNode ? devNode.y : (layout.bounds.minY + layout.bounds.maxY) / 2;
		const focus: VnSpotlightNode = {
			vid: v.id,
			title: v.title,
			original: v.original,
			year: focusYear,
			pid: primaryDev?.pid ?? null,
			studioName: primaryDev ? shownName(primaryDev.name, primaryDev.original) : 'Unlisted studio',
			relation: null,
			x: layout.yearToX(focusYear),
			y: focusY,
			isFocus: true,
			virtual: !devNode
		};
		const related: VnSpotlightNode[] = [];
		let vSlot = 0;
		const yearBuckets = new Map<string, number>();
		for (const r of spotlightVnData.relatedVns) {
			if (r.firstYear == null) continue;
			const rDev = r.developers[0] ?? null;
			const rNode = rDev ? layout.nodeById.get(rDev.pid) : undefined;
			let ry: number;
			if (rNode && Math.abs(rNode.y - focusY) <= layout.rowStep * 30) {
				ry = rNode.y;
			} else {
				vSlot++;
				ry = focusY + (vSlot % 2 === 1 ? -1 : 1) * Math.ceil(vSlot / 2) * layout.rowStep * 3;
			}
			const bk = `${rDev?.pid ?? 'none'}|${r.firstYear}`;
			const idx = yearBuckets.get(bk) ?? 0;
			yearBuckets.set(bk, idx + 1);
			const yOff = idx > 0 ? (idx % 2 === 1 ? -1 : 1) * Math.ceil(idx / 2) * 32 : 0;
			related.push({
				vid: r.vid,
				title: r.title,
				original: r.original,
				year: r.firstYear,
				pid: rDev?.pid ?? null,
				studioName: rDev ? shownName(rDev.name, rDev.original) : 'Unlisted studio',
				relation: r.relation,
				x: layout.yearToX(r.firstYear),
				y: ry + yOff,
				isFocus: false,
				virtual: !rNode || ry !== rNode.y
			});
		}
		return { focus, related };
	});

	const hasActiveOverlay = $derived(!!primaryTrail || !!vnSpotlight || !!compareData);
	const selectedNode = $derived(selectedNodeId ? (layout.nodeById.get(selectedNodeId) ?? null) : null);
	const steppedFromNode = $derived(steppedFromNodeId ? (layout.nodeById.get(steppedFromNodeId) ?? null) : null);
	const selectedEdge = $derived(selectedEdgeId ? (layout.edges.find((e) => e.id === selectedEdgeId) ?? null) : null);
	const hoveredNode = $derived(hoveredNodeId ? (layout.nodeById.get(hoveredNodeId) ?? null) : null);

	const selectedNodeAdj = $derived.by(() => {
		if (!selectedNode) {
			return {
				explicit: [] as Array<{ edge: PlacedLandscapeEdge; other: PlacedLandscapeNode }>,
				inferred: [] as Array<{ edge: PlacedLandscapeEdge; other: PlacedLandscapeNode }>
			};
		}
		const list = layout.adj.get(selectedNode.id) ?? [];
		const explicit: Array<{ edge: PlacedLandscapeEdge; other: PlacedLandscapeNode }> = [];
		const inferred: Array<{ edge: PlacedLandscapeEdge; other: PlacedLandscapeNode }> = [];
		for (const e of list) {
			const other = e.source === selectedNode.id ? e.targetNode : e.sourceNode;
			if (e.register === 'confirmed') explicit.push({ edge: e, other });
			else inferred.push({ edge: e, other });
		}
		explicit.sort((a, b) => a.other.plotYear - b.other.plotYear || b.other.vnCount - a.other.vnCount);
		inferred.sort((a, b) => (b.edge.confidence ?? 0) - (a.edge.confidence ?? 0));
		return { explicit, inferred };
	});

	/** Multi-hop outgoing link chain from the focused studio when `chainOutgoing` is checked. */
	const outgoingChain = $derived.by(() => {
		const nodeIds = new Set<string>();
		const edgeIds = new Set<string>();
		const steps: Array<{ from: PlacedLandscapeNode; to: PlacedLandscapeNode; edge: PlacedLandscapeEdge; depth: number }> = [];
		if (!chainOutgoing || !selectedNode || hasActiveOverlay) return { nodeIds, edgeIds, steps };

		const maxDepth = 4;
		const maxNodes = 24;
		nodeIds.add(selectedNode.id);
		const queue: Array<{ id: string; depth: number }> = [{ id: selectedNode.id, depth: 0 }];

		while (queue.length > 0 && nodeIds.size < maxNodes) {
			const { id, depth } = queue.shift()!;
			if (depth >= maxDepth) continue;
			const curNode = layout.nodeById.get(id);
			if (!curNode) continue;
			const adjEdges = [...(layout.adj.get(id) ?? [])].sort(
				(a, b) =>
					Number(b.directed && b.source === id) - Number(a.directed && a.source === id) ||
					(b.confidence ?? 1) - (a.confidence ?? 1)
			);
			for (const e of adjEdges) {
				// Follow directed outgoing edges (`e.source === id`), or undirected edges when in hidden mode / beyond depth 0.
				const isOutgoing = e.directed ? e.source === id : depth === 0 || mode === 'hidden';
				if (!isOutgoing) continue;
				const nextNode = e.source === id ? e.targetNode : e.sourceNode;
				if (nodeIds.has(nextNode.id)) continue;
				if (nodeIds.size >= maxNodes) break;
				nodeIds.add(nextNode.id);
				edgeIds.add(e.id);
				steps.push({ from: curNode, to: nextNode, edge: e, depth: depth + 1 });
				queue.push({ id: nextNode.id, depth: depth + 1 });
			}
		}
		return { nodeIds, edgeIds, steps };
	});

	const activeChainStep = $derived(
		chainOutgoing && outgoingChain.steps.length > 0
			? outgoingChain.steps[Math.min(chainStepIdx, outgoingChain.steps.length - 1)]
			: null
	);

	function jumpToChainStep(idx: number) {
		if (outgoingChain.steps.length === 0) return;
		const clamped = (idx + outgoingChain.steps.length) % outgoingChain.steps.length;
		chainStepIdx = clamped;
		const step = outgoingChain.steps[clamped];
		fitStudioPair(step.from, step.to);
	}

	$effect(() => {
		if (chainOutgoing && outgoingChain.steps.length > 0) {
			const step = outgoingChain.steps[0];
			untrack(() => fitStudioPair(step.from, step.to));
		}
	});

	/** Export helpers for crisp spaced-out 2× PNGs of whatever is currently focused. */
	function exportFocusedStudioPng() {
		if (!selectedNode) return;
		const includeIds = new Set<string>([selectedNode.id]);
		const includedEdges: PlacedLandscapeEdge[] = [];
		const seenEdge = new Set<string>();
		for (const e of layout.adj.get(selectedNode.id) ?? []) {
			includeIds.add(e.source);
			includeIds.add(e.target);
			if (!seenEdge.has(e.id)) {
				seenEdge.add(e.id);
				includedEdges.push(e);
			}
		}
		if (chainOutgoing) {
			for (const id of outgoingChain.nodeIds) includeIds.add(id);
			for (const st of outgoingChain.steps) {
				if (!seenEdge.has(st.edge.id)) {
					seenEdge.add(st.edge.id);
					includedEdges.push(st.edge);
				}
			}
		}
		const groupOf = (id: string): number => {
			if (id === selectedNode.id) return 2;
			for (const e of includedEdges) {
				if (e.source === id && e.target === selectedNode.id && e.kind === 'ownership') return 0;
			}
			for (const e of includedEdges) {
				if (e.source === id && e.target === selectedNode.id && e.kind === 'lineage') return 1;
			}
			for (const e of includedEdges) {
				if (e.source === selectedNode.id && e.target === id && e.kind === 'ownership') return 3;
			}
			for (const e of includedEdges) {
				if (e.source === selectedNode.id && e.target === id && e.kind === 'lineage') return 4;
			}
			return 5;
		};
		const exportNodes = [...includeIds]
			.map((id) => layout.nodeById.get(id))
			.filter((n): n is PlacedLandscapeNode => !!n)
			.map((n) => ({
				id: n.id,
				label: shownName(n.name, n.original),
				type: n.type,
				firstYear: n.firstYear,
				lastYear: n.lastYear,
				vnCount: n.vnCount,
				isFocus: n.id === selectedNode.id,
				group: groupOf(n.id)
			}));
		const inferredEdgesCount = includedEdges.filter((e) => e.register === 'inferred').length;
		exportTimelineSubgraphPng({
			title: `${shownName(selectedNode.name, selectedNode.original)}${chainOutgoing ? ' — Link Chain' : ' — Studio Connections'}`,
			subtitle: `${exportNodes.length} studios · ${includedEdges.length} links${inferredEdgesCount > 0 ? ` · min confidence ${Math.round(minConfidence * 100)}` : ''}`,
			filenameBase: shownName(selectedNode.name, selectedNode.original),
			nodes: exportNodes,
			edges: includedEdges.map((e) => ({
				source: e.source,
				target: e.target,
				register: e.register,
				kind: e.kind,
				code: e.code,
				directed: e.directed,
				seiyuuDriven: e.seiyuuDriven,
				confidence: e.register === 'inferred' && e.confidence != null ? Math.round(e.confidence * 100) : null
			})),
			dumpYear
		});
	}

	function exportFocusedTrailPng() {
		if (!primaryTrail || !traceData) return;
		const sub =
			showingInferredOnly && secondaryTrail
				? `${secondaryTrail.stops.length} dated VNs across ${secondaryTrail.lanes.length} studios (potential alias of ${primaryTrail.name})`
				: `${primaryTrail.stops.length} dated VNs across ${primaryTrail.lanes.length} studios (${traceData.staff.firstYear ?? '?'}–${traceData.staff.lastYear ?? '?'})`;
		exportCareerTrailPng({
			primary: primaryTrail,
			secondary: secondaryTrail,
			onlySecondary: showingInferredOnly,
			subtitle: sub
		});
	}

	function exportFocusedComparePng() {
		const cmp = compareData;
		if (!cmp) return;
		const ids = new Set<string>([cmp.producerA.id, cmp.producerB.id]);
		for (const s of cmp.explicitPath ?? []) ids.add(s.id);
		const exportNodes = [...ids].map((id, i) => {
			const nd = layout.nodeById.get(id);
			const p = id === cmp.producerA.id ? cmp.producerA : id === cmp.producerB.id ? cmp.producerB : null;
			return {
				id,
				label: nd ? shownName(nd.name, nd.original) : p ? shownName(p.name, p.original ?? null) : id,
				type: nd?.type ?? p?.type ?? ('co' as const),
				firstYear: nd?.firstYear ?? p?.firstYear ?? null,
				lastYear: nd?.lastYear ?? p?.lastYear ?? null,
				vnCount: nd?.vnCount ?? p?.vnCount ?? 0,
				isFocus: id === cmp.producerA.id || id === cmp.producerB.id,
				group: i
			};
		});
		const exportEdges: Array<{
			source: string;
			target: string;
			register: 'confirmed' | 'inferred';
			kind: RelationKind;
			code: string;
			directed: boolean;
			confidence?: number | null;
		}> = [];
		const expPath = cmp.explicitPath ?? [];
		for (let i = 1; i < expPath.length; i++) {
			const prev = expPath[i - 1];
			const cur = expPath[i];
			const meta = cur.relationFromPrev ? EXPLICIT_META[cur.relationFromPrev] : null;
			exportEdges.push({
				source: prev.id,
				target: cur.id,
				register: 'confirmed',
				kind: meta?.kind ?? 'ownership',
				code: meta?.code ?? 'VNDB',
				directed: true
			});
		}
		if (cmp.inferred && expPath.length !== 2) {
			const meta = INFERRED_META[cmp.inferred.inferredType];
			exportEdges.push({
				source: cmp.producerA.id,
				target: cmp.producerB.id,
				register: 'inferred',
				kind: meta.kind,
				code: meta.code,
				directed: false,
				confidence: Math.round(cmp.inferred.confidence * 100)
			});
		}
		const nameA = shownName(cmp.producerA.name, cmp.producerA.original ?? null);
		const nameB = shownName(cmp.producerB.name, cmp.producerB.original ?? null);
		const cmpConfSub = cmp.inferred ? ` · inferred confidence ${Math.round(cmp.inferred.confidence * 100)}` : '';
		exportTimelineSubgraphPng({
			title: `${nameA} vs ${nameB}`,
			subtitle: `${cmp.sharedTotals.core} shared core staff · ${cmp.sharedTotals.seiyuu} shared seiyuu${cmpConfSub}`,
			filenameBase: `${nameA}-vs-${nameB}`,
			nodes: exportNodes,
			edges: exportEdges,
			dumpYear
		});
	}

	function exportFocusedVnPng() {
		if (!vnSpotlight || !spotlightVnData) return;
		const f = vnSpotlight.focus;
		const exportNodes = [f, ...vnSpotlight.related].map((pt, i) => ({
			id: pt.vid,
			label: `${shownName(pt.title, pt.original)} (${pt.studioName})`,
			type: 'co' as const,
			firstYear: pt.year,
			lastYear: pt.year,
			vnCount: 0,
			isFocus: pt.isFocus,
			group: pt.isFocus ? 0 : i + 1
		}));
		const exportEdges = vnSpotlight.related.map((r) => ({
			source: f.vid,
			target: r.vid,
			register: 'confirmed' as const,
			kind: (r.pid !== f.pid ? 'lineage' : 'ownership') as RelationKind,
			code: VN_RELATION_LABELS[r.relation ?? ''] ?? r.relation ?? 'Related',
			directed: true
		}));
		exportTimelineSubgraphPng({
			title: `${shownName(f.title, f.original)} — Series Timeline`,
			subtitle: `${exportNodes.length} dated titles across studios`,
			filenameBase: shownName(f.title, f.original),
			nodes: exportNodes,
			edges: exportEdges,
			dumpYear
		});
	}

	$effect(() => {
		const edge = selectedEdge;
		if (!edge || edge.register !== 'inferred') {
			edgeProofLink = null;
			edgeProofPairKey = null;
			edgeProofLoading = false;
			return;
		}
		const key = `${edge.source}|${edge.target}`;
		if (edgeProofPairKey === key) return;
		edgeProofPairKey = key;
		edgeProofLink = null;
		edgeProofLoading = true;
		void fetchProof<CompareApiPayload>(
			`/api/compare?a=${encodeURIComponent(edge.source)}&b=${encodeURIComponent(edge.target)}`
		)
			.then((res) => {
				if (edgeProofPairKey !== key) return;
				edgeProofLink = res.inferred;
			})
			.catch(() => {
				if (edgeProofPairKey !== key) return;
				edgeProofLink = null;
			})
			.finally(() => {
				if (edgeProofPairKey === key) edgeProofLoading = false;
			});
	});

	// ── Unified Google Maps Search ──
	let searchQuery = $state('');
	let searchFocused = $state(false);
	let searchActiveIdx = $state(0);
	let searchInputEl = $state<HTMLInputElement | null>(null);
	let remoteResults = $state<SearchResult[]>([]);
	let remoteLoading = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	const compareQueryMatch = $derived.by(() => {
		const m = searchQuery.trim().match(/^(p\d+)\s+(?:vs|and|-)\s+(p\d+)$/i);
		if (!m || m[1].toLowerCase() === m[2].toLowerCase()) return null;
		return { a: m[1].toLowerCase(), b: m[2].toLowerCase() };
	});

	const localStudioHits = $derived.by(() => {
		const q = searchQuery.trim();
		if (!q || compareQueryMatch) return [];
		const out: PlacedLandscapeNode[] = [];
		for (const nd of layout.nodes) {
			if (matchesText(q, nd.name, nd.original, nd.id)) {
				out.push(nd);
				if (out.length >= 6) break;
			}
		}
		return out;
	});

	$effect(() => {
		const q = searchQuery.trim();
		if (searchTimer) clearTimeout(searchTimer);
		if (q.length < 2 || compareQueryMatch) {
			remoteResults = [];
			remoteLoading = false;
			return;
		}
		remoteLoading = true;
		searchTimer = setTimeout(() => {
			void fetch(`/api/search?q=${encodeURIComponent(q)}&limit=12`)
				.then((r) => (r.ok ? r.json() : { results: [] }))
				.then((d: { results?: SearchResult[] }) => {
					if (searchQuery.trim() === q) remoteResults = d.results ?? [];
				})
				.catch(() => {
					if (searchQuery.trim() === q) remoteResults = [];
				})
				.finally(() => {
					if (searchQuery.trim() === q) remoteLoading = false;
				});
		}, 160);
		return () => {
			if (searchTimer) clearTimeout(searchTimer);
		};
	});

	const searchStaffHits = $derived(remoteResults.filter((r) => r.kind === 'staff').slice(0, 6));
	const searchVnHits = $derived(remoteResults.filter((r) => r.kind === 'vn').slice(0, 5));
	const searchRemoteStudios = $derived.by(() => {
		const localIds = new Set(localStudioHits.map((n) => n.id));
		return remoteResults.filter((r) => r.kind === 'producer' && !localIds.has(r.id)).slice(0, 4);
	});

	interface SearchNavItem {
		key: string;
		run: () => void;
	}
	const searchNavItems = $derived.by<SearchNavItem[]>(() => {
		if (!searchQuery.trim()) {
			return [
				{ key: 'demo-maeda', run: () => void startCareerTrail('s224') },
				{ key: 'demo-compare', run: () => void startCompareSpotlight('p24', 'p49') },
				{ key: 'demo-clannad', run: () => void startVnSpotlight('v4') }
			];
		}
		const items: SearchNavItem[] = [];
		if (compareQueryMatch) {
			const m = compareQueryMatch;
			items.push({ key: `cmp:${m.a}-${m.b}`, run: () => void startCompareSpotlight(m.a, m.b) });
		}
		for (const hit of localStudioHits) {
			items.push({ key: `local:${hit.id}`, run: () => selectStudio(hit.id, true) });
		}
		for (const hit of searchRemoteStudios) {
			items.push({ key: `remote:${hit.id}`, run: () => void goto(`/producer/${hit.id}`) });
		}
		for (const hit of searchStaffHits) {
			items.push({ key: `staff:${hit.id}`, run: () => void startCareerTrail(hit.id) });
		}
		for (const hit of searchVnHits) {
			items.push({ key: `vn:${hit.id}`, run: () => void startVnSpotlight(hit.id) });
		}
		return items;
	});

	$effect(() => {
		void searchQuery;
		void searchNavItems.length;
		searchActiveIdx = 0;
	});

	function isSearchItemActive(key: string): boolean {
		return searchNavItems[searchActiveIdx]?.key === key;
	}

	function setSearchActiveKey(key: string) {
		const idx = searchNavItems.findIndex((i) => i.key === key);
		if (idx >= 0) searchActiveIdx = idx;
	}

	function onSearchKeydown(e: KeyboardEvent) {
		if (!searchFocused || menuOpen) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (searchNavItems.length > 0) searchActiveIdx = (searchActiveIdx + 1) % searchNavItems.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (searchNavItems.length > 0) searchActiveIdx = (searchActiveIdx - 1 + searchNavItems.length) % searchNavItems.length;
		} else if (e.key === 'Enter') {
			const item = searchNavItems[searchActiveIdx];
			if (item) {
				e.preventDefault();
				searchFocused = false;
				searchInputEl?.blur();
				item.run();
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			searchFocused = false;
			searchInputEl?.blur();
		}
	}

	/**
	 * Mirror Atlas state into the query string. Calls within one tick are merged
	 * into a single navigation. Pushes a real history entry by default so Browser
	 * Back / Forward returns to the exact previous studio, trail, VN or compare.
	 */
	let pendingUrlPatch: Record<string, string | null> | null = null;
	let pendingUrlReplace = true;
	function syncUrl(params: Record<string, string | null>, replace = false) {
		if (typeof window === 'undefined' || backdropMode) return;
		if (pendingUrlPatch) {
			Object.assign(pendingUrlPatch, params);
			if (!replace) pendingUrlReplace = false;
			return;
		}
		pendingUrlPatch = { ...params };
		pendingUrlReplace = replace;
		queueMicrotask(() => {
			const patch = pendingUrlPatch;
			const shouldReplace = pendingUrlReplace;
			pendingUrlPatch = null;
			pendingUrlReplace = true;
			if (!patch || backdropMode || window.location.pathname !== '/') return;
			const u = new URL(window.location.href);
			for (const [k, v] of Object.entries(patch)) {
				if (v) u.searchParams.set(k, v);
				else u.searchParams.delete(k);
			}
			const target = `${u.pathname}${u.search}`;
			if (target === `${window.location.pathname}${window.location.search}`) return;
			try {
				void goto(target, { shallow: true, replace: shouldReplace });
			} catch {
				// Ignore during early hydration before router initializes.
			}
		});
	}

	function clearOverlays(keepSelection = false, sync = true) {
		traceSid = null;
		traceData = null;
		traceError = null;
		compareTraceSid = null;
		compareTraceData = null;
		spotlightVnId = null;
		spotlightVnData = null;
		spotlightVnError = null;
		comparePair = null;
		compareData = null;
		compareError = null;
		hoveredAliasSegIdx = null;
		if (!keepSelection) {
			selectedNodeId = null;
			selectedEdgeId = null;
			steppedFromNodeId = null;
			steppedEdgeId = null;
			unmappedFocus = null;
		}
		if (sync) {
			syncUrl({ focus: keepSelection ? selectedNodeId : null, trace: null, compareTrace: null, vn: null, compare: null });
		}
	}

	function exitOverlay() {
		if (returnSheetUrl && onReturnToSheet) {
			onReturnToSheet();
			return;
		}
		clearOverlays();
	}

	async function focusUnmappedStudio(id: string, sync = true) {
		clearOverlays(false, false);
		unmappedFocus = {
			id,
			loading: true,
			error: null,
			producer: null,
			explicitCount: 0,
			inferredCount: 0,
			maxInferredConfidence: null
		};
		if (sync) syncUrl({ focus: id, trace: null, compareTrace: null, vn: null, compare: null });
		try {
			const body = await fetchProof<{
				producer?: ProducerSummary;
				explicitRelations?: unknown[];
				inferredRelations?: Array<{ confidence?: number; seiyuuDriven?: boolean }>;
			}>(`/api/producers/${encodeURIComponent(id)}`);
			if (unmappedFocus?.id !== id) return;
			const explicitCount = body.explicitRelations?.length ?? 0;
			const coreInferred = (body.inferredRelations ?? []).filter((r) => !r.seiyuuDriven);
			const inferredCount = coreInferred.length;
			const maxInferredConfidence =
				coreInferred.length > 0
					? Math.max(...coreInferred.map((r) => Number(r.confidence ?? 0)))
					: null;
			unmappedFocus = {
				id,
				loading: false,
				error: body.producer ? null : 'Studio not found.',
				producer: body.producer ?? null,
				explicitCount,
				inferredCount,
				maxInferredConfidence
			};
		} catch {
			if (unmappedFocus?.id !== id) return;
			unmappedFocus = {
				id,
				loading: false,
				error: 'Could not load studio details.',
				producer: null,
				explicitCount: 0,
				inferredCount: 0,
				maxInferredConfidence: null
			};
		}
	}

	async function startCareerTrail(sid: string, overlayCandidateSid: string | null = null, sync = true) {
		clearOverlays(false, false);
		menuOpen = false;
		traceSid = sid;
		traceLoading = true;
		traceError = null;
		activeStopIdx = 0;
		searchFocused = false;
		if (sync) syncUrl({ trace: sid, compareTrace: overlayCandidateSid, focus: null, vn: null, compare: null });
		try {
			const data = await fetchProof<StaffApiPayload>(`/api/staff/${encodeURIComponent(sid)}`);
			if (traceSid !== sid) return;
			traceData = data;
			const trail = buildCareerTrail(data.staff, data.timelineEvents, data.brandTracks, layout, 0);
			if (trail.stops.length > 0) fitBox(trailFrame(trail), 84, 0.95, true, true);
			if (overlayCandidateSid) void setCompareTrace(overlayCandidateSid, false);
		} catch {
			if (traceSid === sid) traceError = 'Could not load career data.';
		} finally {
			if (traceSid === sid) traceLoading = false;
		}
	}

	/** A trail's frame, with room on the left for the studio badges that sit ahead of each lane. */
	function trailFrame(trail: CareerTrail) {
		return { ...trail.bounds, minX: trail.bounds.minX - 460 };
	}

	async function setCompareTrace(sid: string | null, sync = true) {
		compareTraceSid = sid;
		compareTraceData = null;
		if (sync) syncUrl({ compareTrace: sid });
		if (!sid) return;
		compareTraceLoading = true;
		try {
			const data = await fetchProof<StaffApiPayload>(`/api/staff/${encodeURIComponent(sid)}`);
			if (compareTraceSid !== sid) return;
			compareTraceData = data;
			if (primaryTrail) {
				const sec = buildCareerTrail(data.staff, data.timelineEvents, data.brandTracks, layout, 32);
				fitBox(
					{
						minX: Math.min(primaryTrail.bounds.minX, sec.bounds.minX),
						minY: Math.min(primaryTrail.bounds.minY, sec.bounds.minY),
						maxX: Math.max(primaryTrail.bounds.maxX, sec.bounds.maxX),
						maxY: Math.max(primaryTrail.bounds.maxY, sec.bounds.maxY)
					},
					100,
					0.9
				);
			}
		} catch {
			// Ignore transient overlay fetch error.
		} finally {
			if (compareTraceSid === sid) compareTraceLoading = false;
		}
	}

	async function startVnSpotlight(vid: string, sync = true) {
		clearOverlays(false, false);
		menuOpen = false;
		spotlightVnId = vid;
		spotlightVnLoading = true;
		spotlightVnError = null;
		searchFocused = false;
		if (sync) syncUrl({ vn: vid, focus: null, trace: null, compareTrace: null, compare: null });
		try {
			const data = await fetchProof<VnApiPayload>(`/api/vns/${encodeURIComponent(vid)}`);
			if (spotlightVnId !== vid) return;
			spotlightVnData = data;
			requestAnimationFrame(() => {
				if (!vnSpotlight) return;
				const pts = [vnSpotlight.focus, ...vnSpotlight.related];
				let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
				for (const p of pts) {
					minX = Math.min(minX, p.x);
					minY = Math.min(minY, p.y);
					maxX = Math.max(maxX, p.x);
					maxY = Math.max(maxY, p.y);
				}
				fitBox({ minX: minX - 200, minY: minY - 120, maxX: maxX + 220, maxY: maxY + 120 }, 100, 0.95);
			});
		} catch {
			if (spotlightVnId === vid) spotlightVnError = 'Could not load visual novel.';
		} finally {
			if (spotlightVnId === vid) spotlightVnLoading = false;
		}
	}

	async function startCompareSpotlight(a: string, b: string, sync = true) {
		clearOverlays(false, false);
		menuOpen = false;
		comparePair = { a, b };
		compareLoading = true;
		compareError = null;
		searchFocused = false;
		if (sync) syncUrl({ compare: `${a}-${b}`, focus: null, trace: null, compareTrace: null, vn: null });
		try {
			const data = await fetchProof<CompareApiPayload>(
				`/api/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`
			);
			if (comparePair?.a !== a || comparePair?.b !== b) return;
			compareData = data;
			const pts: Array<{ x: number; y: number }> = [];
			const na = layout.nodeById.get(a);
			const nb = layout.nodeById.get(b);
			if (na) pts.push(na);
			if (nb) pts.push(nb);
			for (const step of data.explicitPath ?? []) {
				const ns = layout.nodeById.get(step.id);
				if (ns) pts.push(ns);
			}
			if (pts.length > 0) {
				let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
				for (const p of pts) {
					minX = Math.min(minX, p.x);
					minY = Math.min(minY, p.y);
					maxX = Math.max(maxX, p.x);
					maxY = Math.max(maxY, p.y);
				}
				fitBox({ minX: minX - 240, minY: minY - 140, maxX: maxX + 260, maxY: maxY + 140 }, 100, 0.95, true, true);
			}
		} catch {
			if (comparePair?.a === a && comparePair?.b === b) {
				const na = layout.nodeById.get(a);
				const nb = layout.nodeById.get(b);
				compareError =
					na && nb
						? `Could not compare ${shownName(na.name, na.original)} and ${shownName(nb.name, nb.original)}.`
						: 'Could not compare these studios.';
			}
		} finally {
			if (comparePair?.a === a && comparePair?.b === b) compareLoading = false;
		}
	}

	function selectStudio(id: string, fly = false, sync = true) {
		const nd = layout.nodeById.get(id);
		if (!nd) {
			void focusUnmappedStudio(id, sync);
			return;
		}
		if (hasActiveOverlay) clearOverlays(true, false);
		unmappedFocus = null;
		selectedNodeId = id;
		selectedEdgeId = null;
		steppedFromNodeId = null;
		steppedEdgeId = null;
		searchFocused = false;
		jumpOpen = false;
		if (sync) syncUrl({ focus: id, trace: null, compareTrace: null, vn: null, compare: null });
		if (fly) flyTo(nd.x, nd.y, Math.max(cam.scale, 0.72));
	}

	/** Frame two studios together cleanly clear of the bottom-left inspector card. */
	function fitStudioPair(a: PlacedLandscapeNode, b: PlacedLandscapeNode) {
		const minX = Math.min(a.x - a.r, b.x - b.r) - 220;
		const maxX = Math.max(a.x + a.r, b.x + b.r, Math.min(a.endX, a.x + 320), Math.min(b.endX, b.x + 320)) + 200;
		const minY = Math.min(a.y - a.r, b.y - b.r) - 110;
		const maxY = Math.max(a.y + a.r, b.y + b.r) + 110;
		fitBox({ minX, minY, maxX, maxY }, 92, 0.92, true, true);
	}

	/** Step from studio A to a linked studio B, framing BOTH in sight so the user keeps spatial orientation. */
	function navigateBetweenStudios(fromId: string, toId: string, edgeId?: string | null) {
		const fromNd = layout.nodeById.get(fromId);
		const toNd = layout.nodeById.get(toId);
		if (!toNd) return;
		if (hasActiveOverlay) clearOverlays(true, false);
		selectedNodeId = toId;
		selectedEdgeId = null;
		steppedFromNodeId = fromNd && fromId !== toId ? fromId : null;
		steppedEdgeId = edgeId ?? null;
		hoveredNodeId = null;
		hoveredEdgeId = null;
		searchFocused = false;
		jumpOpen = false;
		syncUrl({ focus: toId, trace: null, compareTrace: null, vn: null, compare: null });
		if (fromNd && fromId !== toId) {
			fitStudioPair(fromNd, toNd);
		} else {
			flyTo(toNd.x, toNd.y, Math.max(cam.scale, 0.72));
		}
	}

	function selectEdge(e: PlacedLandscapeEdge, fly = false) {
		if (hasActiveOverlay) clearOverlays(true, false);
		selectedEdgeId = e.id;
		selectedNodeId = null;
		steppedFromNodeId = null;
		steppedEdgeId = null;
		if (fly) {
			fitBox(
				{
					minX: Math.min(e.sourceNode.x, e.targetNode.x) - 220,
					minY: Math.min(e.sourceNode.y, e.targetNode.y) - 130,
					maxX: Math.max(e.sourceNode.x, e.targetNode.x) + 220,
					maxY: Math.max(e.sourceNode.y, e.targetNode.y) + 130
				},
				100,
				0.95,
				true,
				true
			);
		}
	}

	function jumpToStop(idx: number) {
		if (!activeTrail || activeTrail.stops.length === 0) return;
		const clamped = (idx + activeTrail.stops.length) % activeTrail.stops.length;
		activeStopIdx = clamped;
		const st = activeTrail.stops[clamped];
		flyTo(st.x, st.y, Math.max(cam.scale, 0.78));
	}

	function setTrailAliasFilter(next: 'both' | 'inferred') {
		trailAliasFilter = next;
		activeStopIdx = 0;
		hoveredStopKey = null;
		hoveredAliasSegIdx = null;
		if (next === 'inferred' && secondaryTrail && secondaryTrail.stops.length > 0) {
			fitBox(trailFrame(secondaryTrail), 84, 0.95, true, true);
		} else if (next === 'both' && primaryTrail && secondaryTrail) {
			fitBox(
				{
					minX: Math.min(primaryTrail.bounds.minX, secondaryTrail.bounds.minX) - 360,
					minY: Math.min(primaryTrail.bounds.minY, secondaryTrail.bounds.minY),
					maxX: Math.max(primaryTrail.bounds.maxX, secondaryTrail.bounds.maxX),
					maxY: Math.max(primaryTrail.bounds.maxY, secondaryTrail.bounds.maxY)
				},
				84,
				0.9,
				true,
				true
			);
		}
	}

	function jumpToHiddenLink(idx: number) {
		if (hiddenQueue.length === 0) return;
		const clamped = (idx + hiddenQueue.length) % hiddenQueue.length;
		hiddenIndex = clamped;
		selectEdge(hiddenQueue[clamped], true);
	}

	function setMode(next: 'all' | 'explicit' | 'hidden') {
		mode = next;
		menuOpen = false;
		syncUrl({ mode: next === 'all' ? null : next });
		if (next === 'hidden' && hiddenQueue.length > 0 && !hasActiveOverlay) {
			hiddenIndex = 0;
			requestAnimationFrame(() => {
				if (hiddenQueue.length > 0) jumpToHiddenLink(0);
			});
		}
	}

	// ── Camera, Animation & Canvas State ──
	const RULER_H = 26;
	const MIN_SCALE = 0.012;
	const MAX_SCALE = 3.2;

	let wrapEl = $state<HTMLDivElement | null>(null);
	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let minimapEl = $state<HTMLCanvasElement | null>(null);
	let viewW = $state(1440);
	let viewH = $state(900);

	let cam = $state({ x: 0, y: 0, scale: 0.35 });
	let dragging = $state(false);
	let minimapDragging = $state(false);
	let dragMoved = false;
	let dragStart = { x: 0, y: 0, camX: 0, camY: 0 };
	let animFrame: number | null = null;
	let animTarget: { x: number; y: number; scale: number; t0: number; dur: number; sx: number; sy: number; ss: number } | null = null;

	interface ThemeColors {
		canvas: string;
		surface: string;
		surfaceSunken: string;
		surfaceRaised: string;
		rule: string;
		ruleStrong: string;
		ink: string;
		ink2: string;
		ink3: string;
		ink4: string;
		confirmed: string;
		inferred: string;
		inferredMark: string;
		focus: string;
		ownership: string;
		sister: string;
		lineage: string;
		partner: string;
		roles: Record<string, string>;
		fontSans: string;
		fontMono: string;
	}
	let theme = $state<ThemeColors>({
		canvas: '',
		surface: '',
		surfaceSunken: '',
		surfaceRaised: '',
		rule: '',
		ruleStrong: '',
		ink: '',
		ink2: '',
		ink3: '',
		ink4: '',
		confirmed: '',
		inferred: '',
		inferredMark: '',
		focus: '',
		ownership: '',
		sister: '',
		lineage: '',
		partner: '',
		roles: {},
		fontSans: 'Inter, system-ui, sans-serif',
		fontMono: 'JetBrains Mono, ui-monospace, monospace'
	});

	function readTheme() {
		if (typeof window === 'undefined') return;
		const cs = getComputedStyle(document.documentElement);
		const g = (v: string) => cs.getPropertyValue(v).trim();
		theme = {
			canvas: g('--canvas'),
			surface: g('--surface'),
			surfaceSunken: g('--surface-sunken'),
			surfaceRaised: g('--surface-raised'),
			rule: g('--rule'),
			ruleStrong: g('--rule-strong'),
			ink: g('--ink'),
			ink2: g('--ink-2'),
			ink3: g('--ink-3'),
			ink4: g('--ink-4'),
			confirmed: g('--confirmed'),
			inferred: g('--inferred'),
			inferredMark: g('--inferred-mark'),
			focus: g('--focus'),
			ownership: g('--rel-ownership'),
			sister: g('--rel-sister'),
			lineage: g('--rel-lineage'),
			partner: g('--rel-partner'),
			roles: {
				director: g('--role-director'),
				scenario: g('--role-scenario'),
				chardesign: g('--role-chardesign'),
				art: g('--role-art'),
				music: g('--role-music'),
				seiyuu: g('--role-seiyuu'),
				other: g('--role-other')
			},
			fontSans: `${g('--latin-sans') || 'Inter'}, ${g('--cjk-sans') || 'sans-serif'}, sans-serif`,
			fontMono: `${g('--latin-mono') || 'JetBrains Mono'}, ui-monospace, monospace`
		};
	}

	function roleColor(role: string): string {
		return theme.roles[role] || theme.roles.other || theme.ink2;
	}

	function kindColor(kind: RelationKind): string {
		if (kind === 'ownership') return theme.ownership;
		if (kind === 'lineage') return theme.lineage;
		if (kind === 'sister') return theme.sister;
		return theme.partner;
	}

	function worldToScreen(wx: number, wy: number) {
		return { x: wx * cam.scale + cam.x, y: wy * cam.scale + cam.y };
	}

	function screenToWorld(sx: number, sy: number) {
		return { x: (sx - cam.x) / cam.scale, y: (sy - cam.y) / cam.scale };
	}

	function startAnim(tx: number, ty: number, ts: number, dur = 360) {
		animTarget = {
			x: tx,
			y: ty,
			scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, ts)),
			t0: performance.now(),
			dur,
			sx: cam.x,
			sy: cam.y,
			ss: cam.scale
		};
		const tick = (now: number) => {
			if (!animTarget) return;
			const p = Math.min(1, (now - animTarget.t0) / animTarget.dur);
			const ease = 1 - Math.pow(1 - p, 3);
			cam = {
				x: animTarget.sx + (animTarget.x - animTarget.sx) * ease,
				y: animTarget.sy + (animTarget.y - animTarget.sy) * ease,
				scale: animTarget.ss + (animTarget.scale - animTarget.ss) * ease
			};
			if (p < 1) animFrame = requestAnimationFrame(tick);
			else animTarget = null;
		};
		if (animFrame) cancelAnimationFrame(animFrame);
		animFrame = requestAnimationFrame(tick);
	}

	function flyTo(wx: number, wy: number, targetScale?: number) {
		const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScale ?? Math.max(cam.scale, 0.72)));
		startAnim(viewW * 0.52 - wx * s, (viewH + RULER_H) * 0.5 - wy * s, s, 380);
	}

	function fitBox(
		box: { minX: number; minY: number; maxX: number; maxY: number },
		pad = 80,
		maxScale = 1.2,
		animate = true,
		reserveLeftCard = false
	) {
		const bw = Math.max(200, box.maxX - box.minX);
		const bh = Math.max(200, box.maxY - box.minY);
		// The inspector card is 26rem wide: keep whatever is being framed clear of it.
		const leftPad = reserveLeftCard && viewW >= 960 ? 448 : pad;
		const topPad = Math.max(pad, 92);
		const usableW = Math.max(240, viewW - leftPad - pad);
		const usableH = Math.max(220, viewH - RULER_H - topPad - pad);
		const s = Math.max(MIN_SCALE, Math.min(maxScale, usableW / bw, usableH / bh));
		const cx = (box.minX + box.maxX) / 2;
		const cy = (box.minY + box.maxY) / 2;
		const tx = leftPad + usableW / 2 - cx * s;
		const ty = RULER_H + topPad + usableH / 2 - cy * s;
		if (animate) startAnim(tx, ty, s, 360);
		else cam = { x: tx, y: ty, scale: s };
	}

	function fitAll(animate = true) {
		fitBox(layout.bounds, 56, 0.65, animate);
	}

	/**
	 * Opening view: the best-known house, framed so its corporate rail reads end
	 * to end, with its owner's name clear of the left edge and its first row clear
	 * of the floating controls.
	 */
	function fitOpeningView() {
		const top = layout.territories[0];
		const hub = top ? layout.nodeById.get(top.hubId) : undefined;
		if (!top || !hub) {
			fitAll(false);
			return;
		}
		const spanYears = viewW >= 1100 ? 27 : viewW >= 700 ? 19 : 11;
		const targetScale = Math.max(0.1, Math.min(0.42, viewW / (spanYears * layout.yearPx)));
		const startX = hub.x - Math.min(layout.yearPx * 3.4, 190 / targetScale);
		cam = {
			x: -startX * targetScale,
			y: RULER_H + 84 - (top.minY + 70 - layout.rowStep) * targetScale,
			scale: targetScale
		};
	}

	function zoomBy(factor: number, cx = viewW / 2, cy = (viewH + RULER_H) / 2) {
		animTarget = null;
		const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cam.scale * factor));
		const ratio = next / cam.scale;
		cam = {
			x: cx - (cx - cam.x) * ratio,
			y: cy - (cy - cam.y) * ratio,
			scale: next
		};
	}

	function fitNeighborhood(nd: PlacedLandscapeNode) {
		const nbs = [
			nd,
			...(layout.adj.get(nd.id) ?? [])
				.filter((e) => !e.isCrossTerritory || e.spanY < 1400)
				.map((e) => (e.source === nd.id ? e.targetNode : e.sourceNode))
		];
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const n of nbs) {
			minX = Math.min(minX, n.x - n.r);
			minY = Math.min(minY, n.y - n.r);
			maxX = Math.max(maxX, n.x + n.r);
			maxY = Math.max(maxY, n.y + n.r);
		}
		fitBox({ minX: minX - 180, minY: minY - 120, maxX: maxX + 200, maxY: maxY + 120 }, 90, 1.0, true, true);
	}

	// ── Clean Round-Year Sticky Top Ruler ──
	const rulerTicks = $derived.by(() => {
		const pxPerYear = layout.yearPx * cam.scale;
		const step = pxPerYear < 16 ? 10 : pxPerYear < 42 ? 5 : pxPerYear < 96 ? 2 : 1;
		const leftYear = Math.floor(layout.xToYear(screenToWorld(0, 0).x));
		const rightYear = Math.ceil(layout.xToYear(screenToWorld(viewW, 0).x));
		const first = Math.floor(leftYear / step) * step;
		const last = Math.ceil(rightYear / step) * step;
		const out: Array<{ year: number; sx: number; major: boolean }> = [];
		for (let yr = first; yr <= last; yr += step) {
			const sx = worldToScreen(layout.yearToX(yr), 0).x;
			if (sx < -40 || sx > viewW + 40) continue;
			out.push({ year: yr, sx, major: yr % 10 === 0 || (step <= 2 && yr % 5 === 0) || step === 1 });
		}
		return out;
	});

	// ── Frame state shared by drawing and hit-testing (plain values, not reactive) ──
	// What is on the map depends on zoom *and* on which names found room, so the
	// draw pass decides it once per frame and the pointer handlers reuse the answer.
	let shownNodeIds = new Set<string>();
	let shownEdgeIds = new Set<string>();
	const textWidthCache = new Map<string, number>();
	let fontEpoch = $state(0);

	/** Glyphs stay screen-sized like map pins: a little smaller far out, a little larger up close. */
	function glyphRadius(nd: PlacedLandscapeNode): number {
		const far = Math.max(0.62, Math.min(1, 0.62 + 2.4 * cam.scale));
		const near = 1 + Math.max(0, Math.min(0.4, (cam.scale - 0.6) * 0.45));
		return nd.r * far * near;
	}

	/** Right end of everything a studio draws on its row: its releases or its corporate rail. */
	function lineRight(nd: PlacedLandscapeNode): number {
		return Math.max(nd.endX, nd.spineEndX, nd.x);
	}

	/** The stated-ownership link each brand hangs from at rest, keyed by the brand. */
	const mainOwnerEdge = $derived.by(() => {
		const map = new Map<string, PlacedLandscapeEdge>();
		for (const e of layout.edges) {
			if (e.route.type === 'bus' && !e.secondary) map.set(e.target, e);
		}
		return map;
	});

	// ── Pointer & Hit-Testing ──
	function hitTestAliasSwitch(sx: number, sy: number): number | null {
		if (!activeTrail || showingInferredOnly) return null;
		const denseSuppressed = activeTrail.stops.length > 30 && !showAllTrailLines;
		let bestIdx: number | null = null;
		let bestD = Infinity;
		for (let i = 0; i < activeTrail.segments.length; i++) {
			const seg = activeTrail.segments[i];
			if (!seg.aliasChanged) continue;
			if (denseSuppressed && activeStop && seg.from.index !== activeStop.index && seg.to.index !== activeStop.index) continue;
			const mid = cubicAt(seg.from.x, seg.from.y, seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.to.x, seg.to.y, 0.5);
			const p = worldToScreen(mid.x, mid.y);
			const d = Math.hypot(sx - p.x, sy - p.y);
			if (d <= 15 && d < bestD) {
				bestIdx = i;
				bestD = d;
			}
		}
		return bestIdx;
	}

	function hitTestStop(wx: number, wy: number): CareerTrailStop | null {
		if (!activeTrail) return null;
		const pad = 13 / cam.scale;
		let best: CareerTrailStop | null = null;
		let bestD = Infinity;
		for (const s of activeTrail.stops) {
			const d = Math.hypot(wx - s.x, wy - s.y);
			if (d <= Math.max(10 / cam.scale, pad) && d < bestD) {
				best = s;
				bestD = d;
			}
		}
		return best;
	}

	function hitTestNode(wx: number, wy: number): PlacedLandscapeNode | null {
		const px = 1 / cam.scale;
		let best: PlacedLandscapeNode | null = null;
		let bestD = Infinity;
		for (const n of layout.nodes) {
			if (!shownNodeIds.has(n.id)) continue;
			const d = Math.hypot(wx - n.x, wy - n.y);
			if (d <= (glyphRadius(n) + 6) * px && d < bestD) {
				best = n;
				bestD = d;
			}
		}
		if (best) return best;
		// A lifeline or a corporate rail is as good a handle as the glyph that starts it.
		const reach = 5 * px;
		for (const n of layout.nodes) {
			if (!shownNodeIds.has(n.id)) continue;
			const dy = Math.abs(wy - n.y);
			if (dy > reach || wx < n.x || wx > lineRight(n)) continue;
			if (dy < bestD) {
				best = n;
				bestD = dy;
			}
		}
		return best;
	}

	function hitTestEdge(wx: number, wy: number): PlacedLandscapeEdge | null {
		const thresh = 7 / cam.scale;
		let best: PlacedLandscapeEdge | null = null;
		let bestD = Infinity;
		for (const e of layout.edges) {
			if (!shownEdgeIds.has(e.id)) continue;
			const b = edgeBounds(e.route);
			if (wx < b.minX - thresh || wx > b.maxX + thresh || wy < b.minY - thresh || wy > b.maxY + thresh) continue;
			const d = pointToEdgeDist(wx, wy, e.route);
			if (d < thresh && d < bestD) {
				best = e;
				bestD = d;
			}
		}
		return best;
	}

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0 || !canvasEl) return;
		menuOpen = false;
		filtersOpen = false;
		jumpOpen = false;
		animTarget = null;
		dragging = true;
		dragMoved = false;
		dragStart = { x: e.clientX, y: e.clientY, camX: cam.x, camY: cam.y };
		canvasEl.setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		const sx = e.clientX - rect.left;
		const sy = e.clientY - rect.top;
		pointerScreenPos = { x: sx, y: sy };
		if (dragging) {
			const dx = e.clientX - dragStart.x;
			const dy = e.clientY - dragStart.y;
			if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
			cam = { ...cam, x: dragStart.camX + dx, y: dragStart.camY + dy };
			return;
		}
		const { x: wx, y: wy } = screenToWorld(sx, sy);
		const aliasIdx = hitTestAliasSwitch(sx, sy);
		if (aliasIdx !== null) {
			hoveredAliasSegIdx = aliasIdx;
			hoveredStopKey = null;
			hoveredNodeId = null;
			hoveredEdgeId = null;
			return;
		}
		hoveredAliasSegIdx = null;
		const st = hitTestStop(wx, wy);
		if (st) {
			hoveredStopKey = st.key;
			hoveredNodeId = null;
			hoveredEdgeId = null;
			return;
		}
		hoveredStopKey = null;
		const nd = hitTestNode(wx, wy);
		if (nd) {
			hoveredNodeId = nd.id;
			hoveredEdgeId = null;
			return;
		}
		hoveredNodeId = null;
		const ed = cam.scale >= 0.22 && !hasActiveOverlay ? hitTestEdge(wx, wy) : null;
		hoveredEdgeId = ed ? ed.id : null;
	}

	function onPointerUp(e: PointerEvent) {
		if (!dragging || !canvasEl) return;
		dragging = false;
		if (canvasEl.hasPointerCapture(e.pointerId)) canvasEl.releasePointerCapture(e.pointerId);
		if (!dragMoved) {
			const rect = canvasEl.getBoundingClientRect();
			const sx = e.clientX - rect.left;
			const sy = e.clientY - rect.top;
			const { x: wx, y: wy } = screenToWorld(sx, sy);
			const aliasIdx = hitTestAliasSwitch(sx, sy);
			if (aliasIdx !== null && activeTrail) {
				const seg = activeTrail.segments[aliasIdx];
				if (seg) activeStopIdx = seg.to.index;
				return;
			}
			const st = hitTestStop(wx, wy);
			if (st) {
				activeStopIdx = st.index;
				return;
			}
			const nd = hitTestNode(wx, wy);
			if (nd) {
				selectStudio(nd.id, false);
				return;
			}
			const ed = !hasActiveOverlay ? hitTestEdge(wx, wy) : null;
			if (ed) {
				selectEdge(ed, false);
				return;
			}
			if (!hasActiveOverlay) {
				selectedNodeId = null;
				selectedEdgeId = null;
				syncUrl({ focus: null });
			}
		}
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		if (!canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
		zoomBy(factor, e.clientX - rect.left, e.clientY - rect.top);
	}

	function onDblClick(e: MouseEvent) {
		if (!canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		const { x: wx, y: wy } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
		const nd = hitTestNode(wx, wy);
		if (nd) {
			selectStudio(nd.id, false);
			fitNeighborhood(nd);
		} else {
			zoomBy(1.65, e.clientX - rect.left, e.clientY - rect.top);
		}
	}

	// ── Minimap (Full-frame 2D Timeline × Lineage radar — left=1980, right=2030!) ──
	// The world is as wide as the timeline and as tall as the industry is crowded,
	// so the minimap takes whichever orientation the current map has.
	const tallWorld = $derived(layout.bounds.h > layout.bounds.w * 1.25);
	const miniW = $derived(tallWorld ? 152 : 224);
	const miniH = $derived(tallWorld ? Math.max(130, Math.min(232, viewH - 320)) : 136);

	function minimapTransform() {
		const b = layout.bounds;
		const padX = 10;
		const padTop = 8;
		const padBottom = 18;
		const sx = (miniW - padX * 2) / Math.max(1, b.w);
		const sy = (miniH - padTop - padBottom) / Math.max(1, b.h);
		const ox = padX - b.minX * sx;
		const oy = padTop - b.minY * sy;
		return { sx, sy, ox, oy };
	}

	function panFromMinimap(clientX: number, clientY: number) {
		if (!minimapEl) return;
		const rect = minimapEl.getBoundingClientRect();
		const mx = clientX - rect.left;
		const my = clientY - rect.top;
		const { sx, sy, ox, oy } = minimapTransform();
		const wx = (mx - ox) / sx;
		const wy = (my - oy) / sy;
		animTarget = null;
		cam = {
			...cam,
			x: viewW / 2 - wx * cam.scale,
			y: RULER_H + (viewH - RULER_H) / 2 - wy * cam.scale
		};
	}

	function onMinimapDown(e: PointerEvent) {
		if (e.button !== 0 || !minimapEl) return;
		minimapDragging = true;
		minimapEl.setPointerCapture(e.pointerId);
		panFromMinimap(e.clientX, e.clientY);
	}

	function onMinimapMove(e: PointerEvent) {
		if (!minimapDragging) return;
		panFromMinimap(e.clientX, e.clientY);
	}

	function onMinimapUp(e: PointerEvent) {
		if (!minimapDragging || !minimapEl) return;
		minimapDragging = false;
		if (minimapEl.hasPointerCapture(e.pointerId)) minimapEl.releasePointerCapture(e.pointerId);
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (backdropMode) return;
		if (e.key === 'Escape') {
			// An open proof popover takes this Escape; the Atlas keeps its selection.
			if (document.querySelector('[role="dialog"]')) return;
			if (searchFocused) {
				searchFocused = false;
				searchInputEl?.blur();
			} else if (menuOpen || filtersOpen || jumpOpen) {
				menuOpen = false;
				filtersOpen = false;
				jumpOpen = false;
			} else if (hasActiveOverlay || selectedNodeId || selectedEdgeId || unmappedFocus) {
				if (traceSid && returnSheetUrl && onReturnToSheet) exitOverlay();
				else clearOverlays();
			}
			return;
		}
		if (
			(e.key === 'k' && (e.ctrlKey || e.metaKey)) ||
			(e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'SELECT')
		) {
			e.preventDefault();
			searchInputEl?.focus();
			searchFocused = true;
			return;
		}
		if (primaryTrail && document.activeElement?.tagName !== 'INPUT') {
			if (e.key === 'ArrowRight') {
				e.preventDefault();
				jumpToStop(activeStopIdx + 1);
			} else if (e.key === 'ArrowLeft') {
				e.preventDefault();
				jumpToStop(activeStopIdx - 1);
			}
		}
	}

	// ── Canvas Drawing ──
	/** Producer-type shape, matching `ProducerShape`: company circle, amateur group rounded square, individual diamond. */
	function drawStudioShape(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, type: PlacedLandscapeNode['type']) {
		ctx.beginPath();
		if (type === 'in') {
			const d = r * 1.18;
			ctx.moveTo(x, y - d);
			ctx.lineTo(x + d, y);
			ctx.lineTo(x, y + d);
			ctx.lineTo(x - d, y);
			ctx.closePath();
		} else if (type === 'ng') {
			const s = r * 0.92;
			ctx.roundRect(x - s, y - s, s * 2, s * 2, s * 0.42);
		} else {
			ctx.arc(x, y, r, 0, Math.PI * 2);
		}
	}

	function drawArrowhead(ctx: CanvasRenderingContext2D, tipX: number, tipY: number, fromX: number, fromY: number, size: number) {
		const angle = Math.atan2(tipY - fromY, tipX - fromX);
		ctx.beginPath();
		ctx.moveTo(tipX, tipY);
		ctx.lineTo(tipX - size * Math.cos(angle - 0.44), tipY - size * Math.sin(angle - 0.44));
		ctx.lineTo(tipX - size * Math.cos(angle + 0.44), tipY - size * Math.sin(angle + 0.44));
		ctx.closePath();
		ctx.fill();
	}

	function measureText(ctx: CanvasRenderingContext2D, font: string, text: string): number {
		const key = `${font}|${text}`;
		let w = textWidthCache.get(key);
		if (w == null) {
			ctx.font = font;
			w = ctx.measureText(text).width;
			if (textWidthCache.size > 9000) textWidthCache.clear();
			textWidthCache.set(key, w);
		}
		return w;
	}

	interface ScreenBox {
		x1: number;
		y1: number;
		x2: number;
		y2: number;
	}

	interface LabelPlan {
		nd: PlacedLandscapeNode;
		text: string;
		/** Brand count shown after an owner's name while its brands are summarised as ticks. */
		suffix: string;
		font: string;
		size: number;
		tx: number;
		ty: number;
		w: number;
		suffixW: number;
		hi: boolean;
		/** Pinned to the left edge because the studio's own glyph has scrolled out of view. */
		sticky: boolean;
	}

	const SUFFIX_FONT_PX = 10;

	/**
	 * Decide what is on the map this frame. Names are placed best-known first,
	 * each on its own line (owners to the left of their rail, everyone else just
	 * right of their glyph), and a studio that cannot be named is not drawn as an
	 * anonymous dot: below full-detail zoom it stays folded into its owner's rail
	 * as a tick. Owners of several brands are structure and always stay.
	 */
	function planFrame(
		ctx: CanvasRenderingContext2D,
		cw: number,
		ch: number,
		hiIds: ReadonlySet<string>,
		forcedIds: ReadonlySet<string>
	): { shown: Set<string>; labels: LabelPlan[]; boxes: ScreenBox[] } {
		const s = cam.scale;
		const full = s >= FULL_DETAIL_SCALE;
		const padX = cw * 0.5;
		const padY = ch * 0.6;
		const boxes: ScreenBox[] = [];
		const labels: LabelPlan[] = [];
		const labelled = new Set<string>();
		const shown = new Set<string>();
		const hits = (x1: number, y1: number, x2: number, y2: number) => {
			for (const b of boxes) if (x1 < b.x2 && x2 > b.x1 && y1 < b.y2 && y2 > b.y1) return true;
			return false;
		};
		const suffixFont = `500 ${SUFFIX_FONT_PX}px ${theme.fontMono}`;

		const tryPlace = (nd: PlacedLandscapeNode, mode: 'rest' | 'neighbour' | 'hi'): boolean => {
			const sx = nd.x * s + cam.x;
			const sy = nd.y * s + cam.y;
			const rightS = lineRight(nd) * s + cam.x;
			const rs = glyphRadius(nd);
			const hi = mode === 'hi';
			const owner = nd.spineChildren > 0;
			const raw = shownName(nd.name, nd.original);
			const size = hi ? 12.5 : owner ? (nd.spineChildren >= 8 ? 12.5 : 12) : nd.tier === 1 ? 12 : nd.tier === 2 ? 11.5 : 11;
			const font = `${hi || owner || nd.tier === 1 ? 600 : 500} ${size}px ${theme.fontSans}`;
			const sticky = sx < 10 && rightS > 130;
			const text = (sticky ? '‹ ' : '') + (raw.length > 28 && !hi ? raw.slice(0, 26) + '…' : raw);
			const w = measureText(ctx, font, text);
			const suffix = owner && nd.spineChildren >= 4 && !full ? String(nd.spineChildren) : '';
			const suffixW = suffix ? measureText(ctx, suffixFont, suffix) + 6 : 0;
			const h = size + 5;
			const total = w + suffixW;

			// Where the name may go, best first. It always stays on the studio's own row,
			// so a name can never be read as belonging to the line above or below.
			const spots: number[] = [];
			let tx: number;
			if (sticky) {
				tx = 14;
			} else if (owner) {
				// An owner's name sits ahead of its rail; when its own branch comes in from the left, ahead of that too.
				const incoming = mainOwnerEdge.get(nd.id);
				const stub =
					incoming && incoming.route.type === 'bus' && s >= incoming.sourceNode.minScale
						? (nd.x - incoming.route.forkX) * s + 4
						: 0;
				tx = sx - rs - 6 - stub - total;
				// No room ahead of the rail: the name rides on it instead.
				spots.push(sx + rs + 7);
			} else {
				tx = sx + rs + 6;
			}
			spots.unshift(tx);
			// The glyph itself must not sit under a name that is already placed.
			const glyphFree = sticky || hi || !hits(sx - rs - 1, sy - rs - 1, sx + rs + 1, sy + rs + 1);
			for (const left of glyphFree ? spots : []) {
				tx = left;
				const x1 = tx - 4;
				const y1 = sy - h / 2 + 0.5;
				const x2 = tx + total + 4;
				const y2 = sy + h / 2 - 0.5;
				if (!hi && hits(x1, y1, x2, y2)) continue;
				boxes.push({ x1, y1, x2, y2 });
				if (!sticky) boxes.push({ x1: sx - rs - 1, y1: sy - rs - 1, x2: sx + rs + 1, y2: sy + rs + 1 });
				labels.push({ nd, text, suffix, font, size, tx, ty: sy, w, suffixW, hi, sticky });
				labelled.add(nd.id);
				return true;
			}
			return false;
		};

		for (const nd of layout.nodes) {
			if (s < nd.minScale) continue;
			const sx = nd.x * s + cam.x;
			const sy = nd.y * s + cam.y;
			const rightS = lineRight(nd) * s + cam.x;
			// A sizeable owner is structure: its rail stays even on the rare frame its name finds no room.
			const structural = nd.spineChildren >= 4;
			if (sy < -padY || sy > ch + padY || rightS < -padX || sx > cw + padX) {
				// Far off screen: decide without a name, so links that leave the view stay put while panning.
				if (full || structural || nd.tier === 1) shown.add(nd.id);
				continue;
			}
			if (tryPlace(nd, 'rest') || full || structural) shown.add(nd.id);
		}
		// Whatever is in focus joins the map regardless of zoom. It is placed after
		// the resting names, so pointing at a studio never reshuffles the map.
		for (const id of forcedIds) {
			const nd = layout.nodeById.get(id);
			if (!nd) continue;
			shown.add(id);
			if (hiIds.has(id)) continue;
			if (!labelled.has(id)) tryPlace(nd, 'neighbour');
		}
		for (const id of hiIds) {
			const nd = layout.nodeById.get(id);
			if (!nd) continue;
			shown.add(id);
			const at = labels.findIndex((l) => l.nd.id === id);
			if (at >= 0) labels.splice(at, 1);
			tryPlace(nd, 'hi');
		}
		return { shown, labels, boxes };
	}

	function drawMainCanvas() {
		const canvas = canvasEl;
		if (!canvas || !theme.canvas) return;
		const dpr = window.devicePixelRatio || 1;
		const cw = Math.max(1, Math.round(viewW));
		const ch = Math.max(1, Math.round(viewH));
		if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
			canvas.width = Math.round(cw * dpr);
			canvas.height = Math.round(ch * dpr);
		}
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		ctx.save();
		ctx.scale(dpr, dpr);
		ctx.fillStyle = theme.canvas;
		ctx.fillRect(0, 0, cw, ch);

		const scale = cam.scale;
		/** One screen pixel, in world units: strokes and glyphs keep a constant on-screen weight. */
		const px = 1 / scale;
		const visMin = screenToWorld(-180, -180);
		const visMax = screenToWorld(cw + 180, ch + 180);

		// 1. Crisp hairline vertical year gridlines (no alternating decade fill so horizontal family bands stay clean, zero plaid!).
		ctx.save();
		ctx.strokeStyle = theme.rule;
		ctx.lineWidth = 1;
		for (const tick of rulerTicks) {
			ctx.globalAlpha = tick.major ? 0.65 : 0.28;
			ctx.beginPath();
			ctx.moveTo(Math.round(tick.sx) + 0.5, RULER_H);
			ctx.lineTo(Math.round(tick.sx) + 0.5, ch);
			ctx.stroke();
		}
		ctx.restore();

		// ── Who is in focus ──
		const trailStudioIds = new Set<string>();
		if (primaryTrail && !showingInferredOnly) for (const l of primaryTrail.lanes) trailStudioIds.add(l.pid);
		if (secondaryTrail) for (const l of secondaryTrail.lanes) trailStudioIds.add(l.pid);

		const compareHighlightNodes = new Set<string>();
		const comparePathPairs = new Set<string>();
		if (compareData) {
			compareHighlightNodes.add(compareData.producerA.id);
			compareHighlightNodes.add(compareData.producerB.id);
			const expPath = compareData.explicitPath ?? [];
			for (let i = 0; i < expPath.length; i++) {
				compareHighlightNodes.add(expPath[i].id);
				if (i > 0) {
					const u = expPath[i - 1].id;
					const v = expPath[i].id;
					comparePathPairs.add(`${u}|${v}`);
					comparePathPairs.add(`${v}|${u}`);
				}
			}
		}

		const vnHighlightStudios = new Set<string>();
		if (vnSpotlight) {
			if (vnSpotlight.focus.pid) vnHighlightStudios.add(vnSpotlight.focus.pid);
			for (const r of vnSpotlight.related) if (r.pid) vnHighlightStudios.add(r.pid);
		}

		// Locking a studio or edge pins focus so hovering an unrelated family never hijacks the highlight.
		const isLocked = !hasActiveOverlay && (selectedNodeId !== null || selectedEdgeId !== null);
		const focusId = hasActiveOverlay ? null : isLocked ? selectedNodeId : hoveredNodeId;
		const focusEdge = hasActiveOverlay
			? null
			: isLocked
				? (layout.edges.find((x) => x.id === selectedEdgeId) ?? null)
				: (layout.edges.find((x) => x.id === hoveredEdgeId) ?? null);
		const focusTerritoryId = focusId
			? (layout.nodeById.get(focusId)?.territoryId ?? null)
			: focusEdge && !focusEdge.isCrossTerritory
				? focusEdge.sourceNode.territoryId
				: null;

		// 1b. Clear horizontal family bands & crisp hairline seams (distinct bands without boxy clutter).
		ctx.save();
		for (let ti = 0; ti < layout.territories.length; ti++) {
			const t = layout.territories[ti];
			const y0 = t.bandMinY * scale + cam.y;
			const y1 = t.bandMaxY * scale + cam.y;
			if (y1 < RULER_H || y0 > ch) continue;
			const bandH = y1 - y0;
			const isFocusFam = focusTerritoryId === t.id;
			const prevIsFocusFam = ti > 0 && focusTerritoryId === layout.territories[ti - 1].id;
			const cy0 = Math.max(RULER_H, y0);
			const cy1 = Math.min(ch, y1);

			if (isFocusFam && cy1 > cy0) {
				ctx.fillStyle = theme.confirmed;
				ctx.globalAlpha = 0.072;
				ctx.fillRect(0, cy0, cw, cy1 - cy0);
			} else if (ti % 2 === 1 && bandH >= 10 && cy1 > cy0) {
				ctx.fillStyle = theme.ink;
				ctx.globalAlpha = 0.036;
				ctx.fillRect(0, cy0, cw, cy1 - cy0);
			}

			// Subtle left-edge gutter bar marking each family's vertical span
			if (bandH >= 18 && cy1 > cy0) {
				ctx.fillStyle = isFocusFam ? theme.confirmed : theme.ruleStrong;
				ctx.globalAlpha = isFocusFam ? 0.9 : 0.45;
				ctx.fillRect(0, cy0 + 2, 3, Math.max(0, cy1 - cy0 - 4));
			}

			if (ti > 0 && y0 > RULER_H + 1 && y0 < ch - 1 && (bandH >= 10 || isFocusFam || prevIsFocusFam || t.nodeCount >= 4)) {
				const ly = Math.round(y0) + 0.5;
				ctx.strokeStyle = isFocusFam || prevIsFocusFam ? theme.confirmed : bandH >= 24 ? theme.ruleStrong : theme.rule;
				ctx.globalAlpha = isFocusFam || prevIsFocusFam ? 0.85 : bandH >= 24 ? 0.72 : 0.48;
				ctx.lineWidth = isFocusFam || prevIsFocusFam ? 1.25 : 1;
				ctx.beginPath();
				ctx.moveTo(0, ly);
				ctx.lineTo(cw, ly);
				ctx.stroke();
			}
		}
		ctx.restore();
		let activeNodeSet: Set<string> | null = null;
		if (focusId) {
			activeNodeSet = new Set([focusId]);
			for (const e of layout.adj.get(focusId) ?? []) {
				activeNodeSet.add(e.source);
				activeNodeSet.add(e.target);
			}
			if (chainOutgoing) {
				for (const id of outgoingChain.nodeIds) activeNodeSet.add(id);
			}
		} else if (focusEdge) {
			activeNodeSet = new Set([focusEdge.source, focusEdge.target]);
		}
		// Only a *selection* quiets the rest of the map; merely pointing at things never makes it flicker.
		const quiet = hasActiveOverlay || selectedNodeId !== null || selectedEdgeId !== null;
		const restAlpha = hasActiveOverlay ? 0.26 : quiet ? 0.28 : 1;

		const hiIds = new Set<string>();
		if (!hasActiveOverlay) {
			if (selectedNodeId) hiIds.add(selectedNodeId);
			if (steppedFromNodeId) hiIds.add(steppedFromNodeId);
			if (activeChainStep) {
				hiIds.add(activeChainStep.from.id);
				hiIds.add(activeChainStep.to.id);
			}
			// When locked, hovering an unrelated studio does NOT hijack highlight (only hovered neighbours do).
			if (hoveredNodeId && (!isLocked || activeNodeSet?.has(hoveredNodeId))) hiIds.add(hoveredNodeId);
		}
		for (const id of compareHighlightNodes) hiIds.add(id);
		const forcedIds = new Set<string>(hiIds);
		if (activeNodeSet) for (const id of activeNodeSet) forcedIds.add(id);
		for (const id of trailStudioIds) forcedIds.add(id);
		for (const id of vnHighlightStudios) forcedIds.add(id);

		const plan = planFrame(ctx, cw, ch, hiIds, forcedIds);
		const shown = plan.shown;
		const shownEdges = new Set<string>();
		const isRelated = (id: string) =>
			(activeNodeSet?.has(id) ?? false) ||
			trailStudioIds.has(id) ||
			compareHighlightNodes.has(id) ||
			vnHighlightStudios.has(id);

		ctx.save();
		ctx.translate(cam.x, cam.y);
		ctx.scale(cam.scale, cam.scale);
		ctx.lineJoin = 'round';

		// 2. Lifelines: every studio on the map is a continuous line from its glyph start to its last release
		//    (closing any gap between an owner's founding rail and its later release span so arcs never float in mid-air).
		for (const nd of layout.nodes) {
			if (!shown.has(nd.id)) continue;
			const lineStart = Math.min(nd.x, nd.lifeX);
			if (nd.endX - lineStart < 2 * px) continue;
			if (nd.endX < visMin.x || lineStart > visMax.x || nd.y < visMin.y || nd.y > visMax.y) continue;
			const isSel = hiIds.has(nd.id);
			const related = isRelated(nd.id);
			ctx.save();
			ctx.lineCap = 'round';
			ctx.strokeStyle = isSel ? theme.confirmed : nd.tier === 1 ? theme.ink2 : theme.ink3;
			ctx.globalAlpha =
				(isSel ? 0.95 : nd.tier === 1 ? 0.78 : nd.tier === 2 ? 0.62 : 0.46) * (isSel || related ? 1 : restAlpha);
			ctx.lineWidth = (isSel ? 3 : nd.tier === 1 ? 2.3 : nd.tier === 2 ? 1.7 : 1.3) * px;
			ctx.beginPath();
			ctx.moveTo(lineStart, nd.y);
			ctx.lineTo(nd.endX, nd.y);
			ctx.stroke();
			// A studio that has gone quiet ends on a stop; one still releasing runs open-ended.
			if (nd.inactive && scale >= 0.3) {
				ctx.lineCap = 'butt';
				ctx.lineWidth = 1.2 * px;
				ctx.beginPath();
				ctx.moveTo(nd.endX, nd.y - 3.5 * px);
				ctx.lineTo(nd.endX, nd.y + 3.5 * px);
				ctx.stroke();
			}
			ctx.restore();
		}

		// 3. Corporate rails: one trunk per owner, from its start to the newest brand it holds.
		for (const nd of layout.nodes) {
			if (nd.spineChildren === 0 || !shown.has(nd.id)) continue;
			if (nd.spineEndX - nd.x < 2 * px) continue;
			if (nd.spineEndX < visMin.x || nd.x > visMax.x || nd.y < visMin.y || nd.y > visMax.y) continue;
			const isFocus = nd.id === focusId;
			ctx.save();
			ctx.lineCap = 'round';
			ctx.strokeStyle = theme.ownership;
			ctx.globalAlpha = (isFocus ? 1 : 0.86) * (isFocus || isRelated(nd.id) ? 1 : restAlpha);
			ctx.lineWidth = ((nd.spineChildren >= 8 ? 3.4 : nd.spineChildren >= 3 ? 2.8 : 2.2) + (isFocus ? 0.8 : 0)) * px;
			ctx.beginPath();
			ctx.moveTo(nd.x, nd.y);
			ctx.lineTo(nd.spineEndX, nd.y);
			ctx.stroke();
			ctx.restore();
		}

		// 4. Links. Stated ownership branches off the rail at the brand's own year
		//    (or folds to a tick while the brand is off the map); everything else is
		//    an arc from the earlier lifeline. Links in focus are drawn last, on top.
		const tickLen = Math.max(2, Math.min(6, layout.rowStep * scale * 0.8)) * px;
		const manyInFocus = focusId !== null && (layout.adj.get(focusId)?.length ?? 0) > 10;
		const comparePathEdges: PlacedLandscapeEdge[] = [];
		const drawLinks = (focusPass: boolean) => {
			for (const e of layout.edges) {
				const s = e.sourceNode;
				const t = e.targetNode;
				const isCompareExplicit =
					compareData !== null && comparePathPairs.has(`${e.source}|${e.target}`) && e.register === 'confirmed';
				const isPicked =
					focusEdge?.id === e.id ||
					(steppedEdgeId !== null && steppedEdgeId === e.id) ||
					(activeChainStep !== null && activeChainStep.edge.id === e.id) ||
					(hoveredEdgeId !== null && hoveredEdgeId === e.id && (!isLocked || (focusId !== null && (e.source === focusId || e.target === focusId))));
				const isInChain = chainOutgoing && outgoingChain.edgeIds.has(e.id);
				const isHi =
					isCompareExplicit ||
					isPicked ||
					isInChain ||
					(focusId !== null && (e.source === focusId || e.target === focusId));
				if (isHi !== focusPass) continue;
				const route = e.route;
				const isBus = route.type === 'bus';

				let tickOnly = false;
				if (!isHi) {
					if (e.secondary) continue;
					if (!shown.has(s.id)) continue;
					if (isBus) tickOnly = !shown.has(t.id);
					else if (!shown.has(t.id) || (e.isCrossTerritory && e.spanY > 360)) continue;
				}

				const b = edgeBounds(route);
				if (b.maxX < visMin.x || b.minX > visMax.x) continue;
				if (!isHi || !isBus) {
					if (b.maxY < visMin.y || b.minY > visMax.y) continue;
				}

				const color = isCompareExplicit ? theme.confirmed : kindColor(e.kind);
				ctx.save();
				ctx.strokeStyle = color;
				ctx.fillStyle = color;
				if (tickOnly && route.type === 'bus') {
					ctx.globalAlpha = 0.6 * restAlpha;
					ctx.lineWidth = 1 * px;
					ctx.beginPath();
					ctx.moveTo(route.forkX, route.fromY);
					ctx.lineTo(route.forkX, route.fromY + Math.sign(route.toY - route.fromY) * tickLen);
					ctx.stroke();
					ctx.restore();
					continue;
				}
				shownEdges.add(e.id);
				if (isCompareExplicit) comparePathEdges.push(e);
				ctx.beginPath();
				traceEdge(ctx, route, isHi && isBus);
				if (e.register === 'inferred') {
					ctx.setLineDash(e.seiyuuDriven ? [2 * px, 4 * px] : [6 * px, 4 * px]);
				}
				if (isHi) {
					ctx.globalAlpha = isPicked || isCompareExplicit || !manyInFocus ? 0.97 : 0.82;
					ctx.lineWidth = (isPicked || isCompareExplicit ? 2.8 : manyInFocus ? 1.4 : 2.1) * px;
				} else {
					ctx.globalAlpha =
						(isBus ? 0.62 : e.isCrossTerritory ? 0.42 : e.register === 'confirmed' ? 0.8 : 0.62) * restAlpha;
					ctx.lineWidth = (isBus ? 1.25 : e.register === 'confirmed' ? 1.6 : 1.25) * px;
				}
				ctx.stroke();
				ctx.setLineDash([]);

				// Anchor dot where a highlighted arc leaves its lifeline so the connection is unmistakable.
				if (route.type === 'arc' && isHi) {
					ctx.beginPath();
					ctx.arc(route.fromX, route.fromY, 2.7 * px, 0, Math.PI * 2);
					ctx.fill();
				}

				if (route.type === 'arc' && e.directed && (isHi || scale >= 0.3)) {
					const angle = Math.atan2(route.toY - route.cp2y, route.toX - route.cp2x);
					const tipDist = (glyphRadius(t) + 3) * px;
					const tipX = route.toX - Math.cos(angle) * tipDist;
					const tipY = route.toY - Math.sin(angle) * tipDist;
					drawArrowhead(ctx, tipX, tipY, tipX - Math.cos(angle), tipY - Math.sin(angle), (isHi ? 7.5 : 5.5) * px);
				}
				ctx.restore();
			}
		};
		drawLinks(false);
		drawLinks(true);

		// 5. Compare Spotlight dashed bridge (only when VNDB does NOT already directly link A and B!)
		if (compareData && (compareData.explicitPath?.length ?? 0) !== 2) {
			const na = layout.nodeById.get(compareData.producerA.id);
			const nb = layout.nodeById.get(compareData.producerB.id);
			if (na && nb) {
				const c = edgeCurvePoints(na, nb, 'sister');
				ctx.save();
				ctx.beginPath();
				ctx.moveTo(na.x, na.y);
				ctx.bezierCurveTo(c.cp1x, c.cp1y, c.cp2x, c.cp2y, nb.x, nb.y);
				ctx.strokeStyle = compareData.inferred ? theme.inferred : theme.ink3;
				ctx.lineWidth = 3 * px;
				ctx.setLineDash([8 * px, 5 * px]);
				ctx.globalAlpha = 0.95;
				ctx.stroke();
				ctx.restore();
			}
		}

		// 6. Studio glyphs. An owner is a ringed terminus in the ownership hue, at
		//    the head of its rail; a flagship studio is a solid ink disc; lesser
		//    studios are progressively lighter rings. Shape still says producer type.
		for (let i = layout.nodes.length - 1; i >= 0; i--) {
			const nd = layout.nodes[i];
			if (!shown.has(nd.id)) continue;
			const r = glyphRadius(nd) * px;
			if (nd.x + r < visMin.x || nd.x - r > visMax.x || nd.y + r < visMin.y || nd.y - r > visMax.y) continue;
			const isSel = hiIds.has(nd.id);
			const isOverlayStudio = trailStudioIds.has(nd.id) || vnHighlightStudios.has(nd.id);
			const related = isSel || isOverlayStudio || isRelated(nd.id);
			const owner = nd.spineChildren > 0;

			ctx.save();
			ctx.globalAlpha = (nd.inactive && !owner && !isSel ? 0.78 : 1) * (related ? 1 : restAlpha);
			// A brand with no release on record is drawn dashed; an owner without one is the norm, so it is not.
			if (nd.undated && !owner && !isSel) ctx.setLineDash([2.2 * px, 1.8 * px]);
			drawStudioShape(ctx, nd.x, nd.y, r, nd.type);
			if (isSel) {
				ctx.fillStyle = theme.confirmed;
				ctx.strokeStyle = theme.ink;
				ctx.lineWidth = 2 * px;
			} else if (isOverlayStudio) {
				ctx.fillStyle = theme.surfaceRaised;
				ctx.strokeStyle = theme.confirmed;
				ctx.lineWidth = 2.2 * px;
			} else if (owner) {
				ctx.fillStyle = theme.canvas;
				ctx.strokeStyle = theme.ownership;
				ctx.lineWidth = 2.2 * px;
			} else if (nd.tier === 1) {
				ctx.fillStyle = theme.ink;
				ctx.strokeStyle = theme.canvas;
				ctx.lineWidth = 1.6 * px;
			} else if (nd.tier === 2) {
				ctx.fillStyle = theme.surfaceRaised;
				ctx.strokeStyle = theme.ink2;
				ctx.lineWidth = 1.5 * px;
			} else {
				ctx.fillStyle = theme.canvas;
				ctx.strokeStyle = theme.ink3;
				ctx.lineWidth = 1.2 * px;
			}
			ctx.fill();
			ctx.stroke();
			ctx.setLineDash([]);
			if (owner && !isSel && !isOverlayStudio) {
				// Core of the terminus: ink when the owner also releases under its own name, hue when it only holds brands.
				drawStudioShape(ctx, nd.x, nd.y, r * 0.42, nd.type);
				ctx.fillStyle = nd.role === 'hub' ? theme.ink : theme.ownership;
				ctx.fill();
			}
			if (isSel) {
				ctx.beginPath();
				ctx.arc(nd.x, nd.y, r + 5 * px, 0, Math.PI * 2);
				ctx.strokeStyle = theme.focus;
				ctx.lineWidth = 2.2 * px;
				ctx.globalAlpha = 0.9;
				ctx.stroke();
			}
			ctx.restore();
		}

		// 7. VN-by-VN Career Trail: every stop sits on the lifeline of the studio that made it.
		const drawTrail = (trail: CareerTrail, isSecondary: boolean) => {
			const denseSuppressed = !isSecondary && trail.stops.length > 30 && !showAllTrailLines;
			for (const lane of trail.lanes) {
				const lx0 = lane.minX - 40 / cam.scale;
				const lx1 = lane.maxX + 40 / cam.scale;
				ctx.save();
				ctx.strokeStyle = isSecondary ? theme.inferred : theme.confirmed;
				ctx.globalAlpha = isSecondary ? 0.36 : 0.38;
				ctx.lineWidth = (isSecondary ? 1.8 : 2.1) / cam.scale;
				if (lane.virtual || isSecondary) ctx.setLineDash([5 / cam.scale, 4 / cam.scale]);
				ctx.beginPath();
				ctx.moveTo(lx0, lane.y);
				ctx.lineTo(lx1, lane.y);
				ctx.stroke();
				ctx.restore();
			}

			for (const seg of trail.segments) {
				// On dense careers (>30 stops), suppress crisscrossing all-stop spaghetti by default
				// and draw ONLY the immediate prev → activeStop → next spotlight arrows!
				const touchesActive =
					activeStop != null &&
					((isSecondary && showingInferredOnly) || (!isSecondary && !showingInferredOnly)) &&
					(seg.from.index === activeStop.index || seg.to.index === activeStop.index);
				if (denseSuppressed && !touchesActive) continue;
				ctx.save();
				ctx.beginPath();
				ctx.moveTo(seg.from.x, seg.from.y);
				ctx.bezierCurveTo(seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.to.x, seg.to.y);
				ctx.strokeStyle = isSecondary ? theme.inferred : seg.studioChanged ? theme.confirmed : theme.ink;
				ctx.globalAlpha = isSecondary ? 0.9 : touchesActive ? 0.98 : seg.studioChanged ? 0.85 : 0.72;
				ctx.lineWidth = (touchesActive ? 3.2 : isSecondary ? 2.4 : seg.studioChanged ? 2.4 : 1.9) / cam.scale;
				if (isSecondary) ctx.setLineDash([7 / cam.scale, 4 / cam.scale]);
				ctx.stroke();
				ctx.setLineDash([]);

				const ang = Math.atan2(seg.to.y - seg.cp2y, seg.to.x - seg.cp2x);
				const stopR = (isSecondary ? 6 : 7) / cam.scale;
				const tipX = seg.to.x - Math.cos(ang) * (stopR + 2 / cam.scale);
				const tipY = seg.to.y - Math.sin(ang) * (stopR + 2 / cam.scale);
				ctx.fillStyle = isSecondary ? theme.inferred : seg.studioChanged ? theme.confirmed : theme.ink;
				ctx.globalAlpha = isSecondary ? 0.9 : 0.94;
				drawArrowhead(ctx, tipX, tipY, seg.cp2x, seg.cp2y, 6.8 / cam.scale);
				ctx.restore();
			}

			for (const stop of trail.stops) {
				const isActive = ((isSecondary && showingInferredOnly) || (!isSecondary && !showingInferredOnly)) && activeStop?.key === stop.key;
				const isHov = ((isSecondary && showingInferredOnly) || (!isSecondary && !showingInferredOnly)) && hoveredStopKey === stop.key;
				const r = (isActive || isHov ? 8.5 : isSecondary ? 6 : 6.4) / cam.scale;
				const col = isSecondary ? theme.inferred : roleColor(stop.primaryRole);
				ctx.save();
				ctx.beginPath();
				if (stop.isSeiyuu) ctx.arc(stop.x, stop.y, r, 0, Math.PI * 2);
				else ctx.rect(stop.x - r * 0.88, stop.y - r * 0.88, r * 1.76, r * 1.76);
				ctx.fillStyle = isSecondary ? theme.canvas : col;
				ctx.fill();
				ctx.lineWidth = (isActive || isHov ? 2.6 : 1.7) / cam.scale;
				ctx.strokeStyle = isActive || isHov ? theme.ink : isSecondary ? theme.inferred : theme.canvas;
				if (isSecondary) ctx.setLineDash([3 / cam.scale, 2 / cam.scale]);
				ctx.stroke();
				ctx.setLineDash([]);
				if (isActive) {
					ctx.beginPath();
					ctx.arc(stop.x, stop.y, r + 6 / cam.scale, 0, Math.PI * 2);
					ctx.strokeStyle = theme.focus;
					ctx.lineWidth = 2.4 / cam.scale;
					ctx.stroke();
				}
				ctx.restore();
			}
		};

		if (secondaryTrail) drawTrail(secondaryTrail, true);
		if (primaryTrail && !showingInferredOnly) drawTrail(primaryTrail, false);

		// 8. VN Series Handoff Spotlight
		if (vnSpotlight) {
			const f = vnSpotlight.focus;
			for (const rel of vnSpotlight.related) {
				const c = edgeCurvePoints(f, rel, 'lineage');
				ctx.save();
				ctx.beginPath();
				ctx.moveTo(f.x, f.y);
				ctx.bezierCurveTo(c.cp1x, c.cp1y, c.cp2x, c.cp2y, rel.x, rel.y);
				ctx.strokeStyle = rel.pid !== f.pid ? theme.lineage : theme.confirmed;
				ctx.lineWidth = 2.4 / cam.scale;
				ctx.globalAlpha = 0.88;
				ctx.stroke();
				const ang = Math.atan2(rel.y - c.cp2y, rel.x - c.cp2x);
				const tipX = rel.x - Math.cos(ang) * (9.5 / cam.scale);
				const tipY = rel.y - Math.sin(ang) * (9.5 / cam.scale);
				ctx.fillStyle = rel.pid !== f.pid ? theme.lineage : theme.confirmed;
				drawArrowhead(ctx, tipX, tipY, c.cp2x, c.cp2y, 6.8 / cam.scale);
				ctx.restore();
			}
			for (const pt of [...vnSpotlight.related, f]) {
				const r = (pt.isFocus ? 9.5 : 6.8) / cam.scale;
				ctx.save();
				ctx.beginPath();
				ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
				ctx.fillStyle = pt.isFocus ? theme.confirmed : theme.surfaceRaised;
				ctx.fill();
				ctx.lineWidth = (pt.isFocus ? 2.6 : 2) / cam.scale;
				ctx.strokeStyle = pt.isFocus ? theme.ink : theme.confirmed;
				ctx.stroke();
				ctx.restore();
			}
		}

		ctx.restore(); // End world-space transform

		// ── Screen-Space Labels (razor-sharp, collision-free) ──
		// Trail and series overlays bring their own captions, so studio names step aside for them.
		const showStudioLabels = !primaryTrail && !vnSpotlight;
		const placedBoxes: ScreenBox[] = showStudioLabels ? plan.boxes : [];
		const collides = (x1: number, y1: number, x2: number, y2: number) => {
			for (const b of placedBoxes) {
				if (x1 < b.x2 && x2 > b.x1 && y1 < b.y2 && y2 > b.y1) return true;
			}
			return false;
		};

		// B. VN-by-VN Career Trail labels & ⇄ pen-name badges (respects Both vs Inferred only cleanly!)
		if (activeTrail) {
			const labelTrails: Array<{ trail: CareerTrail; isSec: boolean }> = showingInferredOnly && secondaryTrail
				? [{ trail: secondaryTrail, isSec: true }]
				: [
						...(primaryTrail ? [{ trail: primaryTrail, isSec: false }] : []),
						...(secondaryTrail ? [{ trail: secondaryTrail, isSec: true }] : [])
					];

			// 1. Studio lane tags (for the currently visible trail(s) only!)
			ctx.save();
			ctx.font = `600 10.5px ${theme.fontSans}`;
			ctx.textAlign = 'right';
			ctx.textBaseline = 'middle';
			const placedLaneBoxes: ScreenBox[] = [];
			for (const { trail, isSec } of labelTrails) {
				for (const lane of trail.lanes) {
					const p = worldToScreen(lane.minX, lane.y);
					if (p.y < RULER_H + 14 || p.y > ch - 14) continue;
					const rawLbl = shownName(lane.name, lane.original);
					const lbl = rawLbl.length > 22 ? rawLbl.slice(0, 20) + '…' : rawLbl;
					const tw = ctx.measureText(lbl).width;
					const bx = Math.max(tw + 18, Math.min(cw - 24, p.x - 16));
					let ly = p.y;
					let fits = false;
					for (let step = 0; step < 6; step++) {
						const x1 = bx - tw - 10;
						const y1 = ly - 10;
						const x2 = bx + 6;
						const y2 = ly + 10;
						const hit = placedLaneBoxes.some((b) => x1 < b.x2 && x2 > b.x1 && y1 < b.y2 && y2 > b.y1);
						if (!hit) {
							placedLaneBoxes.push({ x1, y1, x2, y2 });
							placedBoxes.push({ x1: x1 - 2, y1: y1 - 2, x2: x2 + 2, y2: y2 + 2 });
							fits = true;
							break;
						}
						ly += step % 2 === 0 ? 20 : -20 * (Math.floor(step / 2) + 1);
					}
					if (!fits) continue;
					ctx.fillStyle = theme.surfaceRaised;
					ctx.globalAlpha = lane.virtual ? 0.88 : 0.95;
					ctx.beginPath();
					ctx.roundRect(bx - tw - 8, ly - 9, tw + 12, 18, 4);
					ctx.fill();
					ctx.strokeStyle = isSec ? theme.inferred : lane.virtual ? theme.ruleStrong : theme.confirmed;
					ctx.globalAlpha = isSec ? 0.78 : lane.virtual ? 0.7 : 0.55;
					ctx.lineWidth = 1;
					if (lane.virtual || isSec) ctx.setLineDash([3, 2]);
					ctx.stroke();
					ctx.setLineDash([]);
					ctx.fillStyle = isSec ? theme.inferred : lane.virtual ? theme.ink2 : theme.ink;
					ctx.globalAlpha = 0.96;
					ctx.fillText(lbl, bx - 2, ly + 0.5);
				}
			}
			ctx.restore();

			// 2. Interactive ⇄ confirmed pen-name switch circles (only on drawn segments!)
			if (!showingInferredOnly && primaryTrail) {
				const denseSuppressed = primaryTrail.stops.length > 30 && !showAllTrailLines;
				ctx.save();
				ctx.font = `600 11px ${theme.fontMono}`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				for (let si = 0; si < primaryTrail.segments.length; si++) {
					const seg = primaryTrail.segments[si];
					if (!seg.aliasChanged) continue;
					if (denseSuppressed && activeStop && seg.from.index !== activeStop.index && seg.to.index !== activeStop.index) continue;
					const mid = cubicAt(seg.from.x, seg.from.y, seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.to.x, seg.to.y, 0.5);
					const p = worldToScreen(mid.x, mid.y);
					if (p.x < 10 || p.x > cw - 10 || p.y < RULER_H + 10 || p.y > ch - 10) continue;
					const isHov = hoveredAliasSegIdx === si;
					const r = isHov ? 11.5 : 10;
					placedBoxes.push({ x1: p.x - r - 2, y1: p.y - r - 2, x2: p.x + r + 2, y2: p.y + r + 2 });
					ctx.fillStyle = isHov ? theme.confirmed : theme.surfaceRaised;
					ctx.globalAlpha = 0.98;
					ctx.beginPath();
					ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
					ctx.fill();
					ctx.strokeStyle = isHov ? theme.ink : theme.confirmed;
					ctx.lineWidth = isHov ? 1.8 : 1.4;
					ctx.stroke();
					ctx.fillStyle = isHov ? theme.canvas : theme.confirmed;
					ctx.fillText('⇄', p.x, p.y + 0.5);
				}
				ctx.restore();
			}

			// 3. Minimal VN stop titles (for activeTrail, plus secondary overlay stops so potential aliases are always readable)
			const lastIdx = activeTrail.stops.length - 1;
			const aliasTargetKey =
				!showingInferredOnly && hoveredAliasSegIdx !== null && primaryTrail
					? (primaryTrail.segments[hoveredAliasSegIdx]?.to.key ?? null)
					: null;
			const maxAmbient = scale >= 1.1 ? 14 : scale >= 0.55 ? 7 : 0;
			let ambientPlaced = 0;
			const stopsToLabel: Array<{ st: CareerTrailStop; isSec: boolean }> = [
				...activeTrail.stops.map((st) => ({ st, isSec: showingInferredOnly })),
				...(!showingInferredOnly && secondaryTrail ? secondaryTrail.stops.map((st) => ({ st, isSec: true })) : [])
			].sort((a, b) => {
				const rank = (x: { st: CareerTrailStop; isSec: boolean }) =>
					activeStop?.key === x.st.key || hoveredStopKey === x.st.key
						? 4
						: x.isSec
							? 3
							: aliasTargetKey === x.st.key
								? 2
								: x.st.index === 0 || x.st.index === lastIdx
									? 1
									: 0;
				return rank(b) - rank(a) || a.st.index - b.st.index;
			});
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'bottom';
			for (const { st, isSec } of stopsToLabel) {
				const p = worldToScreen(st.x, st.y);
				if (p.x < -40 || p.x > cw + 40 || p.y < RULER_H + 14 || p.y > ch - 10) continue;
				const isHi = activeStop?.key === st.key || hoveredStopKey === st.key;
				const isAnchor = isSec || st.index === 0 || st.index === lastIdx || aliasTargetKey === st.key;
				if (!isHi && !isAnchor) {
					if (ambientPlaced >= maxAmbient) continue;
				}
				const rawTitle = shownName(st.title, st.original);
				const shortTitle = rawTitle.length > 24 && !isHi ? rawTitle.slice(0, 22) + '…' : rawTitle;
				const label = `${shortTitle} (${st.year})`;
				ctx.font = `${isHi ? 600 : 500} ${isHi ? 12 : 10.5}px ${theme.fontSans}`;
				const tw = ctx.measureText(label).width;
				const x1 = p.x - tw / 2 - 6;
				const y1 = p.y - 27;
				const x2 = p.x + tw / 2 + 6;
				const y2 = p.y - 9;
				const padX = isHi ? 2 : 12;
				const padY = isHi ? 2 : 7;
				if (!isHi && collides(x1 - padX, y1 - padY, x2 + padX, y2 + padY)) continue;
				placedBoxes.push({ x1: x1 - padX, y1: y1 - padY, x2: x2 + padX, y2: y2 + padY });
				if (!isHi && !isAnchor) ambientPlaced++;
				ctx.fillStyle = isHi ? theme.surfaceRaised : theme.canvas;
				ctx.globalAlpha = isHi ? 0.98 : 0.9;
				ctx.beginPath();
				ctx.roundRect(x1, y1, x2 - x1, y2 - y1, 4);
				ctx.fill();
				if (isHi || isSec) {
					ctx.strokeStyle = isSec ? theme.inferred : theme.focus;
					ctx.lineWidth = isHi ? 1.25 : 1;
					if (isSec) ctx.setLineDash([3, 2]);
					ctx.stroke();
					ctx.setLineDash([]);
				}
				ctx.fillStyle = isSec ? theme.inferred : isHi ? theme.ink : theme.ink2;
				ctx.globalAlpha = 1;
				ctx.fillText(label, p.x, p.y - 12);
			}
			ctx.restore();
		}

		// C. VN Series Handoff Spotlight labels
		if (vnSpotlight) {
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'bottom';
			for (const pt of [vnSpotlight.focus, ...vnSpotlight.related]) {
				const p = worldToScreen(pt.x, pt.y);
				if (p.x < -40 || p.x > cw + 40 || p.y < RULER_H + 14 || p.y > ch - 10) continue;
				const raw = shownName(pt.title, pt.original);
				const relTag = pt.relation ? `[${VN_RELATION_LABELS[pt.relation] ?? pt.relation}] ` : '';
				const label = `${relTag}${raw.length > 26 && !pt.isFocus ? raw.slice(0, 24) + '…' : raw} (${pt.year})`;
				ctx.font = `${pt.isFocus ? 600 : 500} ${pt.isFocus ? 12 : 11}px ${theme.fontSans}`;
				const tw = ctx.measureText(label).width;
				const x1 = p.x - tw / 2 - 6;
				const y1 = p.y - 28;
				const x2 = p.x + tw / 2 + 6;
				const y2 = p.y - 9;
				if (!pt.isFocus && collides(x1 - 4, y1 - 3, x2 + 4, y2 + 3)) continue;
				placedBoxes.push({ x1: x1 - 4, y1: y1 - 3, x2: x2 + 4, y2: y2 + 3 });
				ctx.fillStyle = theme.surfaceRaised;
				ctx.globalAlpha = 0.94;
				ctx.beginPath();
				ctx.roundRect(x1, y1, x2 - x1, y2 - y1, 4);
				ctx.fill();
				ctx.fillStyle = pt.isFocus ? theme.ink : theme.ink2;
				ctx.globalAlpha = 1;
				ctx.fillText(label, p.x, p.y - 12);
			}
			ctx.restore();
		}

		// D. Studio names, exactly as planned: each on its own line, backed by the
		//    canvas colour so no rail or riser ever strikes through a name.
		if (showStudioLabels) {
			// Quiet family margin captions in each band's empty top channel (never colliding with studio names or HUD).
			ctx.save();
			ctx.font = `600 9.5px ${theme.fontMono}`;
			ctx.textAlign = 'left';
			ctx.textBaseline = 'middle';
			for (const t of layout.territories) {
				const y0 = t.bandMinY * scale + cam.y;
				const y1 = t.bandMaxY * scale + cam.y;
				const bandH = y1 - y0;
				if (bandH < 34 || y1 < RULER_H + 14 || y0 > ch - 14) continue;
				const hy = y0 + 10;
				if (hy < RULER_H + 10 || hy > ch - 12) continue;
				// Stay clear of the floating top-left search & filter HUD.
				if (hy < 114) continue;
				const isFocusFam = focusTerritoryId === t.id;
				const rawFam = shownName(t.label, t.labelOriginal);
				const shortFam = rawFam.length > 28 ? rawFam.slice(0, 26) + '…' : rawFam;
				const caption = `${shortFam.toUpperCase()} · ${t.nodeCount}`;
				const tw = measureText(ctx, ctx.font, caption);
				const bx = 14;
				if (collides(bx - 4, hy - 8, bx + tw + 8, hy + 8)) continue;
				ctx.fillStyle = isFocusFam ? theme.confirmed : theme.ink2;
				ctx.globalAlpha = isFocusFam ? 0.98 : quiet ? 0.42 : 0.78;
				ctx.fillText(caption, bx, hy);
			}
			ctx.restore();

			ctx.save();
			ctx.textAlign = 'left';
			ctx.textBaseline = 'middle';
			for (const l of plan.labels) {
				const nd = l.nd;
				if (compareData && !l.hi) continue;
				const total = l.w + l.suffixW;
				if (l.tx + total < -20 || l.tx > cw + 20 || l.ty < RULER_H + 8 || l.ty > ch - 6) continue;
				const related = l.hi || (activeNodeSet?.has(nd.id) ?? false);
				const h = l.size + 5;
				ctx.globalAlpha = l.hi ? 0.97 : related || !quiet ? 0.9 : 0.5;
				ctx.fillStyle = l.hi ? theme.surfaceRaised : theme.canvas;
				ctx.beginPath();
				ctx.roundRect(l.tx - 4, l.ty - h / 2, total + 8, h, 3);
				ctx.fill();
				if (l.hi) {
					ctx.strokeStyle = theme.focus;
					ctx.lineWidth = 1.1;
					ctx.stroke();
				}
				ctx.globalAlpha = related || !quiet ? 1 : 0.42;
				ctx.font = l.font;
				ctx.fillStyle =
					l.hi || nd.spineChildren > 0 || nd.tier === 1 ? theme.ink : nd.tier === 3 ? theme.ink3 : theme.ink2;
				ctx.fillText(l.text, l.tx, l.ty + 0.5);
				if (l.suffix) {
					ctx.font = `500 ${SUFFIX_FONT_PX}px ${theme.fontMono}`;
					ctx.fillStyle = theme.ownership;
					ctx.fillText(l.suffix, l.tx + l.w + 6, l.ty + 0.5);
				}
			}
			ctx.restore();
		}

		// E. Relation words on links, once there is room to read them (or the link is in focus).
		if (compareData ? comparePathEdges.length > 0 : !hasActiveOverlay && (scale >= 0.8 || focusEdge || focusId)) {
			ctx.save();
			ctx.font = `600 10px ${theme.fontSans}`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			let pills = 0;
			const drawPill = (e: PlacedLandscapeEdge, isHi: boolean): boolean => {
				const spots = e.route.type === 'arc' ? [0.5, 0.36, 0.64] : [0.5];
				const tw = measureText(ctx, ctx.font, e.code) + 12;
				for (const t of spots) {
					const mid = edgeLabelPoint(e.route, t);
					const p = worldToScreen(mid.x, mid.y);
					if (p.x < 16 || p.x > cw - 16 || p.y < RULER_H + 14 || p.y > ch - 14) continue;
					if (collides(p.x - tw / 2 - 2, p.y - 8, p.x + tw / 2 + 2, p.y + 8)) continue;
					placedBoxes.push({ x1: p.x - tw / 2 - 2, y1: p.y - 8, x2: p.x + tw / 2 + 2, y2: p.y + 8 });
					ctx.fillStyle = theme.surfaceRaised;
					ctx.globalAlpha = 0.96;
					ctx.beginPath();
					ctx.roundRect(p.x - tw / 2, p.y - 7.5, tw, 15, 7.5);
					ctx.fill();
					ctx.strokeStyle = kindColor(e.kind);
					ctx.lineWidth = isHi ? 1.5 : 1;
					if (e.register === 'inferred') ctx.setLineDash([3, 2]);
					ctx.stroke();
					ctx.setLineDash([]);
					ctx.fillStyle = theme.ink;
					ctx.globalAlpha = 1;
					ctx.fillText(e.code, p.x, p.y + 0.5);
					return true;
				}
				return false;
			};
			// The stated VNDB path between two compared studios names each of its steps.
			for (const e of comparePathEdges) drawPill(e, true);
			// Links in focus (or active outgoing chain) claim their spots first.
			for (const e of layout.edges) {
				if (!shownEdges.has(e.id)) continue;
				const isHi =
					focusEdge?.id === e.id ||
					(chainOutgoing && outgoingChain.edgeIds.has(e.id)) ||
					(focusId !== null && (e.source === focusId || e.target === focusId));
				if (isHi && pills < 90 && drawPill(e, true)) pills++;
			}
			if (scale >= 0.8 && !quiet && !hasActiveOverlay) {
				for (const e of layout.edges) {
					if (pills >= 90) break;
					if (!shownEdges.has(e.id)) continue;
					if (focusEdge?.id === e.id || (focusId !== null && (e.source === focusId || e.target === focusId))) continue;
					if (drawPill(e, false)) pills++;
				}
			}
			ctx.restore();
		}

		ctx.restore();
		shownNodeIds = shown;
		shownEdgeIds = shownEdges;
	}

	function drawMinimap() {
		const mm = minimapEl;
		if (!mm || !theme.canvas) return;
		const dpr = window.devicePixelRatio || 1;
		if (mm.width !== Math.round(miniW * dpr) || mm.height !== Math.round(miniH * dpr)) {
			mm.width = Math.round(miniW * dpr);
			mm.height = Math.round(miniH * dpr);
		}
		const ctx = mm.getContext('2d');
		if (!ctx) return;
		ctx.save();
		ctx.scale(dpr, dpr);
		ctx.fillStyle = theme.surface;
		ctx.fillRect(0, 0, miniW, miniH);

		const { sx, sy, ox, oy } = minimapTransform();

		// The map in miniature: corporate rails as hairlines, flagship studios as dots.
		ctx.strokeStyle = theme.ownership;
		ctx.lineWidth = 1;
		ctx.globalAlpha = hasActiveOverlay ? 0.2 : 0.5;
		ctx.beginPath();
		for (const nd of layout.nodes) {
			if (nd.spineChildren < 3) continue;
			const y = Math.round(nd.y * sy + oy) + 0.5;
			ctx.moveTo(nd.x * sx + ox, y);
			ctx.lineTo(nd.spineEndX * sx + ox, y);
		}
		ctx.stroke();
		ctx.fillStyle = theme.ink3;
		ctx.globalAlpha = hasActiveOverlay ? 0.18 : 0.5;
		for (const nd of layout.nodes) {
			if (nd.tier === 3) continue;
			const x = nd.x * sx + ox;
			const y = nd.y * sy + oy;
			const sz = nd.tier === 1 ? 1.8 : 1;
			ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
		}

		if (activeTrail && activeTrail.stops.length > 0) {
			ctx.strokeStyle = showingInferredOnly ? theme.inferred : theme.confirmed;
			ctx.lineWidth = 1.6;
			ctx.globalAlpha = 0.95;
			ctx.beginPath();
			activeTrail.stops.forEach((st, i) => {
				const x = st.x * sx + ox;
				const y = st.y * sy + oy;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			});
			ctx.stroke();
			ctx.fillStyle = showingInferredOnly ? theme.inferred : theme.confirmed;
			for (const st of activeTrail.stops) {
				ctx.beginPath();
				ctx.arc(st.x * sx + ox, st.y * sy + oy, 2.2, 0, Math.PI * 2);
				ctx.fill();
			}
		}

		if (selectedNode) {
			ctx.fillStyle = theme.focus;
			ctx.globalAlpha = 1;
			ctx.beginPath();
			ctx.arc(selectedNode.x * sx + ox, selectedNode.y * sy + oy, 3.2, 0, Math.PI * 2);
			ctx.fill();
		}

		const tl = screenToWorld(0, RULER_H);
		const br = screenToWorld(viewW, viewH);
		const rw = Math.max(10, (br.x - tl.x) * sx);
		const rh = Math.max(8, (br.y - tl.y) * sy);
		const rx = tl.x * sx + ox - Math.max(0, 10 - (br.x - tl.x) * sx) / 2;
		const ry = tl.y * sy + oy - Math.max(0, 8 - (br.y - tl.y) * sy) / 2;
		ctx.globalAlpha = 0.16;
		ctx.fillStyle = theme.focus;
		ctx.fillRect(rx, ry, rw, rh);
		ctx.globalAlpha = 0.92;
		ctx.strokeStyle = theme.focus;
		ctx.lineWidth = 1.35;
		ctx.strokeRect(rx, ry, rw, rh);

		// Axis markers inside the minimap: years along bottom, vertical axis at top-left.
		ctx.globalAlpha = 0.72;
		ctx.fillStyle = theme.ink3;
		ctx.font = `500 9px ${theme.fontMono}`;
		ctx.textBaseline = 'top';
		ctx.textAlign = 'left';
		ctx.fillText('↓ Families', 6, 4);
		ctx.textBaseline = 'bottom';
		ctx.textAlign = 'left';
		ctx.fillText(String(layout.minYear), 6, miniH - 4);
		ctx.textAlign = 'right';
		ctx.fillText(String(layout.maxYear), miniW - 6, miniH - 4);

		ctx.restore();
	}

	$effect(() => {
		void cam;
		void layout;
		void theme;
		void viewW;
		void viewH;
		void selectedNodeId;
		void selectedEdgeId;
		void steppedFromNodeId;
		void steppedEdgeId;
		void hoveredNodeId;
		void hoveredEdgeId;
		void hoveredStopKey;
		void hoveredAliasSegIdx;
		void primaryTrail;
		void secondaryTrail;
		void trailAliasFilter;
		void showAllTrailLines;
		void chainOutgoing;
		void outgoingChain;
		void activeChainStep;
		void activeStopIdx;
		void vnSpotlight;
		void compareData;
		void prefs.nameOrder;
		void fontEpoch;
		drawMainCanvas();
		drawMinimap();
	});

	/** Restore Atlas state from the current browser URL (handles both SvelteKit navigations and native shallow popstate). */
	function restoreFromUrl(url: URL) {
		if (!initialized || url.pathname !== '/') return;
		const sp = url.searchParams;
		const rawMode = sp.get('mode');
		const urlMode: 'all' | 'explicit' | 'hidden' =
			rawMode === 'hidden' ? 'hidden' : rawMode === 'explicit' ? 'explicit' : 'all';
		if (mode !== urlMode) mode = urlMode;
		const trace = sp.get('trace')?.trim().toLowerCase() || null;
		const cmpTrace = sp.get('compareTrace')?.trim().toLowerCase() || null;
		const vn = sp.get('vn')?.trim().toLowerCase() || null;
		const cmp = sp.get('compare')?.trim().toLowerCase() || null;
		const focus = sp.get('focus')?.trim().toLowerCase() || null;
		const prevFocus = selectedNodeId;
		if (trace) {
			if (traceSid !== trace || compareTraceSid !== cmpTrace) void startCareerTrail(trace, cmpTrace, false);
		} else if (vn) {
			if (spotlightVnId !== vn) void startVnSpotlight(vn, false);
		} else if (cmp) {
			const m = cmp.match(/^(p\d+)-(p\d+)$/i);
			if (m && (comparePair?.a !== m[1] || comparePair?.b !== m[2])) {
				void startCompareSpotlight(m[1], m[2], false);
			}
		} else if (focus) {
			if (layout.nodeById.has(focus)) {
				if (selectedNodeId === focus && !hasActiveOverlay) return;
				const nd = layout.nodeById.get(focus)!;
				selectStudio(focus, false, false);
				if (prevFocus && prevFocus !== focus && layout.nodeById.has(prevFocus)) {
					const prevNd = layout.nodeById.get(prevFocus)!;
					const isAdj = (layout.adj.get(focus) ?? []).some((e) => e.source === prevFocus || e.target === prevFocus);
					if (isAdj) fitStudioPair(nd, prevNd);
					else fitNeighborhood(nd);
				} else {
					fitNeighborhood(nd);
				}
			} else if (unmappedFocus?.id !== focus) {
				void focusUnmappedStudio(focus, false);
			}
		} else {
			clearOverlays(false, false);
		}
	}

	afterNavigate((nav) => {
		if (!initialized || nav.type !== 'popstate') return;
		if (nav.to?.url) restoreFromUrl(nav.to.url);
	});

	let initialized = $state(false);
	let lastExternalKey = '';
	/** The mode in force before the Hidden Links sheet borrowed the Atlas; restored when it closes. */
	let modeBeforeSheet: 'all' | 'explicit' | 'hidden' | null = null;
	$effect(() => {
		const tgt = externalTarget;
		if (!initialized || !tgt || tgt.key === lastExternalKey) return;
		lastExternalKey = tgt.key;
		untrack(() => {
			if (tgt.mode) {
				modeBeforeSheet = null;
				if (mode !== tgt.mode) mode = tgt.mode;
			} else if (tgt.kind !== 'hidden' && modeBeforeSheet) {
				mode = modeBeforeSheet;
				modeBeforeSheet = null;
			}
			// Closing a sheet hands over the state it was already showing behind
			// itself: keep the spotlight and the camera where they are. Never push history here.
			if (tgt.kind === 'focus' && tgt.id) {
				// Recompute after any mode update via microtask so `layout` reflects the new mode!
				const targetId = tgt.id;
				queueMicrotask(() => {
					if (layout.nodeById.has(targetId)) {
						if (selectedNodeId === targetId && !hasActiveOverlay) {
							fitNeighborhood(layout.nodeById.get(targetId)!);
							return;
						}
						selectStudio(targetId, false, false);
						fitNeighborhood(layout.nodeById.get(targetId)!);
					} else if (unmappedFocus?.id !== targetId) {
						void focusUnmappedStudio(targetId, false);
					}
				});
			} else if (tgt.kind === 'trace' && tgt.id) {
				if (traceSid === tgt.id && compareTraceSid === (tgt.secondId ?? null)) return;
				void startCareerTrail(tgt.id, tgt.secondId ?? null, false);
			} else if (tgt.kind === 'vn' && tgt.id) {
				if (spotlightVnId === tgt.id) return;
				void startVnSpotlight(tgt.id, false);
			} else if (tgt.kind === 'compare' && tgt.id && tgt.secondId) {
				if (comparePair?.a === tgt.id && comparePair?.b === tgt.secondId) return;
				void startCompareSpotlight(tgt.id, tgt.secondId, false);
			} else if (tgt.kind === 'hidden' && mode !== 'hidden') {
				modeBeforeSheet = mode;
				mode = 'hidden';
			} else if (tgt.kind === 'none' && !backdropMode) {
				if (selectedNodeId || selectedEdgeId || hasActiveOverlay) {
					clearOverlays(false, false);
				}
			}
		});
	});

	onMount(() => {
		readTheme();
		const mo = new MutationObserver(() => readTheme());
		mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
		// Names are measured before the web fonts land; measure again once they have.
		void document.fonts?.ready.then(() => {
			textWidthCache.clear();
			fontEpoch++;
		});

		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				viewW = Math.max(320, Math.round(entry.contentRect.width));
				viewH = Math.max(360, Math.round(entry.contentRect.height));
			}
			if (!initialized && viewW > 0 && viewH > 0) {
				initialized = true;
				if (initialTrace) {
					fitOpeningView();
					void startCareerTrail(initialTrace, initialCompareTrace);
				} else if (initialVn) {
					fitOpeningView();
					void startVnSpotlight(initialVn);
				} else if (initialCompare) {
					const m = initialCompare.match(/^(p\d+)-(p\d+)$/i);
					fitOpeningView();
					if (m) void startCompareSpotlight(m[1].toLowerCase(), m[2].toLowerCase());
				} else if (initialFocus) {
					if (layout.nodeById.has(initialFocus)) {
						const nd = layout.nodeById.get(initialFocus)!;
						selectedNodeId = nd.id;
						fitNeighborhood(nd);
					} else {
						fitOpeningView();
						void focusUnmappedStudio(initialFocus, false);
					}
				} else if (initialMode === 'hidden' && (!externalTarget || externalTarget.kind === 'none') && hiddenQueue.length > 0) {
					fitOpeningView();
					jumpToHiddenLink(0);
				} else {
					fitOpeningView();
				}
			}
		});
		if (wrapEl) ro.observe(wrapEl);

		// Shallow history entries (`goto(..., { shallow: true, replace: false })`) fire native popstate without always triggering afterNavigate.
		const onPopState = () => {
			queueMicrotask(() => {
				if (window.location.pathname === '/') {
					restoreFromUrl(new URL(window.location.href));
				}
			});
		};
		window.addEventListener('popstate', onPopState);

		return () => {
			window.removeEventListener('popstate', onPopState);
			mo.disconnect();
			ro.disconnect();
			if (animFrame) cancelAnimationFrame(animFrame);
		};
	});

	const topTerritories = $derived(layout.territories.slice(0, 14));
	const hoveredEdge = $derived(
		hoveredEdgeId ? (layout.edges.find((e) => e.id === hoveredEdgeId) ?? null) : null
	);

	/** The other studio's role in a stated VNDB link, read from `focusId`'s side. */
	function explicitRole(edge: PlacedLandscapeEdge, focusId: string) {
		if (!edge.relationCode) return null;
		const code = edge.source === focusId ? edge.relationCode : invertExplicit(edge.relationCode);
		return { code, meta: EXPLICIT_META[code] };
	}
	const hoveredStop = $derived(
		hoveredStopKey && activeTrail ? (activeTrail.stops.find((s) => s.key === hoveredStopKey) ?? null) : null
	);
	const hoveredAliasSeg = $derived(
		!showingInferredOnly && hoveredAliasSegIdx !== null && primaryTrail ? (primaryTrail.segments[hoveredAliasSegIdx] ?? null) : null
	);
	const hoveredAliasScreenPos = $derived.by<{ x: number; y: number } | null>(() => {
		if (!hoveredAliasSeg) return null;
		const mid = cubicAt(
			hoveredAliasSeg.from.x,
			hoveredAliasSeg.from.y,
			hoveredAliasSeg.cp1x,
			hoveredAliasSeg.cp1y,
			hoveredAliasSeg.cp2x,
			hoveredAliasSeg.cp2y,
			hoveredAliasSeg.to.x,
			hoveredAliasSeg.to.y,
			0.5
		);
		return worldToScreen(mid.x, mid.y);
	});

	/** Clickable top/bottom edge portal chips for highlighted studios that sit far off-screen vertically. */
	const offscreenPortals = $derived.by(() => {
		const top: Array<{ other: PlacedLandscapeNode; edge: PlacedLandscapeEdge; x: number }> = [];
		const bottom: Array<{ other: PlacedLandscapeNode; edge: PlacedLandscapeEdge; x: number }> = [];
		if (!selectedNode || hasActiveOverlay || backdropMode) return { top, bottom };
		const adjList = layout.adj.get(selectedNode.id) ?? [];
		const seen = new Set<string>();
		for (const e of adjList) {
			const other = e.source === selectedNode.id ? e.targetNode : e.sourceNode;
			if (seen.has(other.id)) continue;
			seen.add(other.id);
			const p = worldToScreen(other.x, other.y);
			if (p.y < RULER_H + 10) {
				top.push({ other, edge: e, x: p.x });
			} else if (p.y > viewH - 12) {
				bottom.push({ other, edge: e, x: p.x });
			}
		}
		const rank = (a: { edge: PlacedLandscapeEdge; other: PlacedLandscapeNode }, b: { edge: PlacedLandscapeEdge; other: PlacedLandscapeNode }) =>
			Number(b.edge.register === 'confirmed') - Number(a.edge.register === 'confirmed') ||
			(b.edge.confidence ?? 0) - (a.edge.confidence ?? 0) ||
			b.other.vnCount - a.other.vnCount;
		top.sort(rank);
		bottom.sort(rank);
		return { top: top.slice(0, 4), bottom: bottom.slice(0, 4) };
	});
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div
	bind:this={wrapEl}
	class="relative h-full w-full overflow-hidden bg-canvas select-none"
	aria-label="Evolutionary Visual Novel Studio Atlas"
>
	<!-- ── Ultra-thin Sticky Year Ruler along top edge (round 5y/10y/1y ticks) ── -->
	<div
		class="pointer-events-none absolute inset-x-0 top-0 z-20 h-[26px] overflow-hidden border-b border-rule bg-canvas/82 backdrop-blur-md"
		aria-hidden="true"
	>
		<div class="absolute top-0 left-0 z-10 flex h-full items-center bg-canvas/95 pr-2.5 pl-3 font-mono text-2xs font-medium text-ink-3">
			Year →
		</div>
		{#each rulerTicks as tick (tick.year)}
			<div
				class="absolute top-0 flex h-full -translate-x-1/2 flex-col items-center justify-end pb-0.5"
				style="left: {tick.sx}px"
			>
				<span class="tnum font-mono text-2xs {tick.major ? 'font-medium text-ink' : 'text-ink-3'}">
					{tick.year}
				</span>
				<span class="mt-0.5 h-1.5 w-px {tick.major ? 'bg-rule-strong' : 'bg-rule'}"></span>
			</div>
		{/each}
	</div>

	<!-- ── Quiet Vertical-Axis Cue (down = studio families, reflecting active sort) ── -->
	{#if !menuOpen && !searchFocused && !filtersOpen && !jumpOpen}
		<div
			class="pointer-events-auto absolute top-[5rem] left-3 z-20 hidden items-center gap-1.5 rounded-md border border-rule bg-surface-raised/82 px-2 py-0.5 font-mono text-2xs text-ink-3 backdrop-blur-md sm:left-4 md:inline-flex"
			title="Down: studio families ({FAMILY_SORT_LABEL[familySort]}). Change order in Filters."
		>
			<span class="text-ink-2">↓</span>
			<span>Studio families · {FAMILY_SORT_LABEL[familySort]}</span>
		</div>
	{/if}

	<!-- ── 100vw × 100vh Infinite Interactive Canvas ── -->
	<canvas
		bind:this={canvasEl}
		class="block h-full w-full touch-none {dragging
			? 'cursor-grabbing'
			: hoveredNodeId || hoveredEdgeId || hoveredStopKey || hoveredAliasSegIdx !== null
				? 'cursor-pointer'
				: 'cursor-grab'}"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		onpointerleave={() => {
			if (!dragging) {
				pointerScreenPos = null;
				hoveredNodeId = null;
				hoveredEdgeId = null;
				hoveredStopKey = null;
				hoveredAliasSegIdx = null;
			}
		}}
		onwheel={onWheel}
		ondblclick={onDblClick}
	></canvas>

	<!-- ── Floating Top-Left Google Maps Pill Chrome (Uniform h-9 sizing across all pills) ── -->
	<div class="pointer-events-none absolute top-9 left-3 z-30 flex max-w-[calc(100%-13rem)] flex-wrap items-center gap-2 sm:left-4">
		<!-- Unified Google Maps Search Pill with integrated ☰ Menu -->
		<div class="pointer-events-auto relative w-[min(24.5rem,calc(100vw-1.5rem))]">
			<div class="flex h-9 items-center gap-1.5 rounded-lg border border-rule-strong bg-surface-raised/94 px-2 shadow-lg backdrop-blur-md focus-within:border-focus">
				<button
					type="button"
					class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-surface-hover hover:text-ink"
					aria-label="Open Atlas menu & pages"
					aria-expanded={menuOpen}
					onclick={() => {
						menuOpen = !menuOpen;
						filtersOpen = false;
						jumpOpen = false;
					}}
				>
					<Menu size={16} />
				</button>
				<Search size={14} class="shrink-0 text-ink-3" />
				<input
					bind:this={searchInputEl}
					type="search"
					bind:value={searchQuery}
					onkeydown={onSearchKeydown}
					onfocus={() => {
						searchFocused = true;
						menuOpen = false;
						filtersOpen = false;
						jumpOpen = false;
					}}
					onblur={() => setTimeout(() => (searchFocused = false), 180)}
					placeholder="Search studios, staff trails, or visual novels"
					class="w-full bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
					aria-label="Search studios, staff trails, or visual novels"
				/>
				{#if searchQuery}
					<button
						type="button"
						class="p-1 text-ink-3 hover:text-ink"
						aria-label="Clear search"
						onclick={() => {
							searchQuery = '';
							searchInputEl?.focus();
						}}
					>
						<X size={14} />
					</button>
				{:else}
					<kbd class="hidden rounded-xs bg-surface-sunken px-1.5 py-0.5 font-mono text-2xs text-ink-3 sm:inline">/</kbd>
				{/if}
			</div>

			<!-- ☰ Floating App Menu Drawer (replaces TopBar completely!) -->
			{#if menuOpen}
				<div class="absolute top-11 left-0 z-50 w-72 rounded-lg border border-rule-strong bg-surface-raised/98 p-2 text-xs shadow-2xl backdrop-blur-md">
					<div class="flex items-center justify-between border-b border-rule px-2 pt-1 pb-2.5">
						<BrandMark />
						<span class="font-mono text-2xs text-ink-3">{dumpDate}</span>
					</div>

					<p class="px-2 pt-2.5 pb-1 text-2xs font-medium uppercase tracking-wider text-ink-3">Atlas modes</p>
					<button
						type="button"
						class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ink hover:bg-surface-hover"
						onclick={() => {
							clearOverlays();
							setMode('all');
							fitOpeningView();
						}}
					>
						<Compass size={14} class="text-confirmed" />
						<span class="font-medium">Reset to Studio Atlas</span>
					</button>
					<button
						type="button"
						class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ink hover:bg-surface-hover"
						onclick={() => void startCareerTrail('s224')}
					>
						<Route size={14} class="text-confirmed" />
						<span>Demo: Maeda Jun's VN-by-VN trail</span>
					</button>
					<button
						type="button"
						class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ink hover:bg-surface-hover"
						onclick={() => setMode('hidden')}
					>
						<EpistemicGlyph kind="inferred" size={12} />
						<span>Tour Hidden Brand Links on map</span>
					</button>

					<p class="mt-2 border-t border-rule px-2 pt-2.5 pb-1 text-2xs font-medium uppercase tracking-wider text-ink-3">
						Full-page tables &amp; tools
					</p>
					<nav class="space-y-0.5">
						<a href="/overview" class="flex items-center justify-between rounded-sm px-2 py-1.5 text-ink no-underline hover:bg-surface-hover">
							<span>Corpus Overview &amp; Highlights</span>
							<ArrowRight size={12} class="text-ink-3" />
						</a>
						<a href="/popularity" class="flex items-center justify-between rounded-sm px-2 py-1.5 text-ink no-underline hover:bg-surface-hover">
							<span>Popularity &amp; Rankings</span>
							<ArrowRight size={12} class="text-ink-3" />
						</a>
						<a href="/discover/brands" class="flex items-center justify-between rounded-sm px-2 py-1.5 text-ink no-underline hover:bg-surface-hover">
							<span class="inline-flex items-center gap-1.5"><EpistemicGlyph kind="inferred" size={11} /> All Hidden Brand Links</span>
							<ArrowRight size={12} class="text-ink-3" />
						</a>
						<a href="/discover/aliases" class="flex items-center justify-between rounded-sm px-2 py-1.5 text-ink no-underline hover:bg-surface-hover">
							<span class="inline-flex items-center gap-1.5"><EpistemicGlyph kind="alias-potential" size={11} /> Potential Aliases</span>
							<ArrowRight size={12} class="text-ink-3" />
						</a>
						<a href="/compare" class="flex items-center justify-between rounded-sm px-2 py-1.5 text-ink no-underline hover:bg-surface-hover">
							<span class="inline-flex items-center gap-1.5"><GitCompareArrows size={12} class="text-ink-3" /> Brand Compare Workbench</span>
							<ArrowRight size={12} class="text-ink-3" />
						</a>
						<a href="/key" class="flex items-center justify-between rounded-sm px-2 py-1.5 text-ink-2 no-underline hover:bg-surface-hover hover:text-ink">
							<span>Help, Symbols &amp; Glossary</span>
							<ArrowRight size={12} class="text-ink-3" />
						</a>
					</nav>
				</div>
			{/if}

			<!-- Unified Search Results Popover -->
			{#if searchFocused && !menuOpen}
				<div class="absolute top-11 left-0 z-50 max-h-[min(28rem,calc(100vh-8rem))] w-full overflow-y-auto rounded-lg border border-rule-strong bg-surface-raised/98 p-1.5 shadow-2xl backdrop-blur-md">
					{#if !searchQuery.trim()}
						<p class="px-2.5 pt-1 pb-1.5 text-2xs font-medium uppercase tracking-wider text-ink-3">
							Explore directly on the Atlas
						</p>
						<button
							type="button"
							class="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs text-ink hover:bg-surface-hover {isSearchItemActive('demo-maeda') ? 'bg-surface-hover' : ''}"
							onmouseenter={() => setSearchActiveKey('demo-maeda')}
							onmousedown={(e) => {
								e.preventDefault();
								void startCareerTrail('s224');
							}}
						>
							<Route size={13} class="shrink-0 text-confirmed" />
							<span class="flex-1 truncate font-medium">Trace Maeda Jun's VN-by-VN career</span>
						</button>
						<button
							type="button"
							class="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs text-ink hover:bg-surface-hover {isSearchItemActive('demo-compare') ? 'bg-surface-hover' : ''}"
							onmouseenter={() => setSearchActiveKey('demo-compare')}
							onmousedown={(e) => {
								e.preventDefault();
								void startCompareSpotlight('p24', 'p49');
							}}
						>
							<GitCompareArrows size={13} class="shrink-0 text-inferred" />
							<span class="flex-1 truncate font-medium">Compare Key vs Tactics</span>
						</button>
						<button
							type="button"
							class="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs text-ink hover:bg-surface-hover {isSearchItemActive('demo-clannad') ? 'bg-surface-hover' : ''}"
							onmouseenter={() => setSearchActiveKey('demo-clannad')}
							onmousedown={(e) => {
								e.preventDefault();
								void startVnSpotlight('v4');
							}}
						>
							<Sparkles size={13} class="shrink-0 text-confirmed" />
							<span class="flex-1 truncate font-medium">Map CLANNAD &amp; series handoffs</span>
						</button>
					{:else}
						{#if compareQueryMatch}
							{@const matchA = layout.nodeById.get(compareQueryMatch.a)}
							{@const matchB = layout.nodeById.get(compareQueryMatch.b)}
							{@const cmpKey = `cmp:${compareQueryMatch.a}-${compareQueryMatch.b}`}
							<button
								type="button"
								class="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs text-ink hover:bg-surface-hover {isSearchItemActive(cmpKey) ? 'bg-surface-hover' : ''}"
								onmouseenter={() => setSearchActiveKey(cmpKey)}
								onmousedown={(e) => {
									e.preventDefault();
									void startCompareSpotlight(compareQueryMatch.a, compareQueryMatch.b);
								}}
							>
								<GitCompareArrows size={14} class="shrink-0 text-inferred" />
								<span class="font-medium">
									{#if matchA && matchB}
										Compare {shownName(matchA.name, matchA.original)} vs {shownName(matchB.name, matchB.original)} on Atlas
									{:else}
										Compare these two studios on Atlas
									{/if}
								</span>
							</button>
						{/if}

						{#if localStudioHits.length > 0 || searchRemoteStudios.length > 0}
							<p class="px-2.5 pt-1.5 pb-1 text-2xs font-medium uppercase tracking-wider text-ink-3">
								Studios (fly to)
							</p>
							{#each localStudioHits as hit (hit.id)}
								{@const itemKey = `local:${hit.id}`}
								<button
									type="button"
									class="flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs hover:bg-surface-hover {isSearchItemActive(itemKey) ? 'bg-surface-hover' : ''}"
									onmouseenter={() => setSearchActiveKey(itemKey)}
									onmousedown={(e) => {
										e.preventDefault();
										selectStudio(hit.id, true);
									}}
								>
									<span class="flex min-w-0 items-center gap-1.5">
										<ProducerShape type={hit.type} size={9} />
										<span class="truncate font-medium text-ink">{shownName(hit.name, hit.original)}</span>
									</span>
									<span class="tnum shrink-0 font-mono text-2xs text-ink-3">
										{hit.firstYear ?? hit.plotYear} · {hit.vnCount} VNs
									</span>
								</button>
							{/each}
							{#each searchRemoteStudios as hit (hit.id)}
								{@const itemKey = `remote:${hit.id}`}
								<a
									href="/producer/{hit.id}"
									class="flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs text-ink-2 no-underline hover:bg-surface-hover hover:text-ink {isSearchItemActive(itemKey) ? 'bg-surface-hover text-ink' : ''}"
									onmouseenter={() => setSearchActiveKey(itemKey)}
								>
									<span class="truncate">{shownName(hit.name, hit.original)}</span>
									<span class="shrink-0 text-2xs text-ink-3">Open page →</span>
								</a>
							{/each}
						{/if}

						{#if searchStaffHits.length > 0}
							<p class="px-2.5 pt-2 pb-1 text-2xs font-medium uppercase tracking-wider text-ink-3">
								Staff &amp; Seiyuu (trace VN-by-VN path)
							</p>
							{#each searchStaffHits as hit (hit.id)}
								{@const itemKey = `staff:${hit.id}`}
								<button
									type="button"
									class="flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs hover:bg-surface-hover {isSearchItemActive(itemKey) ? 'bg-surface-hover' : ''}"
									onmouseenter={() => setSearchActiveKey(itemKey)}
									onmousedown={(e) => {
										e.preventDefault();
										void startCareerTrail(hit.id);
									}}
								>
									<span class="flex min-w-0 items-center gap-1.5">
										<Route size={12} class="shrink-0 text-confirmed" />
										<span class="truncate font-medium text-ink">{shownName(hit.name, hit.original)}</span>
									</span>
									<span class="shrink-0 truncate text-2xs text-ink-3">{hit.subtitle}</span>
								</button>
							{/each}
						{/if}

						{#if searchVnHits.length > 0}
							<p class="px-2.5 pt-2 pb-1 text-2xs font-medium uppercase tracking-wider text-ink-3">
								Visual novels (map studio &amp; series)
							</p>
							{#each searchVnHits as hit (hit.id)}
								{@const itemKey = `vn:${hit.id}`}
								<button
									type="button"
									class="flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs hover:bg-surface-hover {isSearchItemActive(itemKey) ? 'bg-surface-hover' : ''}"
									onmouseenter={() => setSearchActiveKey(itemKey)}
									onmousedown={(e) => {
										e.preventDefault();
										void startVnSpotlight(hit.id);
									}}
								>
									<span class="flex min-w-0 items-center gap-1.5">
										<Sparkles size={12} class="shrink-0 text-confirmed" />
										<span class="truncate font-medium text-ink">{shownName(hit.name, hit.original)}</span>
									</span>
									<span class="shrink-0 text-2xs text-ink-3">{hit.subtitle}</span>
								</button>
							{/each}
						{/if}

						{#if !compareQueryMatch && localStudioHits.length === 0 && searchStaffHits.length === 0 && searchVnHits.length === 0 && searchRemoteStudios.length === 0}
							<p class="px-2.5 py-2 text-xs text-ink-3">
								{remoteLoading ? 'Searching database…' : 'No studios, staff, or visual novels matched.'}
							</p>
						{/if}
					{/if}
				</div>
			{/if}
		</div>

		<!-- Compact Floating Mode Pills (exact h-9 match) -->
		<div class="pointer-events-auto flex h-9 items-center gap-0.5 rounded-lg border border-rule-strong bg-surface-raised/94 p-1 shadow-lg backdrop-blur-md">
			<button
				type="button"
				class="inline-flex h-7 items-center rounded-md px-2.5 text-xs transition-colors {mode === 'all'
					? 'bg-surface-sunken font-semibold text-ink ring-1 ring-rule-strong'
					: 'font-medium text-ink-2 hover:bg-control-hover hover:text-ink'}"
				onclick={() => setMode('all')}
			>
				All
			</button>
			<button
				type="button"
				class="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs transition-colors {mode === 'explicit'
					? 'bg-surface-sunken font-semibold text-ink ring-1 ring-rule-strong'
					: 'font-medium text-ink-2 hover:bg-control-hover hover:text-ink'}"
				onclick={() => setMode('explicit')}
				title="VNDB links only"
			>
				<EpistemicGlyph kind="confirmed" size={10} /> VNDB
			</button>
			<button
				type="button"
				class="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs transition-colors {mode === 'hidden'
					? 'bg-surface-sunken font-semibold text-ink ring-1 ring-rule-strong'
					: 'font-medium text-ink-2 hover:bg-control-hover hover:text-ink'}"
				onclick={() => setMode('hidden')}
				title="Inferred links only"
			>
				<EpistemicGlyph kind="inferred" size={10} /> Hidden
			</button>
		</div>

		<!-- Clean Jump Dropdown (exact h-9 match) -->
		<div class="pointer-events-auto relative">
			<button
				type="button"
				class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rule-strong bg-surface-raised/94 px-3 text-xs font-medium text-ink shadow-lg backdrop-blur-md hover:bg-surface-hover"
				aria-expanded={jumpOpen}
				onclick={() => {
					jumpOpen = !jumpOpen;
					filtersOpen = false;
					menuOpen = false;
				}}
			>
				<Compass size={13} class="text-ink-2" />
				<span class="hidden sm:inline">Houses</span>
			</button>
			{#if jumpOpen}
				<div class="absolute top-11 left-0 z-50 max-h-80 w-64 overflow-y-auto rounded-lg border border-rule-strong bg-surface-raised/98 p-1.5 text-xs shadow-2xl backdrop-blur-md">
					<p class="px-2 pt-1 pb-1.5 text-2xs font-medium uppercase tracking-wider text-ink-3">
						Jump to major studio house
					</p>
					{#each topTerritories as t (t.id)}
						<button
							type="button"
							class="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-surface-hover"
							onclick={() => {
								jumpOpen = false;
								fitBox(t, 80, 0.85);
							}}
						>
							<span class="truncate font-medium text-ink">{shownName(t.label, t.labelOriginal)}</span>
							<span class="tnum shrink-0 font-mono text-2xs text-ink-3">{t.nodeCount} · {num(t.totalVns)} VNs</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Filters Popover Trigger (exact h-9 match) -->
		<div class="pointer-events-auto relative">
			<button
				type="button"
				class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rule-strong bg-surface-raised/94 px-3 text-xs font-medium text-ink shadow-lg backdrop-blur-md hover:bg-surface-hover"
				aria-expanded={filtersOpen}
				onclick={() => {
					filtersOpen = !filtersOpen;
					menuOpen = false;
					jumpOpen = false;
				}}
			>
				<SlidersHorizontal size={13} />
				<span class="hidden sm:inline">Filters</span>
				{#if hasCustomFilters}
					<span class="size-1.5 rounded-full bg-confirmed"></span>
				{/if}
			</button>

			{#if filtersOpen}
				<div class="absolute top-11 left-0 z-50 w-80 rounded-lg border border-rule-strong bg-surface-raised/98 p-3.5 text-xs shadow-2xl backdrop-blur-md">
					<div class="flex items-center justify-between border-b border-rule pb-2">
						<span class="font-semibold text-ink">Atlas filters</span>
						<button type="button" class="text-ink-3 hover:text-ink" onclick={() => (filtersOpen = false)}>
							<X size={14} />
						</button>
					</div>

					<div class="mt-3 space-y-3">
						<div>
							<p class="mb-1.5 text-2xs font-medium text-ink-3">Relation kinds</p>
							<div class="flex flex-wrap gap-1.5">
								{#each KINDS as k (k)}
									<label class="chip {kinds[k] ? 'on' : ''}" title={KIND_MEANING[k]}>
										<input type="checkbox" class="sr-only" bind:checked={kinds[k]} />
										<span class="inline-block h-1.5 w-3 rounded-[1px]" style="background: {KIND_COLOR[k]}"></span>
										{KIND_LABEL[k]}
									</label>
								{/each}
							</div>
						</div>

						<div>
							<p class="mb-1.5 text-2xs font-medium text-ink-3">How to read the map</p>
							<ul class="space-y-1 text-2xs text-ink-2">
								<li class="flex items-center gap-2">
									<svg width="34" height="12" viewBox="0 0 34 12" class="shrink-0" aria-hidden="true">
										<path d="M1 3H33" fill="none" stroke="var(--rel-ownership)" stroke-width="2.6" stroke-linecap="round" />
										<path d="M14 3h3a4 4 0 0 1 4 4v0a2 2 0 0 0 2 2h9" fill="none" stroke="var(--rel-ownership)" stroke-width="1.2" />
									</svg>
									<span>Owner's rail; each brand branches off in the year it starts</span>
								</li>
								<li class="flex items-center gap-2">
									<svg width="34" height="12" viewBox="0 0 34 12" class="shrink-0" aria-hidden="true">
										<path d="M1 6H5M11 6H33" fill="none" stroke="var(--ink-3)" stroke-width="1.6" stroke-linecap="round" />
										<circle cx="8" cy="6" r="3" fill="var(--ink)" />
									</svg>
									<span>A studio and the years it released in</span>
								</li>
								<li class="flex items-center gap-2">
									<svg width="34" height="12" viewBox="0 0 34 12" class="shrink-0" aria-hidden="true">
										<path d="M1 2C16 2 18 10 33 10" fill="none" stroke="var(--rel-lineage)" stroke-width="1.5" />
									</svg>
									<span>Renamed or spun off, leaving at the year it happened</span>
								</li>
								<li class="flex items-center gap-2">
									<svg width="34" height="12" viewBox="0 0 34 12" class="shrink-0" aria-hidden="true">
										<path d="M1 2C16 2 18 10 33 10" fill="none" stroke="var(--rel-sister)" stroke-width="1.3" stroke-dasharray="4 3" />
									</svg>
									<span>Dashed: inferred by this tool, not stated in VNDB</span>
								</li>
								<li class="flex items-center gap-2">
									<span class="inline-flex w-[34px] shrink-0 justify-center font-mono text-2xs font-medium text-ink-3">↓</span>
									<span>Down axis: studio families stacked most prominent first, with linked houses adjacent</span>
								</li>
							</ul>
						</div>

						<div class="flex items-center justify-between gap-2">
							<span class="text-ink-3">Producer scope</span>
							<SegmentedControl
								label="Producer scope"
								size="sm"
								value={producerType}
								onchange={(v) => onScopeChange({ producerType: v })}
								options={[
									{ value: 'co', label: 'Companies' },
									{ value: 'all', label: 'All types' }
								]}
							/>
						</div>

						<label class="flex items-center justify-between gap-2">
							<span class="text-ink-3">Language</span>
							<select
								class="h-7 rounded-sm border border-rule-strong bg-control px-2 text-xs text-ink"
								value={lang}
								onchange={(e) => onScopeChange({ lang: e.currentTarget.value })}
							>
								{#each LANGS as l (l.value)}
									<option value={l.value}>{l.label}</option>
								{/each}
							</select>
						</label>

						<label class="flex items-center justify-between gap-2">
							<span class="text-ink-3">Family order</span>
							<select
								class="h-7 rounded-sm border border-rule-strong bg-control px-2 text-xs text-ink"
								bind:value={familySort}
							>
								<option value="prominence">Prominent &amp; linked first</option>
								<option value="size">Largest families first</option>
								<option value="oldest">Oldest families first</option>
								<option value="alpha">Alphabetical (A–Z)</option>
							</select>
						</label>

						<label class="flex items-center justify-between gap-2">
							<span class="text-ink-3">Min family size</span>
							<select
								class="h-7 rounded-sm border border-rule-strong bg-control px-2 text-xs text-ink"
								bind:value={minClusterSize}
							>
								<option value={2}>All families (2+ studios)</option>
								<option value={3}>3+ studios</option>
								<option value={5}>5+ studios (major families)</option>
							</select>
						</label>

						{#if showInferred}
							<label class="block">
								<div class="flex items-center justify-between">
									<span class="term text-ink-3" title={CONFIDENCE_HINT}>Min inferred confidence</span>
									<span class="tnum font-mono text-ink">{localConfidence}</span>
								</div>
								<input
									type="range"
									min="10"
									max="95"
									step="5"
									class="mt-1 w-full accent-(--inferred-mark)"
									bind:value={localConfidence}
									onchange={() => onScopeChange({ minConfidence: localConfidence / 100 })}
								/>
							</label>
						{/if}

						<p class="tnum border-t border-rule pt-2 font-mono text-2xs text-ink-3">
							{num(layout.nodes.length)} studios · {num(layout.edges.length)} links · {layout.minYear}–{layout.maxYear}
							{#if pending}· updating…{/if}
						</p>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- ── Floating Top-Right Utility Pill (exact h-9 match) ── -->
	<div class="pointer-events-auto absolute top-9 right-3 z-30 hidden h-9 items-center gap-1.5 rounded-lg border border-rule-strong bg-surface-raised/94 px-2 shadow-lg backdrop-blur-md sm:right-4 md:flex">
		<a
			href="/key"
			class="inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-ink-2 no-underline hover:bg-surface-hover hover:text-ink"
			title="Help, symbols & glossary"
		>
			Help
		</a>
		<NameOrderSwitch />
		<ThemeSwitch />
	</div>

	<!-- ── Off-Screen Portal Chips for Long-Distance Vertical Jumps (e.g. MAGES. ↔ Otomate / M2) ── -->
	{#if offscreenPortals.top.length > 0 && selectedNode}
		<div class="pointer-events-none absolute top-[5.2rem] left-1/2 z-20 flex -translate-x-1/2 flex-wrap justify-center gap-1.5">
			{#each offscreenPortals.top as item (item.edge.id)}
				<button
					type="button"
					class="pointer-events-auto inline-flex h-7 items-center gap-1.5 rounded-full border bg-surface-raised/95 px-2.5 text-2xs font-medium text-ink shadow-md backdrop-blur-md hover:bg-surface-hover {item.edge.register === 'inferred' ? 'border-dashed border-inferred/70' : 'border-rule-strong'}"
					title="Jump up to {shownName(item.other.name, item.other.original)} ({item.edge.code})"
					onmouseenter={() => {
						hoveredEdgeId = item.edge.id;
						hoveredNodeId = item.other.id;
					}}
					onmouseleave={() => {
						if (hoveredEdgeId === item.edge.id) hoveredEdgeId = null;
						if (hoveredNodeId === item.other.id) hoveredNodeId = null;
					}}
					onclick={() => navigateBetweenStudios(selectedNode.id, item.other.id, item.edge.id)}
				>
					<span class="font-mono text-ink-3">↑</span>
					<span class="max-w-[10rem] truncate">{shownName(item.other.name, item.other.original)}</span>
					<span class="font-mono text-ink-3">{item.edge.code}</span>
				</button>
			{/each}
		</div>
	{/if}
	{#if offscreenPortals.bottom.length > 0 && selectedNode}
		<div class="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 flex-wrap justify-center gap-1.5">
			{#each offscreenPortals.bottom as item (item.edge.id)}
				<button
					type="button"
					class="pointer-events-auto inline-flex h-7 items-center gap-1.5 rounded-full border bg-surface-raised/95 px-2.5 text-2xs font-medium text-ink shadow-md backdrop-blur-md hover:bg-surface-hover {item.edge.register === 'inferred' ? 'border-dashed border-inferred/70' : 'border-rule-strong'}"
					title="Jump down to {shownName(item.other.name, item.other.original)} ({item.edge.code})"
					onmouseenter={() => {
						hoveredEdgeId = item.edge.id;
						hoveredNodeId = item.other.id;
					}}
					onmouseleave={() => {
						if (hoveredEdgeId === item.edge.id) hoveredEdgeId = null;
						if (hoveredNodeId === item.other.id) hoveredNodeId = null;
					}}
					onclick={() => navigateBetweenStudios(selectedNode.id, item.other.id, item.edge.id)}
				>
					<span class="font-mono text-ink-3">↓</span>
					<span class="max-w-[10rem] truncate">{shownName(item.other.name, item.other.original)}</span>
					<span class="font-mono text-ink-3">{item.edge.code}</span>
				</button>
			{/each}
		</div>
	{/if}

	<!-- ── Anchored Popover right next to hovered ⇄ Pen-Name Switch circle (always visible on every screen size!) ── -->
	{#if !dragging && hoveredAliasSeg && hoveredAliasScreenPos}
		{@const ax = Math.max(16, Math.min(viewW - 260, hoveredAliasScreenPos.x + 18))}
		{@const ay = Math.max(RULER_H + 12, Math.min(viewH - 96, hoveredAliasScreenPos.y - 36))}
		<div
			class="pointer-events-none absolute z-40 w-60 rounded-md border border-confirmed/60 bg-surface-raised/98 px-3 py-2 text-xs shadow-xl backdrop-blur-md"
			style="left: {ax}px; top: {ay}px"
		>
			<p class="flex items-center gap-1.5 font-semibold text-confirmed">
				<span class="font-mono">⇄</span> VNDB pen-name switch
			</p>
			<p class="mt-0.5 font-medium text-ink">
				{hoveredAliasSeg.from.aliasUsed} <span class="text-ink-3">→</span> {hoveredAliasSeg.to.aliasUsed}
			</p>
			<p class="mt-0.5 text-2xs text-ink-3">
				{hoveredAliasSeg.from.studioName} ({hoveredAliasSeg.from.year}) → {hoveredAliasSeg.to.studioName} ({hoveredAliasSeg.to.year})
			</p>
		</div>
	{/if}

	<!-- ── Hover Tooltip Popover right beside the cursor (no darting to the top-right corner!) ── -->
	{#if !dragging && !hoveredAliasSeg && pointerScreenPos && (hoveredStop || hoveredNode || hoveredEdge)}
		{@const tx = pointerScreenPos.x + 16 + 260 > viewW ? Math.max(12, pointerScreenPos.x - 270) : Math.max(12, pointerScreenPos.x + 16)}
		{@const ty = pointerScreenPos.y + 16 + 82 > viewH ? Math.max(RULER_H + 10, pointerScreenPos.y - 78) : Math.max(RULER_H + 10, pointerScreenPos.y + 16)}
		<div
			class="pointer-events-none absolute z-40 max-w-[16.5rem] rounded-md border border-rule-strong bg-surface-raised/96 px-3 py-2 text-xs shadow-xl backdrop-blur-md"
			style="left: {tx}px; top: {ty}px"
		>
			{#if hoveredStop}
				<p class="font-semibold text-ink">{shownName(hoveredStop.title, hoveredStop.original)}</p>
				<p class="mt-0.5 text-ink-3">
					<span class="tnum font-mono text-ink-2">{hoveredStop.year}</span> · {hoveredStop.studioName}
					{#if hoveredStop.isNonPrimaryAlias}· as <span class="font-medium text-ink-2">{hoveredStop.aliasUsed}</span> (VNDB alias){/if}
				</p>
			{:else if hoveredNode}
				<p class="flex items-center gap-1.5 font-semibold text-ink">
					<ProducerShape type={hoveredNode.type} size={9} />
					<span class="truncate">{shownName(hoveredNode.name, hoveredNode.original)}</span>
				</p>
				<p class="tnum mt-0.5 text-ink-3">
					<YearSpan from={hoveredNode.firstYear} to={hoveredNode.lastYear} /> · {plural(hoveredNode.vnCount, 'VN')} · {plural(hoveredNode.degree, 'link')}
					{#if hoveredNode.spineChildren > 0}· owns {plural(hoveredNode.spineChildren, 'brand')}{/if}
				</p>
			{:else if hoveredEdge}
				{@const role = explicitRole(hoveredEdge, hoveredEdge.source)}
				<p class="font-semibold text-ink">
					{shownName(hoveredEdge.sourceNode.name, hoveredEdge.sourceNode.original)}
					<span class="mx-0.5 font-mono font-normal text-ink-3">{hoveredEdge.directed ? '→' : '↔'}</span>
					{shownName(hoveredEdge.targetNode.name, hoveredEdge.targetNode.original)}
				</p>
				<p class="mt-0.5 text-ink-3">
					{#if hoveredEdge.register === 'confirmed' && role}
						<span class="text-ink-2">{role.meta.label}</span> · stated in VNDB
					{:else if hoveredEdge.inferredType}
						<span class="text-inferred">{INFERRED_META[hoveredEdge.inferredType].short}</span>
						· inferred, confidence <span class="tnum font-mono">{toScore(hoveredEdge.confidence)}</span>
					{/if}
				</p>
			{/if}
		</div>
	{/if}

	<!-- ── Bottom-Left Floating Context Card (ZERO side panels — hidden while a full floating sheet is open!) ── -->
	{#if !backdropMode && (traceSid || spotlightVnId || comparePair || selectedNode || unmappedFocus || selectedEdge || (mode === 'hidden' && hiddenQueue.length > 0))}
		<aside
			class="pointer-events-auto absolute bottom-3 left-3 z-30 max-h-[min(32rem,calc(100vh-8rem))] w-[min(26rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-rule-strong bg-surface-raised/96 p-3.5 text-xs shadow-2xl backdrop-blur-md sm:bottom-4 sm:left-4"
			aria-label="Atlas inspector"
		>
			{#if traceSid}
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<p class="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-confirmed">
							<Route size={12} /> VN-by-VN Career Trail
						</p>
						{#if traceData}
							<h2 class="mt-0.5 truncate text-md font-semibold text-ink">
								<NamePair name={traceData.staff.name} original={traceData.staff.original} href="/staff/{traceData.staff.id}" />
							</h2>
							<p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-ink-3">
								<DisciplineBadge kind={traceData.staff.primaryDiscipline} dense />
								<YearSpan from={traceData.staff.firstYear} to={traceData.staff.lastYear} />
								<span class="tnum">{plural(primaryTrail?.stops.length ?? 0, 'dated VN')}</span>
								<span class="tnum">{plural(primaryTrail?.lanes.length ?? 0, 'studio')}</span>
							</p>
						{:else if traceLoading}
							<p class="mt-1 text-ink-2">Loading visual novel career trail…</p>
						{:else if traceError}
							<p class="mt-1 text-danger">{traceError}</p>
						{/if}
					</div>
					<button
						type="button"
						class="rounded-sm p-1 text-ink-3 hover:bg-surface-hover hover:text-ink"
						aria-label={returnSheetUrl ? 'Back to previous screen' : 'Exit career trail'}
						title={returnSheetUrl ? 'Back to previous screen' : 'Exit career trail'}
						onclick={() => exitOverlay()}
					>
						<X size={15} />
					</button>
				</div>

				{#if traceData && activeTrail}
					{#if activeTrail.stops.length > 0 && activeStop}
						<div class="mt-3 rounded-md border {showingInferredOnly ? 'border-dashed border-inferred/60' : 'border-rule'} bg-surface/90 p-2.5">
							{#if showingInferredOnly && secondaryTrail}
								<p class="mb-2 flex items-center gap-1 text-2xs font-medium text-inferred">
									<EpistemicGlyph kind="alias-potential" size={10} />
									Stepping through potential alias: {secondaryTrail.name}
								</p>
							{/if}
							<div class="flex items-center justify-between gap-2">
								<button type="button" class="btn btn-sm" onclick={() => jumpToStop(activeStopIdx - 1)}>
									<ArrowLeft size={12} /> Prev VN
								</button>
								<span class="tnum font-mono text-2xs text-ink-3">
									Stop {activeStop.index + 1} / {activeTrail.stops.length}
								</span>
								<button type="button" class="btn btn-sm" onclick={() => jumpToStop(activeStopIdx + 1)}>
									Next VN <ArrowRight size={12} />
								</button>
							</div>

							<div class="mt-2.5 border-t border-rule pt-2">
								<div class="flex items-baseline justify-between gap-2">
									<a href="/vn/{activeStop.vid}" class="link text-sm font-semibold text-ink">
										{shownName(activeStop.title, activeStop.original)}
									</a>
									<span class="tnum shrink-0 font-mono text-xs {showingInferredOnly ? 'text-inferred' : 'text-confirmed'}">{activeStop.year}</span>
								</div>
								<p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-2">
									{#if activeStop.pid}
										<a href="/producer/{activeStop.pid}" class="link text-xs">{activeStop.studioName}</a>
									{:else}
										<span class="text-ink-3">{activeStop.studioName}</span>
									{/if}
									<RatingTag hasEro={activeStop.hasEro} hasAllAges={activeStop.hasAllAges} />
								</p>
								<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
									<RolePills roles={activeStop.roles} max={4} full />
									{#if activeStop.isNonPrimaryAlias}
										<span
											class="inline-flex items-center gap-1 rounded-xs border border-confirmed/45 bg-surface-sunken px-1.5 py-0.5 text-2xs font-medium text-ink"
											title="Confirmed VNDB pen name on this staff entry"
										>
											<EpistemicGlyph kind="confirmed" size={9} />
											Credited as: {activeStop.aliasUsed}
										</span>
									{/if}
								</div>
								{#if activeStopAliasSwitch}
									<p class="mt-1.5 flex items-center gap-1.5 rounded-xs border border-confirmed/35 bg-surface-sunken/70 px-2 py-1 text-2xs text-ink" title="Previous VN stop used a different VNDB credit name">
										<span class="font-mono font-semibold text-confirmed">⇄</span>
										<span>Credit name vs prev VN: <strong>{activeStopAliasSwitch.from}</strong> → <strong>{activeStopAliasSwitch.to}</strong></span>
									</p>
								{/if}
								{#if activeStop.characters.length > 0}
									{@const shownStopChars = expandedStopChars ? activeStop.characters : activeStop.characters.slice(0, 4)}
									<p class="mt-1.5 text-2xs text-ink-3">
										Voiced:
										<span class="text-ink-2">
											{shownStopChars.map((c) => shownName(c.name, c.original ?? null)).join(', ')}
										</span>
										{#if activeStop.characters.length > 4}
											<button
												type="button"
												class="tnum ml-1 inline-flex h-[18px] items-center rounded-xs border border-rule-strong bg-surface-sunken px-1.5 font-mono text-2xs text-ink-2 hover:border-rule-hover hover:text-ink"
												aria-expanded={expandedStopChars}
												onclick={() => (expandedStopChars = !expandedStopChars)}
											>
												{expandedStopChars ? 'less' : `+${activeStop.characters.length - 4}`}
											</button>
										{/if}
									</p>
								{/if}
							</div>
						</div>
					{:else}
						<p class="mt-2.5 text-ink-3">No dated visual novel credits recorded for this entry.</p>
					{/if}

					{#if traceData.potentialAliases.length > 0}
						<div class="mt-2.5 rounded-md border border-dashed border-inferred/50 bg-surface/60 p-2">
							<p class="flex items-center gap-1 text-2xs font-medium text-inferred">
								<EpistemicGlyph kind="alias-potential" size={11} /> Overlay potential alias (dashed sand)
							</p>
							<div class="mt-1.5 flex flex-wrap gap-1.5">
								{#each traceData.potentialAliases.slice(0, 4) as cand (cand.sidA + cand.sidB)}
									{@const otherId = cand.sidA === traceData.staff.id ? cand.sidB : cand.sidA}
									{@const otherName = cand.sidA === traceData.staff.id ? shownName(cand.nameB, cand.originalB ?? null) : shownName(cand.nameA, cand.originalA ?? null)}
									<button
										type="button"
										class="chip dashed {compareTraceSid === otherId ? 'on' : ''}"
										onclick={() => void setCompareTrace(compareTraceSid === otherId ? null : otherId)}
									>
										{otherName}
										<span class="tnum font-mono text-2xs text-ink-3">{toScore(cand.confidence)}</span>
									</button>
								{/each}
								{#if compareTraceLoading}<span class="text-2xs text-ink-3">Loading…</span>{/if}
							</div>
							{#if secondaryTrail}
								<div class="mt-2 flex items-center justify-between gap-2 border-t border-dashed border-inferred/30 pt-1.5 text-2xs">
									<span class="text-ink-3">Trail view</span>
									<div class="inline-flex rounded-sm border border-rule-strong bg-surface p-0.5">
										<button
											type="button"
											class="rounded-xs px-1.5 py-0.5 {trailAliasFilter === 'both' ? 'bg-surface-sunken font-semibold text-ink' : 'text-ink-3 hover:text-ink'}"
											onclick={() => setTrailAliasFilter('both')}
										>
											Both
										</button>
										<button
											type="button"
											class="rounded-xs px-1.5 py-0.5 {trailAliasFilter === 'inferred' ? 'bg-surface-sunken font-semibold text-inferred' : 'text-ink-3 hover:text-ink'}"
											onclick={() => setTrailAliasFilter('inferred')}
										>
											Inferred only
										</button>
									</div>
								</div>
							{/if}
						</div>
					{/if}

					{#if isDenseTrail && !showingInferredOnly}
						<label class="mt-2 flex cursor-pointer items-center gap-1.5 text-2xs text-ink-2">
							<input type="checkbox" class="accent-(--confirmed)" bind:checked={showAllTrailLines} />
							Show all {activeTrail.segments.length} chronological path lines
						</label>
					{/if}

					<div class="mt-3 flex flex-wrap items-center gap-1.5 border-t border-rule pt-2.5">
						<button type="button" class="btn btn-sm" onclick={() => fitBox(trailFrame(activeTrail), 84, 0.95, true, true)}>
							<Maximize2 size={12} /> Fit trail
						</button>
						<button type="button" class="btn btn-sm" title="Download spaced-out career trail as PNG" onclick={exportFocusedTrailPng}>
							<Download size={12} /> PNG
						</button>
						<a href="/staff/{traceData.staff.id}" class="btn btn-primary btn-sm ml-auto no-underline">
							Full career →
						</a>
					</div>
				{/if}

			{:else if spotlightVnId}
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<p class="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-confirmed">
							<Sparkles size={12} /> Visual Novel &amp; Series Map
						</p>
						{#if spotlightVnData}
							<h2 class="mt-0.5 text-md font-semibold text-ink">
								<NamePair name={spotlightVnData.vn.title} original={spotlightVnData.vn.original} href="/vn/{spotlightVnData.vn.id}" />
							</h2>
							<p class="mt-0.5 flex flex-wrap items-center gap-2 text-ink-3">
								<span class="tnum font-mono text-ink-2">{spotlightVnData.vn.firstYear ?? 'Unreleased'}</span>
								{#if vnSpotlight}<span>{vnSpotlight.focus.studioName}</span>{/if}
								<RatingTag hasEro={spotlightVnData.vn.hasEro} hasAllAges={spotlightVnData.vn.hasAllAges} />
							</p>
						{:else if spotlightVnLoading}
							<p class="mt-1 text-ink-2">Loading visual novel series map…</p>
						{:else if spotlightVnError}
							<p class="mt-1 text-danger">{spotlightVnError}</p>
						{/if}
					</div>
					<button type="button" class="rounded-sm p-1 text-ink-3 hover:bg-surface-hover hover:text-ink" aria-label="Close visual novel spotlight" onclick={() => clearOverlays()}>
						<X size={15} />
					</button>
				</div>

				{#if spotlightVnData && vnSpotlight}
					{#if vnSpotlight.related.length > 0}
						<p class="mt-2.5 text-2xs font-medium uppercase tracking-wider text-ink-3">
							Related titles ({vnSpotlight.related.length})
						</p>
						<ul class="mt-1 max-h-40 space-y-1 overflow-y-auto">
							{#each vnSpotlight.related as rel (rel.vid)}
								<li>
									<button
										type="button"
										class="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left hover:bg-surface-hover"
										onclick={() => flyTo(rel.x, rel.y, Math.max(cam.scale, 0.8))}
									>
										<span class="min-w-0 truncate">
											<span class="font-medium text-ink">{shownName(rel.title, rel.original)}</span>
											<span class="ml-1 text-2xs text-ink-3">· {rel.studioName}</span>
										</span>
										<span class="tnum shrink-0 font-mono text-2xs text-ink-3">
											{VN_RELATION_LABELS[rel.relation ?? ''] ?? rel.relation} · {rel.year}
										</span>
									</button>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="mt-2 text-ink-3">No dated sequels, prequels or related series entries in VNDB.</p>
					{/if}
					<div class="mt-3 flex flex-wrap items-center gap-1.5 border-t border-rule pt-2.5">
						{#if vnSpotlight.focus.pid && layout.nodeById.has(vnSpotlight.focus.pid)}
							<button type="button" class="btn btn-sm" onclick={() => selectStudio(vnSpotlight.focus.pid!, true)}>
								Inspect developer
							</button>
						{/if}
						<button type="button" class="btn btn-sm" title="Download VN series timeline as PNG" onclick={exportFocusedVnPng}>
							<Download size={12} /> PNG
						</button>
						<a href="/vn/{spotlightVnData.vn.id}" class="btn btn-primary btn-sm ml-auto no-underline">
							Open VN page →
						</a>
					</div>
				{/if}

			{:else if comparePair}
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<p class="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-inferred">
							<GitCompareArrows size={12} /> Studio Compare Spotlight
						</p>
						{#if compareData}
							<h2 class="mt-0.5 text-sm font-semibold text-ink">
								{shownName(compareData.producerA.name, compareData.producerA.original ?? null)}
								<span class="mx-1 font-normal text-ink-3">vs</span>
								{shownName(compareData.producerB.name, compareData.producerB.original ?? null)}
							</h2>
						{:else if compareLoading}
							<p class="mt-1 text-ink-2">Comparing studios…</p>
						{:else if compareError}
							<p class="mt-1 text-danger">{compareError}</p>
						{/if}
					</div>
					<button type="button" class="rounded-sm p-1 text-ink-3 hover:bg-surface-hover hover:text-ink" aria-label="Close compare spotlight" onclick={() => clearOverlays()}>
						<X size={15} />
					</button>
				</div>

				{#if compareData}
					{@const expPath = compareData.explicitPath ?? []}
					{@const directStep = expPath.length === 2 ? expPath[1] : null}
					{@const directMeta = directStep?.relationFromPrev ? EXPLICIT_META[directStep.relationFromPrev] : null}
					{@const shownCmpA = shownName(compareData.producerA.name, compareData.producerA.original ?? null)}
					{@const shownCmpB = shownName(compareData.producerB.name, compareData.producerB.original ?? null)}
					<div class="mt-2.5 space-y-2">
						{#if directMeta && directStep?.relationFromPrev}
							<!-- Direct VNDB link is ground truth: state it clearly and show staff overlap as supporting evidence (no contradictory guess!). -->
							<div class="rounded-sm border border-confirmed/35 bg-surface p-2.5">
								<div class="flex flex-wrap items-center gap-1.5">
									<EpistemicBadge register="confirmed" />
									<RelationBadge
										register="confirmed"
										kind={directMeta.kind}
										label={directMeta.label}
										arrow={directMeta.arrow}
									/>
								</div>
								<p class="mt-1.5 font-medium text-ink">{directMeta.sentence(shownCmpB, shownCmpA)}</p>
								{#if compareData.inferred}
									<EvidenceList
										items={brandEvidence(compareData.inferred, compareData.producerA.id, 'slots', shownPairNames(compareData.inferred), shownName)}
										max={3}
										proof={{
											kind: 'brand',
											pidA: compareData.producerA.id,
											pidB: compareData.producerB.id,
											nameA: shownCmpA,
											nameB: shownCmpB
										}}
										class="mt-2"
									/>
								{/if}
							</div>
						{:else}
							{#if expPath.length > 2}
								<p class="rounded-sm border border-confirmed/35 bg-surface px-2.5 py-1.5 text-ink-2">
									<EpistemicBadge register="confirmed" />
									<span class="ml-1">{expPath.length - 1}-hop VNDB path highlighted in blue.</span>
								</p>
							{/if}

							{#if compareData.inferred}
								{@const cmpDir = inferredDirectionHint(compareData.inferred, shownPairNames(compareData.inferred))}
								<div class="rounded-sm border border-dashed border-inferred/50 bg-surface p-2.5">
									<div class="flex items-center justify-between gap-2">
										<RelationBadge
											register="inferred"
											kind={INFERRED_META[compareData.inferred.inferredType].kind}
											label={inferredLabel(compareData.inferred)}
										/>
										<ConfidenceMeter score={toScore(compareData.inferred.confidence)} tier={compareData.inferred.confidenceTier} dense />
									</div>
									{#if cmpDir}
										<p class="mt-1 text-xs text-ink-2 italic">{cmpDir}</p>
									{/if}
									<EvidenceList
										items={brandEvidence(compareData.inferred, compareData.producerA.id, 'slots', shownPairNames(compareData.inferred), shownName)}
										max={3}
										proof={{
											kind: 'brand',
											pidA: compareData.producerA.id,
											pidB: compareData.producerB.id,
											nameA: shownCmpA,
											nameB: shownCmpB
										}}
										class="mt-2"
									/>
								</div>
							{:else if expPath.length === 0}
								<p class="rounded-sm border border-rule bg-surface px-2.5 py-1.5 text-ink-3">
									No VNDB link or inferred relationship found.
								</p>
							{/if}
						{/if}
					</div>
					<div class="mt-3 flex flex-wrap items-center gap-1.5 border-t border-rule pt-2.5">
						<span class="tnum text-2xs text-ink-3" title={CORE_STAFF_HINT}>
							{num(compareData.sharedTotals.core)} core · {num(compareData.sharedTotals.seiyuu)} seiyuu
						</span>
						<button type="button" class="btn btn-sm ml-auto" title="Download comparison timeline as PNG" onclick={exportFocusedComparePng}>
							<Download size={12} /> PNG
						</button>
						<a href={compareHref(compareData.producerA.id, compareData.producerB.id)} class="btn btn-primary btn-sm no-underline">
							Full Compare →
						</a>
					</div>
				{/if}

			{:else if selectedNode}
				{#if steppedFromNode}
					<div class="mb-2 flex items-center justify-between gap-2 border-b border-rule pb-1.5 text-2xs text-ink-3">
						<button
							type="button"
							class="inline-flex items-center gap-1 font-medium text-ink-2 hover:text-ink"
							onclick={() => navigateBetweenStudios(selectedNode.id, steppedFromNode.id, steppedEdgeId)}
						>
							<ArrowLeft size={11} /> From {shownName(steppedFromNode.name, steppedFromNode.original)}
						</button>
						<button
							type="button"
							class="text-2xs text-ink-3 hover:text-ink"
							onclick={() => fitStudioPair(steppedFromNode, selectedNode)}
						>
							Fit both
						</button>
					</div>
				{/if}
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<p class="flex flex-wrap items-center gap-1.5 text-2xs text-ink-3">
							<ProducerShape type={selectedNode.type} size={10} />
							<ProducerTypeBadge type={selectedNode.type} lang={selectedNode.lang} />
						</p>
						<h2 class="mt-1 text-md font-semibold text-ink">
							<NamePair name={selectedNode.name} original={selectedNode.original} lang={selectedNode.lang} href="/producer/{selectedNode.id}" />
						</h2>
						<p class="tnum mt-0.5 flex flex-wrap items-center gap-x-2.5 text-ink-3">
							<YearSpan from={selectedNode.firstYear} to={selectedNode.lastYear} />
							<StaffVnsButton
								count={selectedNode.vnCount}
								label={plural(selectedNode.vnCount, 'VN')}
								title={shownName(selectedNode.name, selectedNode.original)}
								subtitle="Visual novels"
								endpoint="/api/proof/producer-vns?pid={encodeURIComponent(selectedNode.id)}&role=all"
								moreHref="/producer/{selectedNode.id}#games"
								moreLabel="Open studio's games →"
								align="left"
								class="text-xs text-ink-2"
							/>
							<span title={CORE_STAFF_HINT}>{num(selectedNode.staffCount)} core staff</span>
						</p>
						{#if selectedNode.spineChildren > 0}
							<p class="mt-0.5 text-2xs text-ink-3">
								{selectedNode.role === 'holding' ? 'Holding company' : 'Owner'} · {plural(selectedNode.spineChildren, 'brand')}
							</p>
						{/if}
					</div>
					<button
						type="button"
						class="rounded-sm p-1 text-ink-3 hover:bg-surface-hover hover:text-ink"
						aria-label="Close studio card"
						onclick={() => {
							selectedNodeId = null;
							steppedFromNodeId = null;
							steppedEdgeId = null;
							syncUrl({ focus: null });
						}}
					>
						<X size={15} />
					</button>
				</div>

				<div class="mt-2.5 flex flex-wrap items-center gap-1.5">
					<button type="button" class="btn btn-sm" onclick={() => fitNeighborhood(selectedNode)}>
						<Crosshair size={12} /> Fit family
					</button>
					<button type="button" class="btn btn-sm" title="Download spaced-out timeline PNG of this studio & links" onclick={exportFocusedStudioPng}>
						<Download size={12} /> PNG
					</button>
					<a class="btn btn-primary btn-sm no-underline" href="/producer/{selectedNode.id}">
						Brand page →
					</a>
					<a
						class="btn-ghost ml-auto inline-flex items-center gap-0.5 text-2xs text-ink-3"
						href={vndbHref(selectedNode.id)}
						target="_blank"
						rel="noopener noreferrer"
					>
						VNDB<ArrowUpRight size={10} />
					</a>
				</div>

				<!-- Chained outgoing links toggle & step tour (e.g. Black Lilith → Anime Lilith → next link) -->
				<div class="mt-2.5 rounded-sm border border-rule bg-surface/75 px-2.5 py-1.5">
					<label class="flex cursor-pointer items-center justify-between gap-2 text-2xs text-ink-2">
						<span class="inline-flex items-center gap-1.5 font-medium">
							<input type="checkbox" class="accent-(--confirmed)" bind:checked={chainOutgoing} />
							Follow outgoing link chain
						</span>
						{#if chainOutgoing && outgoingChain.steps.length > 0}
							<span class="tnum font-mono text-ink-3">{outgoingChain.steps.length} hops</span>
						{/if}
					</label>
					{#if chainOutgoing && outgoingChain.steps.length > 0}
						{@const curStep = outgoingChain.steps[Math.min(chainStepIdx, outgoingChain.steps.length - 1)]}
						<div class="mt-1.5 flex items-center justify-between gap-1.5 border-t border-rule pt-1.5">
							<button type="button" class="btn btn-sm h-6 px-1.5 text-2xs" onclick={() => jumpToChainStep(chainStepIdx - 1)}>
								<ArrowLeft size={11} />
							</button>
							<span class="min-w-0 flex-1 truncate text-center text-2xs text-ink">
								<span class="tnum font-mono text-ink-3">{chainStepIdx + 1}/{outgoingChain.steps.length}</span>
								{shownName(curStep.from.name, curStep.from.original)} → {shownName(curStep.to.name, curStep.to.original)}
							</span>
							<button type="button" class="btn btn-sm h-6 px-1.5 text-2xs" onclick={() => jumpToChainStep(chainStepIdx + 1)}>
								<ArrowRight size={11} />
							</button>
						</div>
					{:else if chainOutgoing}
						<p class="mt-1 text-2xs text-ink-3">No further outgoing links from this studio under current filters.</p>
					{/if}
				</div>

				{#if selectedNodeAdj.explicit.length > 0}
					<div class="mt-3 border-t border-rule pt-2">
						<p class="flex items-center gap-1.5 text-2xs font-medium text-ink-3">
							<EpistemicGlyph kind="confirmed" size={10} /> VNDB links ({selectedNodeAdj.explicit.length})
						</p>
						<ul class="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
							{#each selectedNodeAdj.explicit as item (item.edge.id)}
								{@const role = explicitRole(item.edge, selectedNode.id)}
								<li>
									<button
										type="button"
										class="flex w-full items-center justify-between gap-2 rounded-sm px-1.5 py-1 text-left hover:bg-surface-hover"
										onmouseenter={() => {
											hoveredEdgeId = item.edge.id;
											hoveredNodeId = item.other.id;
										}}
										onmouseleave={() => {
											if (hoveredEdgeId === item.edge.id) hoveredEdgeId = null;
											if (hoveredNodeId === item.other.id) hoveredNodeId = null;
										}}
										onclick={() => navigateBetweenStudios(selectedNode.id, item.other.id, item.edge.id)}
									>
										<span class="truncate font-medium text-ink">{shownName(item.other.name, item.other.original)}</span>
										<span class="shrink-0 text-2xs text-ink-3" title={role ? explicitTitle(role.code) : undefined}>
											{#if role}<span class="font-mono" aria-hidden="true">{role.meta.arrow}</span> {role.meta.label}{:else}{item.edge.code}{/if}
										</span>
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if selectedNodeAdj.inferred.length > 0}
					<div class="mt-2.5 border-t border-dashed border-inferred/35 pt-2">
						<p class="flex items-center gap-1.5 text-2xs font-medium text-inferred">
							<EpistemicGlyph kind="inferred" size={10} /> Hidden links ({selectedNodeAdj.inferred.length})
						</p>
						<ul class="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
							{#each selectedNodeAdj.inferred as item (item.edge.id)}
								<li>
									<button
										type="button"
										class="flex w-full items-center justify-between gap-2 rounded-sm px-1.5 py-1 text-left hover:bg-surface-hover"
										onmouseenter={() => {
											hoveredEdgeId = item.edge.id;
											hoveredNodeId = item.other.id;
										}}
										onmouseleave={() => {
											if (hoveredEdgeId === item.edge.id) hoveredEdgeId = null;
											if (hoveredNodeId === item.other.id) hoveredNodeId = null;
										}}
										onclick={() => navigateBetweenStudios(selectedNode.id, item.other.id, item.edge.id)}
									>
										<span class="truncate text-ink-2">{shownName(item.other.name, item.other.original)}</span>
										<span
											class="tnum shrink-0 text-2xs text-inferred"
											title={item.edge.inferredType
												? inferredTitle({ inferredType: item.edge.inferredType, coDevVns: item.edge.coDevVns })
												: undefined}
										>
											{item.edge.code} <span class="font-mono">· {toScore(item.edge.confidence)}</span>
										</span>
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

			{:else if unmappedFocus}
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						{#if unmappedFocus.producer}
							{@const up = unmappedFocus.producer}
							<p class="flex items-center gap-1.5 text-2xs text-ink-3">
								<ProducerShape type={up.type} size={10} />
								<ProducerTypeBadge type={up.type} lang={up.lang} />
							</p>
							<h2 class="mt-1 truncate text-md font-semibold text-ink">
								<NamePair name={up.name} original={up.original} href="/producer/{up.id}" />
							</h2>
							<p class="tnum mt-0.5 flex flex-wrap items-center gap-x-2 text-ink-3">
								<YearSpan from={up.firstYear} to={up.lastYear} />
								<StaffVnsButton
									count={up.vnCount}
									label={plural(up.vnCount, 'VN')}
									title={shownName(up.name, up.original)}
									subtitle="Visual novels developed"
									endpoint="/api/proof/producer-vns?pid={encodeURIComponent(up.id)}"
									moreHref="/producer/{up.id}#games"
									moreLabel="Open all games →"
									align="left"
									class="text-xs text-ink-3"
								/>
								<span title={CORE_STAFF_HINT}>{num(up.staffCount)} core staff</span>
							</p>
						{:else if unmappedFocus.loading}
							<p class="text-ink-2">Loading studio…</p>
						{:else}
							<p class="text-danger">{unmappedFocus.error ?? 'Studio not found.'}</p>
						{/if}
					</div>
					<button
						type="button"
						class="rounded-sm p-1 text-ink-3 hover:bg-surface-hover hover:text-ink"
						aria-label="Close studio card"
						onclick={() => {
							unmappedFocus = null;
							syncUrl({ focus: null });
						}}
					>
						<X size={15} />
					</button>
				</div>

				{#if unmappedFocus.producer}
					{@const up = unmappedFocus.producer}
					{@const hasAnyLinks = unmappedFocus.explicitCount > 0 || unmappedFocus.inferredCount > 0}
					{@const minScore = Math.round(minConfidence * 100)}
					{@const bestScore = unmappedFocus.maxInferredConfidence != null ? Math.round(unmappedFocus.maxInferredConfidence * 100) : null}
					<p class="mt-2 rounded-sm border border-rule bg-surface px-2.5 py-1.5 text-ink-2">
						{#if !hasAnyLinks}
							Standalone studio — no VNDB brand links or inferred overlaps recorded.
						{:else if producerType === 'co' && up.type !== 'co'}
							Hidden because the Atlas is currently set to Companies only.
						{:else if lang !== 'all' && up.lang !== lang}
							Hidden by the current language filter ({lang.toUpperCase()}).
						{:else if unmappedFocus.explicitCount === 0 && mode === 'explicit'}
							No explicit VNDB brand links (switch mode to All or Hidden links to inspect inferred connections).
						{:else if unmappedFocus.explicitCount === 0 && bestScore != null && unmappedFocus.maxInferredConfidence! < minConfidence}
							No VNDB brand links; strongest inferred link is {bestScore} (below the Atlas confidence threshold of {minScore}).
						{:else if mode === 'hidden' && unmappedFocus.explicitCount > 0 && (bestScore == null || unmappedFocus.maxInferredConfidence! < minConfidence)}
							No inferred links above {minScore} confidence in Hidden links mode (has {plural(unmappedFocus.explicitCount, 'VNDB link')}).
						{:else}
							Hidden by current Atlas filters (e.g. Companies only or cluster size ≥ {minClusterSize}).
						{/if}
					</p>
					<div class="mt-2.5 flex flex-wrap items-center gap-1.5">
						{#if unmappedFocus.explicitCount === 0 && bestScore != null && unmappedFocus.maxInferredConfidence! < minConfidence && bestScore >= 10}
							{@const targetScore = Math.max(10, Math.floor(bestScore / 5) * 5)}
							<button
								type="button"
								class="btn btn-sm"
								onclick={() => {
									minClusterSize = 2;
									onScopeChange({ minConfidence: targetScore / 100 });
								}}
							>
								Lower confidence to {targetScore}
							</button>
						{:else if hasAnyLinks && (hasCustomFilters || (producerType === 'co' && up.type !== 'co'))}
							<button
								type="button"
								class="btn btn-sm"
								onclick={() => {
									minClusterSize = 2;
									onScopeChange({ producerType: 'all', lang: 'all', minConfidence: 0.15 });
								}}
							>
								Show all studios
							</button>
						{/if}
						<a class="btn btn-primary btn-sm no-underline" href="/producer/{up.id}">
							Open brand page →
						</a>
						<a
							class="btn-ghost ml-auto inline-flex items-center gap-0.5 text-2xs text-ink-3"
							href={vndbHref(up.id)}
							target="_blank"
							rel="noopener noreferrer"
						>
							VNDB<ArrowUpRight size={10} />
						</a>
					</div>
				{/if}

			{:else if selectedEdge}
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-1.5">
							<EpistemicBadge register={selectedEdge.register} />
							<RelationBadge
								register={selectedEdge.register}
								kind={selectedEdge.kind}
								label={selectedEdge.register === 'confirmed' && selectedEdge.relationCode
									? EXPLICIT_META[selectedEdge.relationCode].label
									: selectedEdge.inferredType
										? INFERRED_META[selectedEdge.inferredType].label
										: selectedEdge.code}
								title={selectedEdge.register === 'confirmed' && selectedEdge.relationCode
									? explicitTitle(selectedEdge.relationCode)
									: selectedEdge.inferredType
										? inferredTitle({ inferredType: selectedEdge.inferredType, coDevVns: selectedEdge.coDevVns })
										: undefined}
							/>
							{#if selectedEdge.register === 'inferred' && selectedEdge.confidence != null}
								<ConfidenceMeter score={toScore(selectedEdge.confidence)} tier={selectedEdge.confidenceTier ?? 'medium'} dense />
							{/if}
						</div>
						<p class="mt-2 text-sm font-semibold text-ink">
							<button type="button" class="link text-left" onclick={() => selectStudio(selectedEdge.source, true)}>
								{shownName(selectedEdge.sourceNode.name, selectedEdge.sourceNode.original)}
							</button>
							<span class="mx-1 font-mono text-xs text-ink-3">{selectedEdge.directed ? '→' : '↔'}</span>
							<button type="button" class="link text-left" onclick={() => selectStudio(selectedEdge.target, true)}>
								{shownName(selectedEdge.targetNode.name, selectedEdge.targetNode.original)}
							</button>
						</p>
					</div>
					<button type="button" class="rounded-sm p-1 text-ink-3 hover:bg-surface-hover hover:text-ink" aria-label="Close selected edge" onclick={() => (selectedEdgeId = null)}>
						<X size={15} />
					</button>
				</div>

				{#if selectedEdge.register === 'confirmed'}
					{#if selectedEdge.relationCode}
						<p class="mt-2 text-ink-2">
							{EXPLICIT_META[selectedEdge.relationCode].sentence(
								shownName(selectedEdge.targetNode.name, selectedEdge.targetNode.original),
								shownName(selectedEdge.sourceNode.name, selectedEdge.sourceNode.original)
							)}
						</p>
					{/if}
				{:else if edgeProofLoading}
					<p class="mt-2 text-ink-3">Loading proof…</p>
				{:else if edgeProofLink}
					{@const edgeDir = inferredDirectionHint(edgeProofLink, shownPairNames(edgeProofLink))}
					{#if edgeDir}
						<p class="mt-1.5 text-xs text-ink-2 italic">{edgeDir}</p>
					{/if}
					<EvidenceList
						items={brandEvidence(edgeProofLink, selectedEdge.source, 'slots', shownPairNames(edgeProofLink), shownName)}
						max={4}
						notes={edgeProofLink.evidence}
						proof={{
							kind: 'brand',
							pidA: selectedEdge.source,
							pidB: selectedEdge.target,
							nameA: shownName(selectedEdge.sourceNode.name, selectedEdge.sourceNode.original),
							nameB: shownName(selectedEdge.targetNode.name, selectedEdge.targetNode.original)
						}}
						class="mt-2"
					/>
				{/if}

				<div class="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-2.5">
					{#if mode === 'hidden' && hiddenQueue.length > 1}
						<button type="button" class="btn btn-sm" onclick={() => jumpToHiddenLink(hiddenIndex - 1)}>
							<ArrowLeft size={12} />
						</button>
						<span class="tnum font-mono text-2xs text-ink-3">
							#{hiddenIndex + 1} / {num(hiddenQueue.length)}
						</span>
						<button type="button" class="btn btn-sm" onclick={() => jumpToHiddenLink(hiddenIndex + 1)}>
							<ArrowRight size={12} />
						</button>
					{/if}
					<button type="button" class="btn btn-sm ml-auto" onclick={() => void startCompareSpotlight(selectedEdge.source, selectedEdge.target)}>
						Spotlight pair
					</button>
					<a class="btn btn-primary btn-sm no-underline" href={compareHref(selectedEdge.source, selectedEdge.target)}>
						Compare →
					</a>
				</div>

			{:else if mode === 'hidden' && hiddenQueue.length > 0}
				<div class="flex items-center justify-between gap-2">
					<div>
						<p class="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-inferred">
							<EpistemicGlyph kind="inferred" size={11} /> Hidden Links Tour
						</p>
						<p class="mt-0.5 text-ink-2">
							{num(hiddenQueue.length)} unlinked studio bridges visible on the timeline.
						</p>
					</div>
					<button type="button" class="btn btn-primary btn-sm" onclick={() => jumpToHiddenLink(0)}>
						Tour #1 →
					</button>
				</div>
			{/if}
		</aside>
	{/if}

	<!-- ── Bottom-Right Floating Live 2D Minimap + Zoom Controls ── -->
	<div class="pointer-events-none absolute right-3 bottom-3 z-30 flex flex-col items-end gap-2 sm:right-4 sm:bottom-4">
		<div class="pointer-events-auto hidden overflow-hidden rounded-lg border border-rule-strong bg-surface/94 shadow-xl backdrop-blur-md sm:block">
			<canvas
				bind:this={minimapEl}
				width={miniW}
				height={miniH}
				class="block cursor-crosshair touch-none"
				style="width: {miniW}px; height: {miniH}px"
				onpointerdown={onMinimapDown}
				onpointermove={onMinimapMove}
				onpointerup={onMinimapUp}
				onpointercancel={onMinimapUp}
				aria-label="Atlas minimap — click or drag to pan"
			></canvas>
		</div>

		<div class="pointer-events-auto flex items-center gap-1.5">
			<div class="flex items-center gap-0.5 rounded-lg border border-rule-strong bg-surface-raised/94 p-1 shadow-lg backdrop-blur-md">
				<button
					type="button"
					class="inline-flex size-7 items-center justify-center rounded-md text-ink-2 hover:bg-surface-hover hover:text-ink"
					aria-label="Zoom out"
					title="Zoom out"
					onclick={() => zoomBy(1 / 1.35)}
				>
					<Minus size={14} />
				</button>
				<span class="tnum min-w-[4.5ch] text-center font-mono text-2xs text-ink-3">
					{Math.round(cam.scale * 100)}%
				</span>
				<button
					type="button"
					class="inline-flex size-7 items-center justify-center rounded-md text-ink-2 hover:bg-surface-hover hover:text-ink"
					aria-label="Zoom in"
					title="Zoom in"
					onclick={() => zoomBy(1.35)}
				>
					<Plus size={14} />
				</button>
				<span class="mx-0.5 h-4 w-px bg-rule"></span>
				<button
					type="button"
					class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-2xs font-medium text-ink-2 hover:bg-surface-hover hover:text-ink"
					title="Fit entire studio atlas into view"
					onclick={() => fitAll(true)}
				>
					<Maximize2 size={12} /> Fit all
				</button>
			</div>
		</div>
	</div>
</div>
