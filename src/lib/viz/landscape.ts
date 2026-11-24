/**
 * Studio Atlas layout: an evolutionary timeline drawn like a railway map.
 * Pure TypeScript, zero DOM, deterministic.
 *
 * The model, from first principles:
 *
 * 1. **Every studio is a lifeline.** `x` is time (the year it starts), each
 *    studio owns one horizontal row for as long as it is active, and no two
 *    lifelines share a row while both are alive. A name can therefore sit right
 *    on its own line and always belongs to exactly one studio.
 *
 * 2. **Ownership is a corporate spine, not a fan of rays.** An owner's row
 *    carries one horizontal rail from its own start to the newest brand it owns.
 *    Each brand leaves that rail at its *own* founding year through a short
 *    rounded elbow (`EdgeRoute` of type `bus`), so an 80-brand holding company
 *    reads as one trunk with 80 perpendicular branches instead of 80 diagonals
 *    converging on a single point decades earlier.
 *
 * 3. **Everything else is an arc anchored at the moment it happened.** Renames,
 *    spinoffs and inferred links leave the earlier studio's lifeline at the year
 *    the later one appears (`EdgeRoute` of type `arc`). No edge spans more than a
 *    sliver of the time axis, so nothing cuts across unrelated studios.
 *
 * 4. **Houses are blocks.** Each studio hangs off one layout parent (its main
 *    owner, else the studio it descends from, else its strongest link), which
 *    turns every family into a tree. Trees are packed recursively as row blocks
 *    around their parent's row, and whole houses are skyline-packed in 2D by the
 *    years they span, best-known first.
 *
 * 5. **Prominence decides what you see first.** `priority` ranks studios by how
 *    well known they are (votes, releases, staff); owners inherit from the
 *    flagship brand they hold. Labels are placed in that order and `minScale`
 *    is the zoom at which a studio joins the map, so a famous brand always
 *    outranks an obscure one however the graph is wired.
 *
 * `buildCareerTrail()` projects one person's VN credits onto the same rows:
 * every stop sits on the lifeline of the studio that made it.
 */
import type {
	ExplicitRelationCode,
	InferredBrandType,
	ProducerType,
	StaffBrandTrack,
	StaffTimelineEvent
} from '../types.ts';
import type { RelationKind } from '../relations.ts';
import { primaryRole } from '../roles.ts';

export interface LandscapeInputNode {
	id: string;
	name: string;
	original: string | null;
	type: ProducerType;
	lang: string | null;
	vnCount: number;
	staffCount: number;
	/** Summed VNDB votes of the VNs it developed. Optional: absent means unknown. */
	votes?: number;
	firstYear: number | null;
	lastYear: number | null;
}

export interface LandscapeInputEdge {
	id: string;
	source: string;
	target: string;
	register: 'confirmed' | 'inferred';
	kind: RelationKind;
	/** Plain-English edge tag (`Imprint`, `Renamed`, `Sister?`). */
	code: string;
	directed: boolean;
	relationCode?: ExplicitRelationCode;
	inferredType?: InferredBrandType;
	direction?: 'a_to_b' | 'b_to_a' | 'bidirectional';
	confidence?: number;
	confidenceTier?: 'high' | 'medium' | 'speculative';
	sharedCoreStaff?: number;
	coDevVns?: number;
	seiyuuDriven?: boolean;
}

/**
 * What a studio is on the map: a `holding` company owns brands and released
 * nothing itself, a `hub` owns brands and also releases under its own name, a
 * `studio` owns nothing.
 */
export type StudioRole = 'holding' | 'hub' | 'studio';

export interface PlacedLandscapeNode extends LandscapeInputNode {
	/** Start of the lifeline (and the node glyph). */
	x: number;
	/** Row centre. */
	y: number;
	/**
	 * Year the studio is plotted at: its first release, or for an owner the year
	 * before the earliest brand it owns, so a rail always starts ahead of its branches.
	 */
	plotYear: number;
	/** No release year is on record: plotted beside its owner. */
	undated: boolean;
	/** Where its own releases begin (`x` unless an owner predates its first release). */
	lifeX: number;
	/** Where its own releases end. */
	endX: number;
	/** End of the corporate rail: the fork of the newest brand it owns (`x` when it owns none). */
	spineEndX: number;
	/** Brands branching off this studio's rail. */
	spineChildren: number;
	/** How many companies VNDB names as its owner. Only the main one is drawn at rest. */
	ownerCount: number;
	role: StudioRole;
	/** Layout parent: the studio this one hangs off, if any. */
	parentId: string | null;
	/** Nominal radius in screen pixels (the canvas keeps glyphs screen-sized). */
	r: number;
	degree: number;
	inDegree: number;
	outDegree: number;
	componentId: number;
	territoryId: string;
	/** 1 = flagship or major owner, 2 = notable, 3 = small. Drives glyph and type weight. */
	tier: 1 | 2 | 3;
	/** Label rank: higher is better known and is placed first. */
	priority: number;
	/** Own fame, before anything inherited from the brands it owns. */
	prominence: number;
	/** Zoom at which the studio joins the map at rest. */
	minScale: number;
	inactive: boolean;
}

/**
 * How an edge is drawn. A `bus` leaves the owner's rail at `forkX`, turns
 * through a rounded elbow and runs along the brand's row into its glyph. An
 * `arc` is a cubic from a point on the earlier studio's lifeline.
 */
export type EdgeRoute =
	| {
			type: 'bus';
			fromX: number;
			fromY: number;
			forkX: number;
			toX: number;
			toY: number;
			radius: number;
	  }
	| {
			type: 'arc';
			fromX: number;
			fromY: number;
			cp1x: number;
			cp1y: number;
			cp2x: number;
			cp2y: number;
			toX: number;
			toY: number;
	  };

export interface PlacedLandscapeEdge extends LandscapeInputEdge {
	sourceNode: PlacedLandscapeNode;
	targetNode: PlacedLandscapeNode;
	componentId: number;
	/** True when this edge jumps between two houses. */
	isCrossTerritory: boolean;
	/** Vertical pixel distance between endpoints. */
	spanY: number;
	route: EdgeRoute;
	/**
	 * A second (or third) owner of a brand that already hangs off its main
	 * owner's rail. Kept off the map at rest; drawn when either end is in focus.
	 */
	secondary: boolean;
}

export interface LandscapeTerritory {
	id: string;
	label: string;
	labelOriginal: string | null;
	hubId: string;
	nodeCount: number;
	edgeCount: number;
	totalVns: number;
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	/** Exclusive seam-to-seam horizontal swimlane bounds (zero overlap between families). */
	bandMinY: number;
	bandMaxY: number;
	cx: number;
	cy: number;
	nodeIds: string[];
}

export interface LandscapeLayout {
	nodes: PlacedLandscapeNode[];
	edges: PlacedLandscapeEdge[];
	territories: LandscapeTerritory[];
	nodeById: Map<string, PlacedLandscapeNode>;
	adj: Map<string, PlacedLandscapeEdge[]>;
	minYear: number;
	maxYear: number;
	yearPx: number;
	rowStep: number;
	yearToX: (year: number) => number;
	xToYear: (x: number) => number;
	bounds: { minX: number; minY: number; maxX: number; maxY: number; w: number; h: number };
}

/** World pixels per year. */
export const YEAR_PX = 300;
/** World pixels between two rows. */
export const ROW_STEP = 36;
/** Zoom from which every studio is on the map, whatever its rank. */
export const FULL_DETAIL_SCALE = 0.5;

/** A branch leaves the rail this far ahead of the brand it feeds. */
const FORK = 30;
const BUS_RADIUS = 13;
/** Brands an owner founded in one year step right by row, so their risers nest instead of stacking. */
const STAGGER_MAX = YEAR_PX * 0.5;
const STAGGER_STEP = 44;
/** Run reserved after a glyph for its inline name. */
const LABEL_ROOM = 150;
/** Run reserved ahead of an owner for its name. */
const OWNER_LABEL_ROOM = 190;
/** Clear space between two lifelines sharing a row. */
const ROW_GAP_X = 44;
/** Only 1–2 studio loose fragments nest beside a strongly-linked host; 3+ studio trees keep their own band. */
const SOFT_MAX = 2;
/** Vertical breathing room (in rows) between adjacent family bands. */
const FAMILY_GAP_LARGE = 4;
const FAMILY_GAP_COMPACT = 3;

type LinkType = 'own' | 'lineage' | 'soft';

interface Block {
	/** The x-runs taken on each row, relative to the block's own row. */
	rows: Map<number, Array<[number, number]>>;
	up: number;
	down: number;
	x0: number;
	x1: number;
}

function validYear(year: number | null | undefined, dumpYear: number): year is number {
	return year != null && year >= 1980 && year <= dumpYear + 2;
}

/** How well known a studio is in its own right. */
function ownProminence(n: LandscapeInputNode): number {
	return (
		Math.log2(1 + Math.max(0, n.votes ?? 0)) +
		1.4 * Math.log2(1 + Math.max(0, n.vnCount)) +
		0.6 * Math.log2(1 + Math.max(0, n.staffCount))
	);
}

/** Cubic control points for a smooth, horizontally-tangent arc between two points. */
export function edgeCurvePoints(
	a: { x: number; y: number },
	b: { x: number; y: number },
	kind: RelationKind
): { cp1x: number; cp1y: number; cp2x: number; cp2y: number } {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	if (Math.abs(dx) < 55) {
		const bow = Math.min(130, Math.max(46, Math.abs(dy) * 0.28));
		const dir = kind === 'ownership' ? 1 : -1;
		return {
			cp1x: a.x + bow * dir,
			cp1y: a.y + dy * 0.25,
			cp2x: b.x + bow * dir,
			cp2y: b.y - dy * 0.25
		};
	}
	const tension = Math.min(420, Math.max(40, Math.abs(dx) * 0.5));
	const sign = dx >= 0 ? 1 : -1;
	return {
		cp1x: a.x + tension * sign,
		cp1y: a.y,
		cp2x: b.x - tension * sign,
		cp2y: b.y
	};
}

/** Point on cubic Bezier at parameter t in [0, 1]. */
export function cubicAt(
	x0: number,
	y0: number,
	cp1x: number,
	cp1y: number,
	cp2x: number,
	cp2y: number,
	x1: number,
	y1: number,
	t: number
): { x: number; y: number } {
	const mt = 1 - t;
	const mt2 = mt * mt;
	const t2 = t * t;
	return {
		x: mt2 * mt * x0 + 3 * mt2 * t * cp1x + 3 * mt * t2 * cp2x + t2 * t * x1,
		y: mt2 * mt * y0 + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t2 * t * y1
	};
}

/** Approximate minimum distance from point (px, py) to a cubic Bezier curve. */
export function pointToCubicDist(
	px: number,
	py: number,
	x0: number,
	y0: number,
	cp1x: number,
	cp1y: number,
	cp2x: number,
	cp2y: number,
	x1: number,
	y1: number,
	steps = 14
): number {
	let best = Infinity;
	let prevX = x0;
	let prevY = y0;
	for (let i = 1; i <= steps; i++) {
		const p = cubicAt(x0, y0, cp1x, cp1y, cp2x, cp2y, x1, y1, i / steps);
		const d = pointToSegmentDist(px, py, prevX, prevY, p.x, p.y);
		if (d < best) best = d;
		prevX = p.x;
		prevY = p.y;
	}
	return best;
}

/** Distance from point (px, py) to segment (x1, y1)-(x2, y2). */
export function pointToSegmentDist(
	px: number,
	py: number,
	x1: number,
	y1: number,
	x2: number,
	y2: number
): number {
	const dx = x2 - x1;
	const dy = y2 - y1;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.hypot(px - x1, py - y1);
	const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
	return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ───────────────────────── Edge route geometry ─────────────────────────

/** The slice of the canvas path API an edge needs, so routes stay DOM-free. */
export interface PathSink {
	moveTo(x: number, y: number): void;
	lineTo(x: number, y: number): void;
	arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
	bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
}

/**
 * Trace an edge into a path. A `bus` normally starts where it leaves the rail,
 * because the rail itself is drawn once per owner; `fromOwner` walks the whole
 * way from the owner's glyph, for a highlighted link.
 */
export function traceEdge(ctx: PathSink, route: EdgeRoute, fromOwner = false): void {
	if (route.type === 'arc') {
		ctx.moveTo(route.fromX, route.fromY);
		ctx.bezierCurveTo(route.cp1x, route.cp1y, route.cp2x, route.cp2y, route.toX, route.toY);
		return;
	}
	const { fromX, fromY, forkX, toX, toY, radius } = route;
	if (Math.abs(toY - fromY) < 0.5 || radius <= 0) {
		ctx.moveTo(fromOwner ? fromX : forkX, fromY);
		ctx.lineTo(forkX, fromY);
		ctx.lineTo(forkX, toY);
		ctx.lineTo(toX, toY);
		return;
	}
	ctx.moveTo(fromOwner ? fromX : forkX - radius, fromY);
	ctx.arcTo(forkX, fromY, forkX, toY, radius);
	ctx.arcTo(forkX, toY, toX, toY, radius);
	ctx.lineTo(toX, toY);
}

/** Where an edge's relation tag sits: on the riser half a row from the brand, or mid-arc. */
export function edgeLabelPoint(route: EdgeRoute, t = 0.5): { x: number; y: number } {
	if (route.type === 'arc') {
		return cubicAt(
			route.fromX,
			route.fromY,
			route.cp1x,
			route.cp1y,
			route.cp2x,
			route.cp2y,
			route.toX,
			route.toY,
			t
		);
	}
	const dy = route.toY - route.fromY;
	if (Math.abs(dy) < ROW_STEP * 0.9) return { x: (route.forkX + route.toX) / 2, y: route.toY };
	return { x: route.forkX, y: route.toY - Math.sign(dy) * ROW_STEP * 0.5 };
}

/** Distance from a point to the part of an edge that belongs to it alone (riser + stub, or the arc). */
export function pointToEdgeDist(px: number, py: number, route: EdgeRoute): number {
	if (route.type === 'arc') {
		return pointToCubicDist(
			px,
			py,
			route.fromX,
			route.fromY,
			route.cp1x,
			route.cp1y,
			route.cp2x,
			route.cp2y,
			route.toX,
			route.toY,
			14
		);
	}
	return Math.min(
		pointToSegmentDist(px, py, route.forkX, route.fromY, route.forkX, route.toY),
		pointToSegmentDist(px, py, route.forkX, route.toY, route.toX, route.toY)
	);
}

/** Bounding box of an edge's own geometry (a bus excludes the shared rail). */
export function edgeBounds(route: EdgeRoute): { minX: number; minY: number; maxX: number; maxY: number } {
	if (route.type === 'arc') {
		return {
			minX: Math.min(route.fromX, route.toX, route.cp1x, route.cp2x),
			maxX: Math.max(route.fromX, route.toX, route.cp1x, route.cp2x),
			minY: Math.min(route.fromY, route.toY, route.cp1y, route.cp2y),
			maxY: Math.max(route.fromY, route.toY, route.cp1y, route.cp2y)
		};
	}
	return {
		minX: Math.min(route.forkX - route.radius, route.toX),
		maxX: Math.max(route.forkX, route.toX),
		minY: Math.min(route.fromY, route.toY),
		maxY: Math.max(route.fromY, route.toY)
	};
}

// ───────────────────────── Layout ─────────────────────────

export type FamilySortOrder = 'prominence' | 'size' | 'oldest' | 'alpha';

export function buildLandscapeLayout(
	inputNodes: readonly LandscapeInputNode[],
	inputEdges: readonly LandscapeInputEdge[],
	options: { minClusterSize?: number; dumpYear?: number; familySort?: FamilySortOrder } = {}
): LandscapeLayout {
	const minClusterSize = options.minClusterSize ?? 2;
	const dumpYear = options.dumpYear || 2026;
	const familySort = options.familySort ?? 'prominence';

	const rawNodeById = new Map(inputNodes.map((n) => [n.id, n]));
	const deg = new Map<string, number>();
	const inDeg = new Map<string, number>();
	const outDeg = new Map<string, number>();
	const validEdges: LandscapeInputEdge[] = [];
	const rawAdj = new Map<string, Array<{ to: string; edge: LandscapeInputEdge }>>();
	const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
		const list = map.get(key);
		if (list) list.push(value);
		else map.set(key, [value]);
	};

	for (const e of inputEdges) {
		if (!rawNodeById.has(e.source) || !rawNodeById.has(e.target) || e.source === e.target) continue;
		validEdges.push(e);
		deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
		deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
		if (e.directed) {
			outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
			inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
		}
		push(rawAdj, e.source, { to: e.target, edge: e });
		push(rawAdj, e.target, { to: e.source, edge: e });
	}

	// 1. Connected components; families below the size floor stay off the map.
	const visited = new Set<string>();
	const compNodeIds: string[][] = [];
	for (const id of rawAdj.keys()) {
		if (visited.has(id)) continue;
		const queue = [id];
		visited.add(id);
		const list: string[] = [];
		for (let qi = 0; qi < queue.length; qi++) {
			const cur = queue[qi];
			list.push(cur);
			for (const nb of rawAdj.get(cur) ?? []) {
				if (!visited.has(nb.to)) {
					visited.add(nb.to);
					queue.push(nb.to);
				}
			}
		}
		if (list.length >= minClusterSize) compNodeIds.push(list);
	}
	compNodeIds.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
	const compOf = new Map<string, number>();
	compNodeIds.forEach((list, ci) => {
		for (const id of list) compOf.set(id, ci);
	});
	const mapEdges = validEdges.filter((e) => compOf.has(e.source) && compOf.has(e.target));

	// 2. Stated ownership, both ways.
	const ownedBy = new Map<string, string[]>();
	const owns = new Map<string, string[]>();
	for (const e of mapEdges) {
		if (e.register !== 'confirmed' || e.kind !== 'ownership') continue;
		push(owns, e.source, e.target);
		push(ownedBy, e.target, e.source);
	}

	// 3. Plot years. A dated studio sits at its first release; an owner sits at
	//    least a year ahead of the earliest brand it owns; an undated studio sits
	//    just after its owner, or else beside whatever it is linked to.
	const plotYearOf = new Map<string, number>();
	const undated = new Set<string>();
	for (const id of compOf.keys()) {
		const fy = rawNodeById.get(id)!.firstYear;
		if (validYear(fy, dumpYear)) plotYearOf.set(id, fy);
		else undated.add(id);
	}
	for (let pass = 0; pass < 8; pass++) {
		let changed = false;
		for (const [owner, kids] of owns) {
			let earliest = Infinity;
			for (const k of kids) {
				const ky = plotYearOf.get(k);
				if (ky != null && ky < earliest) earliest = ky;
			}
			if (earliest === Infinity) continue;
			const cur = plotYearOf.get(owner);
			const want = Math.max(1970, cur == null ? earliest - 1 : Math.min(cur, earliest - 1));
			if (want !== cur) {
				plotYearOf.set(owner, want);
				changed = true;
			}
		}
		for (const id of undated) {
			if (plotYearOf.has(id)) continue;
			let latestOwner = -Infinity;
			for (const o of ownedBy.get(id) ?? []) {
				const oy = plotYearOf.get(o);
				if (oy != null && oy > latestOwner) latestOwner = oy;
			}
			if (latestOwner > -Infinity) {
				plotYearOf.set(id, latestOwner + 1);
				changed = true;
				continue;
			}
			const years: number[] = [];
			for (const nb of rawAdj.get(id) ?? []) {
				const ny = plotYearOf.get(nb.to);
				if (ny == null) continue;
				if (nb.edge.register === 'confirmed' && nb.edge.kind === 'lineage') {
					years.push(nb.edge.source === id ? ny - 1 : ny + 1);
				} else {
					years.push(ny);
				}
			}
			if (years.length > 0) {
				years.sort((a, b) => a - b);
				plotYearOf.set(id, years[Math.floor(years.length / 2)]);
				changed = true;
			}
		}
		if (!changed) break;
	}

	// Round year domain (multiples of 5 so ruler ticks land on 1980, 1985, 1990...).
	let minYear = dumpYear;
	let maxYear = 1995;
	for (const y of plotYearOf.values()) {
		if (y < minYear) minYear = y;
		if (y > maxYear) maxYear = y;
	}
	if (minYear >= maxYear) {
		minYear = 1990;
		maxYear = dumpYear;
	}
	minYear = Math.floor(minYear / 5) * 5;
	maxYear = Math.max(Math.ceil((maxYear + 1) / 5) * 5, Math.ceil(dumpYear / 5) * 5);
	const fallbackYear = Math.round((minYear + maxYear) / 2);

	const yearToX = (year: number) => (year - minYear) * YEAR_PX;
	const xToYear = (x: number) => x / YEAR_PX + minYear;

	// 4. Placed nodes.
	const nodeById = new Map<string, PlacedLandscapeNode>();
	for (const [id, ci] of compOf) {
		const src = rawNodeById.get(id)!;
		const py = plotYearOf.get(id) ?? fallbackYear;
		const dated = validYear(src.firstYear, dumpYear);
		const ownStart = dated ? Math.max(py, src.firstYear as number) : py;
		const ownEnd =
			dated && src.lastYear != null && src.lastYear >= ownStart ? Math.min(maxYear, src.lastYear) : ownStart;
		const x = yearToX(py);
		const kids = owns.get(id)?.length ?? 0;
		nodeById.set(id, {
			...src,
			x,
			y: 0,
			plotYear: py,
			undated: !dated,
			lifeX: yearToX(ownStart),
			// A release year is a span, not an instant: the line runs to late in its last year.
			endX: dated ? yearToX(ownEnd + 0.85) : x,
			spineEndX: x,
			spineChildren: 0,
			ownerCount: ownedBy.get(id)?.length ?? 0,
			role: kids === 0 ? 'studio' : src.vnCount > 0 ? 'hub' : 'holding',
			parentId: null,
			r: 4,
			degree: deg.get(id) ?? 0,
			inDegree: inDeg.get(id) ?? 0,
			outDegree: outDeg.get(id) ?? 0,
			componentId: ci,
			territoryId: id,
			tier: 3,
			priority: 0,
			prominence: ownProminence(src),
			minScale: FULL_DETAIL_SCALE,
			inactive: dated && src.lastYear != null && src.lastYear < dumpYear - 5
		});
	}

	// 5. One layout parent per studio. Main owner first: the company with the
	//    larger family, so a brand two companies share hangs off the house people
	//    know it by. Then stated lineage: a rename continues its old name's row.
	const parentOf = new Map<string, string>();
	const linkOf = new Map<string, LinkType>();
	const renameOf = new Map<string, string>();
	const descendsFrom = (id: string, ancestor: string): boolean => {
		let cur: string | undefined = id;
		for (let guard = 0; cur != null && guard < 400; guard++) {
			if (cur === ancestor) return true;
			cur = parentOf.get(cur);
		}
		return false;
	};
	const ownerRank = (a: string, b: string) =>
		(owns.get(b)?.length ?? 0) - (owns.get(a)?.length ?? 0) ||
		nodeById.get(b)!.prominence - nodeById.get(a)!.prominence ||
		a.localeCompare(b);

	for (const [child, ownerIds] of ownedBy) {
		for (const owner of [...ownerIds].sort(ownerRank)) {
			if (descendsFrom(owner, child)) continue;
			parentOf.set(child, owner);
			linkOf.set(child, 'own');
			break;
		}
	}
	const lineageInto = new Map<string, LandscapeInputEdge[]>();
	for (const e of mapEdges) {
		if (e.register === 'confirmed' && e.kind === 'lineage') push(lineageInto, e.target, e);
	}
	for (const [child, list] of lineageInto) {
		const rename = list.find((e) => e.relationCode === 'new');
		if (rename) renameOf.set(child, rename.source);
		if (parentOf.has(child)) continue;
		const ranked = [...list].sort(
			(a, b) =>
				Number(b.relationCode === 'new') - Number(a.relationCode === 'new') ||
				nodeById.get(b.source)!.prominence - nodeById.get(a.source)!.prominence ||
				a.source.localeCompare(b.source)
		);
		for (const e of ranked) {
			if (descendsFrom(e.source, child)) continue;
			parentOf.set(child, e.source);
			linkOf.set(child, 'lineage');
			break;
		}
	}

	// 6. Family trees so far, then nest small families beside whatever they are
	//    linked to: a lone sister brand belongs next to its sister, not in a band
	//    of its own across the map.
	const rootMemo = new Map<string, string>();
	const rootOf = (id: string): string => {
		const path: string[] = [];
		let cur = id;
		for (let guard = 0; guard < 400; guard++) {
			const known = rootMemo.get(cur);
			if (known != null) {
				cur = known;
				break;
			}
			const p = parentOf.get(cur);
			if (p == null) break;
			path.push(cur);
			cur = p;
		}
		for (const pid of path) rootMemo.set(pid, cur);
		rootMemo.set(id, cur);
		return cur;
	};
	const treeNodes = new Map<string, string[]>();
	for (const id of nodeById.keys()) push(treeNodes, rootOf(id), id);
	const treeScore = (root: string): number => {
		const top = (treeNodes.get(root) ?? [])
			.map((id) => nodeById.get(id)!.prominence)
			.sort((a, b) => b - a)
			.slice(0, 3);
		return top.reduce((s, v) => s + v, 0) + 2 * Math.log2(1 + (treeNodes.get(root)?.length ?? 1));
	};

	const anchored = new Set<string>();
	for (const [root, list] of treeNodes) if (list.length > SOFT_MAX) anchored.add(root);
	const linkWeight = (e: LandscapeInputEdge) =>
		e.register === 'confirmed' ? (e.kind === 'ownership' ? 4 : 3) : 1 + (e.confidence ?? 0);
	const crossLinks = mapEdges
		.filter((e) => e.register === 'confirmed' || (e.confidence ?? 0) >= 0.65)
		.map((e) => ({ e, a: rootOf(e.source), b: rootOf(e.target), w: linkWeight(e) }))
		.filter((l) => l.a !== l.b);
	const looseByScore = [...treeNodes.keys()]
		.filter((root) => !anchored.has(root))
		.sort((a, b) => treeScore(b) - treeScore(a) || a.localeCompare(b));
	let looseCursor = 0;
	for (let guard = 0; guard < 4000; guard++) {
		const best = new Map<string, { w: number; host: string }>();
		for (const l of crossLinks) {
			const aIn = anchored.has(l.a);
			const bIn = anchored.has(l.b);
			if (aIn === bIn) continue;
			const tree = aIn ? l.b : l.a;
			// `l.a` is the source's tree: the host is whichever end is already on the map.
			const host = aIn ? l.e.source : l.e.target;
			const cur = best.get(tree);
			if (!cur || l.w > cur.w || (l.w === cur.w && host < cur.host)) best.set(tree, { w: l.w, host });
		}
		if (best.size > 0) {
			for (const [tree, b] of best) {
				parentOf.set(tree, b.host);
				linkOf.set(tree, 'soft');
				anchored.add(tree);
			}
			continue;
		}
		while (looseCursor < looseByScore.length && anchored.has(looseByScore[looseCursor])) looseCursor++;
		if (looseCursor >= looseByScore.length) break;
		anchored.add(looseByScore[looseCursor]);
	}

	const childrenOf = new Map<string, string[]>();
	const topRoots: string[] = [];
	for (const id of nodeById.keys()) {
		const p = parentOf.get(id);
		if (p == null) topRoots.push(id);
		else push(childrenOf, p, id);
		nodeById.get(id)!.parentId = p ?? null;
	}

	// 7. Pack each family bottom-up. A studio's block is its own row plus its
	//    children's blocks, each dropped onto the nearest rows above or below where
	//    every one of its lifelines is clear. Blocks keep their true outline (the
	//    x-run taken on each row), so a child's family tucks in around its siblings
	//    instead of reserving an empty rectangle.
	const order: string[] = [];
	for (const root of topRoots) {
		const stack = [root];
		while (stack.length > 0) {
			const id = stack.pop()!;
			order.push(id);
			for (const c of childrenOf.get(id) ?? []) stack.push(c);
		}
	}
	const blockOf = new Map<string, Block>();
	const relRow = new Map<string, number>();

	for (let oi = order.length - 1; oi >= 0; oi--) {
		const id = order[oi];
		const nd = nodeById.get(id)!;
		const kids = (childrenOf.get(id) ?? []).map((k) => nodeById.get(k)!);
		const ownKids = kids.filter((k) => linkOf.get(k.id) === 'own');
		const isOwner = ownKids.length > 0;
		const selfShift = linkOf.get(id) === 'own' ? STAGGER_MAX : 0;
		let railEnd = nd.x;
		for (const k of ownKids) if (k.x > railEnd) railEnd = k.x;
		const ownX0 = nd.x - FORK - (isOwner ? OWNER_LABEL_ROOM : 10);
		const ownX1 =
			Math.max(nd.endX, isOwner ? railEnd + STAGGER_MAX : nd.x + selfShift + LABEL_ROOM) + ROW_GAP_X;

		const rows = new Map<number, Array<[number, number]>>([[0, [[ownX0, ownX1]]]]);
		const fits = (kb: Block, at: number): boolean => {
			for (const [r, runs] of kb.rows) {
				const taken = rows.get(at + r);
				if (!taken) continue;
				for (const run of runs) {
					for (const q of taken) if (run[0] < q[1] && run[1] > q[0]) return false;
				}
			}
			return true;
		};
		let up = 0;
		let down = 0;
		let x0 = ownX0;
		let x1 = ownX1;

		kids.sort((a, b) => a.x - b.x || b.prominence - a.prominence || a.id.localeCompare(b.id));
		for (const kid of kids) {
			const kb = blockOf.get(kid.id)!;
			const link = linkOf.get(kid.id);
			const renamedFrom = renameOf.get(kid.id);
			// A rename continues the row its old name ran on, when that row is free again.
			const prefRow =
				renamedFrom != null && renamedFrom !== id && parentOf.get(renamedFrom) === id
					? (relRow.get(renamedFrom) ?? 0)
					: 0;
			const mayShareOwnRow = link === 'lineage' && renamedFrom === id;
			const belowFirst = down <= up;
			let chosen: number | null = null;
			for (let step = 0; step < 1200 && chosen == null; step++) {
				const cands =
					step === 0 ? [prefRow] : belowFirst ? [prefRow + step, prefRow - step] : [prefRow - step, prefRow + step];
				for (const row of cands) {
					// A child's family stays wholly on one side of its parent's line.
					if (row - kb.up <= 0 && row + kb.down >= 0 && !mayShareOwnRow) continue;
					if (fits(kb, row)) {
						chosen = row;
						break;
					}
				}
			}
			const row = chosen ?? down + kb.up + 1;
			relRow.set(kid.id, row);
			for (const [r, runs] of kb.rows) for (const run of runs) push(rows, row + r, run);
			if (link === 'own') {
				// Keep the riser's corridor clear on every row it crosses.
				const dir = Math.sign(row);
				for (let r = dir; r !== row; r += dir) {
					push(rows, r, [kid.x - FORK - 14, kid.x - FORK + STAGGER_MAX + 14] as [number, number]);
				}
			}
			if (kb.up - row > up) up = kb.up - row;
			if (row + kb.down > down) down = row + kb.down;
			if (kb.x0 < x0) x0 = kb.x0;
			if (kb.x1 > x1) x1 = kb.x1;
		}

		// Brands founded in one year fan out by row: the nearest row forks last, so
		// no riser ever runs through a sibling's name.
		const groups = new Map<string, PlacedLandscapeNode[]>();
		for (const k of ownKids) push(groups, `${(relRow.get(k.id) ?? 0) < 0 ? 'u' : 'd'}|${k.plotYear}`, k);
		for (const group of groups.values()) {
			if (group.length < 2) continue;
			group.sort((a, b) => Math.abs(relRow.get(a.id)!) - Math.abs(relRow.get(b.id)!));
			const stepPx = Math.min(STAGGER_STEP, STAGGER_MAX / (group.length - 1));
			group.forEach((k, i) => {
				const shift = (group.length - 1 - i) * stepPx;
				k.x += shift;
				if (k.lifeX < k.x) k.lifeX = k.x;
				if (k.endX < k.x) k.endX = k.x;
				if (k.spineEndX < k.x) k.spineEndX = k.x;
			});
		}
		nd.spineChildren = ownKids.length;
		blockOf.set(id, { rows, up, down, x0, x1 });
	}

	// 8. Rank houses and place each in its own exclusive horizontal band (zero Y-overlap
	//    between unrelated families). The best-known house goes first; after it, a house
	//    linked to one already placed jumps the queue so related houses sit as adjacent bands.
	const blockMembers = new Map<string, PlacedLandscapeNode[]>();
	for (const root of topRoots) {
		const stack = [root];
		const list: PlacedLandscapeNode[] = [];
		while (stack.length > 0) {
			const id = stack.pop()!;
			const nd = nodeById.get(id)!;
			nd.territoryId = root;
			list.push(nd);
			for (const c of childrenOf.get(id) ?? []) stack.push(c);
		}
		blockMembers.set(root, list);
	}
	const kidFame = (id: string): number => {
		let best = 0;
		let count = 0;
		for (const c of childrenOf.get(id) ?? []) {
			if (linkOf.get(c) !== 'own') continue;
			count++;
			const cp = nodeById.get(c)!.prominence;
			if (cp > best) best = cp;
		}
		return count > 0 ? best * 0.92 + 1.5 * Math.log2(1 + count) : 0;
	};
	// An owner ranks by the best-known brand it holds directly, so a holding
	// company is as prominent as its flagship and never outranks it by size alone.
	for (const nd of nodeById.values()) nd.priority = Math.max(nd.prominence, kidFame(nd.id));

	const houseScore = new Map<string, number>();
	for (const [root, list] of blockMembers) {
		const top = list.map((n) => n.priority).sort((a, b) => b - a);
		houseScore.set(root, (top[0] ?? 0) + 0.3 * ((top[1] ?? 0) + (top[2] ?? 0)) + 2 * Math.log2(1 + list.length));
	}
	const houseLinks = new Map<string, Array<{ other: string; w: number; here: string }>>();
	for (const e of mapEdges) {
		const a = nodeById.get(e.source)!.territoryId;
		const b = nodeById.get(e.target)!.territoryId;
		if (a === b) continue;
		// What VNDB states outright binds two houses far more than a hypothesis does.
		const w = e.register === 'confirmed' ? linkWeight(e) : 0.25 + 0.5 * (e.confidence ?? 0);
		push(houseLinks, a, { other: b, w, here: e.source });
		push(houseLinks, b, { other: a, w, here: e.target });
	}

	const placedHouses = new Set<string>();
	const pending = new Set(topRoots);
	const houseOrder: string[] = [];
	const pull = new Map<string, number>();
	const houseBand = new Map<string, { topRow: number; botRow: number; gapTop: number; gapBot: number }>();
	for (const root of topRoots) pull.set(root, 0);

	let cursorRow = 0;
	let prevGap = FAMILY_GAP_COMPACT;

	const placeHouse = (root: string) => {
		houseOrder.push(root);
		const b = blockOf.get(root)!;
		const spanRows = b.up + b.down + 1;
		const gapTop = prevGap;
		const gapBot = spanRows >= 4 ? FAMILY_GAP_LARGE : FAMILY_GAP_COMPACT;
		const topRow = cursorRow;
		const base = topRow + b.up;
		const botRow = base + b.down;
		houseBand.set(root, { topRow, botRow, gapTop, gapBot });
		cursorRow = botRow + 1 + gapBot;
		prevGap = gapBot;

		const stack: Array<{ id: string; row: number }> = [{ id: root, row: base }];
		while (stack.length > 0) {
			const cur = stack.pop()!;
			nodeById.get(cur.id)!.y = cur.row * ROW_STEP;
			for (const c of childrenOf.get(cur.id) ?? []) stack.push({ id: c, row: cur.row + (relRow.get(c) ?? 0) });
		}
	};

	if (familySort === 'prominence') {
		while (pending.size > 0) {
			let next: string | null = null;
			let nextScore = -Infinity;
			for (const root of pending) {
				const s = houseScore.get(root)! + Math.min(30, 6 * pull.get(root)!);
				if (s > nextScore || (s === nextScore && next != null && root < next)) {
					next = root;
					nextScore = s;
				}
			}
			const root = next!;
			pending.delete(root);
			placeHouse(root);
			placedHouses.add(root);
			for (const l of houseLinks.get(root) ?? []) {
				if (placedHouses.has(l.other)) continue;
				pull.set(l.other, pull.get(l.other)! + l.w);
			}
		}
	} else {
		const hubOf = (root: string) =>
			[...blockMembers.get(root)!].sort(
				(a, b) => b.spineChildren - a.spineChildren || b.priority - a.priority || a.id.localeCompare(b.id)
			)[0];
		const minYrOf = (root: string) =>
			Math.min(...blockMembers.get(root)!.map((n) => n.firstYear ?? n.plotYear));
		const sorted = [...topRoots].sort((a, b) => {
			if (familySort === 'size') {
				return (
					(blockMembers.get(b)?.length ?? 0) - (blockMembers.get(a)?.length ?? 0) ||
					houseScore.get(b)! - houseScore.get(a)! ||
					a.localeCompare(b)
				);
			}
			if (familySort === 'oldest') {
				return minYrOf(a) - minYrOf(b) || houseScore.get(b)! - houseScore.get(a)! || a.localeCompare(b);
			}
			return hubOf(a).name.localeCompare(hubOf(b).name) || a.localeCompare(b);
		});
		for (const root of sorted) placeHouse(root);
	}
	topRoots.length = 0;
	topRoots.push(...houseOrder);

	// 9. Routes. Stated ownership rides the owner's rail; everything else is an
	//    arc that leaves the earlier lifeline when the later studio appears.
	const placedEdges: PlacedLandscapeEdge[] = [];
	const adj = new Map<string, PlacedLandscapeEdge[]>();
	const extraOwners = new Map<string, number>();
	for (const e of mapEdges) {
		const s = nodeById.get(e.source)!;
		const t = nodeById.get(e.target)!;
		const isOwnership = e.register === 'confirmed' && e.kind === 'ownership';
		const isMain = isOwnership && parentOf.get(t.id) === s.id && linkOf.get(t.id) === 'own';
		let route: EdgeRoute | null = null;

		if (isOwnership) {
			const lane = isMain ? 0 : (extraOwners.get(t.id) ?? 0) + 1;
			if (!isMain) extraOwners.set(t.id, lane);
			const forkX = t.x - FORK - lane * 9;
			const dy = t.y - s.y;
			const radius = Math.max(0, Math.min(BUS_RADIUS, Math.abs(dy) / 2, FORK - 6));
			if (forkX - radius >= s.x + 8) {
				route = { type: 'bus', fromX: s.x, fromY: s.y, forkX, toX: t.x, toY: t.y, radius };
				if (isMain && forkX > s.spineEndX) s.spineEndX = forkX;
			}
		}
		if (!route) {
			// Undirected links read earlier → later; directed ones keep their stated direction.
			const flip = !e.directed && (t.x < s.x || (t.x === s.x && t.y < s.y));
			const from = flip ? t : s;
			const to = flip ? s : t;
			const dy = to.y - from.y;
			const lead = Math.min(260, Math.max(80, Math.abs(dy) * 0.45));
			const lifeEnd = Math.max(from.endX, from.spineEndX, from.x);
			const fromX = Math.abs(dy) < 0.5 ? Math.min(lifeEnd, to.x) : Math.max(from.x, Math.min(to.x - lead, lifeEnd));
			const c = edgeCurvePoints({ x: fromX, y: from.y }, { x: to.x, y: to.y }, e.kind);
			route = { type: 'arc', fromX, fromY: from.y, ...c, toX: to.x, toY: to.y };
		}

		const pe: PlacedLandscapeEdge = {
			...e,
			sourceNode: s,
			targetNode: t,
			componentId: s.componentId,
			isCrossTerritory: s.territoryId !== t.territoryId,
			spanY: Math.abs(t.y - s.y),
			route,
			secondary: isOwnership && !isMain
		};
		placedEdges.push(pe);
		push(adj, e.source, pe);
		push(adj, e.target, pe);
	}

	// 10. Who is seen first: rank every studio by priority and turn the rank into
	//     a tier (how it is drawn) and a zoom threshold (when it joins the map).
	const allNodes = [...nodeById.values()];
	const ranked = [...allNodes].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
	const FLAGSHIP_Q = 0.1;
	const NOTABLE_Q = 0.3;
	ranked.forEach((nd, i) => {
		const q = ranked.length > 1 ? i / (ranked.length - 1) : 0;
		nd.tier = q <= FLAGSHIP_Q ? 1 : q <= NOTABLE_Q ? 2 : 3;
		// Flagships are always on the map; the rest join on a smooth log ramp of zoom.
		nd.minScale =
			q <= FLAGSHIP_Q ? 0 : 0.1 * Math.pow(FULL_DETAIL_SCALE / 0.1, (q - FLAGSHIP_Q) / (1 - FLAGSHIP_Q));
		const fame = Math.max(0, Math.min(1, (nd.priority - 8) / 22));
		nd.r = nd.spineChildren > 0 ? 5 + Math.min(3, Math.log2(1 + nd.spineChildren) * 0.55) : 3.2 + fame * 3.4;
	});

	// Territories, in house rank order.
	const edgeCountByTerritory = new Map<string, number>();
	for (const e of placedEdges) {
		const tid = e.sourceNode.territoryId;
		edgeCountByTerritory.set(tid, (edgeCountByTerritory.get(tid) ?? 0) + 1);
	}
	const territories: LandscapeTerritory[] = topRoots.map((root) => {
		const list = blockMembers.get(root)!;
		const hub = [...list].sort(
			(a, b) => b.spineChildren - a.spineChildren || b.priority - a.priority || a.id.localeCompare(b.id)
		)[0];
		// Every family keeps its hub visible at ALL zoom levels so zooming out never turns parts of the Atlas into blank space.
		hub.minScale = 0;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		let totalVns = 0;
		for (const nd of list) {
			totalVns += nd.vnCount;
			const right = Math.max(nd.endX, nd.spineEndX, nd.x);
			if (nd.x < minX) minX = nd.x;
			if (right > maxX) maxX = right;
			if (nd.y < minY) minY = nd.y;
			if (nd.y > maxY) maxY = nd.y;
		}
		const band = houseBand.get(root)!;
		const bandMinY = (band.topRow - (1 + band.gapTop) / 2) * ROW_STEP;
		const bandMaxY = (band.botRow + (1 + band.gapBot) / 2) * ROW_STEP;
		return {
			id: root,
			label: hub.name,
			labelOriginal: hub.original,
			hubId: hub.id,
			nodeCount: list.length,
			edgeCount: edgeCountByTerritory.get(root) ?? 0,
			totalVns,
			minX: minX - 260,
			minY: minY - ROW_STEP * 1.4,
			maxX: maxX + 160,
			maxY: maxY + ROW_STEP * 1.4,
			bandMinY,
			bandMaxY,
			cx: (minX + maxX) / 2,
			cy: (minY + maxY) / 2,
			nodeIds: list.map((n) => n.id)
		};
	});

	// Global bounds.
	let gMinX = yearToX(minYear) - 220;
	let gMaxX = yearToX(maxYear) + 240;
	let gMinY = Infinity;
	let gMaxY = -Infinity;
	for (const nd of allNodes) {
		if (nd.x - 260 < gMinX) gMinX = nd.x - 260;
		const right = Math.max(nd.endX, nd.spineEndX, nd.x) + 200;
		if (right > gMaxX) gMaxX = right;
		if (nd.y - 120 < gMinY) gMinY = nd.y - 120;
		if (nd.y + 120 > gMaxY) gMaxY = nd.y + 120;
	}
	if (!Number.isFinite(gMinY)) {
		gMinY = 0;
		gMaxY = 800;
	}

	// Best-known first: label placement and search both walk this order.
	allNodes.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

	return {
		nodes: allNodes,
		edges: placedEdges,
		territories,
		nodeById,
		adj,
		minYear,
		maxYear,
		yearPx: YEAR_PX,
		rowStep: ROW_STEP,
		yearToX,
		xToYear,
		bounds: {
			minX: gMinX,
			minY: gMinY,
			maxX: gMaxX,
			maxY: gMaxY,
			w: Math.max(1, gMaxX - gMinX),
			h: Math.max(1, gMaxY - gMinY)
		}
	};
}

// ───────────────────────── VN-by-VN Career Trail on the Timeline Map ─────────────────────────

export interface CareerTrailStop {
	index: number;
	key: string;
	vid: string;
	title: string;
	original: string | null;
	year: number;
	pid: string | null;
	studioName: string;
	studioOriginal: string | null;
	x: number;
	y: number;
	roles: string[];
	primaryRole: string;
	isSeiyuu: boolean;
	aliasUsed: string;
	isNonPrimaryAlias: boolean;
	characters: Array<{ cid: string; name: string; original?: string | null }>;
	hasEro: boolean;
	hasAllAges: boolean;
	virtualStudio: boolean;
}

export interface CareerTrailSegment {
	from: CareerTrailStop;
	to: CareerTrailStop;
	cp1x: number;
	cp1y: number;
	cp2x: number;
	cp2y: number;
	studioChanged: boolean;
	aliasChanged: boolean;
}

export interface CareerTrailLane {
	pid: string;
	name: string;
	original: string | null;
	y: number;
	minX: number;
	maxX: number;
	firstYear: number;
	lastYear: number;
	vnCount: number;
	/** Drawn on a ghost lane rather than a real lifeline. */
	virtual: boolean;
	/** A studio that is on the map, but too far from the trail's home to draw in place. */
	remote: boolean;
}

export interface CareerTrail {
	sid: string;
	name: string;
	original: string | null;
	stops: CareerTrailStop[];
	segments: CareerTrailSegment[];
	lanes: CareerTrailLane[];
	bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * Project a person's chronological VN credits directly onto the Evolutionary
 * Timeline Map so every individual Visual Novel sits at `(x = yearToX(vn.year), y = studio.y)`
 * and connects into a complete VN-to-VN journey across studios!
 */
export function buildCareerTrail(
	staff: { id: string; name: string; original: string | null },
	events: readonly StaffTimelineEvent[],
	tracks: readonly StaffBrandTrack[],
	layout: LandscapeLayout,
	yOffsetForSecondary = 0
): CareerTrail {
	const dated = events
		.filter((e): e is StaffTimelineEvent & { year: number } => e.year != null)
		.sort((a, b) => a.year - b.year || (a.pid ?? '').localeCompare(b.pid ?? '') || a.vnTitle.localeCompare(b.vnTitle));

	// The map is as tall as the industry is crowded, and a career can touch houses
	// thousands of rows apart. The trail stays readable by keeping its home near
	// the studio the person worked at most: studios within reach are drawn on
	// their real lifelines, the rest on ghost lanes stacked beside that home.
	const stopsPerStudio = new Map<string, number>();
	for (const ev of dated) {
		if (ev.pid && layout.nodeById.has(ev.pid)) stopsPerStudio.set(ev.pid, (stopsPerStudio.get(ev.pid) ?? 0) + 1);
	}
	for (const tr of tracks) {
		if (layout.nodeById.has(tr.pid) && !stopsPerStudio.has(tr.pid)) stopsPerStudio.set(tr.pid, 0);
	}
	const weighted = [...stopsPerStudio.entries()]
		.map(([pid, n]) => ({ y: layout.nodeById.get(pid)!.y, n: n + 0.01 }))
		.sort((a, b) => a.y - b.y);
	let anchorY = (layout.bounds.minY + layout.bounds.maxY) / 2;
	if (weighted.length > 0) {
		const half = weighted.reduce((sum, w) => sum + w.n, 0) / 2;
		let acc = 0;
		for (const w of weighted) {
			acc += w.n;
			if (acc >= half) {
				anchorY = w.y;
				break;
			}
		}
	}
	const reach = ROW_STEP * 30;
	const ghostStep = ROW_STEP * 3;

	const studioY = new Map<
		string,
		{ y: number; virtual: boolean; remote: boolean; name: string; original: string | null }
	>();
	const takenYs: number[] = [];
	for (const ev of dated) {
		const key = ev.pid ?? '__edition';
		if (studioY.has(key)) continue;
		const onMap = ev.pid ? layout.nodeById.get(ev.pid) : undefined;
		if (onMap && Math.abs(onMap.y - anchorY) <= reach) {
			studioY.set(key, {
				y: onMap.y + yOffsetForSecondary,
				virtual: false,
				remote: false,
				name: onMap.name,
				original: onMap.original
			});
			takenYs.push(onMap.y);
		}
	}
	let ghostIdx = 0;
	for (const ev of dated) {
		const key = ev.pid ?? '__edition';
		if (studioY.has(key)) continue;
		const onMap = ev.pid ? layout.nodeById.get(ev.pid) : undefined;
		let y = anchorY;
		for (let guard = 0; guard < 200; guard++) {
			ghostIdx++;
			const dir = ghostIdx % 2 === 1 ? -1 : 1;
			y = anchorY + dir * Math.ceil(ghostIdx / 2) * ghostStep;
			if (!takenYs.some((t) => Math.abs(t - y) < ROW_STEP * 1.5)) break;
		}
		takenYs.push(y);
		studioY.set(key, {
			y: y + yOffsetForSecondary,
			virtual: true,
			remote: !!onMap,
			name: onMap?.name ?? ev.producerName ?? (ev.isEdition ? 'Ports & re-releases' : 'Independent / Unlisted'),
			original: onMap?.original ?? ev.producerOriginal ?? null
		});
	}

	const cellCount = new Map<string, number>();
	for (const ev of dated) {
		const ck = `${ev.pid ?? '__edition'}|${ev.year}`;
		cellCount.set(ck, (cellCount.get(ck) ?? 0) + 1);
	}
	const cellUsed = new Map<string, number>();

	const stops: CareerTrailStop[] = [];
	const laneAcc = new Map<string, CareerTrailLane>();

	for (const ev of dated) {
		const sk = ev.pid ?? '__edition';
		const st = studioY.get(sk)!;
		const ck = `${sk}|${ev.year}`;
		const totalInCell = cellCount.get(ck) ?? 1;
		const slot = cellUsed.get(ck) ?? 0;
		cellUsed.set(ck, slot + 1);

		const xSpread = totalInCell > 1 ? (slot - (totalInCell - 1) / 2) * Math.min(48, 160 / totalInCell) : 0;
		const ySpread = totalInCell > 1 ? (slot % 2 === 0 ? -1 : 1) * Math.min(26, 12 + Math.floor(slot / 2) * 10) : 0;
		const x = layout.yearToX(ev.year) + xSpread;
		const y = st.y + ySpread;

		const stop: CareerTrailStop = {
			index: stops.length,
			key: `${ev.vid}|${sk}|${stops.length}`,
			vid: ev.vid,
			title: ev.vnTitle,
			original: ev.vnOriginal,
			year: ev.year,
			pid: ev.pid,
			studioName: st.name,
			studioOriginal: st.original,
			x,
			y,
			roles: ev.roles,
			primaryRole: primaryRole(ev.roles, ev.isSeiyuu && ev.roles.length === 1),
			isSeiyuu: ev.isSeiyuu && ev.roles.every((r) => r === 'seiyuu'),
			aliasUsed: ev.aliasUsed,
			isNonPrimaryAlias: ev.isNonPrimaryAlias,
			characters: ev.characters,
			hasEro: ev.hasEro,
			hasAllAges: ev.hasAllAges,
			virtualStudio: st.virtual
		};
		stops.push(stop);

		let lane = laneAcc.get(sk);
		if (!lane) {
			lane = {
				pid: sk,
				name: st.name,
				original: st.original,
				y: st.y,
				minX: x,
				maxX: x,
				firstYear: ev.year,
				lastYear: ev.year,
				vnCount: 0,
				virtual: st.virtual,
				remote: st.remote
			};
			laneAcc.set(sk, lane);
		}
		lane.minX = Math.min(lane.minX, x);
		lane.maxX = Math.max(lane.maxX, x);
		lane.firstYear = Math.min(lane.firstYear, ev.year);
		lane.lastYear = Math.max(lane.lastYear, ev.year);
		lane.vnCount++;
	}

	const segments: CareerTrailSegment[] = [];
	for (let i = 1; i < stops.length; i++) {
		const a = stops[i - 1];
		const b = stops[i];
		const studioChanged = a.pid !== b.pid;
		const aliasChanged =
			a.aliasUsed !== '' &&
			b.aliasUsed !== '' &&
			a.aliasUsed.toLowerCase() !== b.aliasUsed.toLowerCase();
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		let cp1x: number;
		let cp1y: number;
		let cp2x: number;
		let cp2y: number;
		if (Math.abs(dx) < 35) {
			const bow = Math.min(85, Math.max(32, Math.abs(dy) * 0.26));
			cp1x = a.x + bow;
			cp1y = a.y + dy * 0.3;
			cp2x = b.x + bow;
			cp2y = b.y - dy * 0.3;
		} else {
			const t = Math.min(300, Math.max(44, Math.abs(dx) * 0.42));
			const sgn = dx >= 0 ? 1 : -1;
			cp1x = a.x + t * sgn;
			cp1y = a.y;
			cp2x = b.x - t * sgn;
			cp2y = b.y;
		}
		segments.push({ from: a, to: b, cp1x, cp1y, cp2x, cp2y, studioChanged, aliasChanged });
	}

	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const s of stops) {
		if (s.x < minX) minX = s.x;
		if (s.y < minY) minY = s.y;
		if (s.x > maxX) maxX = s.x;
		if (s.y > maxY) maxY = s.y;
	}
	if (!Number.isFinite(minX)) {
		minX = layout.bounds.minX;
		maxX = layout.bounds.maxX;
		minY = layout.bounds.minY;
		maxY = layout.bounds.maxY;
	}

	return {
		sid: staff.id,
		name: staff.name,
		original: staff.original,
		stops,
		segments,
		lanes: [...laneAcc.values()].sort((a, b) => a.firstYear - b.firstYear),
		bounds: { minX: minX - 180, minY: minY - 120, maxX: maxX + 180, maxY: maxY + 120 }
	};
}
