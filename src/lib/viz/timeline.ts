/**
 * Career timeline layout (DESIGN §6.1). Pure maths: no DOM, no Svelte.
 *
 * Time runs left to right, each lane is a brand. A lane holds up to three
 * sub-rows: development credits (squares), voice credits (circles) and, in
 * investigative mode, a candidate record's credits (hollow dashed marks).
 */
import type { StaffBrandTrack, StaffTimelineEvent, StaffTransition } from '../types.ts';
import { legendRole, sortRoles } from '../roles.ts';
import { estimateTextWidth } from './text.ts';

export type SubRow = 'core' | 'seiyuu' | 'candidate';
export type LaneSort = 'first' | 'credits' | 'tenure';

export interface Credit {
	key: string;
	vid: string;
	title: string;
	original: string | null;
	year: number | null;
	pid: string | null;
	producerName: string | null;
	producerOriginal: string | null;
	/** Dev roles in precedence order, or ['seiyuu']. */
	roles: string[];
	kind: 'core' | 'seiyuu';
	candidate: boolean;
	/** Every name credited on this part of the event (never empty). */
	aliases: CreditAlias[];
	/** The name to show where there is room for one: a pen name first. */
	aliasUsed: string;
	/** Any of `aliases` is not the record's primary name. */
	isNonPrimaryAlias: boolean;
	hasEro: boolean;
	/** The VN also has an all-ages release. */
	hasAllAges: boolean;
	/** A credit on a later edition (port, localisation): it has no brand. */
	edition: boolean;
	characters: Array<{ cid: string; name: string; original?: string | null }>;
}

export interface CreditAlias {
	name: string;
	original: string | null;
	isNonPrimary: boolean;
	/** A pen name romanised exactly like the primary name: its label prints the script. */
	sameRomanisation?: boolean;
}

/**
 * Identity of a credited name. Two pen names can share one romanisation
 * (ヒマリ and 陽茉莉 are both "Himari"): they stay two names, so anything that
 * lists names keys them by this and never by the romanised form alone.
 */
export function aliasKey(a: { name: string; original?: string | null }): string {
	return `${a.name}\0${a.original ?? ''}`;
}

/** A pen name ready to list: a unique key and a label that tells namesakes apart. */
export interface PenName {
	key: string;
	name: string;
	original: string | null;
	/** The romanised name, with its script when another name in the list shares it: `Himari (ヒマリ)`. */
	label: string;
}

/**
 * The pen names among a set of credited names, each once. One VN can credit a
 * person under two names with the same romanisation; both are kept, and their
 * labels carry the original script so they do not read as one name twice.
 */
export function distinctPenNames(
	aliases: ReadonlyArray<{
		name: string;
		original?: string | null;
		isNonPrimary: boolean;
		sameRomanisation?: boolean;
	}>
): PenName[] {
	const byKey = new Map<string, { name: string; original: string | null; homograph: boolean }>();
	for (const a of aliases) {
		if (!a.isNonPrimary) continue;
		const key = aliasKey(a);
		if (!byKey.has(key)) {
			byKey.set(key, {
				name: a.name,
				original: a.original ?? null,
				homograph: a.sameRomanisation === true
			});
		}
	}
	const uses = new Map<string, number>();
	for (const a of byKey.values()) uses.set(a.name, (uses.get(a.name) ?? 0) + 1);
	return [...byKey].map(([key, a]) => ({
		key,
		name: a.name,
		original: a.original,
		// The script is printed when the romanisation alone would not say which name
		// this is: another pen name shares it, or the person's primary name does.
		label:
			((uses.get(a.name) ?? 0) > 1 || a.homograph) && a.original
				? `${a.name} (${a.original})`
				: a.name
	}));
}

/** Pen names on a credit, for "as …" labels. */
export function creditPenNames(c: Pick<Credit, 'aliases'>): string[] {
	return distinctPenNames(c.aliases).map((a) => a.label);
}

export interface TimelineCell {
	key: string;
	laneId: string;
	laneIndex: number;
	sub: SubRow;
	year: number;
	/** Centre x of the year column. */
	cx: number;
	/** Top of the sub-row band. */
	y: number;
	h: number;
	credits: Credit[];
	/** Drawn marks (at most `rows`), bottom-up. */
	marks: Array<{ credit: Credit; cx: number; cy: number }>;
	/** Count tile when the cell holds more credits than it can draw. */
	tile: { cx: number; cy: number; count: number } | null;
}

export interface TimelineLane {
	id: string;
	pid: string | null;
	name: string;
	original: string | null;
	index: number;
	y: number;
	h: number;
	vnCount: number;
	candidateVnCount: number;
	firstYear: number | null;
	lastYear: number | null;
	aliases: string[];
	/** The same pen names with their original script, for a label in the reader's name order. */
	penNames: PenName[];
	roles: string[];
	subs: SubRow[];
	candidateOnly: boolean;
	aggregate: boolean;
	/** Tenure track of the person (first to last credit). */
	tenure: { x1: number; x2: number; y: number } | null;
	candidateTenure: { x1: number; x2: number; y: number } | null;
}

/** Alias rows drawn before the rest collapse into a "+n more" note. */
export const MAX_ALIAS_ROWS = 6;

export interface AliasSegment {
	/** Identity of the name: its romanised and original forms together. */
	key: string;
	/** Printed label: the romanised name, with the original script when two names share it. */
	alias: string;
	firstYear: number;
	lastYear: number;
	/** The bar: exactly the years the name was used, read against the year axis. */
	x1: number;
	x2: number;
	/** Where the label sits: inside the bar when it fits, otherwise beside it. */
	labelSide: 'inside' | 'right' | 'left';
	/** Label anchor: its left edge for `inside` and `right`, its right edge for `left`. */
	labelX: number;
	/** Width reserved for the label; longer text is clipped to it. */
	labelW: number;
	row: number;
	count: number;
}

export interface SwitchMarker {
	year: number;
	x: number;
	from: string;
	to: string;
	withBrandChange: boolean;
	fromBrand: string | null;
	toBrand: string | null;
	/** A drawn lane holds a credit this year: the switch gets a guide through the lanes. */
	inLanes: boolean;
}

export interface Connector {
	key: string;
	path: string;
	arrow: string;
	fromLane: string;
	toLane: string;
	fromName: string;
	toName: string;
	fromOriginal: string | null;
	toOriginal: string | null;
	fromYear: number | null;
	toYear: number | null;
	gapYears: number | null;
	aliasChanged: boolean;
	aliasFrom: string | null;
	aliasTo: string | null;
	/** First arrival at the destination lane (the default trace). */
	first: boolean;
	mid: { x: number; y: number };
}

export interface TimelineLayout {
	minYear: number;
	maxYear: number;
	yearW: number;
	plotW: number;
	plotH: number;
	lanesTop: number;
	aliasStripH: number;
	axisH: number;
	ticks: Array<{ year: number; x: number; major: boolean; label: boolean }>;
	lanes: TimelineLane[];
	cells: TimelineCell[];
	aliasSegments: AliasSegment[];
	/** Aliases that did not fit in `MAX_ALIAS_ROWS` rows. */
	aliasOverflow: number;
	/** Height of the repeated year axis under the lanes (0 when it is not drawn). */
	bottomAxisH: number;
	/** y of the last lane's bottom edge. */
	lanesBottom: number;
	switches: SwitchMarker[];
	connectors: Connector[];
	undated: Credit[];
	hiddenLaneCount: number;
	totalLaneCount: number;
	x: (year: number) => number;
}

export interface TimelineOptions {
	/** Calendar year of the dump: the fixed "now" when a career has no dated credit. */
	dumpYear: number;
	yearW?: number;
	/** Available plot width: short careers stretch to fill it (auto zoom only). */
	fitWidth?: number;
	maxLanes?: number;
	sort?: LaneSort;
	/** Legend roles the reader has isolated; empty = all. */
	activeRoles?: readonly string[];
	showAllTransitions?: boolean;
	/** The reader's name order for alias-strip labels: pass `shownName`. */
	shown?: (name: string, original?: string | null) => string;
	overlay?: {
		events: StaffTimelineEvent[];
		tracks: StaffBrandTrack[];
	} | null;
}

/** Tall enough for a mark plus a `+n` tile with clear air under the lane's top rule. */
export const LANE_H = 48;
/** Above this many lanes the year axis is repeated under them (DESIGN §6.1). */
export const BOTTOM_AXIS_MIN_LANES = 12;
/** Above this many brands a career is a freelancer's: same-year loops are noise by default. */
export const BUSY_CAREER_BRANDS = 12;
/** Horizontal step between same-year loops that leave one year column. */
const LOOP_STAGGER = 4;
/**
 * Vertical pitch of stacked marks: the 12px mark, its alias underscore (1.5px,
 * 1px below) and 2.5px of air before the mark underneath.
 */
export const STACK = 17;
const SUB_H = 18;
const MULTI_PAD = 10;
export const MARK = 12;
const AXIS_H = 24;
/**
 * One alias row: an 18px bar with 3px of air above and below. The bar holds a
 * 12px label with its descenders (the `g` of `Tomonaga Maki`) and full-height
 * CJK brackets; at 14px both were cut off.
 */
export const ALIAS_ROW_H = 24;
/** Height of the alias bar inside its row. */
export const ALIAS_BAR_H = 18;
/** Narrowest alias bar drawn, so a bar at the plot's edge stays visible. */
const ALIAS_MIN_BAR_W = 4;
/** Longest alias label printed in full; beyond it the text is clipped. */
const ALIAS_LABEL_MAX_W = 160;
/** Clear space kept between two items on one alias row. */
const ALIAS_ROW_GAP = 4;
/** Width of a 12px alias label (the CJK legibility floor): Latin letters about 0.6em, CJK a full em. */
const aliasLabelWidth = (text: string) => Math.ceil(estimateTextWidth(text, 7.2, 12));
/** Truncate an alias label cleanly with `…` so SVG bars never hard-clip mid-glyph. */
function fitAliasLabel(text: string, maxW: number): string {
	if (maxW <= 12) return '';
	if (aliasLabelWidth(text) <= maxW) return text;
	const chars = [...text];
	let lo = 0;
	let hi = chars.length;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (aliasLabelWidth(`${chars.slice(0, mid).join('')}…`) <= maxW) lo = mid;
		else hi = mid - 1;
	}
	return lo > 0 ? `${chars.slice(0, lo).join('')}…` : '';
}
/** Band under the alias rows that holds the name-switch marks, clear of labels. */
export const SWITCH_BAND_H = 14;
const OTHER_ID = '__other';
const NONE_ID = '__none';

/** Split events into drawable credits: one per (VN, brand, kind). */
export function eventsToCredits(events: readonly StaffTimelineEvent[], candidate = false): Credit[] {
	const out: Credit[] = [];
	for (const ev of events) {
		const dev = sortRoles(ev.roles.filter((r) => r !== 'seiyuu'));
		const base = {
			vid: ev.vid,
			title: ev.vnTitle,
			original: ev.vnOriginal,
			year: ev.year,
			pid: ev.pid,
			producerName: ev.producerName,
			producerOriginal: ev.producerOriginal ?? null,
			candidate,
			hasEro: ev.hasEro,
			hasAllAges: ev.hasAllAges === true,
			edition: ev.isEdition === true
		};
		// The names used on this part of the event. A voice part and a staff credit
		// on one VN can carry different names, and each keeps its own.
		const namesFor = (part: 'dev' | 'voice') => {
			const used = (ev.aliases ?? []).filter((a) => a[part]);
			const list: CreditAlias[] = used.length
				? used.map((a) => ({
						name: a.name,
						original: a.original,
						isNonPrimary: a.isNonPrimary,
						sameRomanisation: a.sameRomanisation
					}))
				: [{ name: ev.aliasUsed, original: null, isNonPrimary: ev.isNonPrimaryAlias }];
			return {
				aliases: list,
				aliasUsed: (list.find((a) => a.isNonPrimary) ?? list[0]).name,
				isNonPrimaryAlias: list.some((a) => a.isNonPrimary)
			};
		};
		const prefix = `${candidate ? 'c' : 'p'}|${ev.vid}|${ev.pid ?? ''}${ev.isEdition ? '|ed' : ''}`;
		if (dev.length) {
			out.push({
				...base,
				...namesFor('dev'),
				key: `${prefix}|core`,
				roles: dev,
				kind: 'core',
				characters: []
			});
		}
		if (ev.isSeiyuu) {
			out.push({
				...base,
				...namesFor('voice'),
				key: `${prefix}|cv`,
				roles: ['seiyuu'],
				kind: 'seiyuu',
				characters: ev.characters
			});
		}
	}
	return out;
}

function creditVisible(c: Credit, active: readonly string[] | undefined): boolean {
	if (!active || active.length === 0) return true;
	return c.roles.some((r) => active.includes(legendRole(r)));
}

function chooseYearW(span: number): number {
	if (span <= 26) return 28;
	if (span <= 40) return 20;
	return 14;
}

function tickStep(yearW: number): number {
	if (yearW >= 28) return 1;
	if (yearW >= 18) return 2;
	return 5;
}

export function layoutTimeline(
	events: readonly StaffTimelineEvent[],
	tracks: readonly StaffBrandTrack[],
	transitions: readonly StaffTransition[],
	options: TimelineOptions
): TimelineLayout {
	const maxLanes = options.maxLanes ?? 14;
	const overlay = options.overlay ?? null;
	const shown = options.shown ?? ((name: string) => name);

	const own = eventsToCredits(events, false).filter((c) => creditVisible(c, options.activeRoles));
	const cand = overlay
		? eventsToCredits(overlay.events, true).filter((c) => creditVisible(c, options.activeRoles))
		: [];
	const all = [...own, ...cand];
	const dated = all.filter((c): c is Credit & { year: number } => c.year != null);
	const undated = all.filter((c) => c.year == null);

	// ── Year domain ──
	const nowYear = options.dumpYear;
	let minYear = dated.length ? Math.min(...dated.map((c) => c.year)) - 1 : nowYear - 5;
	let maxYear = dated.length ? Math.max(...dated.map((c) => c.year)) + 1 : nowYear;
	if (maxYear - minYear < 6) {
		const pad = 6 - (maxYear - minYear);
		minYear -= Math.floor(pad / 2);
		maxYear += Math.ceil(pad / 2);
	}
	const span = maxYear - minYear + 1;
	const autoW = chooseYearW(span);
	const yearW =
		options.yearW ??
		(options.fitWidth && options.fitWidth > 0
			? Math.max(autoW, Math.min(48, Math.floor(options.fitWidth / span)))
			: autoW);
	const plotW = span * yearW;
	const x = (year: number) => (year - minYear + 0.5) * yearW;

	// ── Lanes ──
	const trackByPid = new Map(tracks.map((t) => [t.pid, t]));
	const candTrackByPid = new Map((overlay?.tracks ?? []).map((t) => [t.pid, t]));

	interface LaneAcc {
		id: string;
		pid: string | null;
		name: string;
		original: string | null;
		ownVns: Set<string>;
		candVns: Set<string>;
		first: number | null;
		last: number | null;
		candFirst: number | null;
		candLast: number | null;
		aliases: Set<string>;
		penNames: CreditAlias[];
		roles: Set<string>;
		subs: Set<SubRow>;
		/** Brandless lane only: it holds edition credits / credits on VNs with no developer. */
		editionCredits: boolean;
		undevelopedCredits: boolean;
	}
	const laneAcc = new Map<string, LaneAcc>();
	for (const c of dated) {
		const id = c.pid ?? NONE_ID;
		let lane = laneAcc.get(id);
		if (!lane) {
			const tr = c.pid ? (trackByPid.get(c.pid) ?? candTrackByPid.get(c.pid)) : undefined;
			lane = {
				id,
				pid: c.pid,
				name: c.pid ? (tr?.name ?? c.producerName ?? c.pid) : 'No developer recorded',
				original: tr?.original ?? null,
				ownVns: new Set(),
				candVns: new Set(),
				first: null,
				last: null,
				candFirst: null,
				candLast: null,
				aliases: new Set(),
				penNames: [],
				roles: new Set(),
				subs: new Set(),
				editionCredits: false,
				undevelopedCredits: false
			};
			laneAcc.set(id, lane);
		}
		if (c.pid == null) {
			if (c.edition) lane.editionCredits = true;
			else lane.undevelopedCredits = true;
		}
		if (c.candidate) {
			lane.candVns.add(c.vid);
			lane.candFirst = lane.candFirst == null ? c.year : Math.min(lane.candFirst, c.year);
			lane.candLast = lane.candLast == null ? c.year : Math.max(lane.candLast, c.year);
			lane.subs.add('candidate');
		} else {
			lane.ownVns.add(c.vid);
			lane.first = lane.first == null ? c.year : Math.min(lane.first, c.year);
			lane.last = lane.last == null ? c.year : Math.max(lane.last, c.year);
			lane.subs.add(c.kind);
			for (const a of c.aliases) {
				if (!a.isNonPrimary) continue;
				lane.aliases.add(a.name);
				lane.penNames.push(a);
			}
			for (const r of c.roles) lane.roles.add(r);
		}
	}
	// The brandless lane says what it holds: edition credits are not "no developer".
	const brandless = laneAcc.get(NONE_ID);
	if (brandless?.editionCredits) {
		brandless.name = brandless.undevelopedCredits
			? 'Later editions / no developer recorded'
			: 'Later editions (ports, localisations)';
	}

	const sort = options.sort ?? 'first';
	const firstOf = (l: LaneAcc) => l.first ?? l.candFirst ?? 9999;
	const creditsOf = (l: LaneAcc) => l.ownVns.size + l.candVns.size;
	const tenureOf = (l: LaneAcc) => (l.first != null && l.last != null ? l.last - l.first : 0);
	const byFirst = (a: LaneAcc, b: LaneAcc) => firstOf(a) - firstOf(b) || creditsOf(b) - creditsOf(a);

	let ordered = [...laneAcc.values()];
	const totalLaneCount = ordered.length;
	let hidden: LaneAcc[] = [];
	if (ordered.length > maxLanes) {
		// Keep the busiest lanes; with an overlay, lanes both records share come first.
		const ranked = [...ordered].sort((a, b) => {
			const sa = a.ownVns.size > 0 && a.candVns.size > 0 ? 1 : 0;
			const sb = b.ownVns.size > 0 && b.candVns.size > 0 ? 1 : 0;
			return sb - sa || creditsOf(b) - creditsOf(a) || firstOf(a) - firstOf(b);
		});
		const keep = new Set(ranked.slice(0, maxLanes).map((l) => l.id));
		hidden = ordered.filter((l) => !keep.has(l.id));
		ordered = ordered.filter((l) => keep.has(l.id));
	}
	if (sort === 'credits') ordered.sort((a, b) => creditsOf(b) - creditsOf(a) || byFirst(a, b));
	else if (sort === 'tenure') ordered.sort((a, b) => tenureOf(b) - tenureOf(a) || byFirst(a, b));
	else ordered.sort(byFirst);

	// ── Alias strip (confirmed aliases, own credits only) ──
	const ownDated = dated.filter((c) => !c.candidate);
	const aliasAcc = new Map<
		string,
		{ name: string; original: string | null; first: number; last: number; count: number }
	>();
	// Every name on a credit extends that name's bar: a VN that credits the person
	// under two names counts for both, so the strip agrees with the alias list.
	for (const c of ownDated) {
		for (const al of c.aliases) {
			const k = aliasKey(al);
			const a = aliasAcc.get(k);
			if (!a) {
				aliasAcc.set(k, {
					name: al.name,
					original: al.original ?? null,
					first: c.year,
					last: c.year,
					count: 1
				});
			} else {
				a.first = Math.min(a.first, c.year);
				a.last = Math.max(a.last, c.year);
				a.count++;
			}
		}
	}
	// A romanisation carried by two names is printed with its script: `Himari (陽茉莉)`.
	const romanisedUses = new Map<string, number>();
	for (const a of aliasAcc.values()) {
		romanisedUses.set(a.name, (romanisedUses.get(a.name) ?? 0) + 1);
	}
	const aliasLabel = (k: string): string => {
		const a = aliasAcc.get(k);
		if (!a) return k.split('\0')[0];
		// Two names with one romanisation always print both forms; otherwise the
		// label follows the reader's name order like every other name on the page.
		return (romanisedUses.get(a.name) ?? 0) > 1 && a.original
			? `${a.name} (${a.original})`
			: shown(a.name, a.original);
	};
	const aliasSegments: AliasSegment[] = [];
	let aliasOverflow = 0;
	if (aliasAcc.size > 1) {
		const segs = [...aliasAcc.entries()]
			.map(([key, v]) => ({ key, alias: aliasLabel(key), first: v.first, last: v.last, count: v.count }))
			.sort((a, b) => a.first - b.first || b.count - a.count);
		// The bar spans exactly the years the name was used: it is read against the
		// year axis, so it is never stretched to hold its label. A label that does
		// not fit inside is printed beside the bar instead (to the right, or to the
		// left near the plot's right edge). Rows are packed by the bar and its label
		// together, so neither ever lands on another row item.
		const rowBoxes: Array<Array<[number, number]>> = [];
		for (const s of segs) {
			const lo = Math.max(1, Math.min(plotW - 2 - ALIAS_MIN_BAR_W, x(s.first) - yearW / 2 + 1));
			const hi = Math.min(plotW - 2, Math.max(lo + ALIAS_MIN_BAR_W, x(s.last) + yearW / 2 - 1));
			const fullLabelW = aliasLabelWidth(s.alias);
			const roomInsideBar = Math.max(0, hi - lo - 8);
			// Use the bar's own full width when the label fits inside, so wide bars never chop names needlessly.
			let labelW =
				roomInsideBar >= Math.min(fullLabelW, ALIAS_LABEL_MAX_W)
					? Math.min(fullLabelW, roomInsideBar)
					: Math.min(ALIAS_LABEL_MAX_W, fullLabelW);
			let labelSide: AliasSegment['labelSide'] = 'inside';
			let labelX = lo + 4;
			let boxLo = lo;
			let boxHi = hi;
			if (hi - lo < labelW + 8) {
				const roomRight = plotW - 2 - (hi + 4);
				const roomLeft = lo - 4 - 1;
				const roomInside = Math.max(0, hi - lo - 8);
				if (roomRight >= labelW) labelSide = 'right';
				else if (roomLeft >= labelW) labelSide = 'left';
				else {
					// No place holds the whole label (a narrow plot): the roomiest one
					// takes it, cut to fit. The bar's tooltip still has the full name.
					const best = Math.max(roomRight, roomLeft, roomInside);
					labelSide = best === roomInside ? 'inside' : best === roomRight ? 'right' : 'left';
					labelW = Math.max(0, best);
				}
				if (labelSide === 'right') {
					labelX = hi + 4;
					boxHi = hi + 4 + labelW;
				} else if (labelSide === 'left') {
					labelX = lo - 4;
					boxLo = lo - 4 - labelW;
				}
			}
			const free = (row: Array<[number, number]>) =>
				row.every(([a, b]) => boxHi + ALIAS_ROW_GAP < a || boxLo - ALIAS_ROW_GAP > b);
			let row = rowBoxes.findIndex(free);
			if (row === -1) {
				// Out of rows: counted in "+n more" rather than stacked on the last row.
				if (rowBoxes.length >= MAX_ALIAS_ROWS) {
					aliasOverflow++;
					continue;
				}
				row = rowBoxes.length;
				rowBoxes.push([]);
			}
			rowBoxes[row].push([boxLo, boxHi]);
			aliasSegments.push({
				key: s.key,
				alias: fitAliasLabel(s.alias, labelW),
				firstYear: s.first,
				lastYear: s.last,
				x1: lo,
				x2: hi,
				labelSide,
				labelX,
				labelW,
				row,
				count: s.count
			});
		}
	}
	const aliasRows = aliasSegments.length ? Math.max(...aliasSegments.map((s) => s.row)) + 1 : 0;
	const aliasStripH = aliasRows ? aliasRows * ALIAS_ROW_H + SWITCH_BAND_H : 0;
	const lanesTop = aliasStripH + AXIS_H;

	// ── Lane geometry ──
	const lanes: TimelineLane[] = [];
	let cursorY = lanesTop;
	const subOrder: SubRow[] = ['core', 'seiyuu', 'candidate'];
	const pushLane = (l: LaneAcc, aggregate: boolean) => {
		const subs = subOrder.filter((s) => l.subs.has(s));
		const h = subs.length <= 1 ? LANE_H : MULTI_PAD + SUB_H * subs.length + 6;
		const track = l.pid ? trackByPid.get(l.pid) : undefined;
		const tenureY = cursorY + h - 6;
		lanes.push({
			id: l.id,
			pid: l.pid,
			name: l.name,
			original: l.original,
			index: lanes.length,
			y: cursorY,
			h,
			vnCount: l.ownVns.size,
			candidateVnCount: l.candVns.size,
			firstYear: l.first,
			lastYear: l.last,
			aliases: [...l.aliases],
			penNames: distinctPenNames(l.penNames),
			roles: sortRoles(track?.roles?.length ? track.roles : [...l.roles]),
			subs,
			candidateOnly: l.ownVns.size === 0 && l.candVns.size > 0,
			aggregate,
			tenure:
				l.first != null && l.last != null
					? { x1: x(l.first) - MARK / 2, x2: x(l.last) + MARK / 2, y: tenureY }
					: null,
			candidateTenure:
				l.candFirst != null && l.candLast != null
					? { x1: x(l.candFirst) - MARK / 2, x2: x(l.candLast) + MARK / 2, y: tenureY }
					: null
		});
		cursorY += h;
	};
	for (const l of ordered) pushLane(l, false);

	let otherLane: LaneAcc | null = null;
	if (hidden.length) {
		otherLane = {
			id: OTHER_ID,
			pid: null,
			name: `Other brands (${hidden.length})`,
			original: null,
			ownVns: new Set(hidden.flatMap((l) => [...l.ownVns])),
			candVns: new Set(hidden.flatMap((l) => [...l.candVns])),
			first: hidden.reduce<number | null>(
				(m, l) => (l.first == null ? m : m == null ? l.first : Math.min(m, l.first)),
				null
			),
			last: hidden.reduce<number | null>(
				(m, l) => (l.last == null ? m : m == null ? l.last : Math.max(m, l.last)),
				null
			),
			candFirst: null,
			candLast: null,
			aliases: new Set(),
			penNames: [],
			roles: new Set(),
			subs: new Set<SubRow>(hidden.flatMap((l) => [...l.subs])),
			editionCredits: false,
			undevelopedCredits: false
		};
		pushLane(otherLane, true);
	}
	const hiddenIds = new Set(hidden.map((l) => l.id));
	const laneById = new Map(lanes.map((l) => [l.id, l]));

	// ── Cells and marks ──
	const cellAcc = new Map<string, TimelineCell>();
	for (const c of dated) {
		const rawId = c.pid ?? NONE_ID;
		const laneId = hiddenIds.has(rawId) ? OTHER_ID : rawId;
		const lane = laneById.get(laneId);
		if (!lane) continue;
		const sub: SubRow = c.candidate ? 'candidate' : c.kind;
		const key = `${laneId}|${sub}|${c.year}`;
		let cell = cellAcc.get(key);
		if (!cell) {
			const multi = lane.subs.length > 1;
			const subIndex = Math.max(0, lane.subs.indexOf(sub));
			cell = {
				key,
				laneId,
				laneIndex: lane.index,
				sub,
				year: c.year,
				cx: x(c.year),
				y: multi ? lane.y + MULTI_PAD / 2 + subIndex * SUB_H : lane.y,
				h: multi ? SUB_H : lane.h,
				credits: [],
				marks: [],
				tile: null
			};
			cellAcc.set(key, cell);
		}
		cell.credits.push(c);
	}
	const cells = [...cellAcc.values()].sort(
		(a, b) => a.year - b.year || a.laneIndex - b.laneIndex || a.y - b.y
	);
	for (const cell of cells) {
		const lane = laneById.get(cell.laneId)!;
		const multi = lane.subs.length > 1;
		const rows = multi || lane.aggregate ? 1 : 2;
		cell.credits.sort((a, b) => a.title.localeCompare(b.title));
		const n = cell.credits.length;
		if (multi || lane.aggregate) {
			const cy = cell.y + cell.h / 2 - (multi ? 0 : 3);
			if (n === 1 && !lane.aggregate) cell.marks.push({ credit: cell.credits[0], cx: cell.cx, cy });
			else cell.tile = { cx: cell.cx, cy, count: n };
		} else {
			const bottom = lane.y + lane.h - 12 - MARK / 2; // sits above the tenure track
			const drawn = n <= rows ? n : rows - 1;
			for (let i = 0; i < drawn; i++) {
				cell.marks.push({ credit: cell.credits[i], cx: cell.cx, cy: bottom - i * STACK });
			}
			if (n > rows) {
				cell.tile = { cx: cell.cx, cy: bottom - drawn * STACK, count: n - drawn };
			}
		}
	}

	// Years with a credit in a lane of its own (the "Other brands" lane is a summary).
	const laneYears = new Set<number>();
	for (const cell of cells) {
		if (!laneById.get(cell.laneId)?.aggregate && cell.sub !== 'candidate') laneYears.add(cell.year);
	}

	// ── Name switches (own credits, chronological) ──
	const switches: SwitchMarker[] = [];
	if (aliasAcc.size > 1) {
		const chron = [...ownDated].sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
		// One representative credit per year: the alias used most that year.
		const byYear = new Map<number, Credit[]>();
		for (const c of chron) {
			if (!byYear.has(c.year)) byYear.set(c.year, []);
			byYear.get(c.year)!.push(c);
		}
		let prev: { alias: string; credit: Credit } | null = null;
		for (const [year, list] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
			const tally = new Map<string, number>();
			for (const c of list) {
				for (const al of c.aliases) tally.set(aliasKey(al), (tally.get(aliasKey(al)) ?? 0) + 1);
			}
			const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
			const rep = list.find((c) => c.aliases.some((a) => aliasKey(a) === top))!;
			if (prev && prev.alias !== top) {
				switches.push({
					year,
					x: x(year),
					from: aliasLabel(prev.alias),
					to: aliasLabel(top),
					withBrandChange: prev.credit.pid !== rep.pid,
					fromBrand: prev.credit.producerName,
					toBrand: rep.producerName,
					inLanes: laneYears.has(year)
				});
			}
			prev = { alias: top, credit: rep };
		}
	}

	// ── Transition connectors (computed strictly from currently visible lanes) ──
	// Default: ONLY true non-overlapping studio handoffs (person finishes at A and
	// starts at B within ≤ 2 years). Concurrent freelance gigs never draw fan-out
	// arrows unless the reader explicitly checks "Show all hops", which draws a
	// single clean chronological chain across visible lanes.
	const connectors: Connector[] = [];
	const yearsByBrand = creditYearsByBrand(events);
	const visibleBrands = lanes.filter(
		(l): l is TimelineLane & { pid: string; firstYear: number; lastYear: number } =>
			!l.aggregate && !l.candidateOnly && l.pid != null && l.firstYear != null && l.lastYear != null
	);
	const aliasAtBrand = (pid: string, year: number | null): string | null => {
		const atBrand = ownDated.filter((c) => c.pid === pid);
		if (!atBrand.length) return null;
		const exact = year != null ? atBrand.filter((c) => c.year === year) : [];
		const pool = exact.length ? exact : atBrand;
		const tally = new Map<string, number>();
		for (const c of pool) {
			for (const al of c.aliases) tally.set(aliasKey(al), (tally.get(aliasKey(al)) ?? 0) + 1);
		}
		const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
		return top ? aliasLabel(top) : null;
	};
	const loopsAtYear = new Map<number, number>();
	const pushConnector = (
		from: TimelineLane & { pid: string; firstYear: number; lastYear: number },
		to: TimelineLane & { pid: string; firstYear: number; lastYear: number },
		anchorYear: number,
		isHandoff: boolean
	) => {
		const y1 = from.y + from.h / 2;
		const y2 = to.y + to.h / 2;
		let x1: number;
		let x2: number;
		let path: string;
		let arrow: string;
		let midX: number;
		if (anchorYear < to.firstYear) {
			x1 = x(anchorYear) + MARK / 2 + 1;
			x2 = Math.max(x1 + 2, x(to.firstYear) - MARK / 2 - 3);
			const bow = (x2 - x1) / 2;
			path = `M${x1.toFixed(1)},${y1.toFixed(1)} C${(x1 + bow).toFixed(1)},${y1.toFixed(1)} ${(x2 - bow).toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
			arrow = `M${(x2 - 5).toFixed(1)},${(y2 - 3.5).toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)} L${(x2 - 5).toFixed(1)},${(y2 + 3.5).toFixed(1)}`;
			midX = (x1 + x2) / 2;
		} else {
			const nth = loopsAtYear.get(anchorYear) ?? 0;
			loopsAtYear.set(anchorYear, nth + 1);
			x1 = x(anchorYear) + MARK / 2 + 1;
			x2 = x1 + 2;
			const out = x1 + 14 + nth * LOOP_STAGGER;
			midX = x1 + 10.5 + nth * LOOP_STAGGER * 0.75;
			path = `M${x1.toFixed(1)},${y1.toFixed(1)} C${out.toFixed(1)},${y1.toFixed(1)} ${out.toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
			arrow = `M${(x2 + 5).toFixed(1)},${(y2 - 3.5).toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)} L${(x2 + 5).toFixed(1)},${(y2 + 3.5).toFixed(1)}`;
		}
		const aliasFrom = aliasAtBrand(from.pid, anchorYear);
		const aliasTo = aliasAtBrand(to.pid, to.firstYear);
		const aliasChanged = !!(aliasFrom && aliasTo && aliasFrom !== aliasTo);
		connectors.push({
			key: `${from.pid}>${to.pid}`,
			path,
			arrow,
			fromLane: from.id,
			toLane: to.id,
			fromName: from.name,
			toName: to.name,
			fromOriginal: from.original ?? null,
			toOriginal: to.original ?? null,
			fromYear: anchorYear,
			toYear: to.firstYear,
			gapYears: to.firstYear - anchorYear,
			aliasChanged,
			aliasFrom: aliasChanged ? aliasFrom : null,
			aliasTo: aliasChanged ? aliasTo : null,
			first: isHandoff,
			mid: { x: midX, y: (y1 + y2) / 2 }
		});
	};

	if (options.showAllTransitions) {
		// Opt-in: single clean chronological chain across visible lanes.
		const chron = [...visibleBrands].sort(
			(a, b) => a.firstYear - b.firstYear || a.lastYear - b.lastYear || b.vnCount - a.vnCount || a.id.localeCompare(b.id)
		);
		for (let i = 1; i < chron.length; i++) {
			const from = chron[i - 1];
			const to = chron[i];
			let anchor = from.firstYear;
			for (const yr of yearsByBrand.get(from.pid) ?? []) {
				if (yr <= to.firstYear) anchor = yr;
				else break;
			}
			const cleanHandoff =
				from.lastYear < to.firstYear ||
				(from.lastYear === to.firstYear && from.firstYear < to.firstYear && to.lastYear > to.firstYear);
			pushConnector(from, to, anchor, cleanHandoff);
		}
	} else {
		// Default: clean non-overlapping studio handoffs only (gap 0–2y, no ongoing overlap).
		// Suppress one-off guest-gig chains that happen entirely inside a larger concurrent home studio's tenure
		// (e.g. Maeda Jun doing 1-off music credits at Shoujobyou/Marron/RAM/Frontwing while primarily at Key 1999–2018).
		const isSideGigInsideHome = (
			from: TimelineLane & { firstYear: number; lastYear: number },
			to: TimelineLane & { firstYear: number; lastYear: number }
		) =>
			visibleBrands.some(
				(home) =>
					home.id !== from.id &&
					home.id !== to.id &&
					home.vnCount >= 3 &&
					home.vnCount > Math.max(from.vnCount, to.vnCount) &&
					home.firstYear <= from.firstYear &&
					home.lastYear >= to.lastYear
			);
		const isCleanHandoff = (
			from: TimelineLane & { firstYear: number; lastYear: number },
			to: TimelineLane & { firstYear: number; lastYear: number }
		) => {
			if (from.id === to.id) return false;
			if (from.vnCount < 2 && to.vnCount < 2) return false;
			const gap = to.firstYear - from.lastYear;
			if (gap < 0 || gap > 2) return false;
			// Strict non-overlap, or a crisp single-year handoff where `from` ends and `to` continues.
			if (gap === 0 && !(from.firstYear < to.firstYear && to.lastYear > to.firstYear)) return false;
			if (isSideGigInsideHome(from, to)) return false;
			return true;
		};
		// Also skip drawing handoff arrows if the source already handed off cleanly to an earlier/bigger studio,
		// preventing arbitrary fan-outs from a short 1-year studio into 3 later ones.
		const handoffCandidates: Array<{
			from: TimelineLane & { pid: string; firstYear: number; lastYear: number };
			to: TimelineLane & { pid: string; firstYear: number; lastYear: number };
			gap: number;
		}> = [];
		for (const to of visibleBrands) {
			let bestFrom: (TimelineLane & { pid: string; firstYear: number; lastYear: number }) | null = null;
			for (const from of visibleBrands) {
				if (!isCleanHandoff(from, to)) continue;
				if (
					!bestFrom ||
					from.lastYear > bestFrom.lastYear ||
					(from.lastYear === bestFrom.lastYear &&
						(from.vnCount > bestFrom.vnCount ||
							(from.vnCount === bestFrom.vnCount && from.id.localeCompare(bestFrom.id) < 0)))
				) {
					bestFrom = from;
				}
			}
			if (bestFrom) handoffCandidates.push({ from: bestFrom, to, gap: to.firstYear - bestFrom.lastYear });
		}
		// Keep at most 1 outgoing clean handoff per source (earliest / largest destination) so arrows never fan out.
		handoffCandidates.sort(
			(a, b) => a.gap - b.gap || b.to.vnCount - a.to.vnCount || a.to.firstYear - b.to.firstYear || a.to.id.localeCompare(b.to.id)
		);
		const usedSources = new Set<string>();
		for (const cand of handoffCandidates) {
			if (usedSources.has(cand.from.id)) continue;
			usedSources.add(cand.from.id);
			pushConnector(cand.from, cand.to, cand.from.lastYear, true);
		}
	}
	void transitions;

	// ── Axis ticks ──
	const step = tickStep(yearW);
	const ticks: TimelineLayout['ticks'] = [];
	for (let y = minYear; y <= maxYear; y++) {
		ticks.push({ year: y, x: x(y), major: y % 10 === 0, label: y % step === 0 });
	}

	// A tall chart repeats its year labels under the last lane, so the bottom
	// lanes can be read without scrolling back up to the axis.
	const bottomAxisH = lanes.length > BOTTOM_AXIS_MIN_LANES ? AXIS_H - 4 : 0;

	return {
		minYear,
		maxYear,
		yearW,
		plotW,
		plotH: cursorY + 4 + bottomAxisH,
		lanesTop,
		aliasStripH,
		axisH: AXIS_H,
		ticks,
		lanes,
		cells,
		aliasSegments,
		aliasOverflow,
		bottomAxisH,
		lanesBottom: cursorY,
		switches,
		connectors,
		undated,
		hiddenLaneCount: hidden.length,
		totalLaneCount,
		x
	};
}

/** Look up the primary alias used at `fromPid` (around `fromYear`) and `toPid` (around `toYear`). */
export function transitionAliasPair(
	events: readonly StaffTimelineEvent[],
	fromPid: string,
	fromYear: number | null,
	toPid: string,
	toYear: number | null,
	shown: (name: string, original?: string | null) => string = (n) => n
): { from: string; to: string } | null {
	const credits = eventsToCredits(events, false);
	const allKeys = new Map<string, { name: string; original: string | null }>();
	for (const c of credits) {
		for (const al of c.aliases) {
			const k = aliasKey(al);
			if (!allKeys.has(k)) allKeys.set(k, { name: al.name, original: al.original ?? null });
		}
	}
	const romUses = new Map<string, number>();
	for (const a of allKeys.values()) romUses.set(a.name, (romUses.get(a.name) ?? 0) + 1);
	const fmt = (k: string) => {
		const a = allKeys.get(k);
		if (!a) return k.split('\0')[0];
		return (romUses.get(a.name) ?? 0) > 1 && a.original ? `${a.name} (${a.original})` : shown(a.name, a.original);
	};
	const pick = (pid: string, yr: number | null) => {
		const atBrand = credits.filter((c) => c.pid === pid);
		if (!atBrand.length) return null;
		const exact = yr != null ? atBrand.filter((c) => c.year === yr) : [];
		const pool = exact.length ? exact : atBrand;
		const tally = new Map<string, number>();
		for (const c of pool) {
			for (const al of c.aliases) tally.set(aliasKey(al), (tally.get(aliasKey(al)) ?? 0) + 1);
		}
		const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
		return top ? fmt(top) : null;
	};
	const a = pick(fromPid, fromYear);
	const b = pick(toPid, toYear);
	if (!a || !b) return null;
	return { from: a, to: b };
}

/** Neighbouring cell for arrow-key navigation inside the plot. */
export function stepCell(
	cells: readonly TimelineCell[],
	currentKey: string | null,
	dir: 'left' | 'right' | 'up' | 'down' | 'home' | 'end'
): TimelineCell | null {
	if (!cells.length) return null;
	const idx = currentKey ? cells.findIndex((c) => c.key === currentKey) : -1;
	if (dir === 'home') return cells[0];
	if (dir === 'end') return cells[cells.length - 1];
	if (idx === -1) return cells[0];
	if (dir === 'left') return cells[Math.max(0, idx - 1)];
	if (dir === 'right') return cells[Math.min(cells.length - 1, idx + 1)];
	const cur = cells[idx];
	const want = dir === 'up' ? -1 : 1;
	let best: TimelineCell | null = null;
	let bestScore = Infinity;
	for (const c of cells) {
		const dy = c.y - cur.y;
		if (want < 0 ? dy >= 0 : dy <= 0) continue;
		const score = Math.abs(dy) * 4 + Math.abs(c.year - cur.year) * 10;
		if (score < bestScore) {
			bestScore = score;
			best = c;
		}
	}
	return best ?? cur;
}

/** Years with a dated credit, per brand, ascending. */
export function creditYearsByBrand(
	events: readonly StaffTimelineEvent[]
): Map<string, number[]> {
	const acc = new Map<string, Set<number>>();
	for (const ev of events) {
		if (ev.pid == null || ev.year == null) continue;
		if (!acc.has(ev.pid)) acc.set(ev.pid, new Set());
		acc.get(ev.pid)!.add(ev.year);
	}
	return new Map([...acc].map(([pid, years]) => [pid, [...years].sort((a, b) => a - b)]));
}

export interface ResolvedMove {
	/** Last year at the source brand that is not after the first year at the destination. */
	anchorYear: number;
	/** The one move shown by default into its destination brand. */
	primary: boolean;
}

/**
 * Resolve every recorded transition to a forward-running move, and pick one
 * primary move per destination: the source the person was most recently
 * credited at before arriving. Transitions that could only run backwards in
 * time (the source brand starts after the destination) are dropped.
 */
export function primaryMoves(
	transitions: readonly StaffTransition[],
	yearsByBrand: ReadonlyMap<string, readonly number[]>
): Map<StaffTransition, ResolvedMove> {
	const out = new Map<StaffTransition, ResolvedMove>();
	const best = new Map<string, StaffTransition>();
	const sequential = (t: StaffTransition) =>
		t.fromLastYear != null && t.toFirstYear != null && t.fromLastYear <= t.toFirstYear;
	for (const t of transitions) {
		if (t.toFirstYear == null) continue;
		let anchor: number | null = null;
		for (const y of yearsByBrand.get(t.fromPid) ?? []) {
			if (y <= t.toFirstYear) anchor = y;
			else break;
		}
		if (anchor == null && t.fromFirstYear != null && t.fromFirstYear <= t.toFirstYear) {
			anchor = t.fromFirstYear;
		}
		if (anchor == null) continue;
		out.set(t, { anchorYear: anchor, primary: false });
		const cur = best.get(t.toPid);
		const curAnchor = cur ? out.get(cur)!.anchorYear : -Infinity;
		if (
			!cur ||
			anchor > curAnchor ||
			(anchor === curAnchor &&
				(Number(sequential(t)) > Number(sequential(cur)) ||
					(sequential(t) === sequential(cur) && t.fromPid.localeCompare(cur.fromPid) < 0)))
		) {
			best.set(t.toPid, t);
		}
	}
	for (const t of best.values()) out.get(t)!.primary = true;
	return out;
}

/** Stint rows for the table twin and the narrow-screen list. */
export interface Stint {
	/** Row key: candidate stints never share one with the person's own. */
	key: string;
	pid: string;
	name: string;
	original: string | null;
	firstYear: number | null;
	lastYear: number | null;
	vnCount: number;
	coreVnCount: number;
	seiyuuVnCount: number;
	roles: string[];
	aliases: string[];
	/** Names other than the primary one used here, decided by VNDB alias id. */
	penNames: string[];
	usedNonPrimaryAlias: boolean;
	/** True for a stint of the overlaid candidate record: a separate `staff.id`. */
	candidate: boolean;
	/** Move that led here, if one is recorded. */
	arrivedFrom: {
		name: string;
		original: string | null;
		year: number | null;
		gapYears: number | null;
		aliasChanged: boolean;
	} | null;
}

/**
 * The person's stints in order of first credit. With an overlay, the candidate
 * record's stints are interleaved by year as their own flagged rows, so the
 * table and the narrow-screen list show the same comparison the chart does.
 */
export function buildStints(
	tracks: readonly StaffBrandTrack[],
	transitions: readonly StaffTransition[],
	events: readonly StaffTimelineEvent[] = [],
	overlay: { tracks: readonly StaffBrandTrack[] } | null = null
): Stint[] {
	const moves = primaryMoves(transitions, creditYearsByBrand(events));
	const into = new Map<string, { t: StaffTransition; move: ResolvedMove }>();
	for (const [t, move] of moves) if (move.primary) into.set(t.toPid, { t, move });

	const toStint = (t: StaffBrandTrack, candidate: boolean): Stint => {
		const arrival = candidate ? undefined : into.get(t.pid);
		return {
			key: `${candidate ? 'c' : 'p'}|${t.pid}`,
			pid: t.pid,
			name: t.name,
			original: t.original ?? null,
			firstYear: t.firstYear,
			lastYear: t.lastYear,
			vnCount: t.vnCount,
			coreVnCount: t.coreVnCount,
			seiyuuVnCount: t.seiyuuVnCount,
			roles: sortRoles(t.roles),
			aliases: t.aliasesUsed,
			penNames: t.penNames ?? [],
			usedNonPrimaryAlias: t.usedNonPrimaryAlias,
			candidate,
			arrivedFrom: arrival
				? {
						name: arrival.t.fromName,
						original: arrival.t.fromOriginal ?? null,
						year: arrival.t.toFirstYear,
						gapYears:
							arrival.t.toFirstYear != null
								? arrival.t.toFirstYear - arrival.move.anchorYear
								: arrival.t.gapYears,
						aliasChanged: arrival.t.aliasChanged
					}
				: null
		};
	};

	return [
		...tracks.map((t) => toStint(t, false)),
		...(overlay?.tracks ?? []).map((t) => toStint(t, true))
	].sort(
		(a, b) =>
			(a.firstYear ?? 9999) - (b.firstYear ?? 9999) ||
			Number(a.candidate) - Number(b.candidate) ||
			b.vnCount - a.vnCount ||
			a.pid.localeCompare(b.pid)
	);
}
