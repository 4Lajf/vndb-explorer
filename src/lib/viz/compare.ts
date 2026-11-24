/**
 * Side-by-side activity timeline (DESIGN §6.4): mirrored yearly bars on one
 * shared scale, with a crossover band for people credited at both brands.
 */

export interface YearVn {
	id: string;
	title: string;
	original: string | null;
}

export interface YearPoint {
	year: number;
	countA: number;
	countB: number;
	vnsA?: YearVn[];
	vnsB?: YearVn[];
}

export interface SharedSpan {
	sid: string;
	name: string;
	/** Original-script name when it differs from `name`. */
	original?: string | null;
	firstYearA: number | null;
	lastYearA: number | null;
	firstYearB: number | null;
	lastYearB: number | null;
}

export interface CompareYear {
	year: number;
	x: number;
	countA: number;
	countB: number;
	vnsA: YearVn[];
	vnsB: YearVn[];
	/** People credited at both brands who were active at either one this year. */
	shared: number;
	sharedNames: string[];
	/** Full list of shared people active in this year, for click-to-pin detail and table view. */
	sharedPeople: Array<{ sid: string; name: string }>;
	/** 0–4: step of the single-hue ramp. */
	sharedLevel: 0 | 1 | 2 | 3 | 4;
	/** First crossings A→B and B→A landing in this year. */
	movesDown: number;
	movesUp: number;
	movesDownPeople: Array<{ sid: string; name: string }>;
	movesUpPeople: Array<{ sid: string; name: string }>;
	/**
	 * The year's move marks as printed: one line when both directions fit the
	 * column side by side, otherwise one line each.
	 */
	moveLines: string[];
	peakA: boolean;
	peakB: boolean;
}

export type OverlapBracket =
	| { kind: 'concurrent'; from: number; to: number; years: number; x1: number; x2: number }
	| {
			kind: 'gap';
			first: 'A' | 'B';
			endYear: number;
			startYear: number;
			gap: number;
			x1: number;
			x2: number;
	  }
	| null;

export interface CompareLayout {
	width: number;
	height: number;
	plotLeft: number;
	plotRight: number;
	yearW: number;
	barW: number;
	minYear: number;
	maxYear: number;
	maxCount: number;
	halfH: number;
	bandH: number;
	bracketH: number;
	/** Width reserved right of the plot for the A/B end labels. */
	rightPad: number;
	/** y of the upper (A) and lower (B) baselines. */
	baseA: number;
	baseB: number;
	scale: (count: number) => number;
	yTicks: number[];
	years: CompareYear[];
	xTicks: Array<{ year: number; x: number }>;
	bracket: OverlapBracket;
	totalMovesDown: number;
	totalMovesUp: number;
}

export const SHARED_LEVELS = [
	{ level: 0, label: '0', opacity: 0 },
	{ level: 1, label: '1–2', opacity: 0.1 },
	{ level: 2, label: '3–5', opacity: 0.25 },
	{ level: 3, label: '6–10', opacity: 0.45 },
	{ level: 4, label: '11+', opacity: 0.7 }
] as const;

function sharedLevel(n: number): 0 | 1 | 2 | 3 | 4 {
	if (n <= 0) return 0;
	if (n <= 2) return 1;
	if (n <= 5) return 2;
	if (n <= 10) return 3;
	return 4;
}

/** Narrowest full-size year column. */
const MIN_YEAR_W = 24;
/** Widest full-size year column, and widest column of end labels. */
const MAX_YEAR_W = 46;
const MAX_RIGHT_PAD = 180;
/** Advance of one character of a move mark (11px mono). */
const MOVE_CHAR_W = 6.8;
/** Line pitch of stacked move marks. */
export const MOVE_LINE_H = 13;

function moveMark(arrow: '↓' | '↑', n: number): string {
	if (n <= 0) return '';
	return `${arrow}${n}`;
}

/**
 * Move marks for one year column: `↓1↑2` on one line when it fits, otherwise
 * one line per direction so two-digit counts never run into a neighbouring year.
 */
function moveLines(down: number, up: number, yearW: number): string[] {
	if (down <= 0 && up <= 0) return [];
	const room = yearW - 2;
	const fits = (s: string) => [...s].length * MOVE_CHAR_W <= room;
	const counted = moveMark('↓', down) + moveMark('↑', up);
	if (fits(counted) || down <= 0 || up <= 0) return [counted];
	return [moveMark('↓', down), moveMark('↑', up)];
}

function niceMax(v: number): number {
	if (v <= 4) return 4;
	if (v <= 6) return 6;
	if (v <= 8) return 8;
	if (v <= 12) return 12;
	const pow = Math.pow(10, Math.floor(Math.log10(v)));
	for (const m of [1, 2, 3, 4, 5, 6, 8, 10]) if (m * pow >= v) return m * pow;
	return 10 * pow;
}

export interface CompareOptions {
	/** Calendar year of the dump: the fixed "now" when neither brand has a dated release. */
	dumpYear: number;
	width?: number;
	halfH?: number;
	compact?: boolean;
	/** The reader's name order for the people named in the hover preview: pass `shownName`. */
	shown?: (name: string, original?: string | null) => string;
}

export function layoutCompare(
	series: readonly YearPoint[],
	shared: readonly SharedSpan[],
	spanA: { first: number | null; last: number | null },
	spanB: { first: number | null; last: number | null },
	options: CompareOptions
): CompareLayout {
	const compact = options.compact ?? false;
	const shown = options.shown ?? ((name: string) => name);
	const halfH = options.halfH ?? (compact ? 40 : 92);
	// Room above the tallest A bar for the overlap bracket, its label and the
	// peak count: the three never share a line.
	const bracketH = compact ? 0 : 34;
	const peakPad = compact ? 4 : 16;
	const plotLeft = 36;
	const axisH = 20;
	// Wide enough for a slot tag plus a real brand name at the right ends. A wide
	// screen with room to spare hands it to this column (see below).
	const baseRightPad = compact ? 8 : 124;

	const yearsWith = series.map((s) => s.year);
	const nowYear = options.dumpYear;
	const minYear = yearsWith.length ? Math.min(...yearsWith) - 1 : nowYear - 5;
	const maxYear = yearsWith.length ? Math.max(...yearsWith) + 1 : nowYear;
	const span = maxYear - minYear + 1;

	const targetW = options.width ?? 960;
	const avail = Math.max(120, targetW - plotLeft - baseRightPad);
	// A full-size column is never narrower than a three-character move mark
	// (`↓14`): a long span scrolls sideways instead of printing marks over each other.
	// It grows to 46px (the career timeline's ceiling) so a short span fills a
	// desktop card instead of leaving its right third blank.
	const yearW = Math.max(
		compact ? 6 : MIN_YEAR_W,
		Math.min(compact ? 34 : MAX_YEAR_W, avail / span)
	);
	const plotW = span * yearW;
	// Width the columns still leave over goes to the brand names at the right
	// ends, up to 180px, so fewer of them are cut short.
	const surplus = Math.max(0, targetW - plotLeft - plotW - baseRightPad);
	const rightPad = compact ? baseRightPad : Math.min(MAX_RIGHT_PAD, baseRightPad + surplus);
	const width = plotLeft + plotW + rightPad;
	const barW = Math.max(2, Math.min(16, yearW - 2));

	const byYear = new Map(series.map((s) => [s.year, s]));
	const maxRaw = Math.max(1, ...series.map((s) => Math.max(s.countA, s.countB)));
	const maxCount = niceMax(maxRaw);
	const scale = (count: number) => (count / maxCount) * halfH;

	// First crossings: the year someone first appears at the other brand.
	const downByYear = new Map<number, Array<{ sid: string; name: string }>>();
	const upByYear = new Map<number, Array<{ sid: string; name: string }>>();
	for (const p of shared) {
		if (p.firstYearA == null || p.firstYearB == null) continue;
		const entry = { sid: p.sid, name: shown(p.name, p.original) };
		if (p.firstYearB > p.firstYearA) {
			const arr = downByYear.get(p.firstYearB) ?? [];
			arr.push(entry);
			downByYear.set(p.firstYearB, arr);
		} else if (p.firstYearA > p.firstYearB) {
			const arr = upByYear.get(p.firstYearA) ?? [];
			arr.push(entry);
			upByYear.set(p.firstYearA, arr);
		}
	}
	const moveLinesByYear = new Map<number, string[]>();
	for (const y of new Set([...downByYear.keys(), ...upByYear.keys()])) {
		moveLinesByYear.set(y, moveLines(downByYear.get(y)?.length ?? 0, upByYear.get(y)?.length ?? 0, yearW));
	}
	const moveRows = Math.max(1, ...[...moveLinesByYear.values()].map((l) => l.length));
	// The band grows by one line of marks when a year needs both directions stacked.
	const bandH = compact ? 14 : 33 + (moveRows - 1) * MOVE_LINE_H;

	const baseA = bracketH + peakPad + halfH;
	const baseB = baseA + bandH;
	// B's peak count is printed under its tallest bar: it gets the same strip
	// A's has above, so it never lands on the year labels.
	const height = baseB + halfH + peakPad + axisH + 4;

	const peakA = Math.max(0, ...series.map((s) => s.countA));
	const peakB = Math.max(0, ...series.map((s) => s.countB));
	let peakAUsed = false;
	let peakBUsed = false;

	const years: CompareYear[] = [];
	for (let y = minYear; y <= maxYear; y++) {
		const s = byYear.get(y);
		const active = shared.filter((p) => {
			const inA = p.firstYearA != null && p.lastYearA != null && y >= p.firstYearA && y <= p.lastYearA;
			const inB = p.firstYearB != null && p.lastYearB != null && y >= p.firstYearB && y <= p.lastYearB;
			return inA || inB;
		});
		const countA = s?.countA ?? 0;
		const countB = s?.countB ?? 0;
		const isPeakA = !peakAUsed && peakA > 0 && countA === peakA;
		const isPeakB = !peakBUsed && peakB > 0 && countB === peakB;
		if (isPeakA) peakAUsed = true;
		if (isPeakB) peakBUsed = true;
		const sharedPeople = active.map((p) => ({ sid: p.sid, name: shown(p.name, p.original) }));
		const movesDownPeople = downByYear.get(y) ?? [];
		const movesUpPeople = upByYear.get(y) ?? [];
		years.push({
			year: y,
			x: plotLeft + (y - minYear + 0.5) * yearW,
			countA,
			countB,
			vnsA: s?.vnsA ?? [],
			vnsB: s?.vnsB ?? [],
			shared: active.length,
			sharedNames: sharedPeople.slice(0, 5).map((p) => p.name),
			sharedPeople,
			sharedLevel: sharedLevel(active.length),
			movesDown: movesDownPeople.length,
			movesUp: movesUpPeople.length,
			movesDownPeople,
			movesUpPeople,
			moveLines: moveLinesByYear.get(y) ?? [],
			peakA: isPeakA,
			peakB: isPeakB
		});
	}

	const step = yearW >= 30 ? 1 : yearW >= 16 ? 2 : yearW >= 8 ? 5 : 10;
	const xTicks = years.filter((y) => y.year % step === 0).map((y) => ({ year: y.year, x: y.x }));
	const yTicks = [maxCount / 2, maxCount];

	let bracket: OverlapBracket = null;
	const { first: fa, last: la } = spanA;
	const { first: fb, last: lb } = spanB;
	const xOf = (year: number) => plotLeft + (year - minYear + 0.5) * yearW;
	if (fa != null && la != null && fb != null && lb != null) {
		const from = Math.max(fa, fb);
		const to = Math.min(la, lb);
		if (to >= from) {
			bracket = {
				kind: 'concurrent',
				from,
				to,
				years: to - from + 1,
				x1: xOf(Math.max(from, minYear)) - yearW / 2,
				x2: xOf(Math.min(to, maxYear)) + yearW / 2
			};
		} else {
			const aFirst = la < fb;
			const endYear = aFirst ? la : lb;
			const startYear = aFirst ? fb : fa;
			bracket = {
				kind: 'gap',
				first: aFirst ? 'A' : 'B',
				endYear,
				startYear,
				gap: startYear - endYear,
				x1: xOf(Math.max(endYear, minYear)),
				x2: xOf(Math.min(startYear, maxYear))
			};
		}
	}

	return {
		width,
		height,
		plotLeft,
		plotRight: plotLeft + plotW,
		yearW,
		barW,
		minYear,
		maxYear,
		maxCount,
		halfH,
		bandH,
		bracketH,
		rightPad,
		baseA,
		baseB,
		scale,
		yTicks,
		years,
		xTicks,
		bracket,
		totalMovesDown: [...downByYear.values()].reduce((s, v) => s + v.length, 0),
		totalMovesUp: [...upByYear.values()].reduce((s, v) => s + v.length, 0)
	};
}

/** Bar path with a 3px rounded far end and a square baseline. */
export function barPath(x: number, base: number, w: number, h: number, up: boolean): string {
	if (h <= 0) return '';
	const r = Math.min(3, w / 2, h);
	const x0 = x - w / 2;
	const x1 = x + w / 2;
	if (up) {
		const top = base - h;
		return `M${x0.toFixed(1)},${base.toFixed(1)} V${(top + r).toFixed(1)} Q${x0.toFixed(1)},${top.toFixed(1)} ${(x0 + r).toFixed(1)},${top.toFixed(1)} H${(x1 - r).toFixed(1)} Q${x1.toFixed(1)},${top.toFixed(1)} ${x1.toFixed(1)},${(top + r).toFixed(1)} V${base.toFixed(1)} Z`;
	}
	const bottom = base + h;
	return `M${x0.toFixed(1)},${base.toFixed(1)} V${(bottom - r).toFixed(1)} Q${x0.toFixed(1)},${bottom.toFixed(1)} ${(x0 + r).toFixed(1)},${bottom.toFixed(1)} H${(x1 - r).toFixed(1)} Q${x1.toFixed(1)},${bottom.toFixed(1)} ${x1.toFixed(1)},${(bottom - r).toFixed(1)} V${base.toFixed(1)} Z`;
}
