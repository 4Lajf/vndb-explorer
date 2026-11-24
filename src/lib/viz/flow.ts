/**
 * Staff migration flow (DESIGN §6.3): Came from ← This brand → Went to.
 * Pure layout: rows, ribbon paths and the centre pillar.
 */
import type { MigrationPartner, MigrationSummary } from '../types.ts';

export type FlowSide = 'in' | 'out';
export type FlowRowKind = 'brand' | 'other' | 'residual';

export interface FlowRow {
	key: string;
	side: FlowSide;
	kind: FlowRowKind;
	label: string;
	partner: MigrationPartner | null;
	/** Brands folded into an "Other" row. */
	folded: MigrationPartner[];
	count: number;
	core: number;
	seiyuu: number;
	/** Mean years between leaving one brand and arriving at the other. */
	gap: number | null;
	minGap: number | null;
	maxGap: number | null;
	/** Row centre y. */
	y: number;
	/** Ribbon thickness. */
	t: number;
	/** Thickness of the seiyuu band inside the ribbon. */
	tSeiyuu: number;
	/** Ribbon paths: core band and seiyuu band (inner side). */
	path: string;
	pathSeiyuu: string | null;
	note?: string;
}

export interface FlowLayout {
	width: number;
	height: number;
	rowH: number;
	pillar: { x: number; y: number; w: number; h: number };
	/** x where left labels end / right labels begin. */
	leftLabelEnd: number;
	rightLabelStart: number;
	inflow: FlowRow[];
	outflow: FlowRow[];
}

export interface FlowOptions {
	maxRows?: number;
	width?: number;
	includeSeiyuu?: boolean;
}

const ROW_H = 38;
const PILLAR_W = 96;

function foldRows(
	side: FlowSide,
	partners: readonly MigrationPartner[],
	maxRows: number,
	residuals: Array<{ key: string; label: string; count: number; note: string }>
): Omit<FlowRow, 'y' | 't' | 'tSeiyuu' | 'path' | 'pathSeiyuu'>[] {
	const sorted = [...partners].sort((a, b) => b.count - a.count || b.coreCount - a.coreCount);
	const top = sorted.slice(0, maxRows);
	const rest = sorted.slice(maxRows);
	const rows: Omit<FlowRow, 'y' | 't' | 'tSeiyuu' | 'path' | 'pathSeiyuu'>[] = top.map((p) => ({
		key: `${side}|${p.pid}`,
		side,
		kind: 'brand' as const,
		label: p.name,
		partner: p,
		folded: [],
		count: p.count,
		core: p.coreCount,
		seiyuu: p.seiyuuCount,
		gap: p.avgGapYears,
		minGap: p.minGapYears ?? null,
		maxGap: p.maxGapYears ?? null
	}));
	if (rest.length) {
		rows.push({
			key: `${side}|__other`,
			side,
			kind: 'other',
			label: `Next ${rest.length} brand${rest.length === 1 ? '' : 's'}`,
			partner: null,
			folded: rest,
			count: rest.reduce((s, p) => s + p.count, 0),
			core: rest.reduce((s, p) => s + p.coreCount, 0),
			seiyuu: rest.reduce((s, p) => s + p.seiyuuCount, 0),
			gap: null,
			minGap: null,
			maxGap: null
		});
	}
	for (const r of residuals) {
		if (r.count <= 0) continue;
		rows.push({
			key: `${side}|${r.key}`,
			side,
			kind: 'residual',
			label: r.label,
			partner: null,
			folded: [],
			count: r.count,
			core: r.count,
			seiyuu: 0,
			gap: null,
			minGap: null,
			maxGap: null,
			note: r.note
		});
	}
	return rows;
}

export function layoutFlow(
	inflow: readonly MigrationPartner[],
	outflow: readonly MigrationPartner[],
	summary: MigrationSummary | null | undefined,
	options: FlowOptions = {}
): FlowLayout {
	const maxRows = options.maxRows ?? 8;
	const width = Math.max(720, options.width ?? 960);

	const left = foldRows('in', inflow, maxRows, [
		{
			key: '__debut',
			label: 'Debuted here',
			count: summary?.debutedHereCount ?? 0,
			note: 'No earlier brand recorded before their first credit here.'
		}
	]);
	const right = foldRows('out', outflow, maxRows, [
		{
			key: '__nolater',
			label: 'No later credits',
			count: summary?.noLaterCreditsCount ?? 0,
			note: 'No later brand recorded, and no credit here in the last 3 years.'
		},
		{
			key: '__active',
			label: 'Still active here',
			count: summary?.stillActiveCount ?? 0,
			note: 'No later brand recorded; credited here within the last 3 years.'
		}
	]);

	const rowsN = Math.max(left.length, right.length, 3);
	const height = Math.max(200, rowsN * ROW_H + 24);
	const pillarH = Math.max(160, Math.min(480, height - 24));
	const pillar = {
		x: width / 2 - PILLAR_W / 2,
		y: (height - pillarH) / 2,
		w: PILLAR_W,
		h: pillarH
	};
	const ribbonW = Math.max(90, Math.min(150, width * 0.14));
	const leftLabelEnd = pillar.x - ribbonW;
	const rightLabelStart = pillar.x + pillar.w + ribbonW;

	const place = (
		rows: Omit<FlowRow, 'y' | 't' | 'tSeiyuu' | 'path' | 'pathSeiyuu'>[],
		side: FlowSide
	): FlowRow[] => {
		const total = rows.reduce((s, r) => s + r.count, 0);
		const gaps = Math.max(0, rows.length - 1) * 2;
		const avail = pillarH - 16 - gaps;
		// 1 person = 2px, scaled down so the side fits the pillar.
		const k = total > 0 ? Math.min(2, avail / total) : 0;
		const thickness = rows.map((r) => Math.max(2, r.count * k));
		const sumT = thickness.reduce((s, t) => s + t, 0) + gaps;
		let cursor = pillar.y + (pillarH - sumT) / 2;
		const blockH = rows.length * ROW_H;
		const top = (height - blockH) / 2;

		return rows.map((r, i) => {
			const t = Math.min(thickness[i], ROW_H - 6);
			const tPillar = thickness[i];
			const y = top + i * ROW_H + ROW_H / 2;
			const py0 = cursor;
			cursor += tPillar + 2;
			const tSeiyuu =
				options.includeSeiyuu && r.count > 0 ? (tPillar * r.seiyuu) / r.count : 0;

			const rowX = side === 'in' ? leftLabelEnd : rightLabelStart;
			const pillarX = side === 'in' ? pillar.x : pillar.x + pillar.w;
			const band = (rowTop: number, rowBottom: number, pTop: number, pBottom: number) => {
				const mx = (rowX + pillarX) / 2;
				return (
					`M${rowX.toFixed(1)},${rowTop.toFixed(1)} ` +
					`C${mx.toFixed(1)},${rowTop.toFixed(1)} ${mx.toFixed(1)},${pTop.toFixed(1)} ${pillarX.toFixed(1)},${pTop.toFixed(1)} ` +
					`L${pillarX.toFixed(1)},${pBottom.toFixed(1)} ` +
					`C${mx.toFixed(1)},${pBottom.toFixed(1)} ${mx.toFixed(1)},${rowBottom.toFixed(1)} ${rowX.toFixed(1)},${rowBottom.toFixed(1)} Z`
				);
			};

			const rowTop = y - t / 2;
			const rowBottom = y + t / 2;
			let path: string;
			let pathSeiyuu: string | null = null;
			if (tSeiyuu > 0.5 && tSeiyuu < tPillar - 0.5) {
				// Core on the outer side, seiyuu on the inner side, 1px gap.
				const share = tSeiyuu / tPillar;
				const rowSplit = rowBottom - t * share;
				const pSplit = py0 + tPillar - tSeiyuu;
				path = band(rowTop, rowSplit - 0.5, py0, pSplit - 0.5);
				pathSeiyuu = band(rowSplit + 0.5, rowBottom, pSplit + 0.5, py0 + tPillar);
			} else if (tSeiyuu >= tPillar - 0.5 && tSeiyuu > 0) {
				path = '';
				pathSeiyuu = band(rowTop, rowBottom, py0, py0 + tPillar);
			} else {
				path = band(rowTop, rowBottom, py0, py0 + tPillar);
			}

			return { ...r, y, t, tSeiyuu, path, pathSeiyuu };
		});
	};

	return {
		width,
		height,
		rowH: ROW_H,
		pillar,
		leftLabelEnd,
		rightLabelStart,
		inflow: place(left, 'in'),
		outflow: place(right, 'out')
	};
}
