/**
 * Role vocabulary (DESIGN §5.6). Shape is the Core-vs-Seiyuu channel everywhere:
 * squares are development credits, circles are voice credits.
 */

export type RoleShape = 'square' | 'circle';
export type RoleFill = 'filled' | 'hollow';
export type RoleGroup = 'core' | 'seiyuu' | 'other';

export interface RoleMeta {
	key: string;
	code: string;
	label: string;
	/** CSS custom property holding the role hue. */
	color: string;
	shape: RoleShape;
	fill: RoleFill;
	group: RoleGroup;
	/** Precedence: lower sorts first (director > scenario > chardesign > art > music > other). */
	order: number;
}

export const ROLE_META: Record<string, RoleMeta> = {
	director: {
		key: 'director',
		code: 'DIR',
		label: 'Director',
		color: 'var(--role-director)',
		shape: 'square',
		fill: 'filled',
		group: 'core',
		order: 0
	},
	scenario: {
		key: 'scenario',
		code: 'SCN',
		label: 'Scenario',
		color: 'var(--role-scenario)',
		shape: 'square',
		fill: 'filled',
		group: 'core',
		order: 1
	},
	chardesign: {
		key: 'chardesign',
		code: 'CHD',
		label: 'Character design',
		color: 'var(--role-chardesign)',
		shape: 'square',
		fill: 'filled',
		group: 'core',
		order: 2
	},
	art: {
		key: 'art',
		code: 'ART',
		label: 'Art',
		color: 'var(--role-art)',
		shape: 'square',
		fill: 'filled',
		group: 'core',
		order: 3
	},
	music: {
		key: 'music',
		code: 'MUS',
		label: 'Music',
		color: 'var(--role-music)',
		shape: 'square',
		fill: 'filled',
		group: 'core',
		order: 4
	},
	songs: {
		key: 'songs',
		code: 'SNG',
		label: 'Songs / vocals',
		color: 'var(--role-music)',
		shape: 'square',
		fill: 'hollow',
		group: 'other',
		order: 5
	},
	seiyuu: {
		key: 'seiyuu',
		code: 'CV',
		label: 'Seiyuu (voice)',
		color: 'var(--role-seiyuu)',
		shape: 'circle',
		fill: 'filled',
		group: 'seiyuu',
		order: 6
	},
	staff: {
		key: 'staff',
		code: 'ETC',
		label: 'Other staff',
		color: 'var(--role-other)',
		shape: 'square',
		fill: 'hollow',
		group: 'other',
		order: 7
	},
	translator: {
		key: 'translator',
		code: 'TL',
		label: 'Translator',
		color: 'var(--role-other)',
		shape: 'square',
		fill: 'hollow',
		group: 'other',
		order: 8
	},
	editor: {
		key: 'editor',
		code: 'ED',
		label: 'Editor',
		color: 'var(--role-other)',
		shape: 'square',
		fill: 'hollow',
		group: 'other',
		order: 9
	},
	qa: {
		key: 'qa',
		code: 'QA',
		label: 'QA',
		color: 'var(--role-other)',
		shape: 'square',
		fill: 'hollow',
		group: 'other',
		order: 10
	}
};

const FALLBACK: RoleMeta = ROLE_META.staff;

/**
 * Generic "development staff" mark for controls and search rows that mean the
 * whole discipline, not one role. Neutral ink: role hues are reserved for real
 * credits, so a filter tab never reads as "Director".
 */
const DEV_META: RoleMeta = {
	key: 'dev',
	code: 'DEV',
	label: 'Development staff',
	color: 'var(--ink-2)',
	shape: 'square',
	fill: 'filled',
	group: 'core',
	order: 99
};

export function roleMeta(role: string): RoleMeta {
	if (role === 'dev') return DEV_META;
	return ROLE_META[role] ?? FALLBACK;
}

/** Roles in precedence order, de-duplicated. */
export function sortRoles(roles: readonly string[]): string[] {
	return [...new Set(roles)].sort((a, b) => roleMeta(a).order - roleMeta(b).order);
}

/** The single role that best represents a credit or a person at a brand. */
export function primaryRole(roles: readonly string[], preferSeiyuu = false): string {
	if (!roles.length) return preferSeiyuu ? 'seiyuu' : 'staff';
	const sorted = sortRoles(roles);
	if (preferSeiyuu && sorted.includes('seiyuu')) return 'seiyuu';
	const dev = sorted.find((r) => r !== 'seiyuu');
	return dev ?? sorted[0];
}

/** The fixed legend order used by timelines and breakdown bars. */
export const LEGEND_ROLES = [
	'director',
	'scenario',
	'chardesign',
	'art',
	'music',
	'songs',
	'staff',
	'seiyuu'
] as const;

/** Fold the non-creative credit types into one legend bucket. */
export function legendRole(role: string): string {
	if (role === 'translator' || role === 'editor' || role === 'qa') return 'staff';
	return ROLE_META[role] ? role : 'staff';
}

export type Mobility = 'anchored' | 'mobile' | 'itinerant';

/**
 * The one definition of mobility, shared by the indicator, filters and copy.
 * Anchored 1–4 brands matches the classifier's "low-mobility ≤ 4 brands" weight
 * in `build-db.ts`, so a person the UI calls anchored is one the score trusts.
 */
export const MOBILITY_THRESHOLDS = {
	/** Anchored: 1 to this many brands. */
	anchoredMax: 4,
	/** Mobile: above anchored, up to this many brands. Itinerant beyond. */
	mobileMax: 15
} as const;

export const MOBILITY_RANGE_LABEL: Record<Mobility, string> = {
	anchored: `1–${MOBILITY_THRESHOLDS.anchoredMax} brands`,
	mobile: `${MOBILITY_THRESHOLDS.anchoredMax + 1}–${MOBILITY_THRESHOLDS.mobileMax} brands`,
	itinerant: `${MOBILITY_THRESHOLDS.mobileMax + 1}+ brands`
};

/**
 * Above this many brands a person is left out of overlap scoring altogether.
 * Mirrors `CORE_BRAND_CAP` in `scripts/build-db.ts`: change one, change the other.
 */
export const MOBILITY_SCORING_CAP = 50;

/** Why each tier matters: how much a shared credit from such a person counts. */
export const MOBILITY_MEANING: Record<Mobility, string> = {
	anchored: 'High weight in overlap scoring.',
	mobile: 'Moderate weight in overlap scoring.',
	itinerant: `Low weight; excluded above ${MOBILITY_SCORING_CAP} brands.`
};

/** The Mobility column in one short phrase, for table headers. */
export const MOBILITY_HINT = 'Studios credited at (fewer = stronger signal)';

/** The five core development roles, as prose. */
export const CORE_ROLES_TEXT = 'director, scenario, character design, art, music';

/** Plain-English definitions for recurring people & credit terms, shared by tooltips and /key. */
export const CORE_STAFF_HINT = `Core dev: ${CORE_ROLES_TEXT}`;
export const ALL_DEV_STAFF_HINT = 'Core staff plus songs, translation, editing, QA';
export const SEIYUU_HINT = 'Voice actors';
export const ALIAS_USED_HINT = 'Pen name used here (— = primary name)';
export const TENURE_HINT = 'First to last year credited here';
export const VNDB_SCORE_HINT = 'VNDB user rating (1–10)';
export const CO_MOVER_HINT = 'Shared 2+ studios with this person';
export const EDITION_CREDIT_HINT = 'Port, remake, or localisation credit';

/** What each staff discipline badge means. Keys match `StaffDiscipline`. */
export const DISCIPLINE_MEANING: Record<'core' | 'seiyuu' | 'dual' | 'other', string> = {
	core: `Core dev (${CORE_ROLES_TEXT})`,
	seiyuu: 'Voice actor',
	dual: 'Both dev staff and voice actor',
	other: 'Non-core dev (songs, TL, editing, QA)'
};

/** The two lenses a brand's overlap can be counted under. */
export const LENS_MEANING = {
	core: 'Core dev staff only',
	seiyuu: 'Core dev staff + voice actors'
} as const;

export function mobilityLevel(brandCount: number): { level: Mobility; bars: 1 | 2 | 3; label: string } {
	if (brandCount > MOBILITY_THRESHOLDS.mobileMax) return { level: 'itinerant', bars: 3, label: 'Itinerant' };
	if (brandCount > MOBILITY_THRESHOLDS.anchoredMax) return { level: 'mobile', bars: 2, label: 'Mobile' };
	return { level: 'anchored', bars: 1, label: 'Anchored' };
}
