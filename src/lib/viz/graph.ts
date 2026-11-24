/**
 * Timeline-aligned ego graph for a brand's local neighbourhood (same visual grammar
 * as the main Studio Atlas): horizontal X = Year →, vertical Y = grouped studio
 * swimlanes with dedicated non-overlapping section headers and clean vertical-drop
 * connectors anchored on shared active years (zero starburst diagonals).
 * Deterministic, pure TypeScript, zero DOM.
 */
import type { BrandGraphEdge, BrandGraphNode, ProducerType } from '../types.ts';
import {
	EXPLICIT_META,
	INFERRED_META,
	agreement,
	inferredLabel,
	inferredOrientation,
	invertExplicit,
	isRename,
	toScore,
	type Register,
	type RelationKind,
	type Sector
} from '../relations.ts';
import { estimateTextWidth } from './text.ts';

export interface GraphFilters {
	explicit: boolean;
	inferred: boolean;
	/** Dotted, voice-cast-only edges. */
	seiyuuDriven: boolean;
	kinds: Record<RelationKind, boolean>;
	/** 0–100. */
	minConfidence: number;
}

/** Weak inferred links are hidden until asked for: the canvas opens on the readable ones. */
export const DEFAULT_MIN_CONFIDENCE = 45;

export const DEFAULT_GRAPH_FILTERS: GraphFilters = {
	explicit: true,
	inferred: true,
	seiyuuDriven: true,
	kinds: { ownership: true, sister: true, lineage: true, partner: true },
	minConfidence: DEFAULT_MIN_CONFIDENCE
};

export function defaultGraphFilters(edges: readonly BrandGraphEdge[]): GraphFilters {
	const filters = structuredClone(DEFAULT_GRAPH_FILTERS);
	const inferred = edges.filter((e) => e.kind === 'inferred');
	if (inferred.length > 0 && !inferred.some((e) => toScore(e.confidence) >= filters.minConfidence)) {
		filters.minConfidence = 0;
	}
	return filters;
}

/** Top year ruler height and bottom margin. */
export const RIM_TOP = 28;
export const RIM_BOTTOM = 18;

export type TimelineBandKind = 'owners' | 'lineage' | 'focus' | 'children' | 'sisters' | 'partners';

export interface TimelineBand {
	kind: TimelineBandKind;
	label: string;
	headerY: number;
	y0: number;
	y1: number;
}

export interface TimelineTick {
	year: number;
	x: number;
	major: boolean;
}

export interface PlacedNode {
	id: string;
	name: string;
	original: string | null;
	type: ProducerType;
	vnCount: number;
	staffCount: number;
	firstYear: number | null;
	lastYear: number | null;
	plotYear: number;
	undated: boolean;
	x: number;
	endX: number;
	y: number;
	r: number;
	isFocus: boolean;
	sector: Sector | 'C';
	band: TimelineBandKind;
	labelAbove: boolean;
	inactive: boolean;
	label: string;
	labelW: number;
	/** Highest inferred confidence score (0–100) for quiet gutter display on inferred bands. */
	inferredScore: number | null;
	overflow: number;
}

export interface PlacedEdge {
	key: string;
	/** The non-focus endpoint. */
	otherId: string;
	register: Register;
	kind: RelationKind;
	code: string;
	label: string;
	path: string;
	/** Second stroke for a rename (double line). */
	path2: string | null;
	arrow: string | null;
	anchor: { x: number; y: number };
	targetAnchor: { x: number; y: number };
	mid: { x: number; y: number };
	/** True when pill stays hidden at rest (e.g. redundant Sister?/Partner? inside its own labeled band); shown on hover/select. */
	labelHidden: boolean;
	length: number;
	dash: string | null;
	roundCap: boolean;
	width: number;
	opacity: number;
	seiyuuDriven: boolean;
	corroborates: boolean;
	score: number | null;
	source: BrandGraphEdge;
}

export interface GraphLayout {
	width: number;
	height: number;
	cx: number;
	cy: number;
	leftGutter: number;
	minYear: number;
	maxYear: number;
	yearTicks: TimelineTick[];
	bands: TimelineBand[];
	nodes: PlacedNode[];
	edges: PlacedEdge[];
	hiddenCount: number;
}

const CAPACITY_PER_BAND = 12;

function nodeRadius(vnCount: number, focus: boolean): number {
	const r = Math.max(4.5, Math.min(8.5, 4 + 0.45 * Math.sqrt(Math.max(0, vnCount))));
	return focus ? Math.max(7.5, r + 1.5) : r;
}

function truncate(s: string, max = 24): string {
	const chars = [...s];
	return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : s;
}

function nodeLabelWidth(label: string): number {
	return estimateTextWidth(label, 6.8, 11.5);
}

export function edgeKind(e: BrandGraphEdge): RelationKind {
	if (e.kind === 'inferred') return INFERRED_META[e.inferredType ?? 'sister'].kind;
	if (e.relationCode) return EXPLICIT_META[e.relationCode].kind;
	return e.kind === 'explicit_ownership' ? 'ownership' : 'lineage';
}

export function edgeOther(e: BrandGraphEdge, focusId: string): string {
	return e.source === focusId ? e.target : e.source;
}

function sectorForEdge(e: BrandGraphEdge, focusId: string): Sector | 'sister' | 'partner' {
	if (e.kind !== 'inferred' && e.relationCode) return EXPLICIT_META[e.relationCode].sector;
	const type = e.inferredType ?? 'sister';
	const { head } = inferredOrientation(type, e.direction);
	const focusSide = e.source === focusId ? 'A' : 'B';
	if (type === 'subbrand') return head === focusSide ? 'N' : 'S';
	if (type === 'successor') return head === focusSide ? 'W' : 'E';
	return type === 'sister' ? 'sister' : 'partner';
}

function bandForSector(sector: Sector | 'sister' | 'partner'): TimelineBandKind {
	if (sector === 'N') return 'owners';
	if (sector === 'W' || sector === 'E') return 'lineage';
	if (sector === 'S') return 'children';
	if (sector === 'sister') return 'sisters';
	return 'partners';
}

export function filterEdges(
	edges: readonly BrandGraphEdge[],
	filters: GraphFilters
): BrandGraphEdge[] {
	return edges.filter((e) => {
		const kind = edgeKind(e);
		if (!filters.kinds[kind]) return false;
		if (e.kind === 'inferred') {
			if (!filters.inferred) return false;
			if (e.seiyuuDriven && !filters.seiyuuDriven) return false;
			if (toScore(e.confidence) < filters.minConfidence) return false;
			return true;
		}
		return filters.explicit;
	});
}

function validYear(y: number | null | undefined, dumpYear: number): y is number {
	return y != null && y >= 1980 && y <= (dumpYear || 2026) + 2;
}

export function layoutGraph(
	focusId: string,
	nodes: readonly BrandGraphNode[],
	allEdges: readonly BrandGraphEdge[],
	filters: GraphFilters,
	width: number,
	minHeight: number,
	dumpYear: number,
	shown: (name: string, original: string | null) => string = (name) => name
): GraphLayout {
	const nowYear = dumpYear || 2026;
	const edges = filterEdges(allEdges, filters).filter(
		(e) => e.source === focusId || e.target === focusId
	);
	const nodeById = new Map(nodes.map((n) => [n.id, n]));

	// Assign each neighbour to one primary swimlane band (VNDB explicit wins over inferred).
	interface Neighbour {
		id: string;
		sector: Sector;
		band: TimelineBandKind;
		rank: number;
		explicit: boolean;
		inferredScore: number | null;
	}
	const neighbours = new Map<string, Neighbour>();
	for (const e of edges) {
		const otherId = edgeOther(e, focusId);
		if (otherId === focusId || !nodeById.has(otherId)) continue;
		const explicit = e.kind !== 'inferred';
		const rawSector = sectorForEdge(e, focusId);
		const sector: Sector = rawSector === 'sister' ? 'NE' : rawSector === 'partner' ? 'SE' : rawSector;
		const band = bandForSector(rawSector);
		const score = explicit ? null : toScore(e.confidence);
		const rank = explicit
			? 1000 + (nodeById.get(otherId)?.vnCount ?? 0)
			: (score ?? 0);
		const cur = neighbours.get(otherId);
		if (!cur || (explicit && !cur.explicit) || (explicit === cur.explicit && rank > cur.rank)) {
			neighbours.set(otherId, {
				id: otherId,
				sector,
				band,
				rank,
				explicit,
				inferredScore: score ?? cur?.inferredScore ?? null
			});
		} else if (score != null && (cur.inferredScore == null || score > cur.inferredScore)) {
			cur.inferredScore = score;
		}
	}

	const focus = nodeById.get(focusId);
	const byBand = new Map<TimelineBandKind, Neighbour[]>();
	for (const n of neighbours.values()) {
		const list = byBand.get(n.band);
		if (list) list.push(n);
		else byBand.set(n.band, [n]);
	}

	const BAND_ORDER: Array<{ kind: TimelineBandKind; label: string }> = [
		{ kind: 'owners', label: '↑ Owners & parents' },
		{ kind: 'lineage', label: '⇄ Lineage' },
		{ kind: 'focus', label: 'Focus studio' },
		{ kind: 'children', label: '↓ Imprints & sub-brands' },
		{ kind: 'sisters', label: 'Sister brands? (inferred)' },
		{ kind: 'partners', label: 'Partner studios? (inferred)' }
	];

	let hiddenCount = 0;
	const visibleIds = new Set<string>([focusId]);
	const bandRows: Array<{ kind: TimelineBandKind; label: string; items: Array<Neighbour | 'focus'>; overflow: number }> = [];

	for (const b of BAND_ORDER) {
		if (b.kind === 'focus') {
			if (focus) bandRows.push({ kind: 'focus', label: b.label, items: ['focus'], overflow: 0 });
			continue;
		}
		const list = (byBand.get(b.kind) ?? []).sort(
			(a, c) =>
				Number(c.explicit) - Number(a.explicit) ||
				(c.inferredScore ?? 0) - (a.inferredScore ?? 0) ||
				(nodeById.get(a.id)?.firstYear ?? 9999) - (nodeById.get(c.id)?.firstYear ?? 9999) ||
				a.id.localeCompare(c.id)
		);
		if (list.length === 0) continue;
		const shownList = list.slice(0, CAPACITY_PER_BAND);
		const overflow = list.length - shownList.length;
		hiddenCount += overflow;
		for (const item of shownList) visibleIds.add(item.id);
		bandRows.push({ kind: b.kind, label: b.label, items: shownList, overflow });
	}

	// Year domain across focus + visible neighbours
	const years: number[] = [];
	for (const id of visibleIds) {
		const n = nodeById.get(id);
		if (!n) continue;
		if (validYear(n.firstYear, nowYear)) years.push(n.firstYear);
		if (validYear(n.lastYear, nowYear)) years.push(n.lastYear);
	}
	const focusYear =
		focus && validYear(focus.firstYear, nowYear)
			? focus.firstYear
			: years.length
				? Math.round(years.reduce((a, b) => a + b, 0) / years.length)
				: nowYear - 5;

	let minYear = years.length ? Math.min(...years) - 1 : focusYear - 5;
	let maxYear = years.length ? Math.max(...years) + 2 : focusYear + 5;
	minYear = Math.floor(minYear / 2) * 2;
	maxYear = Math.max(minYear + 6, Math.ceil(maxYear / 2) * 2);

	const leftGutter = Math.max(195, Math.min(248, Math.round(width * 0.25)));
	const rightPad = 36;
	const plotW = Math.max(260, width - leftGutter - rightPad);
	const span = Math.max(1, maxYear - minYear);
	const yearToX = (yr: number) => leftGutter + ((yr - minYear) / span) * plotW;

	const tickStep = span > 34 ? 5 : span > 16 ? 2 : 1;
	const firstTick = Math.ceil(minYear / tickStep) * tickStep;
	const yearTicks: TimelineTick[] = [];
	for (let yr = firstTick; yr <= maxYear; yr += tickStep) {
		yearTicks.push({
			year: yr,
			x: yearToX(yr),
			major: yr % 10 === 0 || (tickStep <= 2 && yr % 5 === 0) || tickStep === 1
		});
	}

	// Vertical swimlane packing with dedicated 22px non-overlapping band headers!
	const totalRows = bandRows.reduce((acc, b) => acc + b.items.length + (b.overflow > 0 ? 1 : 0), 0);
	const rowH = totalRows <= 8 ? 36 : totalRows <= 16 ? 30 : 28;
	const headerH = 22;
	const bandGap = 8;
	const headerCount = bandRows.filter((b) => b.kind !== 'focus').length;
	const naturalH =
		RIM_TOP + RIM_BOTTOM + 10 + totalRows * rowH + headerCount * headerH + Math.max(0, bandRows.length - 1) * bandGap;
	const height = Math.max(minHeight, naturalH);
	const extraY = Math.max(0, (height - naturalH) / 2);

	const placed: PlacedNode[] = [];
	const bands: TimelineBand[] = [];
	let curY = RIM_TOP + 6 + extraY;

	for (let bi = 0; bi < bandRows.length; bi++) {
		const b = bandRows[bi];
		const bandStartY = curY;
		const headerY = b.kind !== 'focus' ? curY + 13 : curY;
		if (b.kind !== 'focus') curY += headerH;
		for (const item of b.items) {
			const y = curY + rowH / 2;
			curY += rowH;
			const isFocus = item === 'focus';
			const id = isFocus ? focusId : item.id;
			const n = nodeById.get(id)!;
			const dated = validYear(n.firstYear, nowYear);
			let py = dated ? (n.firstYear as number) : focusYear;
			if (!dated && b.kind === 'owners') py = Math.max(minYear, focusYear - 1);
			if (!dated && b.kind === 'children') py = Math.min(maxYear - 1, focusYear + 1);
			const endYr = dated && validYear(n.lastYear, nowYear) && n.lastYear >= py ? n.lastYear : py;
			const x = yearToX(py);
			const endX = dated ? Math.max(x + 12, yearToX(endYr + 0.85)) : x;
			const label = truncate(shown(n.name, n.original ?? null), 22);

			placed.push({
				id: n.id,
				name: n.name,
				original: n.original ?? null,
				type: n.type,
				vnCount: n.vnCount,
				staffCount: n.staffCount,
				firstYear: n.firstYear,
				lastYear: n.lastYear,
				plotYear: py,
				undated: !dated,
				x,
				endX,
				y,
				r: nodeRadius(n.vnCount, isFocus),
				isFocus,
				sector: isFocus ? 'C' : item.sector,
				band: b.kind,
				labelAbove: false,
				inactive: n.lastYear != null && nowYear - n.lastYear > 10,
				label,
				labelW: nodeLabelWidth(label),
				inferredScore: !isFocus && !item.explicit ? item.inferredScore : null,
				overflow: 0
			});
		}
		if (b.overflow > 0) {
			const y = curY + rowH / 2;
			curY += rowH;
			placed.push({
				id: `__more_${b.kind}`,
				name: `${b.overflow} more`,
				original: null,
				type: 'co',
				vnCount: 0,
				staffCount: 0,
				firstYear: null,
				lastYear: null,
				plotYear: focusYear,
				undated: true,
				x: leftGutter + 42,
				endX: leftGutter + 42,
				y,
				r: 9,
				isFocus: false,
				sector: b.kind === 'owners' ? 'N' : b.kind === 'children' ? 'S' : 'E',
				band: b.kind,
				labelAbove: false,
				inactive: true,
				label: `+${b.overflow} more`,
				labelW: 54,
				inferredScore: null,
				overflow: b.overflow
			});
		}
		bands.push({ kind: b.kind, label: b.label, headerY, y0: bandStartY, y1: curY });
		if (bi < bandRows.length - 1) curY += bandGap;
	}

	const posById = new Map(placed.map((n) => [n.id, n]));
	const focusNode = posById.get(focusId);
	const cx = focusNode ? focusNode.x : width / 2;
	const cy = focusNode ? focusNode.y : height / 2;

	// Build tidy orthogonal/vertical-drop edges anchored on the SHARED active years (zero starburst diagonals!)
	const pairHasExplicit = new Set<string>();
	const pairHasInferred = new Set<string>();
	for (const e of edges) {
		const other = edgeOther(e, focusId);
		(e.kind === 'inferred' ? pairHasInferred : pairHasExplicit).add(other);
	}

	const out: PlacedEdge[] = [];
	const curves = new Map<string, [number, number, number, number, number, number]>();

	if (focusNode) {
		// Pre-order undirected inferred edges (sisters & partners) so their vertical stems
		// fan out neatly along the focus lifeline instead of stacking on top of each other!
		const undirectedInferred = edges.filter(
			(e) =>
				e.kind === 'inferred' &&
				(e.inferredType === 'sister' || e.inferredType === 'partner') &&
				visibleIds.has(edgeOther(e, focusId))
		);
		const stemSlotByKey = new Map<string, { idx: number; total: number }>();
		const stemOrdered = [...undirectedInferred].sort((a, b) => {
			const na = posById.get(edgeOther(a, focusId));
			const nb = posById.get(edgeOther(b, focusId));
			return (na?.y ?? 0) - (nb?.y ?? 0);
		});
		stemOrdered.forEach((e, idx) => {
			const otherId = edgeOther(e, focusId);
			const key = `inf|${otherId}|${e.relationCode ?? e.inferredType ?? ''}`;
			stemSlotByKey.set(key, { idx, total: stemOrdered.length });
		});

		const focusStart = focusNode.x;
		const focusEnd = Math.max(focusNode.x + 12, focusNode.endX);

		for (const e of edges) {
			const otherId = edgeOther(e, focusId);
			const other = posById.get(otherId);
			if (!other || !visibleIds.has(otherId)) continue;
			const inferred = e.kind === 'inferred';
			const kind = edgeKind(e);
			const both = pairHasExplicit.has(otherId) && pairHasInferred.has(otherId);
			const key = `${inferred ? 'inf' : 'exp'}|${otherId}|${e.relationCode ?? e.inferredType ?? ''}`;

			let headIsOther: boolean | null = null;
			if (!inferred && e.relationCode) {
				headIsOther = EXPLICIT_META[e.relationCode].targetIsHead;
				if (isRename(e.relationCode)) headIsOther = null;
			} else if (inferred) {
				const { head } = inferredOrientation(e.inferredType ?? 'sister', e.direction);
				if (head) {
					const focusSide = e.source === focusId ? 'A' : 'B';
					headIsOther = head !== focusSide;
				}
			}

			const otherStart = other.x;
			const otherEnd = Math.max(other.x + 12, other.endX);

			let x1: number;
			let y1: number;
			let x2: number;
			let y2: number;
			let qx: number;
			let qy: number;
			let path: string;
			let arrow: string | null = null;

			const stemInfo = stemSlotByKey.get(key);
			if (stemInfo) {
				// Clean vertical drop inside the shared active overlap [overlapLo, overlapHi]!
				const overlapLo = Math.max(focusStart + 10, otherStart + 8);
				const overlapHi = Math.min(focusEnd - 8, otherEnd - 8);
				let stemX: number;
				if (overlapHi > overlapLo + 6) {
					const t = stemInfo.total <= 1 ? 0.5 : (stemInfo.idx + 0.5) / stemInfo.total;
					stemX = overlapLo + t * (overlapHi - overlapLo);
				} else {
					// No overlap: connect closest ends smoothly
					stemX = focusStart >= otherEnd ? (focusStart + otherEnd) / 2 : (focusEnd + otherStart) / 2;
				}
				const clampedFocusX = Math.max(focusStart, Math.min(focusEnd, stemX));
				const clampedOtherX = Math.max(otherStart, Math.min(otherEnd, stemX));
				x1 = clampedFocusX;
				y1 = focusNode.y;
				x2 = clampedOtherX;
				y2 = other.y;
				qx = (x1 + x2) / 2;
				qy = (y1 + y2) / 2;
				path = `M${f(x1)},${f(y1)} Q${f(qx)},${f(qy)} ${f(x2)},${f(y2)}`;
			} else {
				// Directed ownership / lineage / successor / subbrand: anchor cleanly on the parent/origin
				// lifeline and arrive perpendicular to the top/bottom rim of the target node so arrowheads pop!
				const src = headIsOther === false ? other : focusNode;
				const dst = headIsOther === false ? focusNode : other;
				const srcStart = src.x;
				const srcEnd = Math.max(src.x + 12, src.endX);
				const dirY = src.y <= dst.y ? 1 : -1;
				const targetR = dst.r + 3.5;

				// Arrive on the top rim (flowing down) or bottom rim (flowing up) of the target node
				x2 = dst.x;
				y2 = dst.y - dirY * targetR;
				if (x2 >= srcStart + 8 && x2 <= srcEnd - 4) {
					x1 = x2;
				} else if (x2 < srcStart + 8) {
					x1 = srcStart;
				} else {
					x1 = srcEnd;
				}
				y1 = src.y + dirY * (x1 === srcStart ? src.r + 1.5 : 1);

				const dy = y2 - y1;
				const dx = x2 - x1;
				const bow = Math.abs(dx) < 16 ? (both ? (inferred ? -22 : 22) : 0) : 0;
				qx = (x1 + x2) / 2 + bow;
				qy = (y1 + y2) / 2 + (both ? (inferred ? 8 : -8) : 0);

				const endDx = x2 - qx;
				const endDy = y2 - qy;
				const endLen = Math.hypot(endDx, endDy) || 1;
				const ax = endDx / endLen;
				const ay = endDy / endLen;

				if (headIsOther !== null) {
					const arrLen = 10.5;
					const arrHalfW = 4.6;
					const strokeEndX = x2 - ax * (arrLen * 0.72);
					const strokeEndY = y2 - ay * (arrLen * 0.72);
					path = `M${f(x1)},${f(y1)} Q${f(qx)},${f(qy)} ${f(strokeEndX)},${f(strokeEndY)}`;
					const bx = x2 - ax * arrLen;
					const by = y2 - ay * arrLen;
					const nx = x2 - ax * (arrLen * 0.72);
					const ny = y2 - ay * (arrLen * 0.72);
					arrow = `${f(x2)},${f(y2)} ${f(bx - ay * arrHalfW)},${f(by + ax * arrHalfW)} ${f(nx)},${f(ny)} ${f(bx + ay * arrHalfW)},${f(by - ax * arrHalfW)}`;
				} else {
					path = `M${f(x1)},${f(y1)} Q${f(qx)},${f(qy)} ${f(x2)},${f(y2)}`;
				}
			}

			const len = Math.hypot(x2 - x1, y2 - y1) || 1;
			const mid = pointOnCurve([x1, y1, qx, qy, x2, y2], 0.5);

			let path2: string | null = null;
			if (!inferred && isRename(e.relationCode)) {
				const endDx = x2 - qx;
				const endDy = y2 - qy;
				const endLen = Math.hypot(endDx, endDy) || 1;
				const nx = -(endDy / endLen) * 3;
				const ny = (endDx / endLen) * 3;
				path2 = `M${f(x1 + nx)},${f(y1 + ny)} Q${f(qx + nx)},${f(qy + ny)} ${f(x2 + nx)},${f(y2 + ny)}`;
			}

			const score = inferred ? toScore(e.confidence) : null;
			const orientedExplicit =
				inferred && e.explicitRelation
					? e.source === focusId
						? e.explicitRelation
						: invertExplicit(e.explicitRelation)
					: null;
			const corroborates =
				inferred &&
				!!orientedExplicit &&
				agreement(e.inferredType ?? 'sister', orientedExplicit, headIsOther) === 'corroborates';

			const baseCode = inferred
				? INFERRED_META[e.inferredType ?? 'sister'].code
				: e.relationCode
					? EXPLICIT_META[e.relationCode].code
					: 'VNDB';
			const dirGlyph =
				arrow != null
					? Math.abs(y2 - y1) < 12
						? x2 >= x1
							? '→ '
							: '← '
						: Math.abs(x2 - x1) < 18
							? y2 > y1
								? '↓ '
								: '↑ '
							: y2 > y1
								? x2 > x1
									? '↘ '
									: '↙ '
								: x2 > x1
									? '↗ '
									: '↖ '
					: '';
			const code = `${dirGlyph}${baseCode}`;
			const label = inferred
				? inferredLabel({ inferredType: e.inferredType ?? 'sister', coDevVns: e.coDevVns })
				: e.relationCode
					? EXPLICIT_META[e.relationCode].label
					: 'VNDB relation';

			curves.set(key, [x1, y1, qx, qy, x2, y2]);
			// Sisters & Partners already sit inside clearly labeled bands — keep their pills off at rest
			// (shown cleanly on hover/selection) so the canvas stays razor-sharp!
			const hidePillAtRest = !!stemInfo;
			out.push({
				key,
				otherId,
				register: inferred ? 'inferred' : 'confirmed',
				kind,
				code,
				label,
				path,
				path2,
				arrow,
				anchor: { x: x1, y: y1 },
				targetAnchor: { x: x2, y: y2 },
				mid,
				labelHidden: hidePillAtRest,
				length: len,
				dash: inferred ? (e.seiyuuDriven ? '1 4' : '5 4') : null,
				roundCap: inferred && !!e.seiyuuDriven,
				width: inferred ? 1.4 : path2 ? 1.5 : 2,
				opacity: inferred ? (corroborates ? 0.28 : 0.45 + 0.4 * ((score ?? 0) / 100)) : 0.96,
				seiyuuDriven: !!e.seiyuuDriven,
				corroborates,
				score,
				source: e
			});
		}
	}

	placeEdgeLabels(out, curves, placed, width, height);
	out.sort((a, b) => (a.register === b.register ? 0 : a.register === 'inferred' ? -1 : 1));

	return {
		width,
		height,
		cx,
		cy,
		leftGutter,
		minYear,
		maxYear,
		yearTicks,
		bands,
		nodes: placed,
		edges: out,
		hiddenCount
	};
}

function f(v: number): string {
	return v.toFixed(1);
}

type Curve = [number, number, number, number, number, number];
const LABEL_SPOTS = [0.5, 0.35, 0.65, 0.25, 0.75];
const LABEL_H = 16;

function pointOnCurve([x1, y1, qx, qy, x2, y2]: Curve, t: number): { x: number; y: number } {
	const u = 1 - t;
	return { x: u * u * x1 + 2 * u * t * qx + t * t * x2, y: u * u * y1 + 2 * u * t * qy + t * t * y2 };
}

export function edgeLabelWidth(code: string, seiyuuDriven: boolean): number {
	return code.length * 6.2 + 14 + (seiyuuDriven ? 9 : 0);
}

function placeEdgeLabels(
	edges: PlacedEdge[],
	curves: ReadonlyMap<string, Curve>,
	nodes: readonly PlacedNode[],
	width: number,
	height: number
): void {
	interface Box {
		x: number;
		y: number;
		w: number;
		h: number;
	}
	const taken: Box[] = [
		{ x: width / 2, y: RIM_TOP / 2, w: width, h: RIM_TOP + 2 },
		{ x: width / 2, y: height - RIM_BOTTOM / 2, w: width, h: RIM_BOTTOM + 2 }
	];
	for (const n of nodes) {
		taken.push({ x: n.x, y: n.y, w: n.r * 2 + 10, h: n.r * 2 + 10 });
	}
	const hits = (b: Box) =>
		taken.some((o) => Math.abs(b.x - o.x) < (b.w + o.w) / 2 && Math.abs(b.y - o.y) < (b.h + o.h) / 2);

	const order = [...edges]
		.filter((e) => !e.labelHidden)
		.sort(
			(a, b) =>
				Number(a.register === 'inferred') - Number(b.register === 'inferred') ||
				(b.score ?? 0) - (a.score ?? 0) ||
				a.key.localeCompare(b.key)
		);
	for (const e of order) {
		const curve = curves.get(e.key);
		if (!curve) continue;
		const w = edgeLabelWidth(e.code, e.seiyuuDriven);
		let spot = pointOnCurve(curve, LABEL_SPOTS[0]);
		let placedClean = false;
		for (const t of LABEL_SPOTS) {
			const p = pointOnCurve(curve, t);
			if (p.x - w / 2 < 8 || p.x + w / 2 > width - 8) continue;
			if (!hits({ x: p.x, y: p.y, w: w + 4, h: LABEL_H + 2 })) {
				spot = p;
				placedClean = true;
				break;
			}
		}
		e.mid = spot;
		e.labelHidden = !placedClean;
		if (placedClean) taken.push({ x: spot.x, y: spot.y, w, h: LABEL_H });
	}
}

export function nearestNode(
	nodes: readonly PlacedNode[],
	fromId: string,
	dir: 'left' | 'right' | 'up' | 'down'
): PlacedNode | null {
	const from = nodes.find((n) => n.id === fromId);
	if (!from) return nodes[0] ?? null;
	let best: PlacedNode | null = null;
	let bestScore = Infinity;
	for (const n of nodes) {
		if (n.id === fromId) continue;
		const dx = n.x - from.x;
		const dy = n.y - from.y;
		const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
		const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
		if (along <= 4) continue;
		const score = along + across * 1.4;
		if (score < bestScore) {
			bestScore = score;
			best = n;
		}
	}
	return best;
}

export function nodeShapePath(type: ProducerType, r: number): string {
	if (type === 'in') {
		const d = r * 1.15;
		return `M0,${-d} L${d},0 L0,${d} L${-d},0 Z`;
	}
	if (type === 'ng') {
		const s = r * 0.92;
		const c = s * 0.5;
		return `M${-s + c},${-s} H${s - c} Q${s},${-s} ${s},${-s + c} V${s - c} Q${s},${s} ${s - c},${s} H${-s + c} Q${-s},${s} ${-s},${s - c} V${-s + c} Q${-s},${-s} ${-s + c},${-s} Z`;
	}
	return `M${-r},0 A${r},${r} 0 1,0 ${r},0 A${r},${r} 0 1,0 ${-r},0 Z`;
}
