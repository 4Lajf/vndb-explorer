/**
 * Relation vocabulary shared by badges, the graph, the verdict card and tables.
 *
 * Explicit direction (verified against live VNDB data): for a row
 * `producers_relations(id, pid, relation)` the code describes what `pid` is
 * to `id` — e.g. `p10 Palette --[imp]--> p6288 Palette darkside` means
 * "Palette darkside is an imprint of Palette". So in every list keyed on a
 * focus brand, the code states the *target's* role relative to the focus.
 */
import type {
	ConfidenceTier,
	ExplicitRelationCode,
	InferredBrandLink,
	InferredBrandType
} from './types.ts';

export type RelationKind = 'ownership' | 'sister' | 'lineage' | 'partner';
export type Register = 'confirmed' | 'inferred';
export type Sector = 'N' | 'S' | 'W' | 'E' | 'NW' | 'NE' | 'SW' | 'SE';

export const KIND_COLOR: Record<RelationKind, string> = {
	ownership: 'var(--rel-ownership)',
	sister: 'var(--rel-sister)',
	lineage: 'var(--rel-lineage)',
	partner: 'var(--rel-partner)'
};

export const KIND_LABEL: Record<RelationKind, string> = {
	ownership: 'Ownership',
	sister: 'Sister',
	lineage: 'Lineage',
	partner: 'Partner'
};

/** What each relation kind covers across both registers, for the Kind filter chips. */
export const KIND_MEANING: Record<RelationKind, string> = {
	ownership: 'Parents, subsidiaries, imprints & sub-brands',
	sister: 'Peer brands sharing core staff (inferred)',
	lineage: 'Renames, branches & successors',
	partner: 'Co-dev or collaborating studios (inferred)'
};

export interface ExplicitMeta {
	kind: 'ownership' | 'lineage';
	/** Mid-edge tag: one plain English word, never an abbreviation. */
	code: string;
	/** What the target is, relative to the focus. */
	label: string;
	/** Plain-English definition of the term, for tooltips and the Key. */
	meaning: string;
	/** Leading direction glyph. */
	arrow: '↑' | '↓' | '←' | '→';
	sector: 'N' | 'S' | 'W' | 'E';
	/** Group heading on the explicit tab. */
	group: string;
	/** True when the target sits "after/below" the focus (arrowhead points at the target). */
	targetIsHead: boolean;
	/** Upright, declarative sentence: `target` relative to `focus`. */
	sentence: (target: string, focus: string) => string;
}

function endSentence(text: string): string {
	return text.endsWith('.') ? text : `${text}.`;
}

export const EXPLICIT_META: Record<ExplicitRelationCode, ExplicitMeta> = {
	par: {
		kind: 'ownership',
		code: 'Parent',
		label: 'Parent company',
		meaning: 'Parent company owning this studio',
		arrow: '↑',
		sector: 'N',
		group: 'Owned by / parent of this brand',
		targetIsHead: false,
		sentence: (t, f) => endSentence(`${t} is the parent company of ${f}`)
	},
	ipa: {
		kind: 'ownership',
		code: 'Parent brand',
		label: 'Parent brand',
		meaning: 'Parent company or brand owning this imprint',
		arrow: '↑',
		sector: 'N',
		group: 'Owned by / parent of this brand',
		targetIsHead: false,
		sentence: (t, f) => endSentence(`${f} is an imprint of ${t}`)
	},
	sub: {
		kind: 'ownership',
		code: 'Subsidiary',
		label: 'Subsidiary',
		meaning: 'Child company owned by its parent',
		arrow: '↓',
		sector: 'S',
		group: 'Owns / imprints of this brand',
		targetIsHead: true,
		sentence: (t, f) => endSentence(`${t} is a subsidiary of ${f}`)
	},
	imp: {
		kind: 'ownership',
		code: 'Imprint',
		label: 'Imprint',
		meaning: 'Brand label owned by its parent',
		arrow: '↓',
		sector: 'S',
		group: 'Owns / imprints of this brand',
		targetIsHead: true,
		sentence: (t, f) => endSentence(`${t} is an imprint of ${f}`)
	},
	old: {
		kind: 'lineage',
		code: 'Formerly',
		label: 'Formerly',
		meaning: 'Same studio under its earlier name',
		arrow: '←',
		sector: 'W',
		group: 'Renamed',
		targetIsHead: false,
		sentence: (t, f) => endSentence(`${f} was formerly known as ${t}`)
	},
	new: {
		kind: 'lineage',
		code: 'Renamed to',
		label: 'Renamed to',
		meaning: 'Same studio continuing under its later name',
		arrow: '→',
		sector: 'E',
		group: 'Renamed',
		targetIsHead: true,
		sentence: (t, f) => endSentence(`${f} is now known as ${t}`)
	},
	ori: {
		kind: 'lineage',
		code: 'Origin',
		label: 'Originated from',
		meaning: 'Earlier studio this one branched from',
		arrow: '←',
		sector: 'W',
		group: 'Lineage & branches',
		targetIsHead: false,
		sentence: (t, f) => endSentence(`${f} originated from ${t}`)
	},
	spa: {
		kind: 'lineage',
		code: 'Branched to',
		label: 'Branched into',
		meaning: 'Later studio founded by staff from this one',
		arrow: '→',
		sector: 'E',
		group: 'Lineage & branches',
		targetIsHead: true,
		sentence: (t, f) => endSentence(`${t} originated from ${f}`)
	}
};

/** Fixed order for the explicit tab: ownership up, ownership down, renames, lineage. */
export const EXPLICIT_ORDER: ExplicitRelationCode[] = [
	'par',
	'ipa',
	'sub',
	'imp',
	'old',
	'new',
	'ori',
	'spa'
];

const EXPLICIT_INVERSE: Record<ExplicitRelationCode, ExplicitRelationCode> = {
	par: 'sub',
	sub: 'par',
	ipa: 'imp',
	imp: 'ipa',
	old: 'new',
	new: 'old',
	ori: 'spa',
	spa: 'ori'
};

/**
 * The same VNDB relation read from the other end: if B is A's subsidiary,
 * A is B's parent. `InferredBrandLink.explicitRelation` is stored as B's role
 * relative to A, so it must be inverted whenever the focus brand is B.
 */
export function invertExplicit(code: ExplicitRelationCode): ExplicitRelationCode {
	return EXPLICIT_INVERSE[code];
}

/** A link's VNDB relation as the *other* brand's role relative to `focusId`. */
export function explicitForFocus(
	link: Pick<InferredBrandLink, 'pidA' | 'pidB' | 'explicitRelation'>,
	focusId: string
): ExplicitRelationCode | null {
	if (!link.explicitRelation) return null;
	return focusId === link.pidB ? invertExplicit(link.explicitRelation) : link.explicitRelation;
}

export function isRename(code: ExplicitRelationCode | null | undefined): boolean {
	return code === 'old' || code === 'new';
}

/** Tooltip for a VNDB relation badge: crisp plain meaning. */
export function explicitTitle(code: ExplicitRelationCode): string {
	return `VNDB: ${EXPLICIT_META[code].meaning}`;
}

/** What a "2-hop" VNDB status means. */
export const TWO_HOP_MEANING = 'Connected via 1 shared studio in VNDB';

/** What "unlinked" means in the VNDB status column. */
export const UNLINKED_MEANING = 'No VNDB path between these studios';

export interface InferredMeta {
	kind: RelationKind;
	/** Mid-edge tag, spelled out. Always ends in `?`: an inference never reads as a statement. */
	code: string;
	label: string;
	short: string;
	/** Plain word for filters and legends, where the surrounding UI already says "inferred". */
	word: string;
	/** Tailwind-safe token name for the class hue. */
	color: string;
	/** Plain-English definition of the class, for tooltips and the Key. */
	meaning: string;
	/** What the arrowhead points at, for the two directed classes. */
	arrowNote?: string;
}

export const INFERRED_META: Record<InferredBrandType, InferredMeta> = {
	subbrand: {
		kind: 'ownership',
		code: 'Sub-brand?',
		label: 'Sub-brand?',
		short: 'Sub-brand?',
		word: 'Sub-brand',
		color: KIND_COLOR.ownership,
		meaning: 'Smaller label likely inside a larger studio',
		arrowNote: '→ sub-brand'
	},
	sister: {
		kind: 'sister',
		code: 'Sister?',
		label: 'Sister brand?',
		short: 'Sister?',
		word: 'Sister',
		color: KIND_COLOR.sister,
		meaning: 'Concurrent peer brands sharing core staff'
	},
	successor: {
		kind: 'lineage',
		code: 'Successor?',
		label: 'Successor?',
		short: 'Successor?',
		word: 'Successor',
		color: KIND_COLOR.lineage,
		meaning: 'Core staff moved earlier → later studio',
		arrowNote: '→ successor'
	},
	partner: {
		kind: 'partner',
		code: 'Partner?',
		label: 'Co-dev partner?',
		short: 'Partner?',
		word: 'Partner',
		color: KIND_COLOR.partner,
		meaning: 'Separate studios sharing titles or staff'
	}
};

export const INFERRED_TYPES: InferredBrandType[] = ['subbrand', 'sister', 'successor', 'partner'];

/** What a dotted, seiyuu-driven link is. */
export const SEIYUU_DRIVEN_MEANING = 'voice-cast only';

/**
 * The class label for one link. The classifier calls a pair partners on joint
 * titles, with one exception: two brands VNDB places under different owners,
 * which it will not call sisters or parent and imprint. Those can have no joint
 * title at all, and "co-dev" on a pair with no co-developed VN would be false.
 */
export function inferredLabel(link: {
	inferredType: InferredBrandType;
	coDevVns?: number | null;
}): string {
	if (link.inferredType === 'partner' && (link.coDevVns ?? 0) === 0) return 'Partner studio?';
	return INFERRED_META[link.inferredType].label;
}

/**
 * The class label where no single link is meant (filter chips, legends, the
 * Key): a partner pair carries either of two labels, so both are named.
 */
export function inferredClassLabel(type: InferredBrandType): string {
	return type === 'partner' ? 'Co-dev partner / Partner studio?' : INFERRED_META[type].label;
}

/**
 * The class definition for one link.
 */
export function inferredMeaning(link: {
	inferredType: InferredBrandType;
	coDevVns?: number | null;
}): string {
	if (link.inferredType === 'partner' && link.coDevVns != null) {
		return link.coDevVns === 0
			? 'Separate studios sharing staff or series'
			: 'Separate studios co-developing titles together';
	}
	return INFERRED_META[link.inferredType].meaning;
}

/**
 * Tooltip for an inferred class badge: single scannable phrase (<=12 words).
 */
export function inferredTitle(
	link: { inferredType: InferredBrandType; coDevVns?: number | null },
	opts: { arrow?: boolean; seiyuuDriven?: boolean | null } = {}
): string {
	const meta = INFERRED_META[link.inferredType];
	const extras = [
		opts.arrow && meta.arrowNote ? meta.arrowNote : '',
		opts.seiyuuDriven ? SEIYUU_DRIVEN_MEANING : ''
	].filter(Boolean);
	return extras.length ? `${inferredMeaning(link)} (${extras.join(', ')})` : inferredMeaning(link);
}

/** Confidence arrives as 0..1 from the classifier; the UI speaks 0–100. */
export function toScore(confidence: number | null | undefined): number {
	if (confidence == null || Number.isNaN(confidence)) return 0;
	const v = confidence <= 1 ? confidence * 100 : confidence;
	return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * Tier floors on the 0..1 classifier scale. The one definition: `build-db.ts`
 * stores tiers with it and the meter falls back to it, so a score can never be
 * "High" in one place and "Medium" in another.
 */
export const CONFIDENCE_TIER_MIN = { high: 0.72, medium: 0.48 } as const;

export function tierForConfidence(confidence: number): ConfidenceTier {
	if (confidence >= CONFIDENCE_TIER_MIN.high) return 'high';
	if (confidence >= CONFIDENCE_TIER_MIN.medium) return 'medium';
	return 'speculative';
}

export function tierLabel(tier: ConfidenceTier): string {
	return tier === 'high' ? 'High' : tier === 'medium' ? 'Medium' : 'Speculative';
}

/** A tier's score range on the 0–100 scale the UI speaks: `≥ 72`, `48–71`, `< 48`. */
export function tierRange(tier: ConfidenceTier): string {
	const high = Math.round(CONFIDENCE_TIER_MIN.high * 100);
	const medium = Math.round(CONFIDENCE_TIER_MIN.medium * 100);
	return tier === 'high' ? `≥ ${high}` : tier === 'medium' ? `${medium}–${high - 1}` : `< ${medium}`;
}

/** The whole scale in one line, for tooltips: `High ≥ 72, Medium 48–71, Speculative < 48`. */
export const TIER_SCALE = (['high', 'medium', 'speculative'] as const)
	.map((t) => `${tierLabel(t)} ${tierRange(t)}`)
	.join(', ');

/** Confidence column/filter tooltip shared across Discover, Graph and Brand pages. */
export const CONFIDENCE_HINT = TIER_SCALE;

/** Hedge by tier (DESIGN §11): High → Likely, Medium → Possibly, Speculative → Weak signal. */
export function tierHedge(tier: ConfidenceTier): string {
	return tier === 'high' ? 'Likely' : tier === 'medium' ? 'Possibly' : 'Weak signal:';
}

export const TIER_COLOR: Record<ConfidenceTier, string> = {
	high: 'var(--alias-high)',
	medium: 'var(--alias-medium)',
	speculative: 'var(--alias-speculative)'
};

/**
 * Orientation of an inferred link.
 *  - subbrand: `a_to_b` means A is the child, B the parent (child → parent).
 *  - successor: `a_to_b` means A came first, B is the successor.
 * `head` is the node an arrowhead points at (the child, or the successor).
 */
export interface InferredOrientation {
	/** Parent (subbrand) or predecessor (successor). Null for symmetric kinds. */
	tail: 'A' | 'B' | null;
	/** Child (subbrand) or successor (successor). Null for symmetric kinds. */
	head: 'A' | 'B' | null;
}

export function inferredOrientation(
	type: InferredBrandType,
	direction: InferredBrandLink['direction'] | undefined
): InferredOrientation {
	if (type === 'subbrand') {
		// child → parent: for a_to_b the child is A.
		if (direction === 'b_to_a') return { tail: 'A', head: 'B' };
		return { tail: 'B', head: 'A' };
	}
	if (type === 'successor') {
		if (direction === 'b_to_a') return { tail: 'B', head: 'A' };
		return { tail: 'A', head: 'B' };
	}
	return { tail: null, head: null };
}

/** Compass sector of `other` around `focus` for an inferred link. */
export function inferredSector(link: {
	inferredType: InferredBrandType;
	direction?: InferredBrandLink['direction'];
	focusIsA: boolean;
}): 'N' | 'S' | 'W' | 'E' | 'sister' | 'partner' {
	const { tail, head } = inferredOrientation(link.inferredType, link.direction);
	const focus = link.focusIsA ? 'A' : 'B';
	if (link.inferredType === 'subbrand') return head === focus ? 'N' : 'S';
	if (link.inferredType === 'successor') return head === focus ? 'W' : 'E';
	void tail;
	return link.inferredType === 'sister' ? 'sister' : 'partner';
}

function lower(s: string): string {
	return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * A full hedged sentence with an explicit subject, by tier (DESIGN §11):
 * "Key is likely …", "Key is possibly …", "Weak signal: Key may be …".
 */
function hedged(tier: ConfidenceTier, subject: string, predicate: string, plural = false): string {
	if (tier === 'speculative') return endSentence(`Weak signal: ${subject} may be ${predicate}`);
	return endSentence(`${subject} ${plural ? 'are' : 'is'} ${lower(tierHedge(tier))} ${predicate}`);
}

/**
 * The two brand names of a link as they should be printed, keyed to the link's
 * own A and B. Pages pass the reader's name order (romanised or original
 * script) through this; without it the romanised names are used.
 */
export interface PairNames {
	a: string;
	b: string;
}

/**
 * Hedged verdict for an inferred link. Never states identity as fact: the
 * sentence always carries the tier's hedge and is rendered italic. It always
 * names both brands, so it reads the same on a card headed by either of them.
 * With `focusId` that brand is the subject; without it, the child or the
 * successor is (or both brands, for the symmetric classes).
 */
export function inferredVerdict(
	link: InferredBrandLink,
	focusId?: string,
	names?: PairNames
): string {
	const tier = link.confidenceTier;
	const { tail, head } = inferredOrientation(link.inferredType, link.direction);
	const nameA = names?.a ?? link.nameA;
	const nameB = names?.b ?? link.nameB;
	const nameOf = (side: 'A' | 'B') => (side === 'A' ? nameA : nameB);
	const focusSide = focusId === link.pidA ? 'A' : focusId === link.pidB ? 'B' : null;
	// The classifier calls a pair partners on joint titles, with one exception:
	// two brands VNDB places under different owners, which it will not call
	// sisters or parent and imprint. Those can have no joint title at all, and
	// then "co-development" is not what the record shows.
	const separateOwnersOnly = link.inferredType === 'partner' && link.coDevVns === 0;

	if (focusSide) {
		const focus = nameOf(focusSide);
		const other = nameOf(focusSide === 'A' ? 'B' : 'A');
		switch (link.inferredType) {
			case 'subbrand':
				return head === focusSide
					? hedged(tier, focus, `a sub-brand or imprint of ${other}`)
					: hedged(tier, focus, `the parent brand of ${other}`);
			case 'successor':
				return head === focusSide
					? hedged(tier, focus, `a successor to ${other}`)
					: hedged(tier, focus, `a predecessor of ${other}`);
			case 'sister':
				return hedged(tier, focus, `a sister brand of ${other}`);
			default:
				return separateOwnersOnly
					? hedged(tier, focus, `a partner studio of ${other}, under separate ownership`)
					: hedged(tier, focus, `a recurring co-development partner of ${other}`);
		}
	}

	const both = `${nameA} and ${nameB}`;
	switch (link.inferredType) {
		case 'subbrand':
			return hedged(tier, nameOf(head ?? 'A'), `a sub-brand or imprint of ${nameOf(tail ?? 'B')}`);
		case 'successor':
			return hedged(
				tier,
				nameOf(head ?? 'B'),
				`a successor to ${nameOf(tail ?? 'A')}`
			);
		case 'sister':
			return hedged(tier, both, 'sister brands', true);
		default:
			return separateOwnersOnly
				? hedged(tier, both, 'partner studios under separate ownership', true)
				: hedged(tier, both, 'recurring co-development partners', true);
	}
}

/**
 * Does an inferred class agree with the relation VNDB already records?
 *
 * Kind is checked first (ownership vs lineage). When `otherIsHead` is given it
 * also checks direction: `explicit` must be the *other* brand's role relative to
 * the focus, and `otherIsHead` says whether the inference puts the other brand at
 * the arrowhead (child for a sub-brand, successor for a succession). A sub-brand
 * guess pointing the wrong way round differs from VNDB even though both are
 * "ownership".
 */
export function agreement(
	type: InferredBrandType,
	explicit: ExplicitRelationCode | null | undefined,
	otherIsHead?: boolean | null
): 'corroborates' | 'differs' | 'none' {
	if (!explicit) return 'none';
	const meta = EXPLICIT_META[explicit];
	if (type !== 'subbrand' && type !== 'successor') return 'differs';
	if (meta.kind !== (type === 'subbrand' ? 'ownership' : 'lineage')) return 'differs';
	if (otherIsHead == null) return 'corroborates';
	return meta.targetIsHead === otherIsHead ? 'corroborates' : 'differs';
}

/** `agreement` for a full link, oriented to a focus brand (defaults to A). */
export function linkAgreement(
	link: Pick<
		InferredBrandLink,
		'pidA' | 'pidB' | 'explicitRelation' | 'inferredType' | 'direction'
	>,
	focusId: string = link.pidA
): 'corroborates' | 'differs' | 'none' {
	const explicit = explicitForFocus(link, focusId);
	if (!explicit) return 'none';
	const { head } = inferredOrientation(link.inferredType, link.direction);
	const focusSide = focusId === link.pidB ? 'B' : 'A';
	return agreement(link.inferredType, explicit, head ? head !== focusSide : null);
}

/** VNDB status column on discover tables. */
export function vndbStatus(link: Pick<InferredBrandLink, 'explicitDist' | 'explicitRelation'>): {
	label: string;
	confirmed: boolean;
} {
	if (link.explicitDist == null) return { label: 'unlinked', confirmed: false };
	if (link.explicitDist === 1) {
		const code = link.explicitRelation ? EXPLICIT_META[link.explicitRelation].code : 'VNDB';
		return { label: code, confirmed: true };
	}
	return { label: `${link.explicitDist}-hop`, confirmed: true };
}

/**
 * Compact directional line ONLY for asymmetric inferred classes (subbrand / successor),
 * so UI badges don't repeat symmetric prose like "A is likely a sister brand of B".
 */
export function inferredDirectionHint(
	link: Pick<InferredBrandLink, 'pidA' | 'pidB' | 'nameA' | 'nameB' | 'inferredType' | 'direction'>,
	names?: PairNames
): string | null {
	const { tail, head } = inferredOrientation(link.inferredType, link.direction);
	if (!tail || !head) return null;
	const nameA = names?.a ?? link.nameA;
	const nameB = names?.b ?? link.nameB;
	const headName = head === 'A' ? nameA : nameB;
	const tailName = tail === 'A' ? nameA : nameB;
	if (link.inferredType === 'subbrand') return `${headName} → sub-brand of ${tailName}`;
	if (link.inferredType === 'successor') return `${tailName} → succeeded by ${headName}`;
	return null;
}

/** The three timeline tags, defined once for column headers and the Key. */
export const TIMELINE_MEANING = {
	concurrent: 'Active in overlapping years.',
	handoff: 'One ends the year the other starts.',
	sequential: 'Active years do not overlap.'
} as const;

/** The Timeline column in one short tooltip. */
export const TIMELINE_HINT = 'How the two studios’ active years line up';

/**
 * Timeline tag for a pair: Concurrent 2004–2011 / Concurrent 2018 (1y) /
 * Handoff 2009 / Sequential, 1y gap.
 */
export function timelineTag(link: {
	firstYearA: number | null;
	lastYearA: number | null;
	firstYearB: number | null;
	lastYearB: number | null;
}): {
	label: string;
	kind: 'concurrent' | 'handoff' | 'sequential' | 'unknown';
	years: number;
	/** Short tooltip phrase. */
	hint: string;
} {
	const { firstYearA: fa, lastYearA: la, firstYearB: fb, lastYearB: lb } = link;
	if (fa == null || la == null || fb == null || lb == null) {
		return {
			label: 'Dates unknown',
			kind: 'unknown',
			years: 0,
			hint: 'Missing dated releases in VNDB'
		};
	}
	const from = Math.max(fa, fb);
	const to = Math.min(la, lb);
	const overlap = to - from + 1;
	if (overlap > 1) {
		return {
			label: `Concurrent ${from}–${to}`,
			kind: 'concurrent',
			years: overlap,
			hint: `Both active ${from}–${to} (${overlap}y)`
		};
	}
	if (overlap === 1) {
		const meets = (la === fb && fa < fb && la < lb) || (lb === fa && fb < fa && lb < la);
		return meets
			? {
					label: `Handoff ${from}`,
					kind: 'handoff',
					years: 1,
					hint: `One ends as the other starts in ${from}`
				}
			: {
					label: `Concurrent ${from} (1y)`,
					kind: 'concurrent',
					years: 1,
					hint: `Overlapped in ${from}`
				};
	}
	const gap = from - to;
	return {
		label: `Sequential, ${gap}y gap`,
		kind: 'sequential',
		years: -gap,
		hint: `${gap}y gap between active years`
	};
}
