/**
 * High-DPI spaced-out PNG exporter for focused Atlas views (studio family/chain,
 * VN-by-VN career trail, studio compare, VN series, and local brand timeline).
 *
 * Reads live resolved CSS tokens from `document.documentElement` so zero colors
 * are hardcoded and the export matches the user's current Light or Dark theme.
 */
import type { ProducerType } from '../types.ts';
import type { RelationKind } from '../relations.ts';
import { cubicAt, edgeCurvePoints, type CareerTrail } from './landscape.ts';

interface ExportPalette {
	canvas: string;
	surface: string;
	surfaceRaised: string;
	surfaceSunken: string;
	rule: string;
	ruleStrong: string;
	ink: string;
	ink2: string;
	ink3: string;
	confirmed: string;
	inferred: string;
	ownership: string;
	sister: string;
	lineage: string;
	partner: string;
	roles: Record<string, string>;
	fontSans: string;
	fontMono: string;
}

function readPalette(): ExportPalette {
	const cs = getComputedStyle(document.documentElement);
	const g = (v: string) => cs.getPropertyValue(v).trim();
	return {
		canvas: g('--canvas'),
		surface: g('--surface'),
		surfaceRaised: g('--surface-raised'),
		surfaceSunken: g('--surface-sunken'),
		rule: g('--rule'),
		ruleStrong: g('--rule-strong'),
		ink: g('--ink'),
		ink2: g('--ink-2'),
		ink3: g('--ink-3'),
		confirmed: g('--confirmed'),
		inferred: g('--inferred'),
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

function kindCol(p: ExportPalette, kind: RelationKind): string {
	if (kind === 'ownership') return p.ownership;
	if (kind === 'lineage') return p.lineage;
	if (kind === 'sister') return p.sister;
	return p.partner;
}

function drawShape(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, type: ProducerType) {
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

function drawArrow(
	ctx: CanvasRenderingContext2D,
	tipX: number,
	tipY: number,
	fromX: number,
	fromY: number,
	size: number,
	haloColor?: string
) {
	const ang = Math.atan2(tipY - fromY, tipX - fromX);
	const spread = 0.45;
	ctx.beginPath();
	ctx.moveTo(tipX, tipY);
	ctx.lineTo(tipX - size * Math.cos(ang - spread), tipY - size * Math.sin(ang - spread));
	// Slight inner notch for a sharp, unmistakable chevron arrowhead
	ctx.lineTo(tipX - size * 0.72 * Math.cos(ang), tipY - size * 0.72 * Math.sin(ang));
	ctx.lineTo(tipX - size * Math.cos(ang + spread), tipY - size * Math.sin(ang + spread));
	ctx.closePath();
	if (haloColor) {
		ctx.save();
		ctx.strokeStyle = haloColor;
		ctx.lineWidth = 2.6;
		ctx.lineJoin = 'round';
		ctx.stroke();
		ctx.restore();
	}
	ctx.fill();
}

function directionArrowGlyph(dx: number, dy: number): string {
	const adx = Math.abs(dx);
	const ady = Math.abs(dy);
	if (ady < 12) return dx >= 0 ? '→' : '←';
	if (adx < 22) return dy > 0 ? '↓' : '↑';
	if (dy > 0) return dx > 0 ? '↘' : '↙';
	return dx > 0 ? '↗' : '↖';
}

function safeFileSlug(raw: string): string {
	const cleaned = raw
		.toLowerCase()
		.replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
	return cleaned || 'vndb-atlas';
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
	canvas.toBlob((blob) => {
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}, 'image/png');
}

function createHiDpiCanvas(w: number, h: number, scale = 2): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(w * scale);
	canvas.height = Math.round(h * scale);
	const ctx = canvas.getContext('2d')!;
	ctx.scale(scale, scale);
	return { canvas, ctx };
}

function drawHeaderAndGrid(
	ctx: CanvasRenderingContext2D,
	p: ExportPalette,
	w: number,
	h: number,
	headerH: number,
	footerH: number,
	leftGutter: number,
	rightPad: number,
	minYear: number,
	maxYear: number,
	title: string,
	subtitle: string
): (year: number) => number {
	ctx.fillStyle = p.canvas;
	ctx.fillRect(0, 0, w, h);

	// Title header band
	ctx.fillStyle = p.surface;
	ctx.fillRect(0, 0, w, headerH);
	ctx.strokeStyle = p.rule;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(0, headerH + 0.5);
	ctx.lineTo(w, headerH + 0.5);
	ctx.stroke();

	ctx.fillStyle = p.ink;
	ctx.font = `600 18px ${p.fontSans}`;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
	ctx.fillText(title, 24, 16);

	ctx.fillStyle = p.ink3;
	ctx.font = `500 11.5px ${p.fontSans}`;
	ctx.fillText(subtitle, 24, 40);

	ctx.textAlign = 'right';
	ctx.font = `500 10.5px ${p.fontMono}`;
	ctx.fillText('VNDB Studio Atlas', w - 24, 22);

	const plotX0 = leftGutter;
	const plotX1 = w - rightPad;
	const span = Math.max(1, maxYear - minYear);
	const yearToX = (yr: number) => plotX0 + ((yr - minYear) / span) * (plotX1 - plotX0);

	// Year ruler strip
	const rulerY = headerH;
	const rulerH = 26;
	ctx.fillStyle = p.surfaceSunken;
	ctx.fillRect(0, rulerY, w, rulerH);
	ctx.strokeStyle = p.rule;
	ctx.beginPath();
	ctx.moveTo(0, rulerY + rulerH + 0.5);
	ctx.lineTo(w, rulerY + rulerH + 0.5);
	ctx.stroke();

	ctx.fillStyle = p.ink3;
	ctx.font = `500 10px ${p.fontMono}`;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	ctx.fillText('Year →', 24, rulerY + rulerH / 2);

	const step = span > 35 ? 5 : span > 16 ? 2 : 1;
	const firstTick = Math.ceil(minYear / step) * step;
	const bodyTop = rulerY + rulerH;
	const bodyBot = h - footerH;

	// Alternating decade wash
	const startDec = Math.floor(minYear / 10) * 10;
	for (let dec = startDec; dec < maxYear; dec += 10) {
		if ((dec / 10) % 2 !== 0) continue;
		const x0 = Math.max(plotX0, yearToX(dec));
		const x1 = Math.min(plotX1, yearToX(dec + 10));
		if (x1 <= x0) continue;
		ctx.save();
		ctx.fillStyle = p.ink;
		ctx.globalAlpha = 0.024;
		ctx.fillRect(x0, bodyTop, x1 - x0, bodyBot - bodyTop);
		ctx.restore();
	}

	// Vertical year gridlines & tick labels
	for (let yr = firstTick; yr <= maxYear; yr += step) {
		const x = Math.round(yearToX(yr)) + 0.5;
		const major = yr % 10 === 0 || (step <= 2 && yr % 5 === 0) || step === 1;
		ctx.save();
		ctx.strokeStyle = p.rule;
		ctx.globalAlpha = major ? 0.65 : 0.3;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(x, bodyTop);
		ctx.lineTo(x, bodyBot);
		ctx.stroke();
		ctx.restore();

		ctx.fillStyle = major ? p.ink : p.ink3;
		ctx.font = `${major ? 600 : 500} 10px ${p.fontMono}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(String(yr), x, rulerY + rulerH / 2);
	}

	// Footer border
	ctx.fillStyle = p.surface;
	ctx.fillRect(0, bodyBot, w, footerH);
	ctx.strokeStyle = p.rule;
	ctx.beginPath();
	ctx.moveTo(0, bodyBot + 0.5);
	ctx.lineTo(w, bodyBot + 0.5);
	ctx.stroke();

	return yearToX;
}

// ───────────────────────── 1. Studio Subgraph / Timeline Export ─────────────────────────

export interface ExportStudioNode {
	id: string;
	label: string;
	type: ProducerType;
	firstYear: number | null;
	lastYear: number | null;
	vnCount: number;
	isFocus: boolean;
	/** Group bucket for clean vertical ordering: 0=owners, 1=in-lineage, 2=focus, 3=children, 4=out-lineage, 5=peers */
	group: number;
	/** Highest inferred confidence score (0–100) linking this studio to the focus, if any. */
	inferredScore?: number | null;
}

export interface ExportStudioEdge {
	source: string;
	target: string;
	register: 'confirmed' | 'inferred';
	kind: RelationKind;
	code: string;
	directed: boolean;
	seiyuuDriven?: boolean;
	/** Confidence score (0–100) for inferred edges. */
	confidence?: number | null;
}

export function exportTimelineSubgraphPng(opts: {
	title: string;
	subtitle: string;
	filenameBase: string;
	nodes: readonly ExportStudioNode[];
	edges: readonly ExportStudioEdge[];
	dumpYear: number;
}): void {
	if (opts.nodes.length === 0) return;
	const p = readPalette();
	const dumpYear = opts.dumpYear || 2026;

	// Resolve years cleanly
	const validYr = (y: number | null | undefined): y is number => y != null && y >= 1980 && y <= dumpYear + 2;
	const knownYears = opts.nodes.flatMap((n) => [n.firstYear, n.lastYear].filter(validYr));
	const fallbackYear = knownYears.length ? Math.round(knownYears.reduce((a, b) => a + b, 0) / knownYears.length) : dumpYear - 5;
	let minYear = knownYears.length ? Math.min(...knownYears) - 1 : 1995;
	let maxYear = knownYears.length ? Math.max(...knownYears) + 2 : dumpYear + 1;
	minYear = Math.floor(minYear / 2) * 2;
	maxYear = Math.max(minYear + 6, Math.ceil(maxYear / 2) * 2);

	// Order nodes cleanly by group then founding year then name
	const ordered = [...opts.nodes].sort(
		(a, b) =>
			a.group - b.group ||
			Number(b.isFocus) - Number(a.isFocus) ||
			(a.firstYear ?? fallbackYear) - (b.firstYear ?? fallbackYear) ||
			b.vnCount - a.vnCount ||
			a.label.localeCompare(b.label)
	);

	const rowH = 68;
	const headerH = 66;
	const rulerH = 26;
	const footerH = 42;
	const padY = 30;
	const leftGutter = 270;
	const rightPad = 56;
	const w = Math.max(1120, Math.min(1840, leftGutter + rightPad + (maxYear - minYear) * 38));
	const h = headerH + rulerH + padY * 2 + ordered.length * rowH + footerH;

	const { canvas, ctx } = createHiDpiCanvas(w, h, 2);
	const yearToX = drawHeaderAndGrid(ctx, p, w, h, headerH, footerH, leftGutter, rightPad, minYear, maxYear, opts.title, opts.subtitle);

	const pos = new Map<string, { x: number; endX: number; y: number; r: number; node: ExportStudioNode }>();
	const bodyTop = headerH + rulerH + padY;

	// Derive per-node best inferred confidence score if not explicitly provided
	const nodeBestConf = new Map<string, number>();
	for (const e of opts.edges) {
		if (e.register === 'inferred' && e.confidence != null) {
			const sc = Math.round(e.confidence);
			nodeBestConf.set(e.source, Math.max(nodeBestConf.get(e.source) ?? -1, sc));
			nodeBestConf.set(e.target, Math.max(nodeBestConf.get(e.target) ?? -1, sc));
		}
	}

	ordered.forEach((n, idx) => {
		const y = bodyTop + idx * rowH + rowH / 2;
		const sy = validYr(n.firstYear) ? n.firstYear : fallbackYear;
		const ey = validYr(n.lastYear) && n.lastYear >= sy ? n.lastYear : sy;
		const x = yearToX(sy);
		const endX = Math.max(x + 22, yearToX(ey + 0.85));
		const r = n.isFocus ? 8 : 5.8;
		pos.set(n.id, { x, endX, y, r, node: n });

		// Subtle zebra row tint & focus highlight
		if (n.isFocus) {
			ctx.save();
			ctx.fillStyle = p.confirmed;
			ctx.globalAlpha = 0.065;
			ctx.fillRect(0, y - rowH / 2, w, rowH);
			ctx.restore();
		} else if (idx % 2 === 1) {
			ctx.save();
			ctx.fillStyle = p.ink;
			ctx.globalAlpha = 0.018;
			ctx.fillRect(0, y - rowH / 2, w, rowH);
			ctx.restore();
		}

		// Prominent confidence pill in left gutter for inferred-linked non-focus studios
		const rowConf = !n.isFocus ? (n.inferredScore ?? nodeBestConf.get(n.id) ?? null) : null;
		let labelRight = leftGutter - 18;
		if (rowConf != null && rowConf >= 0) {
			const badgeText = `${rowConf}`;
			ctx.save();
			ctx.font = `700 10.5px ${p.fontMono}`;
			const bw = Math.max(30, ctx.measureText(badgeText).width + 12);
			const bh = 20;
			const bx = leftGutter - 14 - bw;
			const by = y - bh / 2;
			ctx.fillStyle = p.surfaceRaised;
			ctx.beginPath();
			ctx.roundRect(bx, by, bw, bh, 5);
			ctx.fill();
			ctx.strokeStyle = p.inferred;
			ctx.lineWidth = 1.25;
			ctx.setLineDash([3, 2]);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = p.inferred;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(badgeText, bx + bw / 2, y + 0.5);
			ctx.restore();
			labelRight = bx - 10;
		}

		// Left lane label (full untruncated name + year span)
		ctx.fillStyle = n.isFocus ? p.ink : p.ink2;
		ctx.font = `${n.isFocus ? 700 : 500} 12px ${p.fontSans}`;
		ctx.textAlign = 'right';
		ctx.textBaseline = 'middle';
		const maxChars = rowConf != null ? 24 : 30;
		const lbl = n.label.length > maxChars ? n.label.slice(0, maxChars - 2) + '…' : n.label;
		ctx.fillText(lbl, labelRight, y - 6);

		ctx.fillStyle = p.ink3;
		ctx.font = `500 9.5px ${p.fontMono}`;
		const yrTxt = validYr(n.firstYear)
			? n.lastYear && n.lastYear !== n.firstYear
				? `${n.firstYear}–${n.lastYear}`
				: `${n.firstYear}`
			: 'undated';
		ctx.fillText(`${yrTxt}${n.vnCount ? ` · ${n.vnCount} VNs` : ''}`, labelRight, y + 9);
	});

	// Draw lifelines first
	for (const pt of pos.values()) {
		ctx.save();
		ctx.lineCap = 'round';
		ctx.strokeStyle = pt.node.isFocus ? p.confirmed : p.ink3;
		ctx.globalAlpha = pt.node.isFocus ? 0.95 : 0.58;
		ctx.lineWidth = pt.node.isFocus ? 3.5 : 2.2;
		ctx.beginPath();
		ctx.moveTo(pt.x, pt.y);
		ctx.lineTo(pt.endX, pt.y);
		ctx.stroke();
		ctx.restore();
	}

	// Pre-compute clean arrival port fan-outs when multiple directed edges enter the same target from the same vertical side
	const sortedEdges = [...opts.edges].sort(
		(a, b) => Number(a.register === 'confirmed') - Number(b.register === 'confirmed')
	);
	const incomingBySide = new Map<string, ExportStudioEdge[]>();
	const undirectedEdges: ExportStudioEdge[] = [];
	for (const e of sortedEdges) {
		const a = pos.get(e.source);
		const b = pos.get(e.target);
		if (!a || !b) continue;
		if (!e.directed) {
			undirectedEdges.push(e);
			continue;
		}
		const side = a.y < b.y ? 'top' : 'bot';
		const k = `${e.target}|${side}`;
		const list = incomingBySide.get(k);
		if (list) list.push(e);
		else incomingBySide.set(k, [e]);
	}
	for (const list of incomingBySide.values()) {
		list.sort((e1, e2) => {
			const a1 = pos.get(e1.source)!;
			const a2 = pos.get(e2.source)!;
			return a1.x - a2.x || a1.y - a2.y;
		});
	}

	// Reserve boxes for all studio nodes so pills never collide with nodes
	const pillBoxes: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
	for (const pt of pos.values()) {
		pillBoxes.push({ x1: pt.x - pt.r - 8, y1: pt.y - pt.r - 8, x2: pt.x + pt.r + 8, y2: pt.y + pt.r + 8 });
	}
	const rowYs = [...pos.values()].map((pt) => pt.y);

	const pillsToDraw: Array<{
		x: number;
		y: number;
		text: string;
		scoreText: string | null;
		color: string;
		inferred: boolean;
	}> = [];
	const arrowheadsToDraw: Array<{ tipX: number; tipY: number; fromX: number; fromY: number; color: string }> = [];
	const originDotsToDraw: Array<{ x: number; y: number; color: string }> = [];

	// Draw edges (curves first; arrowheads & pills drawn AFTER nodes so nodes never cover arrowheads!)
	let undirIdx = 0;
	for (const e of sortedEdges) {
		const a = pos.get(e.source);
		const b = pos.get(e.target);
		if (!a || !b) continue;
		const color = kindCol(p, e.kind);
		const dirY = a.y <= b.y ? 1 : -1; // +1 = flowing down, -1 = flowing up

		let fromX: number;
		let fromY: number;
		let cp1x: number;
		let cp1y: number;
		let cp2x: number;
		let cp2y: number;
		let toX: number;
		let toY: number;
		let strokeEndX: number;
		let strokeEndY: number;
		let arrowFromX = 0;
		let arrowFromY = 0;

		if (!e.directed) {
			// Clean vertical-drop stem inside shared active overlap
			const overlapLo = Math.max(a.x + 12, b.x + 12);
			const overlapHi = Math.min(a.endX - 10, b.endX - 10);
			let stemX: number;
			if (overlapHi > overlapLo + 8) {
				const t = undirectedEdges.length <= 1 ? 0.5 : (undirIdx + 0.5) / undirectedEdges.length;
				stemX = overlapLo + t * (overlapHi - overlapLo);
			} else {
				stemX = (a.x + b.x) / 2;
			}
			undirIdx++;
			fromX = Math.max(a.x, Math.min(a.endX, stemX));
			fromY = a.y;
			toX = Math.max(b.x, Math.min(b.endX, stemX));
			toY = b.y;
			const midY = (fromY + toY) / 2;
			cp1x = fromX;
			cp1y = midY;
			cp2x = toX;
			cp2y = midY;
			strokeEndX = toX;
			strokeEndY = toY;
			originDotsToDraw.push({ x: fromX, y: fromY, color }, { x: toX, y: toY, color });
		} else {
			// Directed edge: anchor cleanly on source lifeline & arrive cleanly on the top/bottom rim of target node!
			const side = a.y < b.y ? 'top' : 'bot';
			const siblings = incomingBySide.get(`${e.target}|${side}`) ?? [e];
			const slotIdx = siblings.indexOf(e);
			const fanSpread = siblings.length <= 1 ? 0 : (slotIdx - (siblings.length - 1) / 2) * 0.58; // radians
			const rimAngle = (side === 'top' ? -Math.PI / 2 : Math.PI / 2) + fanSpread;
			const rimGap = b.r + 3.5;
			toX = b.x + Math.cos(rimAngle) * rimGap;
			toY = b.y + Math.sin(rimAngle) * rimGap;

			// Choose departure X on source lifeline: straight vertical if target X is within source span!
			if (toX >= a.x + 10 && toX <= a.endX - 4) {
				fromX = toX;
			} else if (toX < a.x + 10) {
				fromX = a.x;
			} else {
				fromX = a.endX;
			}
			fromY = a.y + dirY * (fromX === a.x ? a.r + 2 : 1.5);

			const dy = toY - fromY;
			const dx = toX - fromX;
			const absDy = Math.abs(dy);
			const vTension = Math.max(24, absDy * 0.52);

			// Clean vertical-departure, smooth S-curve arrival aligned to the target node's rim normal
			cp1x = fromX + (Math.abs(dx) < 6 ? 0 : dx * 0.14);
			cp1y = fromY + dirY * vTension;
			cp2x = toX + Math.cos(rimAngle) * Math.max(24, absDy * 0.44);
			cp2y = toY + Math.sin(rimAngle) * Math.max(24, absDy * 0.44);

			// Stop the line stroke cleanly at the arrowhead base so the tip is razor-sharp!
			const arrSize = 11.5;
			const tanX = toX - cp2x;
			const tanY = toY - cp2y;
			const tanLen = Math.hypot(tanX, tanY) || 1;
			strokeEndX = toX - (tanX / tanLen) * (arrSize * 0.72);
			strokeEndY = toY - (tanY / tanLen) * (arrSize * 0.72);
			arrowFromX = cp2x;
			arrowFromY = cp2y;

			originDotsToDraw.push({ x: fromX, y: fromY, color });
			arrowheadsToDraw.push({ tipX: toX, tipY: toY, fromX: arrowFromX, fromY: arrowFromY, color });
		}

		// Draw crisp curve (with subtle canvas halo underneath so crossings stay readable)
		ctx.save();
		ctx.lineCap = 'round';
		if (e.register === 'confirmed') {
			ctx.strokeStyle = p.canvas;
			ctx.lineWidth = 4.6;
			ctx.globalAlpha = 0.85;
			ctx.beginPath();
			ctx.moveTo(fromX, fromY);
			ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, strokeEndX, strokeEndY);
			ctx.stroke();
		}

		ctx.strokeStyle = color;
		ctx.lineWidth = e.register === 'confirmed' ? 2.4 : 1.75;
		ctx.globalAlpha = e.register === 'confirmed' ? 0.96 : 0.84;
		if (e.register === 'inferred') ctx.setLineDash(e.seiyuuDriven ? [2, 4] : [6, 4]);
		ctx.beginPath();
		ctx.moveTo(fromX, fromY);
		ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, strokeEndX, strokeEndY);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.restore();

		// Place pill label cleanly in the open lane between studio lifelines, with direction glyph + prominent confidence badge
		const cleanCode = e.code.replace(/^[↑↓←→↖↗↘↙]\s*/, '');
		const pillText = e.directed
			? `${directionArrowGlyph(toX - fromX, toY - fromY)} ${cleanCode}`
			: cleanCode;
		const scoreText =
			e.register === 'inferred' && e.confidence != null ? `${Math.round(e.confidence)}` : null;
		ctx.font = `600 10.5px ${p.fontSans}`;
		const mainW = ctx.measureText(pillText).width;
		let scoreW = 0;
		if (scoreText) {
			ctx.font = `700 10.5px ${p.fontMono}`;
			scoreW = ctx.measureText(scoreText).width + 10;
		}
		const tw = mainW + scoreW + 18;
		const th = 21;

		// Prefer candidate points on the curve that do NOT sit on top of any studio lifeline or other pill
		const candidates = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74];
		let chosen: { x: number; y: number } | null = null;
		let fallback: { x: number; y: number } | null = null;
		for (const t of candidates) {
			const pt = cubicAt(fromX, fromY, cp1x, cp1y, cp2x, cp2y, toX, toY, t);
			const box = { x1: pt.x - tw / 2 - 4, y1: pt.y - th / 2 - 3, x2: pt.x + tw / 2 + 4, y2: pt.y + th / 2 + 3 };
			const hitsPill = pillBoxes.some((o) => box.x1 < o.x2 && box.x2 > o.x1 && box.y1 < o.y2 && box.y2 > o.y1);
			const hitsRow = rowYs.some((ry) => Math.abs(pt.y - ry) < 15);
			if (!hitsPill && !hitsRow) {
				chosen = pt;
				pillBoxes.push(box);
				break;
			}
			if (!hitsPill && !fallback) {
				fallback = pt;
			}
		}
		if (!chosen && fallback) {
			chosen = fallback;
			pillBoxes.push({
				x1: chosen.x - tw / 2 - 4,
				y1: chosen.y - th / 2 - 3,
				x2: chosen.x + tw / 2 + 4,
				y2: chosen.y + th / 2 + 3
			});
		}
		if (chosen) {
			pillsToDraw.push({
				x: chosen.x,
				y: chosen.y,
				text: pillText,
				scoreText,
				color,
				inferred: e.register === 'inferred'
			});
		}
	}

	// Draw studio nodes
	for (const pt of pos.values()) {
		ctx.save();
		drawShape(ctx, pt.x, pt.y, pt.r, pt.node.type);
		ctx.fillStyle = pt.node.isFocus ? p.confirmed : p.surfaceRaised;
		ctx.strokeStyle = pt.node.isFocus ? p.ink : p.ink2;
		ctx.lineWidth = pt.node.isFocus ? 2.4 : 1.7;
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}

	// Draw origin dots & crisp haloed arrowheads ON TOP of nodes/lifelines so direction is 100% unmistakable!
	for (const dot of originDotsToDraw) {
		ctx.save();
		ctx.beginPath();
		ctx.arc(dot.x, dot.y, 3.3, 0, Math.PI * 2);
		ctx.fillStyle = dot.color;
		ctx.strokeStyle = p.canvas;
		ctx.lineWidth = 1.6;
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}
	for (const arr of arrowheadsToDraw) {
		ctx.save();
		ctx.fillStyle = arr.color;
		drawArrow(ctx, arr.tipX, arr.tipY, arr.fromX, arr.fromY, 11.5, p.canvas);
		ctx.restore();
	}

	// Draw mid-edge pills on top (with prominent confidence score segment on inferred links)
	ctx.save();
	ctx.textBaseline = 'middle';
	for (const pill of pillsToDraw) {
		ctx.font = `600 10.5px ${p.fontSans}`;
		const mainW = ctx.measureText(pill.text).width;
		let scoreW = 0;
		if (pill.scoreText) {
			ctx.font = `700 10.5px ${p.fontMono}`;
			scoreW = ctx.measureText(pill.scoreText).width + 10;
		}
		const padX = 8;
		const tw = mainW + scoreW + padX * 2;
		const th = 21;
		const leftX = pill.x - tw / 2;

		ctx.fillStyle = p.surfaceRaised;
		ctx.beginPath();
		ctx.roundRect(leftX, pill.y - th / 2, tw, th, th / 2);
		ctx.fill();
		ctx.strokeStyle = pill.color;
		ctx.lineWidth = 1.35;
		if (pill.inferred) ctx.setLineDash([3, 2]);
		ctx.stroke();
		ctx.setLineDash([]);

		if (pill.scoreText) {
			// Draw label on left, subtle hairline divider, bold inferred confidence score on right
			ctx.font = `600 10.5px ${p.fontSans}`;
			ctx.textAlign = 'left';
			ctx.fillStyle = p.ink;
			ctx.fillText(pill.text, leftX + padX, pill.y + 0.5);

			const divX = leftX + padX + mainW + 5;
			ctx.strokeStyle = p.ruleStrong;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(divX, pill.y - 6);
			ctx.lineTo(divX, pill.y + 6);
			ctx.stroke();

			ctx.font = `700 10.5px ${p.fontMono}`;
			ctx.fillStyle = p.inferred;
			ctx.fillText(pill.scoreText, divX + 5, pill.y + 0.5);
		} else {
			ctx.font = `600 10.5px ${p.fontSans}`;
			ctx.textAlign = 'center';
			ctx.fillStyle = p.ink;
			ctx.fillText(pill.text, pill.x, pill.y + 0.5);
		}
	}
	ctx.restore();

	// Footer legend (including explicit source → target direction marker & confidence key)
	const ly = h - footerH / 2;
	let lx = 24;
	const legendItems: Array<{ label: string; color: string; dashed?: boolean }> = [
		{ label: 'Ownership', color: p.ownership },
		{ label: 'Lineage', color: p.lineage },
		{ label: 'Sister (inferred)', color: p.sister, dashed: true },
		{ label: 'Partner (inferred)', color: p.partner, dashed: true }
	];
	ctx.font = `500 10.5px ${p.fontSans}`;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	for (const it of legendItems) {
		ctx.save();
		ctx.strokeStyle = it.color;
		ctx.lineWidth = 2.2;
		if (it.dashed) ctx.setLineDash([5, 3]);
		ctx.beginPath();
		ctx.moveTo(lx, ly);
		ctx.lineTo(lx + 18, ly);
		ctx.stroke();
		ctx.restore();
		ctx.fillStyle = p.ink2;
		ctx.fillText(it.label, lx + 24, ly + 0.5);
		lx += ctx.measureText(it.label).width + 44;
	}
	// Direction & confidence key on right side of footer
	ctx.save();
	const hasAnyInferred = opts.edges.some((e) => e.register === 'inferred' && e.confidence != null);
	const dirLabel = hasAnyInferred
		? 'Scores = inferred confidence (0–100)   ·   Source ● ──▶ Target'
		: 'Source ● ──▶ Target';
	ctx.fillStyle = p.ink3;
	ctx.font = `500 10px ${p.fontMono}`;
	ctx.textAlign = 'right';
	ctx.fillText(dirLabel, w - 24, ly + 0.5);
	ctx.restore();

	downloadCanvas(canvas, `${safeFileSlug(opts.filenameBase)}-timeline.png`);
}

// ───────────────────────── 2. Career Trail Export ─────────────────────────

export function exportCareerTrailPng(opts: {
	primary: CareerTrail;
	secondary?: CareerTrail | null;
	subtitle: string;
	onlySecondary?: boolean;
}): void {
	const p = readPalette();
	const showPrimary = !(opts.onlySecondary && opts.secondary);
	const trails = [
		...(showPrimary ? [{ trail: opts.primary, isSec: false }] : []),
		...(opts.secondary ? [{ trail: opts.secondary, isSec: true }] : [])
	];
	const allStops = trails.flatMap((t) => t.trail.stops);
	if (allStops.length === 0) return;

	const minYear = Math.min(...allStops.map((s) => s.year)) - 1;
	const maxYear = Math.max(...allStops.map((s) => s.year)) + 1;

	// Collect unique studio lanes cleanly spaced, sorted by first appearance
	const laneMap = new Map<
		string,
		{ pid: string; name: string; firstYear: number; lastYear: number; count: number; secOnly: boolean }
	>();
	for (const { trail, isSec } of trails) {
		for (const st of trail.stops) {
			const k = st.pid ?? '__unlisted';
			const cur = laneMap.get(k);
			if (!cur) {
				laneMap.set(k, {
					pid: k,
					name: st.studioName,
					firstYear: st.year,
					lastYear: st.year,
					count: 1,
					secOnly: isSec
				});
			} else {
				cur.firstYear = Math.min(cur.firstYear, st.year);
				cur.lastYear = Math.max(cur.lastYear, st.year);
				cur.count++;
				if (!isSec) cur.secOnly = false;
			}
		}
	}
	const lanes = [...laneMap.values()].sort((a, b) => a.firstYear - b.firstYear || b.count - a.count || a.name.localeCompare(b.name));

	// Confirmed pen-name spans for the top alias strip (primary trail only)
	const aliasSpans: Array<{ name: string; first: number; last: number; count: number }> = [];
	if (showPrimary) {
		const map = new Map<string, { name: string; first: number; last: number; count: number }>();
		for (const st of opts.primary.stops) {
			const nm = st.aliasUsed || opts.primary.name;
			const cur = map.get(nm);
			if (!cur) map.set(nm, { name: nm, first: st.year, last: st.year, count: 1 });
			else {
				cur.first = Math.min(cur.first, st.year);
				cur.last = Math.max(cur.last, st.year);
				cur.count++;
			}
		}
		if (map.size > 1) {
			aliasSpans.push(...[...map.values()].sort((a, b) => a.first - b.first || b.count - a.count));
		}
	}

	const isDense = allStops.length > 30 || lanes.length > 14;
	const rowH = isDense ? 30 : 48;
	const aliasRowH = 22;
	const aliasStripH = aliasSpans.length > 0 ? aliasSpans.length * aliasRowH + 14 : 0;
	const headerH = 66;
	const rulerH = 26;
	const footerH = 42;
	const padY = 18;
	const leftGutter = 250;
	const rightPad = 90;
	const w = Math.max(1140, Math.min(1800, leftGutter + rightPad + Math.max(8, maxYear - minYear) * 42));
	const h = headerH + rulerH + aliasStripH + padY * 2 + lanes.length * rowH + footerH;

	const { canvas, ctx } = createHiDpiCanvas(w, h, 2);
	const title =
		opts.onlySecondary && opts.secondary
			? `${opts.secondary.name} — Potential Alias Trail (unconfirmed)`
			: opts.secondary
				? `${opts.primary.name} + ${opts.secondary.name} (potential alias)`
				: `${opts.primary.name} — Career Timeline`;
	const subtitle = opts.subtitle;
	const yearToX = drawHeaderAndGrid(ctx, p, w, h, headerH, footerH, leftGutter, rightPad, minYear, maxYear, title, subtitle);

	// Optional confirmed pen-name strip right under the Year ruler (zero overlapping pills inside the matrix!)
	const stripTop = headerH + rulerH;
	if (aliasSpans.length > 0) {
		ctx.fillStyle = p.surface;
		ctx.fillRect(0, stripTop, w, aliasStripH);
		ctx.strokeStyle = p.rule;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, stripTop + aliasStripH + 0.5);
		ctx.lineTo(w, stripTop + aliasStripH + 0.5);
		ctx.stroke();

		ctx.fillStyle = p.ink3;
		ctx.font = `600 10px ${p.fontMono}`;
		ctx.textAlign = 'right';
		ctx.textBaseline = 'middle';
		ctx.fillText('VNDB pen names', leftGutter - 16, stripTop + aliasStripH / 2);

		aliasSpans.forEach((al, ai) => {
			const y = stripTop + 7 + ai * aliasRowH;
			const x0 = yearToX(al.first) - 6;
			const x1 = Math.max(x0 + 14, yearToX(al.last) + 6);
			ctx.fillStyle = p.surfaceSunken;
			ctx.strokeStyle = p.confirmed;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.roundRect(x0, y + 2, x1 - x0, aliasRowH - 5, 4);
			ctx.fill();
			ctx.stroke();

			ctx.fillStyle = p.ink;
			ctx.font = `500 10.5px ${p.fontSans}`;
			ctx.textAlign = 'left';
			ctx.textBaseline = 'middle';
			const text = `${al.name} (${al.count})`;
			const tw = ctx.measureText(text).width;
			if (x1 - x0 >= tw + 12) {
				ctx.fillText(text, x0 + 6, y + aliasRowH / 2);
			} else {
				ctx.fillText(text, x1 + 6, y + aliasRowH / 2);
			}
		});
	}

	const laneY = new Map<string, number>();
	const bodyTop = stripTop + aliasStripH + padY;
	lanes.forEach((lane, idx) => {
		const y = bodyTop + idx * rowH + rowH / 2;
		laneY.set(lane.pid, y);
		if (lane.secOnly) {
			ctx.save();
			ctx.fillStyle = p.inferred;
			ctx.globalAlpha = 0.055;
			ctx.fillRect(0, y - rowH / 2, w, rowH);
			ctx.restore();
		} else if (idx % 2 === 1) {
			ctx.save();
			ctx.fillStyle = p.ink;
			ctx.globalAlpha = 0.022;
			ctx.fillRect(0, y - rowH / 2, w, rowH);
			ctx.restore();
		}

		// Subtle row separator
		ctx.save();
		ctx.strokeStyle = p.rule;
		ctx.globalAlpha = 0.45;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, y + rowH / 2 + 0.5);
		ctx.lineTo(w, y + rowH / 2 + 0.5);
		ctx.stroke();
		ctx.restore();

		// Left lane label + count
		ctx.fillStyle = lane.secOnly ? p.inferred : p.ink;
		ctx.font = `${lane.count >= 3 ? 600 : 500} 11px ${p.fontSans}`;
		ctx.textAlign = 'right';
		ctx.textBaseline = 'middle';
		const lbl = lane.name.length > 26 ? lane.name.slice(0, 24) + '…' : lane.name;
		ctx.fillText(lbl, leftGutter - 40, y);

		ctx.fillStyle = p.ink3;
		ctx.font = `500 9.5px ${p.fontMono}`;
		ctx.fillText(String(lane.count), leftGutter - 16, y);

		// Studio tenure bar (clean horizontal span from firstYear to lastYear)
		const tx0 = yearToX(lane.firstYear);
		const tx1 = yearToX(lane.lastYear);
		if (tx1 > tx0) {
			ctx.save();
			ctx.strokeStyle = lane.secOnly ? p.inferred : p.ruleStrong;
			ctx.lineWidth = lane.secOnly ? 2 : 3;
			ctx.lineCap = 'round';
			ctx.globalAlpha = lane.secOnly ? 0.55 : 0.7;
			if (lane.secOnly) ctx.setLineDash([5, 4]);
			ctx.beginPath();
			ctx.moveTo(tx0, y);
			ctx.lineTo(tx1, y);
			ctx.stroke();
			ctx.restore();
		}
	});

	// Draw trails: full chronological curves ONLY when compact (or for compact secondary overlay);
	// dense primary careers show clean studio tenure bars + grouped credit markers + clean handoffs!
	for (const { trail, isSec } of trails) {
		const drawFullCurves = !isDense || (isSec && trail.stops.length <= 20);

		// Group stops by (studio, year) so multiple credits in the same cell don't pile up
		const cellMap = new Map<string, typeof trail.stops>();
		for (const st of trail.stops) {
			const ck = `${st.pid ?? '__unlisted'}|${st.year}`;
			const arr = cellMap.get(ck);
			if (arr) arr.push(st);
			else cellMap.set(ck, [st]);
		}

		if (drawFullCurves && trail.stops.length > 1) {
			const pts = trail.stops.map((st) => ({
				st,
				x: yearToX(st.year),
				y: (laneY.get(st.pid ?? '__unlisted') ?? bodyTop) + (isSec && showPrimary ? 6 : 0)
			}));
			for (let i = 1; i < pts.length; i++) {
				const a = pts[i - 1];
				const b = pts[i];
				if (Math.hypot(b.x - a.x, b.y - a.y) < 3) continue;
				const c = edgeCurvePoints(a, b, 'lineage');
				ctx.save();
				ctx.strokeStyle = isSec ? p.inferred : a.st.pid !== b.st.pid ? p.confirmed : p.ink2;
				ctx.globalAlpha = isSec ? 0.85 : 0.72;
				ctx.lineWidth = isSec ? 2 : 1.8;
				if (isSec) ctx.setLineDash([6, 4]);
				ctx.beginPath();
				ctx.moveTo(a.x, a.y);
				ctx.bezierCurveTo(c.cp1x, c.cp1y, c.cp2x, c.cp2y, b.x, b.y);
				ctx.stroke();
				ctx.setLineDash([]);
				const ang = Math.atan2(b.y - c.cp2y, b.x - c.cp2x);
				ctx.fillStyle = isSec ? p.inferred : p.confirmed;
				drawArrow(ctx, b.x - Math.cos(ang) * 7.5, b.y - Math.sin(ang) * 7.5, c.cp2x, c.cp2y, 6);
				ctx.restore();
			}
		}

		// Draw grouped stop dots (and crisp labels for compact trails or potential alias stops)
		for (const stopsInCell of cellMap.values()) {
			const first = stopsInCell[0];
			const x = yearToX(first.year);
			const y = (laneY.get(first.pid ?? '__unlisted') ?? bodyTop) + (isSec && showPrimary ? 6 : 0);
			const r = isSec ? 5.2 : 5.4;
			const col = isSec ? p.inferred : p.roles[first.primaryRole] || p.roles.other || p.ink2;

			ctx.save();
			ctx.beginPath();
			if (first.isSeiyuu) ctx.arc(x, y, r, 0, Math.PI * 2);
			else ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
			ctx.fillStyle = isSec ? p.canvas : col;
			ctx.fill();
			ctx.strokeStyle = isSec ? p.inferred : p.canvas;
			ctx.lineWidth = 1.6;
			if (isSec) ctx.setLineDash([2.5, 2]);
			ctx.stroke();
			ctx.setLineDash([]);

			// Non-primary confirmed alias underline mark (matching CareerTimeline!)
			if (!isSec && stopsInCell.some((s) => s.isNonPrimaryAlias)) {
				ctx.fillStyle = p.ink;
				ctx.fillRect(x - r, y + r + 1.5, r * 2, 1.5);
			}

			// Count badge if > 1 VN in this (studio, year)
			if (stopsInCell.length > 1) {
				const tag = `×${stopsInCell.length}`;
				ctx.font = `600 9px ${p.fontMono}`;
				ctx.fillStyle = p.ink2;
				ctx.textAlign = 'left';
				ctx.textBaseline = 'middle';
				ctx.fillText(tag, x + r + 3, y);
			} else if (!isDense || isSec) {
				// Label individual VN title when trail is compact or for potential alias overlay stops
				const raw = first.title.length > 26 ? first.title.slice(0, 24) + '…' : first.title;
				ctx.font = `500 9.5px ${p.fontSans}`;
				ctx.fillStyle = isSec ? p.inferred : p.ink2;
				ctx.textAlign = 'left';
				ctx.textBaseline = 'middle';
				ctx.fillText(raw, x + r + 5, y);
			}
			ctx.restore();
		}
	}

	// Footer legend
	const ly = h - footerH / 2;
	ctx.font = `500 10.5px ${p.fontSans}`;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = p.ink2;
	const parts = [
		showPrimary ? `Solid = ${opts.primary.name} (VNDB confirmed)` : null,
		opts.secondary ? `Dashed sand = ${opts.secondary.name} (unconfirmed potential alias)` : null,
		showPrimary && aliasSpans.length > 0 ? 'Underline on dot = credited under pen name' : null
	].filter(Boolean);
	ctx.fillText(parts.join('   ·   '), 24, ly + 0.5);

	const slug = opts.onlySecondary && opts.secondary ? `${opts.secondary.name}-inferred` : opts.primary.name;
	downloadCanvas(canvas, `${safeFileSlug(slug)}-career-trail.png`);
}
