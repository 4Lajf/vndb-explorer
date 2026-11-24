import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dumpYear, plural } from '#lib/util.ts';
import { EXPLICIT_META, INFERRED_META } from '#lib/relations.ts';
import type {
	BrandGraphEdge,
	BrandGraphNode,
	BrandRosterMember,
	CareerRecordEntry,
	CorpusStats,
	DecadeStatEntry,
	ExplicitRelationCode,
	ExplicitRelationItem,
	InferredBrandLink,
	InferredBrandType,
	MigrationPartner,
	MigrationSummary,
	PopularPersonEntry,
	PopularStudioEntry,
	PopularVnEntry,
	PopularityRankings,
	PotentialAliasCandidate,
	ProducerSummary,
	ProducerType,
	SearchResult,
	SharedPersonPreview,
	StaffBrandTrack,
	StaffCollaborator,
	StaffDiscipline,
	StaffTimelineEvent,
	StaffTransition
} from '#lib/types.ts';

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
	if (!_db) {
		const dbPath = process.env.VNDB_DB_PATH || path.join(process.cwd(), 'data', 'vndb.sqlite');
		_db = new DatabaseSync(dbPath, { open: true, readOnly: true });
	}
	return _db;
}

function safeJson<T>(val: unknown, fallback: T): T {
	if (typeof val !== 'string' || !val) return fallback;
	try {
		return JSON.parse(val) as T;
	} catch {
		return fallback;
	}
}

/** A finite number from untrusted input, or the fallback. */
export function finiteNumber(val: unknown, fallback: number): number {
	if (val === null || val === undefined || val === '') return fallback;
	const n = typeof val === 'number' ? val : Number(val);
	return Number.isFinite(n) ? n : fallback;
}

let _dumpYear: number | null = null;

/**
 * The year of the VNDB dump. Every "recent" or "still active" cut-off is
 * measured from it, so a given database always renders the same way.
 */
export function getDumpYear(): number {
	if (_dumpYear === null) {
		const stmt = getDb().prepare(`SELECT value FROM meta WHERE key = ?`);
		const dump = stmt.get('dump_timestamp') as { value: string } | undefined;
		const built = stmt.get('built_at') as { value: string } | undefined;
		_dumpYear = dumpYear(dump?.value) ?? dumpYear(built?.value) ?? 0;
	}
	return _dumpYear;
}

/** Original-script name, only when it differs from the romanised display name. */
function orig(name: unknown, latin: unknown): string | null {
	return latin && name && name !== latin ? String(name) : null;
}

/**
 * Was a credit given under a name other than the person's primary one?
 * Decided by VNDB's alias ids: two aliases can share a romanisation and differ
 * only in script (ヒマリ and 陽茉莉 are both "Himari"), and a comparison of the
 * romanised names called the second one primary. The names are compared only
 * when a row carries no ids.
 */
function isNonPrimaryCredit(
	aid: unknown,
	mainAid: unknown,
	aliasShown: string,
	primaryShown: string,
	primaryOriginal: unknown
): boolean {
	if (aid != null && mainAid != null) return Number(aid) !== Number(mainAid);
	return (
		aliasShown.toLowerCase() !== primaryShown.toLowerCase() && aliasShown !== String(primaryOriginal)
	);
}

/**
 * A pen name as a label. Romanised exactly like the primary name, it carries
 * its script, `Maeda Jun (麻枝 准)`: "as Maeda Jun" beside "Maeda Jun" says nothing.
 */
function penNameLabel(aliasShown: string, aliasOriginal: string | null, primaryShown: string): string {
	return aliasOriginal && aliasShown === primaryShown ? `${aliasShown} (${aliasOriginal})` : aliasShown;
}

/** One alias a person was credited under at a brand (`staff_brand_tenure.aliases_json`). */
interface TenureAlias {
	aid: number | null;
	/** Romanised form, or the only form. */
	name: string;
	/** Original script, when it differs from `name`. */
	original: string | null;
}

/** Reads `aliases_json`. A database built before alias ids were kept holds bare names. */
function tenureAliases(json: unknown): TenureAlias[] {
	const raw = safeJson<Array<string | Partial<TenureAlias>>>(json, []);
	const out: TenureAlias[] = [];
	for (const a of raw) {
		if (typeof a === 'string') {
			if (a) out.push({ aid: null, name: a, original: null });
		} else if (a && a.name) {
			out.push({
				aid: a.aid != null ? Number(a.aid) : null,
				name: String(a.name),
				original: a.original ? String(a.original) : null
			});
		}
	}
	return out;
}

/**
 * The aliases of one tenure as the pages print them. Primary or not is decided
 * by alias id, as on every single credit (`isNonPrimaryCredit`), so a pen name
 * that romanises like the primary name still counts, and prints with its script.
 */
function tenureAliasView(
	aliases: TenureAlias[],
	mainAid: unknown,
	primaryShown: string,
	primaryOriginal: unknown
): { labels: string[]; penNames: string[]; usedNonPrimaryAlias: boolean } {
	const labels: string[] = [];
	const penNames: string[] = [];
	for (const a of aliases) {
		const nonPrimary = isNonPrimaryCredit(a.aid, mainAid, a.name, primaryShown, primaryOriginal);
		const label = nonPrimary ? penNameLabel(a.name, a.original, primaryShown) : a.name;
		if (!labels.includes(label)) labels.push(label);
		if (nonPrimary && !penNames.includes(label)) penNames.push(label);
	}
	return { labels, penNames, usedNonPrimaryAlias: penNames.length > 0 };
}

/**
 * Credited at both brands and under no alias the two tenures have in common.
 * Compared by alias id over every alias; by name only where a row has no ids.
 */
function aliasesSwitched(a: TenureAlias[], b: TenureAlias[]): boolean {
	if (a.length === 0 || b.length === 0) return false;
	const key = (x: TenureAlias) => (x.aid != null ? `#${x.aid}` : `${x.name}|${x.original ?? ''}`);
	const inB = new Set(b.map(key));
	return !a.some((x) => inB.has(key(x)));
}

/** VNDB ids are lower-case (`p24`); a hand-typed `P24` means the same record. */
function normId(id: string): string {
	return String(id ?? '').trim().toLowerCase();
}

/** Kana, Han and Hangul: scripts written without spaces between words. */
const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uff66-\uff9f]/;

/** A literal for `LIKE … ESCAPE '\'`. */
function likeLiteral(text: string): string {
	return text.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Final sort keys, so equal scores page in a fixed order. */
const PAIR_TIEBREAK = 'b.weighted_seiyuu_score DESC, b.pid_a ASC, b.pid_b ASC';
/** A link the classifier scored on something other than a shared voice cast. */
const CORE_DRIVEN_SQL = '(b.scored_core_staff > 0 OR b.co_dev_vns > 0 OR b.shared_extlinks > 0)';

export function getCorpusStats(): CorpusStats {
	const db = getDb();
	const rows = db.prepare(`SELECT key, value FROM meta`).all() as Array<{
		key: string;
		value: string;
	}>;
	const m = new Map(rows.map((r) => [r.key, r.value]));
	const num = (k: string) => Number(m.get(k) || 0);
	return {
		dumpTimestamp: m.get('dump_timestamp') || 'unknown',
		builtAt: m.get('built_at') || '',
		producersTotal: num('producers_total'),
		commercialProducers: num('commercial_producers'),
		staffTotal: num('staff_total'),
		seiyuuTotal: num('seiyuu_total'),
		aliasesTotal: num('aliases_total'),
		vnsTotal: num('vns_total'),
		explicitRelationPairs: num('explicit_relation_pairs'),
		inferredBrandLinks: num('inferred_brand_links'),
		unlinkedInferredBrandLinks: num('unlinked_inferred_brand_links'),
		potentialAliasCount: num('potential_alias_count'),
		potentialSeiyuuAliasCount: num('potential_seiyuu_alias_count'),
		potentialStaffAliasCount: num('potential_staff_alias_count')
	};
}

export function searchAll(
	rawQuery: string,
	kind: 'all' | 'producer' | 'staff' | 'vn' = 'all',
	limit = 20
): SearchResult[] {
	const q = rawQuery.trim();
	if (!q) return [];
	const db = getDb();
	const cap = Math.min(50, Math.max(1, Math.trunc(finiteNumber(limit, 20))));

	// Exact VNDB ID shortcut (p123, s456, v789). It honours `kind` like the text
	// search does: a brand picker must never be handed a staff or VN id.
	if (/^[psv]\d+$/i.test(q)) {
		const id = q.toLowerCase();
		const wants = (k: 'producer' | 'staff' | 'vn') => kind === 'all' || kind === k;
		if (id.startsWith('p') && wants('producer')) {
			const row = db
				.prepare(`SELECT id, name, latin, type, lang, vn_count FROM producers WHERE id = ?`)
				.get(id) as Record<string, unknown> | undefined;
			if (row) {
				return [
					{
						kind: 'producer',
						id: String(row.id),
						name: String(row.latin || row.name),
						original: row.latin && row.name !== row.latin ? String(row.name) : null,
						subtitle: [String(row.lang || '').toUpperCase(), plural(Number(row.vn_count), 'VN')]
							.filter(Boolean)
							.join(' · '),
						badge: String(row.type)
					}
				];
			}
		} else if (id.startsWith('s') && wants('staff')) {
			const row = db
				.prepare(
					`SELECT id, name, latin, primary_discipline, brand_count, vn_count, potential_alias_count
           FROM staff WHERE id = ?`
				)
				.get(id) as Record<string, unknown> | undefined;
			if (row) {
				return [
					{
						kind: 'staff',
						id: String(row.id),
						name: String(row.latin || row.name),
						original: row.latin && row.name !== row.latin ? String(row.name) : null,
						subtitle: `${plural(Number(row.brand_count), 'brand')} · ${plural(Number(row.vn_count), 'VN')}`,
						badge: String(row.primary_discipline),
						potentialAliasCount: Number(row.potential_alias_count || 0)
					}
				];
			}
		} else if (id.startsWith('v') && wants('vn')) {
			const row = db
				.prepare(`SELECT id, title, original, olang, first_year FROM vns WHERE id = ?`)
				.get(id) as Record<string, unknown> | undefined;
			if (row) {
				return [
					{
						kind: 'vn',
						id: String(row.id),
						name: String(row.title),
						original: row.original ? String(row.original) : null,
						subtitle: `${String(row.olang || '').toUpperCase()} · ${row.first_year || '—'}`,
						badge: 'vn'
					}
				];
			}
		}
	}

	// A token with no letter or digit (`/`, `&`, `-`) is nothing the tokenizer
	// indexes: quoted as an FTS5 prefix it matches no row, and under AND it emptied
	// the whole result ("Fate / stay night", "A & B").
	const tokens = q
		.replace(/["'*()[\]{}:^~]/g, ' ')
		.split(/\s+/)
		.filter((t) => /[\p{L}\p{N}]/u.test(t));
	if (!tokens.length) return [];
	const ftsQuery = tokens.map((t) => `"${t}"*`).join(' AND ');

	const whereKind = kind === 'all' ? '' : `AND kind = ?`;
	// The raw query is bound as a parameter: never interpolated into the SQL text.
	const params = kind === 'all' ? [ftsQuery, q, cap] : [ftsQuery, kind, q, cap];

	try {
		let rows: Array<Record<string, unknown>>;
		if (kind === 'all') {
			// Balanced per-kind slices so prolific VNs or staff never starve brands out of unscoped results.
			const perKind = Math.max(8, Math.ceil(cap / 3));
			const stmt = db.prepare(
				`SELECT kind, id, title, alt_names, badge, subtitle, rank_score
         FROM search_index
         WHERE search_index MATCH ? AND kind = ?
         ORDER BY (CASE WHEN lower(title) = lower(?) THEN 1000000 ELSE 0 END) + rank_score DESC
         LIMIT ?`
			);
			rows = [
				...(stmt.all(ftsQuery, 'producer', q, perKind) as Array<Record<string, unknown>>),
				...(stmt.all(ftsQuery, 'staff', q, perKind) as Array<Record<string, unknown>>),
				...(stmt.all(ftsQuery, 'vn', q, perKind) as Array<Record<string, unknown>>)
			];
		} else {
			rows = db
				.prepare(
					`SELECT kind, id, title, alt_names, badge, subtitle, rank_score
         FROM search_index
         WHERE search_index MATCH ? ${whereKind}
         ORDER BY (CASE WHEN lower(title) = lower(?) THEN 1000000 ELSE 0 END) + rank_score DESC
         LIMIT ?`
				)
				.all(...params) as Array<Record<string, unknown>>;
		}

		// The tokenizer indexes an unbroken run of kana or kanji as one word and
		// matches it from its first character only. So `スティング` misses
		// `株式会社スティング`, and `朋永真季` misses a name stored as `朋永 真季`.
		// When such a query leaves room in the list, a plain substring scan fills
		// it: every token anywhere in the names, or the whole query with the
		// spaces taken out of both sides.
		if (rows.length < cap && CJK_RE.test(q)) {
			// `instr` is a plain byte search, about twice as fast as LIKE over the
			// whole index, and exact for kana and kanji. A token with Latin letters
			// keeps LIKE, which ignores their case.
			const contains = (column: string, text: string): { sql: string; arg: string } =>
				/[a-z]/i.test(text)
					? { sql: `${column} LIKE ? ESCAPE '\\'`, arg: `%${likeLiteral(text)}%` }
					: { sql: `instr(${column}, ?) > 0`, arg: text };
			const tokenParts = tokens.map((t) => [contains('title', t), contains('alt_names', t)]);
			const tokenSql = tokenParts.map(([a, b]) => `(${a.sql} OR ${b.sql})`).join(' AND ');
			const tokenArgs = tokenParts.flatMap(([a, b]) => [a.arg, b.arg]);
			// Stripping the spaces from a row is the slow part, so it is tried only
			// on rows that hold the query's first and last characters.
			const joined = [...tokens.join('')];
			const first = joined[0];
			const last = joined[joined.length - 1];
			const squashed = contains(
				`REPLACE(REPLACE(title || ' ' || alt_names, ' ', ''), '　', '')`,
				joined.join('')
			);
			const seen = new Set(rows.map((r) => `${r.kind}|${r.id}`));
			const extra = db
				.prepare(
					`SELECT kind, id, title, alt_names, badge, subtitle, rank_score
           FROM search_index
           WHERE ${kind === 'all' ? '' : 'kind = ? AND'}
                 ((${tokenSql})
                  OR ((instr(title, ?) > 0 OR instr(alt_names, ?) > 0)
                      AND (instr(title, ?) > 0 OR instr(alt_names, ?) > 0)
                      AND ${squashed.sql}))
           ORDER BY rank_score DESC
           LIMIT ?`
				)
				.all(
					...(kind === 'all' ? [] : [kind]),
					...tokenArgs,
					first,
					first,
					last,
					last,
					squashed.arg,
					cap + rows.length
				) as Array<Record<string, unknown>>;
			rows = [...rows, ...extra.filter((r) => !seen.has(`${r.kind}|${r.id}`))].slice(0, cap);
		}

		const prodStmt = db.prepare(`SELECT name, latin FROM producers WHERE id = ?`);
		const staffStmt = db.prepare(
			`SELECT name, latin, potential_alias_count FROM staff WHERE id = ?`
		);
		const vnStmt = db.prepare(`SELECT original FROM vns WHERE id = ?`);

		return rows.map((r) => {
			const kindVal = r.kind as SearchResult['kind'];
			const id = String(r.id);
			let original: string | null = null;
			let potentialAliasCount: number | undefined;
			if (kindVal === 'producer') {
				const row = prodStmt.get(id) as Record<string, unknown> | undefined;
				original = row ? orig(row.name, row.latin) : null;
			} else if (kindVal === 'staff') {
				const row = staffStmt.get(id) as Record<string, unknown> | undefined;
				original = row ? orig(row.name, row.latin) : null;
				potentialAliasCount = row ? Number(row.potential_alias_count || 0) : 0;
			} else {
				const row = vnStmt.get(id) as Record<string, unknown> | undefined;
				original = row?.original ? String(row.original) : null;
			}
			return {
				kind: kindVal,
				id,
				name: String(r.title),
				original,
				subtitle: String(r.subtitle || ''),
				badge: String(r.badge || ''),
				...(potentialAliasCount !== undefined ? { potentialAliasCount } : {})
			};
		});
	} catch {
		return [];
	}
}

function mapInferredBrandRow(r: Record<string, unknown>): InferredBrandLink {
	return {
		pidA: String(r.pid_a),
		nameA: String(r.latin_a || r.name_a),
		latinA: r.latin_a ? String(r.latin_a) : null,
		typeA: String(r.type_a) as ProducerType,
		langA: r.lang_a ? String(r.lang_a) : null,
		firstYearA: r.first_year_a !== null ? Number(r.first_year_a) : null,
		lastYearA: r.last_year_a !== null ? Number(r.last_year_a) : null,
		staffCountA: Number(r.staff_count_a || 0),
		pidB: String(r.pid_b),
		nameB: String(r.latin_b || r.name_b),
		latinB: r.latin_b ? String(r.latin_b) : null,
		typeB: String(r.type_b) as ProducerType,
		langB: r.lang_b ? String(r.lang_b) : null,
		firstYearB: r.first_year_b !== null ? Number(r.first_year_b) : null,
		lastYearB: r.last_year_b !== null ? Number(r.last_year_b) : null,
		staffCountB: Number(r.staff_count_b || 0),
		inferredType: String(r.inferred_type) as InferredBrandType,
		direction: String(r.direction) as InferredBrandLink['direction'],
		confidence: Number(r.confidence),
		confidenceTier: String(r.confidence_tier) as InferredBrandLink['confidenceTier'],
		explicitRelation: r.explicit_relation
			? (String(r.explicit_relation) as ExplicitRelationCode)
			: null,
		explicitDist: r.explicit_dist !== null && r.explicit_dist !== undefined ? Number(r.explicit_dist) : null,
		sharedCoreStaff: Number(r.shared_core_staff),
		scoredCoreStaff: Number(r.scored_core_staff ?? r.shared_core_staff),
		lowMobCoreStaff: Number(r.low_mob_core_staff),
		coDevOnlyStaff: Number(r.co_dev_only_staff || 0),
		weightedCoreScore: Number(r.weighted_core_score),
		containmentAInB: Number(r.containment_a_in_b),
		containmentBInA: Number(r.containment_b_in_a),
		maxContainment: Number(r.max_containment),
		jaccardCore: Number(r.jaccard_core),
		sharedSeiyuu: Number(r.shared_seiyuu),
		weightedSeiyuuScore: Number(r.weighted_seiyuu_score),
		coDevVns: Number(r.co_dev_vns),
		crossVnRelations: Number(r.cross_vn_relations),
		sharedExtlinks: Number(r.shared_extlinks),
		yearOverlap: Number(r.year_overlap),
		flowAToB: Number(r.flow_a_to_b),
		flowBToA: Number(r.flow_b_to_a),
		evidence: safeJson<string[]>(r.evidence_json, []),
		topShared: safeJson<SharedPersonPreview[]>(r.top_shared_json, []),
		originalA: orig(r.name_a, r.latin_a),
		originalB: orig(r.name_b, r.latin_b),
		vnCountA: Number(r.vn_count_a || 0),
		vnCountB: Number(r.vn_count_b || 0),
		// Judged on the people the classifier scored: a pair whose only common
		// core credit is a composer at 80 studios still rests on its voice cast.
		seiyuuDriven:
			Number(r.scored_core_staff ?? r.shared_core_staff) === 0 &&
			Number(r.co_dev_vns) === 0 &&
			Number(r.shared_extlinks) === 0
	};
}

const INFERRED_BRAND_SELECT = `
  SELECT b.*,
    pa.name AS name_a, pa.latin AS latin_a, pa.type AS type_a, pa.lang AS lang_a,
    pa.first_year AS first_year_a, pa.last_year AS last_year_a, pa.staff_count AS staff_count_a,
    pa.vn_count AS vn_count_a,
    pb.name AS name_b, pb.latin AS latin_b, pb.type AS type_b, pb.lang AS lang_b,
    pb.first_year AS first_year_b, pb.last_year AS last_year_b, pb.staff_count AS staff_count_b,
    pb.vn_count AS vn_count_b
  FROM brand_relations_inferred b
  JOIN producers pa ON pa.id = b.pid_a
  JOIN producers pb ON pb.id = b.pid_b
`;

export interface DiscoverBrandsParams {
	inferredType?: string;
	explicitStatus?: 'unlinked' | 'twohop' | 'explicit' | 'all';
	producerType?: string;
	lang?: string;
	minConfidence?: number;
	includeSeiyuu?: boolean;
	sort?: 'confidence' | 'shared_core' | 'containment' | 'seiyuu';
	q?: string;
	page?: number;
	limit?: number;
}

/** The requested page, held between 1 and the last page that has rows. */
function lastPage(requested: unknown, total: number, limit: number): number {
	const page = Math.max(1, Math.trunc(finiteNumber(requested, 1)));
	return Math.min(page, Math.max(1, Math.ceil(total / limit)));
}

export function discoverBrands(params: DiscoverBrandsParams = {}) {
	const db = getDb();
	const where: string[] = ['1=1'];
	const args: (string | number)[] = [];

	if (params.inferredType && params.inferredType !== 'all') {
		where.push('b.inferred_type = ?');
		args.push(params.inferredType);
	}
	if (params.explicitStatus === 'unlinked') {
		where.push('b.explicit_dist IS NULL');
	} else if (params.explicitStatus === 'twohop') {
		where.push('b.explicit_dist = 2');
	} else if (params.explicitStatus === 'explicit') {
		where.push('b.explicit_dist = 1');
	}
	if (params.producerType && params.producerType !== 'all') {
		where.push('(pa.type = ? AND pb.type = ?)');
		args.push(params.producerType, params.producerType);
	}
	if (params.lang && params.lang !== 'all') {
		where.push('(pa.lang = ? OR pb.lang = ?)');
		args.push(params.lang, params.lang);
	}
	if (params.q && params.q.trim()) {
		const idQuery = normId(params.q);
		if (/^p\d+$/.test(idQuery)) {
			// An exact VNDB id: that brand's pairs only, as `s123` does on the alias list.
			where.push('(b.pid_a = ? OR b.pid_b = ?)');
			args.push(idQuery, idQuery);
		} else {
			// Typed text is matched literally (`%` and `_` are not wildcards), against
			// each brand's name, romanisation and VNDB alias list.
			const like = `%${likeLiteral(params.q.trim())}%`;
			const cols = ['pa.name', 'pa.latin', 'pa.alias', 'pb.name', 'pb.latin', 'pb.alias'];
			where.push(`(${cols.map((col) => `${col} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
			args.push(...cols.map(() => like));
		}
	}

	// Everything above is the scope; the confidence floor and the voice-cast
	// switch narrow it. Kept apart so the list can say what the floor is hiding.
	const scopeWhere = [...where];
	const scopeArgs = [...args];
	const minConfidence = Math.min(1, Math.max(0, finiteNumber(params.minConfidence, 0)));
	if (minConfidence > 0) {
		where.push('b.confidence >= ?');
		args.push(minConfidence);
	}
	if (!params.includeSeiyuu) {
		where.push(CORE_DRIVEN_SQL);
	}

	// A link that rests on a voice cast alone is never rated above Speculative,
	// so a floor in the Medium range removes all of them. When the reader has
	// asked for those links, report how many the floor leaves out.
	let seiyuuBelowFloor: { count: number; minConfidence: number } | null = null;
	if (params.includeSeiyuu && minConfidence > 0) {
		const below = db
			.prepare(
				`SELECT COUNT(*) AS cnt, MIN(b.confidence) AS lowest FROM brand_relations_inferred b
         JOIN producers pa ON pa.id = b.pid_a
         JOIN producers pb ON pb.id = b.pid_b
         WHERE ${scopeWhere.join(' AND ')} AND NOT ${CORE_DRIVEN_SQL} AND b.confidence < ?`
			)
			.get(...scopeArgs, minConfidence) as { cnt: number; lowest: number | null };
		if (Number(below.cnt) > 0) {
			seiyuuBelowFloor = { count: Number(below.cnt), minConfidence: Number(below.lowest ?? 0) };
		}
	}

	const orderMap: Record<string, string> = {
		confidence: `b.confidence DESC, b.weighted_core_score DESC, ${PAIR_TIEBREAK}`,
		shared_core: `b.shared_core_staff DESC, b.confidence DESC, ${PAIR_TIEBREAK}`,
		containment: `b.max_containment DESC, b.low_mob_core_staff DESC, b.confidence DESC, ${PAIR_TIEBREAK}`,
		seiyuu: `b.shared_seiyuu DESC, ${PAIR_TIEBREAK}`
	};
	const orderBy = orderMap[params.sort || 'confidence'] || orderMap.confidence;
	const limit = Math.min(100, Math.max(1, Math.trunc(finiteNumber(params.limit, 30))));

	const countRow = db
		.prepare(
			`SELECT COUNT(*) AS cnt FROM brand_relations_inferred b
       JOIN producers pa ON pa.id = b.pid_a
       JOIN producers pb ON pb.id = b.pid_b
       WHERE ${where.join(' AND ')}`
		)
		.get(...args) as { cnt: number };
	const total = Number(countRow.cnt);
	// A page past the end lands on the last one: `?page=999` never reads "29,941–151 of 151".
	const page = lastPage(params.page, total, limit);
	const offset = (page - 1) * limit;

	const rows = db
		.prepare(`${INFERRED_BRAND_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
		.all(...args, limit, offset) as Array<Record<string, unknown>>;

	return {
		total,
		page,
		limit,
		items: rows.map(mapInferredBrandRow),
		seiyuuBelowFloor
	};
}

function mapPotentialAliasRow(r: Record<string, unknown>): PotentialAliasCandidate {
	return {
		sidA: String(r.sid_a),
		nameA: String(r.latin_a || r.name_a),
		latinA: r.latin_a ? String(r.latin_a) : null,
		genderA: r.gender_a ? String(r.gender_a) : null,
		langA: r.lang_a ? String(r.lang_a) : null,
		disciplineA: String(r.disc_a) as StaffDiscipline,
		vnCountA: Number(r.vn_count_a || 0),
		seiyuuVnCountA: Number(r.seiyuu_vn_count_a || 0),
		firstYearA: r.first_year_a !== null ? Number(r.first_year_a) : null,
		lastYearA: r.last_year_a !== null ? Number(r.last_year_a) : null,
		eroRateA: r.ero_rate_a !== null ? Number(r.ero_rate_a) : null,
		sidB: String(r.sid_b),
		nameB: String(r.latin_b || r.name_b),
		latinB: r.latin_b ? String(r.latin_b) : null,
		genderB: r.gender_b ? String(r.gender_b) : null,
		langB: r.lang_b ? String(r.lang_b) : null,
		disciplineB: String(r.disc_b) as StaffDiscipline,
		vnCountB: Number(r.vn_count_b || 0),
		seiyuuVnCountB: Number(r.seiyuu_vn_count_b || 0),
		firstYearB: r.first_year_b !== null ? Number(r.first_year_b) : null,
		lastYearB: r.last_year_b !== null ? Number(r.last_year_b) : null,
		eroRateB: r.ero_rate_b !== null ? Number(r.ero_rate_b) : null,
		category: String(r.category) as PotentialAliasCandidate['category'],
		confidence: Number(r.confidence),
		confidenceTier: String(r.confidence_tier) as PotentialAliasCandidate['confidenceTier'],
		sharedChars: Number(r.shared_chars),
		sameVnSharedChars: Number(r.same_vn_shared_chars),
		sharedExtlinks: Number(r.shared_extlinks),
		bioCrossref: Boolean(r.bio_crossref),
		nameMatchKind: r.name_match_kind ? String(r.name_match_kind) : null,
		sharedBrands: Number(r.shared_brands),
		coCreditVns: Number(r.co_credit_vns),
		eroSplit: r.ero_split !== null ? Number(r.ero_split) : null,
		evidence: safeJson<string[]>(r.evidence_json, []),
		listedApart: safeJson<string[]>(r.listed_apart_json, []),
		sampleChars: safeJson<Array<{ cid: string; name: string; count?: number }>>(
			r.sample_chars_json,
			[]
		),
		sampleBrands: safeJson<Array<{ pid: string; name: string; original?: string | null }>>(
			r.sample_brands_json,
			[]
		),
		originalA: orig(r.name_a, r.latin_a),
		originalB: orig(r.name_b, r.latin_b),
		brandCountA: Number(r.brand_count_a || 0),
		brandCountB: Number(r.brand_count_b || 0)
	};
}

const POTENTIAL_ALIAS_SELECT = `
  SELECT pa.*,
    sa.name AS name_a, sa.latin AS latin_a, sa.gender AS gender_a, sa.lang AS lang_a,
    sa.primary_discipline AS disc_a, sa.vn_count AS vn_count_a, sa.seiyuu_vn_count AS seiyuu_vn_count_a,
    sa.first_year AS first_year_a, sa.last_year AS last_year_a, sa.ero_rate AS ero_rate_a,
    sa.brand_count AS brand_count_a, sb.brand_count AS brand_count_b,
    sb.name AS name_b, sb.latin AS latin_b, sb.gender AS gender_b, sb.lang AS lang_b,
    sb.primary_discipline AS disc_b, sb.vn_count AS vn_count_b, sb.seiyuu_vn_count AS seiyuu_vn_count_b,
    sb.first_year AS first_year_b, sb.last_year AS last_year_b, sb.ero_rate AS ero_rate_b
  FROM potential_aliases pa
  JOIN staff sa ON sa.id = pa.sid_a
  JOIN staff sb ON sb.id = pa.sid_b
`;

export interface DiscoverAliasesParams {
	category?: 'all' | 'seiyuu' | 'staff' | 'mixed';
	tier?: 'all' | 'high' | 'medium' | 'speculative';
	signal?: 'all' | 'shared_chars' | 'shared_extlinks' | 'bio_crossref' | 'name_match';
	q?: string;
	/** Exactly one pair, as `s123-s456` (either order). Other filters still apply. */
	pair?: string;
	page?: number;
	limit?: number;
}

/** Parse `s123-s456` into two staff ids, or null. */
export function parseAliasPair(raw: string | null | undefined): [string, string] | null {
	const m = /^(s\d+)-(s\d+)$/.exec((raw ?? '').trim().toLowerCase());
	if (!m || m[1] === m[2]) return null;
	return [m[1], m[2]];
}

export function discoverAliases(params: DiscoverAliasesParams = {}) {
	const db = getDb();
	const where: string[] = ['1=1'];
	const args: (string | number)[] = [];

	if (params.category && params.category !== 'all') {
		where.push('pa.category = ?');
		args.push(params.category);
	}
	if (params.tier && params.tier !== 'all') {
		where.push('pa.confidence_tier = ?');
		args.push(params.tier);
	}
	if (params.signal === 'shared_chars') where.push('pa.shared_chars > 0');
	else if (params.signal === 'shared_extlinks') where.push('pa.shared_extlinks > 0');
	else if (params.signal === 'bio_crossref') where.push('pa.bio_crossref = 1');
	else if (params.signal === 'name_match') where.push('pa.name_match_kind IS NOT NULL');

	if (params.q && params.q.trim()) {
		const idQuery = params.q.trim().toLowerCase();
		if (/^s\d+$/.test(idQuery)) {
			where.push('(pa.sid_a = ? OR pa.sid_b = ?)');
			args.push(idQuery, idQuery);
		} else {
			// Main names, plus every confirmed pen name of either record.
			// Matched literally: `%` and `_` in the typed text are not wildcards.
			const like = `%${likeLiteral(params.q.trim())}%`;
			const esc = `ESCAPE '\\'`;
			where.push(
				`(sa.name LIKE ? ${esc} OR sa.latin LIKE ? ${esc} OR sb.name LIKE ? ${esc} OR sb.latin LIKE ? ${esc}
          OR EXISTS (
            SELECT 1 FROM staff_alias sa_s
            WHERE (sa_s.sid = pa.sid_a OR sa_s.sid = pa.sid_b)
              AND (sa_s.name LIKE ? ${esc} OR sa_s.latin LIKE ? ${esc})
          ))`
			);
			args.push(like, like, like, like, like, like);
		}
	}

	const pair = parseAliasPair(params.pair);
	if (pair) {
		where.push('((pa.sid_a = ? AND pa.sid_b = ?) OR (pa.sid_a = ? AND pa.sid_b = ?))');
		args.push(pair[0], pair[1], pair[1], pair[0]);
	}

	const limit = Math.min(100, Math.max(1, Math.trunc(finiteNumber(params.limit, 30))));

	const countRow = db
		.prepare(
			`SELECT COUNT(*) AS cnt FROM potential_aliases pa
       JOIN staff sa ON sa.id = pa.sid_a
       JOIN staff sb ON sb.id = pa.sid_b
       WHERE ${where.join(' AND ')}`
		)
		.get(...args) as { cnt: number };
	const total = Number(countRow.cnt);
	const page = lastPage(params.page, total, limit);
	const offset = (page - 1) * limit;

	const rows = db
		.prepare(
			`${POTENTIAL_ALIAS_SELECT} WHERE ${where.join(' AND ')}
       ORDER BY pa.confidence DESC, pa.shared_chars DESC, pa.shared_brands DESC, pa.sid_a ASC, pa.sid_b ASC
       LIMIT ? OFFSET ?`
		)
		.all(...args, limit, offset) as Array<Record<string, unknown>>;

	return {
		total,
		page,
		limit,
		items: rows.map(mapPotentialAliasRow)
	};
}

export function getHomeHighlights() {
	const db = getDb();
	const stats = getCorpusStats();
	// Showcase a balanced mix of high-signal unlinked commercial relationships (subbrands, successors, sisters, partners)
	const hiddenNonPartner = db
		.prepare(
			`${INFERRED_BRAND_SELECT}
       WHERE b.explicit_dist IS NULL AND pa.type = 'co' AND pb.type = 'co'
         AND b.inferred_type IN ('subbrand', 'successor', 'sister')
         AND b.confidence >= 0.55 AND b.scored_core_staff >= 4
       ORDER BY b.confidence DESC, b.low_mob_core_staff DESC, b.weighted_core_score DESC
       LIMIT 6`
		)
		.all() as Array<Record<string, unknown>>;
	const hiddenPartners = db
		.prepare(
			`${INFERRED_BRAND_SELECT}
       WHERE b.explicit_dist IS NULL AND pa.type = 'co' AND pb.type = 'co'
         AND b.inferred_type = 'partner' AND b.confidence >= 0.72
       ORDER BY b.confidence DESC, b.co_dev_vns DESC
       LIMIT 2`
		)
		.all() as Array<Record<string, unknown>>;
	const hiddenBrands = [...hiddenNonPartner, ...hiddenPartners].map(mapInferredBrandRow);

	const potentialAliases = discoverAliases({
		tier: 'high',
		limit: 8
	}).items;

	const topMovers = db
		.prepare(
			`SELECT id, name, latin, primary_discipline, roles_json, brand_count, vn_count, seiyuu_vn_count, first_year, last_year, alias_count, potential_alias_count
       FROM staff
       WHERE brand_count BETWEEN 5 AND 30 AND vn_count >= 12 AND lang = 'ja'
         AND is_core_staff = 1
       ORDER BY (CASE WHEN alias_count > 1 THEN 15 ELSE 0 END) + brand_count * 2 + vn_count * 0.5 DESC
       LIMIT 8`
		)
		.all() as Array<Record<string, unknown>>;

	const topSeiyuu = db
		.prepare(
			`SELECT id, name, latin, primary_discipline, roles_json, brand_count, seiyuu_brand_count, vn_count, seiyuu_vn_count, first_year, last_year, alias_count, potential_alias_count
       FROM staff
       WHERE is_seiyuu = 1 AND seiyuu_vn_count >= 25 AND lang = 'ja'
       ORDER BY (CASE WHEN potential_alias_count > 0 THEN 50 ELSE 0 END) + alias_count * 2 + seiyuu_brand_count DESC
       LIMIT 8`
		)
		.all() as Array<Record<string, unknown>>;

	const popularity = getPopularityRankings();

	return {
		stats,
		hiddenBrands,
		potentialAliases,
		popularCreators: popularity.popularCreators.slice(0, 8),
		popularSeiyuu: popularity.popularSeiyuu.slice(0, 8),
		topMovers: topMovers.map((r) => ({
			id: String(r.id),
			name: String(r.latin || r.name),
			original: r.latin && r.name !== r.latin ? String(r.name) : null,
			primaryDiscipline: String(r.primary_discipline) as StaffDiscipline,
			roles: safeJson<string[]>(r.roles_json, []),
			brandCount: Number(r.brand_count),
			vnCount: Number(r.vn_count),
			seiyuuVnCount: Number(r.seiyuu_vn_count),
			firstYear: r.first_year !== null ? Number(r.first_year) : null,
			lastYear: r.last_year !== null ? Number(r.last_year) : null,
			aliasCount: Number(r.alias_count),
			potentialAliasCount: Number(r.potential_alias_count)
		})),
		topSeiyuu: topSeiyuu.map((r) => ({
			id: String(r.id),
			name: String(r.latin || r.name),
			original: r.latin && r.name !== r.latin ? String(r.name) : null,
			primaryDiscipline: String(r.primary_discipline) as StaffDiscipline,
			roles: safeJson<string[]>(r.roles_json, []),
			brandCount: Number(r.seiyuu_brand_count || r.brand_count),
			vnCount: Number(r.seiyuu_vn_count),
			firstYear: r.first_year !== null ? Number(r.first_year) : null,
			lastYear: r.last_year !== null ? Number(r.last_year) : null,
			aliasCount: Number(r.alias_count),
			potentialAliasCount: Number(r.potential_alias_count)
		}))
	};
}

/** Caps on a producer page's lists. Headings report true totals from SQL. */
const PRODUCER_INFERRED_LIMIT = 45;
/** Applied to the development staff and to the voice cast separately. */
const PRODUCER_ROSTER_LIMIT = 350;
/** Applied to developed titles and to published / ported titles separately. */
const PRODUCER_GAMES_LIMIT = 200;
/** Inferred neighbours drawn on the relationship graph (the strongest ones). */
const GRAPH_INFERRED_LIMIT = 18;

export function getProducerDetail(pidInput: string, includeSeiyuu = false) {
	const db = getDb();
	const pid = normId(pidInput);
	const p = db.prepare(`SELECT * FROM producers WHERE id = ?`).get(pid) as
		| Record<string, unknown>
		| undefined;
	if (!p) return null;

	const extlinks = db
		.prepare(`SELECT site, value, url FROM producer_extlinks WHERE pid = ?`)
		.all(pid) as Array<{ site: string; value: string; url: string | null }>;

	const linkedCreators = db
		.prepare(`SELECT id, name, latin, primary_discipline FROM staff WHERE prod = ?`)
		.all(pid) as Array<Record<string, unknown>>;

	const explicitRows = db
		.prepare(
			`SELECT pr.pid, pr.relation, pr.edge_kind, p2.name, p2.latin, p2.type, p2.lang, p2.first_year, p2.last_year, p2.vn_count, p2.staff_count
       FROM producers_relations pr
       JOIN producers p2 ON p2.id = pr.pid
       WHERE pr.id = ?
       ORDER BY pr.edge_kind DESC, p2.vn_count DESC`
		)
		.all(pid) as Array<Record<string, unknown>>;

	const explicitRelations: ExplicitRelationItem[] = explicitRows.map((r) => ({
		pid: String(r.pid),
		name: String(r.latin || r.name),
		latin: r.latin ? String(r.latin) : null,
		type: String(r.type) as ProducerType,
		lang: r.lang ? String(r.lang) : null,
		relation: String(r.relation) as ExplicitRelationCode,
		edgeKind: String(r.edge_kind) as 'ownership' | 'lineage',
		firstYear: r.first_year !== null ? Number(r.first_year) : null,
		lastYear: r.last_year !== null ? Number(r.last_year) : null,
		vnCount: Number(r.vn_count),
		staffCount: Number(r.staff_count || 0),
		original: orig(r.name, r.latin)
	}));

	const inferredFilter = includeSeiyuu ? '' : `AND ${CORE_DRIVEN_SQL}`;

	const inferredRows = db
		.prepare(
			`${INFERRED_BRAND_SELECT}
       WHERE (b.pid_a = ? OR b.pid_b = ?) ${inferredFilter}
       ORDER BY b.confidence DESC, b.weighted_core_score DESC, ${PAIR_TIEBREAK}
       LIMIT ${PRODUCER_INFERRED_LIMIT}`
		)
		.all(pid, pid) as Array<Record<string, unknown>>;

	const inferredRelations = inferredRows.map(mapInferredBrandRow);
	// Hydrate full alias lists for any preview person credited under >1 alias so `+N` expands inline.
	const aliasLookupStmt = db.prepare(
		`SELECT aliases_json FROM staff_brand_tenure WHERE sid = ? AND pid = ?`
	);
	const aliasCache = new Map<string, Array<{ name: string; original: string | null }>>();
	const loadAliases = (sid: string, targetPid: string, first: string | null | undefined) => {
		const key = `${sid}|${targetPid}`;
		let list = aliasCache.get(key);
		if (!list) {
			const row = aliasLookupStmt.get(sid, targetPid) as { aliases_json?: unknown } | undefined;
			list = tenureAliases(row?.aliases_json).map((a) => ({ name: a.name, original: a.original }));
			aliasCache.set(key, list);
		}
		if (!first || list.length <= 1) return list;
		const idx = list.findIndex((a) => a.name === first);
		return idx > 0 ? [list[idx], ...list.slice(0, idx), ...list.slice(idx + 1)] : list;
	};
	for (const rel of inferredRelations) {
		for (const person of rel.topShared) {
			if ((person.aliasCountA ?? 1) > 1) {
				const full = loadAliases(person.sid, rel.pidA, person.aliasA);
				if (full.length > 1) person.aliasesA = full;
			}
			if ((person.aliasCountB ?? 1) > 1) {
				const full = loadAliases(person.sid, rel.pidB, person.aliasB);
				if (full.length > 1) person.aliasesB = full;
			}
		}
	}
	// The list above is capped: headings state the true total, never the cap.
	const inferredTotal =
		inferredRelations.length < PRODUCER_INFERRED_LIMIT
			? inferredRelations.length
			: Number(
					(
						db
							.prepare(
								`SELECT COUNT(*) AS cnt FROM brand_relations_inferred b
                 WHERE (b.pid_a = ? OR b.pid_b = ?) ${inferredFilter}`
							)
							.get(pid, pid) as { cnt: number }
					).cnt
				);

	// Neighbourhood graph: the centre, every explicit neighbour and the top
	// inferred ones. VNDB's relations are never cut here: the sector layout folds
	// what a sector cannot hold into a `+n` node, and the Table view and the
	// Inspector counts read the same full edge list.
	const nodeMap = new Map<string, BrandGraphNode>();
	const edges: BrandGraphEdge[] = [];
	const seenEdges = new Set<string>();

	nodeMap.set(pid, {
		id: pid,
		name: String(p.latin || p.name),
		latin: p.latin ? String(p.latin) : null,
		type: String(p.type) as ProducerType,
		vnCount: Number(p.vn_count),
		staffCount: Number(p.staff_count),
		firstYear: p.first_year !== null ? Number(p.first_year) : null,
		lastYear: p.last_year !== null ? Number(p.last_year) : null,
		isCenter: true,
		original: orig(p.name, p.latin)
	});

	for (const rel of explicitRelations) {
		if (!nodeMap.has(rel.pid)) {
			nodeMap.set(rel.pid, {
				id: rel.pid,
				name: rel.name,
				latin: rel.latin,
				type: rel.type,
				vnCount: rel.vnCount,
				staffCount: rel.staffCount ?? 0,
				firstYear: rel.firstYear,
				lastYear: rel.lastYear,
				isExplicitNeighbor: true,
				original: rel.original ?? null
			});
		}
		const ek = `exp|${pid}|${rel.pid}`;
		if (!seenEdges.has(ek)) {
			seenEdges.add(ek);
			edges.push({
				source: pid,
				target: rel.pid,
				kind: rel.edgeKind === 'ownership' ? 'explicit_ownership' : 'explicit_lineage',
				label: rel.relation,
				relationCode: rel.relation
			});
		}
	}

	for (const inf of inferredRelations.slice(0, GRAPH_INFERRED_LIMIT)) {
		const isA = inf.pidA === pid;
		const otherId = isA ? inf.pidB : inf.pidA;
		if (!nodeMap.has(otherId)) {
			nodeMap.set(otherId, {
				id: otherId,
				name: isA ? inf.nameB : inf.nameA,
				latin: isA ? inf.latinB : inf.latinA,
				type: isA ? inf.typeB : inf.typeA,
				vnCount: (isA ? inf.vnCountB : inf.vnCountA) ?? 0,
				staffCount: isA ? inf.staffCountB : inf.staffCountA,
				firstYear: isA ? inf.firstYearB : inf.firstYearA,
				lastYear: isA ? inf.lastYearB : inf.lastYearA,
				original: (isA ? inf.originalB : inf.originalA) ?? null
			});
		}
		const ek = `inf|${inf.pidA}|${inf.pidB}`;
		if (!seenEdges.has(ek)) {
			seenEdges.add(ek);
			edges.push({
				source: inf.pidA,
				target: inf.pidB,
				kind: 'inferred',
				label: inf.inferredType,
				inferredType: inf.inferredType,
				confidence: inf.confidence,
				sharedCoreStaff: inf.sharedCoreStaff,
				sharedSeiyuu: inf.sharedSeiyuu,
				coDevVns: inf.coDevVns,
				direction: inf.direction,
				explicitRelation: inf.explicitRelation,
				seiyuuDriven: inf.seiyuuDriven
			});
		}
	}

	// Migration inflow & outflow. One predicate decides which moves count under the
	// current lens, and the residual buckets below use the very same one, so the
	// diagram's flows and its "debuted here / no later brand" remainders add up.
	const moveClause = (alias: string) => (includeSeiyuu ? '' : `AND ${alias}.is_core_move = 1`);
	const seiyuuClause = moveClause('t');
	const buildMigration = (dir: 'in' | 'out'): MigrationPartner[] => {
		const sql =
			dir === 'in'
				? `SELECT t.from_pid AS other_pid, p2.name, p2.latin, p2.type, t.sid, s.name AS s_name, s.latin AS s_latin,
                  t.is_seiyuu, t.is_core_move, t.from_first_year, t.from_last_year, t.to_first_year, t.to_last_year, t.gap_years, t.alias_changed, pr.relation AS exp_rel
           FROM staff_brand_transitions t
           JOIN producers p2 ON p2.id = t.from_pid
           JOIN staff s ON s.id = t.sid
           LEFT JOIN producers_relations pr ON pr.id = t.to_pid AND pr.pid = t.from_pid
           WHERE t.to_pid = ? ${seiyuuClause}
           ORDER BY t.to_first_year DESC`
				: `SELECT t.to_pid AS other_pid, p2.name, p2.latin, p2.type, t.sid, s.name AS s_name, s.latin AS s_latin,
                  t.is_seiyuu, t.is_core_move, t.from_first_year, t.from_last_year, t.to_first_year, t.to_last_year, t.gap_years, t.alias_changed, pr.relation AS exp_rel
           FROM staff_brand_transitions t
           JOIN producers p2 ON p2.id = t.to_pid
           JOIN staff s ON s.id = t.sid
           LEFT JOIN producers_relations pr ON pr.id = t.from_pid AND pr.pid = t.to_pid
           WHERE t.from_pid = ? ${seiyuuClause}
           ORDER BY t.to_first_year DESC`;
		const rows = db.prepare(sql).all(pid) as Array<Record<string, unknown>>;
		const grouped = new Map<
			string,
			MigrationPartner & { gapSum: number; gapCnt: number; seenSids: Set<string> }
		>();
		for (const r of rows) {
			const opid = String(r.other_pid);
			let g = grouped.get(opid);
			if (!g) {
				g = {
					pid: opid,
					name: String(r.latin || r.name),
					latin: r.latin ? String(r.latin) : null,
					type: String(r.type) as ProducerType,
					count: 0,
					coreCount: 0,
					seiyuuCount: 0,
					avgGapYears: null,
					explicitRelation: r.exp_rel ? (String(r.exp_rel) as ExplicitRelationCode) : null,
					people: [],
					original: orig(r.name, r.latin),
					minGapYears: null,
					maxGapYears: null,
					gapSum: 0,
					gapCnt: 0,
					seenSids: new Set()
				};
				grouped.set(opid, g);
			}
			const sid = String(r.sid);
			if (g.seenSids.has(sid)) continue;
			g.seenSids.add(sid);
			g.count++;
			// Three kinds of move under the + Seiyuu lens: a voice move, a core move
			// (a core credit at both ends), and the rest (QA, vocals, a core credit at
			// one end only), which belongs to neither count.
			if (Number(r.is_seiyuu)) g.seiyuuCount++;
			else if (Number(r.is_core_move) === 1) g.coreCount++;
			if (r.gap_years !== null) {
				const gap = Number(r.gap_years);
				g.gapSum += gap;
				g.gapCnt++;
				g.minGapYears = g.minGapYears == null ? gap : Math.min(g.minGapYears, gap);
				g.maxGapYears = g.maxGapYears == null ? gap : Math.max(g.maxGapYears, gap);
			}
			if (g.people.length < 60) {
				g.people.push({
					sid,
					name: String(r.s_latin || r.s_name),
					original: orig(r.s_name, r.s_latin),
					isSeiyuu: Boolean(r.is_seiyuu),
					fromFirstYear: r.from_first_year !== null ? Number(r.from_first_year) : null,
					fromLastYear: r.from_last_year !== null ? Number(r.from_last_year) : null,
					toFirstYear: r.to_first_year !== null ? Number(r.to_first_year) : null,
					toLastYear: r.to_last_year !== null ? Number(r.to_last_year) : null,
					aliasChanged: Boolean(r.alias_changed),
					gapYears: r.gap_years !== null ? Number(r.gap_years) : null
				});
			}
		}
		return [...grouped.values()]
			.sort((a, b) => b.coreCount - a.coreCount || b.count - a.count)
			.slice(0, 14)
			.map(({ gapSum, gapCnt, seenSids: _, ...rest }) => ({
				...rest,
				avgGapYears: gapCnt > 0 ? Number((gapSum / gapCnt).toFixed(1)) : null
			}));
	};

	const inflow = buildMigration('in');
	const outflow = buildMigration('out');

	// Residual buckets for the migration diagram: people with no earlier, or no
	// later, brand on record. Read from the tenures themselves, not from the
	// transition rows: those are capped (a few recent predecessors, a gap limit,
	// and only the 35 busiest brands of anyone past 45), so a busy freelancer's
	// lesser brands had no row either way and counted as both a debut and a
	// last stop. Under the core lens the other brand needs a core credit too,
	// like a core move does.
	//
	// A tenure with no year (every title here undated or unreleased) has no
	// place in the order: `x.first_year < NULL` is never true, so without the
	// guard such a person had "no earlier brand" and "no later brand" at once
	// and was counted as a debut and as a last stop. They stay in the totals and
	// in neither bucket, as the transition builder leaves them out of the moves.
	const latestYear = getDumpYear();
	const tenureSeiyuuClause = includeSeiyuu ? '' : 'AND t.core_vn_count > 0';
	const otherTenure = (cmp: '<' | '>') =>
		`EXISTS (
               SELECT 1 FROM staff_brand_tenure x
               WHERE x.sid = t.sid AND x.pid <> t.pid
                 AND x.first_year IS NOT NULL AND x.first_year ${cmp} t.first_year
                 ${includeSeiyuu ? '' : 'AND x.core_vn_count > 0'}
             )`;
	const residual = db
		.prepare(
			`SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN t.core_vn_count > 0 THEN 1 ELSE 0 END) AS core_total,
         SUM(CASE WHEN t.core_vn_count = 0 AND t.seiyuu_vn_count > 0 THEN 1 ELSE 0 END) AS seiyuu_total,
         SUM(CASE WHEN t.first_year IS NOT NULL AND NOT ${otherTenure('<')} THEN 1 ELSE 0 END) AS debuted,
         SUM(CASE WHEN t.first_year IS NOT NULL AND NOT ${otherTenure('>')} AND COALESCE(t.last_year, 0) < ? THEN 1 ELSE 0 END) AS no_later,
         SUM(CASE WHEN t.first_year IS NOT NULL AND NOT ${otherTenure('>')} AND COALESCE(t.last_year, 0) >= ? THEN 1 ELSE 0 END) AS still_active
       FROM staff_brand_tenure t
       WHERE t.pid = ? ${tenureSeiyuuClause}`
		)
		.get(latestYear - 3, latestYear - 3, pid) as Record<string, unknown>;
	const migrationSummary: MigrationSummary = {
		totalPeople: Number(residual.total || 0),
		corePeople: Number(residual.core_total || 0),
		seiyuuPeople: Number(residual.seiyuu_total || 0),
		debutedHereCount: Number(residual.debuted || 0),
		noLaterCreditsCount: Number(residual.no_later || 0),
		stillActiveCount: Number(residual.still_active || 0),
		latestYear
	};

	// Roster. Development staff and voice cast are two populations with a cap
	// each: under one shared cap a large studio's staff filled every slot and the
	// Seiyuu tab came back short or empty. A person credited in both is fetched
	// by either query and kept once.
	const rosterSelect = `SELECT t.sid, t.vn_count, t.core_vn_count, t.seiyuu_vn_count, t.dev_vn_count, t.first_year, t.last_year, t.roles_json, t.aliases_json,
              s.name, s.latin, s.main_aid, s.gender, s.primary_discipline, s.is_seiyuu, s.is_core_staff, s.brand_count, s.potential_alias_count
       FROM staff_brand_tenure t
       JOIN staff s ON s.id = t.sid`;
	const rosterDevRows = db
		.prepare(
			`${rosterSelect}
       WHERE t.pid = ? AND t.dev_vn_count > 0
       ORDER BY t.dev_vn_count DESC, t.core_vn_count DESC, t.first_year ASC, t.sid ASC
       LIMIT ${PRODUCER_ROSTER_LIMIT}`
		)
		.all(pid) as Array<Record<string, unknown>>;
	const rosterSeiyuuRows = db
		.prepare(
			`${rosterSelect}
       WHERE t.pid = ? AND t.seiyuu_vn_count > 0
       ORDER BY t.seiyuu_vn_count DESC, t.first_year ASC, t.sid ASC
       LIMIT ${PRODUCER_ROSTER_LIMIT}`
		)
		.all(pid) as Array<Record<string, unknown>>;
	const rosterSeen = new Set<string>();
	const rosterRows = [...rosterDevRows, ...rosterSeiyuuRows].filter((r) => {
		const sid = String(r.sid);
		if (rosterSeen.has(sid)) return false;
		rosterSeen.add(sid);
		return true;
	});

	// True head counts for the roster's headings, whatever the cap above cuts off.
	const rosterCount = db
		.prepare(
			`SELECT COUNT(*) AS total,
              SUM(CASE WHEN dev_vn_count > 0 THEN 1 ELSE 0 END) AS dev,
              SUM(CASE WHEN seiyuu_vn_count > 0 THEN 1 ELSE 0 END) AS seiyuu
       FROM staff_brand_tenure WHERE pid = ?`
		)
		.get(pid) as Record<string, unknown>;
	const rosterTotals = {
		all: Number(rosterCount.total || 0),
		dev: Number(rosterCount.dev || 0),
		seiyuu: Number(rosterCount.seiyuu || 0),
		limit: PRODUCER_ROSTER_LIMIT
	};

	const roster: BrandRosterMember[] = rosterRows.map((r) => {
		const primaryName = String(r.latin || r.name);
		const aliasView = tenureAliasView(
			tenureAliases(r.aliases_json),
			r.main_aid,
			primaryName,
			r.name
		);
		return {
			sid: String(r.sid),
			name: primaryName,
			latin: r.latin ? String(r.latin) : null,
			gender: r.gender ? String(r.gender) : null,
			primaryDiscipline: String(r.primary_discipline) as StaffDiscipline,
			isSeiyuu: Boolean(r.is_seiyuu),
			isCoreStaff: Boolean(r.is_core_staff),
			vnCountAtBrand: Number(r.vn_count),
			coreVnCountAtBrand: Number(r.core_vn_count),
			seiyuuVnCountAtBrand: Number(r.seiyuu_vn_count),
			devVnCountAtBrand: Number(r.dev_vn_count),
			firstYear: r.first_year !== null ? Number(r.first_year) : null,
			lastYear: r.last_year !== null ? Number(r.last_year) : null,
			roles: safeJson<string[]>(r.roles_json, []),
			aliasesAtBrand: aliasView.labels,
			usedNonPrimaryAlias: aliasView.usedNonPrimaryAlias,
			penNames: aliasView.penNames,
			totalBrands: Number(r.brand_count),
			potentialAliasCount: Number(r.potential_alias_count),
			original: orig(r.name, r.latin)
		};
	});

	// Games catalog. Developed titles and published / ported ones are capped
	// separately, so a long list of one never crowds out the other; the headings
	// state the true totals.
	const gamesStmt = db.prepare(
		`SELECT v.id, v.title, v.original, v.olang, v.first_year, v.c_rating, v.c_votecount, v.has_ero, v.has_all_ages,
            vd.is_original_dev, vd.is_publisher
     FROM vn_developers vd
     JOIN vns v ON v.id = vd.vid
     WHERE vd.pid = ? AND vd.is_original_dev = ?
     ORDER BY v.first_year DESC, v.c_votecount DESC, v.id ASC
     LIMIT ${PRODUCER_GAMES_LIMIT}`
	);
	const gamesRows = [
		...(gamesStmt.all(pid, 1) as Array<Record<string, unknown>>),
		...(gamesStmt.all(pid, 0) as Array<Record<string, unknown>>)
	];
	const gamesCount = db
		.prepare(
			`SELECT COUNT(*) AS total, SUM(CASE WHEN is_original_dev = 1 THEN 1 ELSE 0 END) AS developed
       FROM vn_developers WHERE pid = ?`
		)
		.get(pid) as Record<string, unknown>;
	const gamesTotal = Number(gamesCount.total || 0);
	const gamesTotals = {
		all: gamesTotal,
		developed: Number(gamesCount.developed || 0),
		published: gamesTotal - Number(gamesCount.developed || 0),
		limit: PRODUCER_GAMES_LIMIT
	};

	const games = gamesRows.map((r) => ({
		id: String(r.id),
		title: String(r.title),
		original: r.original ? String(r.original) : null,
		olang: r.olang ? String(r.olang) : null,
		firstYear: r.first_year !== null ? Number(r.first_year) : null,
		rating: r.c_rating !== null ? Number(r.c_rating) : null,
		votecount: Number(r.c_votecount || 0),
		hasEro: Boolean(r.has_ero),
		hasAllAges: Boolean(r.has_all_ages),
		isOriginalDev: Boolean(r.is_original_dev),
		isPublisher: Boolean(r.is_publisher)
	}));

	return {
		producer: {
			id: String(p.id),
			type: String(p.type) as ProducerType,
			lang: p.lang ? String(p.lang) : null,
			name: String(p.latin || p.name),
			original: p.latin && p.name !== p.latin ? String(p.name) : null,
			alias: p.alias ? String(p.alias).split('\n').filter(Boolean) : [],
			description: p.description ? String(p.description) : null,
			vnCount: Number(p.vn_count),
			staffCount: Number(p.staff_count),
			seiyuuCount: Number(p.seiyuu_count),
			firstYear: p.first_year !== null ? Number(p.first_year) : null,
			lastYear: p.last_year !== null ? Number(p.last_year) : null
		},
		extlinks,
		linkedCreators: linkedCreators.map((c) => ({
			id: String(c.id),
			name: String(c.latin || c.name),
			original: orig(c.name, c.latin),
			discipline: String(c.primary_discipline)
		})),
		explicitRelations,
		inferredRelations,
		inferredTotal,
		graph: {
			nodes: [...nodeMap.values()],
			edges,
			inferredLimit: GRAPH_INFERRED_LIMIT
		},
		inflow,
		outflow,
		migrationSummary,
		roster,
		rosterTotals,
		games,
		gamesTotal,
		gamesTotals
	};
}

/** Rows in each of the two collaborator lists (closest, and co-movers). */
const COLLAB_SLICE = 16;

export function getStaffDetail(sidInput: string) {
	const db = getDb();
	const sid = normId(sidInput);
	const s = db.prepare(`SELECT * FROM staff WHERE id = ?`).get(sid) as
		| Record<string, unknown>
		| undefined;
	if (!s) return null;

	const extlinks = db
		.prepare(`SELECT site, value, url FROM staff_extlinks WHERE sid = ?`)
		.all(sid) as Array<{ site: string; value: string; url: string | null }>;

	const personalProducer = s.prod
		? (db
				.prepare(`SELECT id, name, latin, type FROM producers WHERE id = ?`)
				.get(String(s.prod)) as Record<string, unknown> | undefined)
		: undefined;

	// Confirmed VNDB aliases + where each alias was used
	const rawAliases = db
		.prepare(`SELECT aid, name, latin, is_main FROM staff_alias WHERE sid = ? ORDER BY is_main DESC, aid ASC`)
		.all(sid) as Array<Record<string, unknown>>;

	const aliasUsageRows = db
		.prepare(
			`SELECT c.aid, vd.pid, p.name AS p_name, p.latin AS p_latin, MIN(c.first_year) AS min_yr, MAX(c.first_year) AS max_yr, COUNT(DISTINCT c.vid) AS vn_cnt
       FROM (
         SELECT aid, vid, first_year FROM vn_staff_credits WHERE sid = ? AND eid IS NULL
         UNION ALL
         SELECT aid, vid, first_year FROM vn_seiyuu_credits WHERE sid = ?
       ) c
       LEFT JOIN vn_developers vd ON vd.vid = c.vid AND vd.is_original_dev = 1
       LEFT JOIN producers p ON p.id = vd.pid
       GROUP BY c.aid, vd.pid
       ORDER BY vn_cnt DESC`
		)
		.all(sid, sid) as Array<Record<string, unknown>>;

	const usageByAid = new Map<
		number,
		Array<{
			pid: string;
			name: string;
			original: string | null;
			vnCount: number;
			firstYear: number | null;
			lastYear: number | null;
		}>
	>();
	for (const r of aliasUsageRows) {
		if (!r.pid) continue;
		const aid = Number(r.aid);
		if (!usageByAid.has(aid)) usageByAid.set(aid, []);
		usageByAid.get(aid)!.push({
			pid: String(r.pid),
			name: String(r.p_latin || r.p_name),
			original: orig(r.p_name, r.p_latin),
			vnCount: Number(r.vn_cnt),
			firstYear: r.min_yr !== null ? Number(r.min_yr) : null,
			lastYear: r.max_yr !== null ? Number(r.max_yr) : null
		});
	}

	const confirmedAliases = rawAliases.map((a) => {
		const allBrands = usageByAid.get(Number(a.aid)) || [];
		return {
			aid: Number(a.aid),
			name: String(a.latin || a.name),
			original: a.latin && a.name !== a.latin ? String(a.name) : null,
			isMain: Boolean(a.is_main),
			// Keep up to 24 brands so inline expansion on the staff page covers nearly every alias.
			brands: allBrands.slice(0, 24),
			brandCount: allBrands.length
		};
	});

	// Potential Unlinked Aliases (Inferred!)
	const potRows = db
		.prepare(
			`${POTENTIAL_ALIAS_SELECT}
       WHERE pa.sid_a = ? OR pa.sid_b = ?
       ORDER BY pa.confidence DESC`
		)
		.all(sid, sid) as Array<Record<string, unknown>>;
	const potentialAliases = potRows.map(mapPotentialAliasRow);

	// Brand tracks (chronological + studio affinity)
	const tenureRows = db
		.prepare(
			`SELECT t.pid, t.vn_count, t.core_vn_count, t.seiyuu_vn_count, t.first_year, t.last_year, t.roles_json, t.aliases_json,
              p.name, p.latin, p.type
       FROM staff_brand_tenure t
       JOIN producers p ON p.id = t.pid
       WHERE t.sid = ?
       ORDER BY COALESCE(t.first_year, 9999) ASC, t.vn_count DESC`
		)
		.all(sid) as Array<Record<string, unknown>>;

	const totalBrandVns = tenureRows.reduce((acc, r) => acc + Number(r.vn_count), 0) || 1;
	const primaryDisplay = String(s.latin || s.name);

	const brandTracks: StaffBrandTrack[] = tenureRows.map((r) => {
		const aliasView = tenureAliasView(
			tenureAliases(r.aliases_json),
			s.main_aid,
			primaryDisplay,
			s.name
		);
		return {
			pid: String(r.pid),
			name: String(r.latin || r.name),
			latin: r.latin ? String(r.latin) : null,
			type: String(r.type) as ProducerType,
			vnCount: Number(r.vn_count),
			coreVnCount: Number(r.core_vn_count),
			seiyuuVnCount: Number(r.seiyuu_vn_count),
			firstYear: r.first_year !== null ? Number(r.first_year) : null,
			lastYear: r.last_year !== null ? Number(r.last_year) : null,
			roles: safeJson<string[]>(r.roles_json, []),
			aliasesUsed: aliasView.labels,
			usedNonPrimaryAlias: aliasView.usedNonPrimaryAlias,
			penNames: aliasView.penNames,
			shareOfCareer: Number((Number(r.vn_count) / totalBrandVns).toFixed(3)),
			original: orig(r.name, r.latin)
		};
	});

	// Chronological timeline events (VN credits + voiced characters + studio + aliases used).
	// A credit on a later edition (`eid`: a port, a localisation) belongs to that
	// edition's house, which VNDB does not attach to the credit: it gets no brand
	// at all rather than the original studio's.
	const staffCreds = db
		.prepare(
			`SELECT c.vid, c.aid, c.role, c.alias_name, c.alias_latin, c.first_year, c.eid,
              v.title, v.original, v.has_ero, v.has_all_ages,
              vd.pid, p.name AS p_name, p.latin AS p_latin, p.type AS p_type
       FROM vn_staff_credits c
       JOIN vns v ON v.id = c.vid
       LEFT JOIN vn_developers vd ON vd.vid = c.vid AND vd.is_original_dev = 1 AND c.eid IS NULL
       LEFT JOIN producers p ON p.id = vd.pid
       WHERE c.sid = ?
       ORDER BY COALESCE(c.first_year, 9999) ASC, v.title ASC`
		)
		.all(sid) as Array<Record<string, unknown>>;

	const seiyuuCreds = db
		.prepare(
			`SELECT c.vid, c.aid, c.cid, c.char_name, c.char_latin, c.alias_name, c.alias_latin, c.first_year,
              v.title, v.original, v.has_ero, v.has_all_ages,
              vd.pid, p.name AS p_name, p.latin AS p_latin, p.type AS p_type
       FROM vn_seiyuu_credits c
       JOIN vns v ON v.id = c.vid
       LEFT JOIN vn_developers vd ON vd.vid = c.vid AND vd.is_original_dev = 1
       LEFT JOIN producers p ON p.id = vd.pid
       WHERE c.sid = ?
       ORDER BY COALESCE(c.first_year, 9999) ASC, v.title ASC`
		)
		.all(sid) as Array<Record<string, unknown>>;

	// Merge by (vid, pid, edition): one event per VN and brand, carrying its
	// roles, characters and every alias the person was credited under on it.
	const eventMap = new Map<string, StaffTimelineEvent>();
	const eventFor = (r: Record<string, unknown>, isEdition: boolean): StaffTimelineEvent => {
		const vid = String(r.vid);
		const pid = !isEdition && r.pid ? String(r.pid) : null;
		const key = `${vid}|${pid || ''}|${isEdition ? 'e' : ''}`;
		let ev = eventMap.get(key);
		if (!ev) {
			ev = {
				vid,
				vnTitle: String(r.title),
				vnOriginal: r.original ? String(r.original) : null,
				year: r.first_year !== null ? Number(r.first_year) : null,
				pid,
				producerName: pid ? String(r.p_latin || r.p_name) : null,
				producerOriginal: pid ? orig(r.p_name, r.p_latin) : null,
				producerType: pid && r.p_type ? (String(r.p_type) as ProducerType) : null,
				roles: [],
				isSeiyuu: false,
				characters: [],
				aliases: [],
				aliasUsed: '',
				isNonPrimaryAlias: false,
				hasEro: Boolean(r.has_ero),
				hasAllAges: Boolean(r.has_all_ages),
				isEdition
			};
			eventMap.set(key, ev);
		}
		return ev;
	};
	const noteAlias = (ev: StaffTimelineEvent, r: Record<string, unknown>, kind: 'dev' | 'voice') => {
		const name = String(r.alias_latin || r.alias_name);
		// Two pen names can share a romanisation (ヒマリ and 陽茉莉 are both
		// "Himari"): a name is the pair of its romanised and original forms.
		const original = orig(r.alias_name, r.alias_latin);
		let alias = ev.aliases.find((a) => a.name === name && a.original === original);
		if (!alias) {
			const isNonPrimary = isNonPrimaryCredit(r.aid, s.main_aid, name, primaryDisplay, s.name);
			alias = {
				name,
				original,
				isNonPrimary,
				sameRomanisation: isNonPrimary && original !== null && name === primaryDisplay,
				dev: false,
				voice: false
			};
			ev.aliases.push(alias);
		}
		alias[kind] = true;
	};

	for (const r of staffCreds) {
		const ev = eventFor(r, r.eid !== null);
		noteAlias(ev, r, 'dev');
		const role = String(r.role);
		if (!ev.roles.includes(role)) ev.roles.push(role);
	}

	for (const r of seiyuuCreds) {
		const ev = eventFor(r, false);
		noteAlias(ev, r, 'voice');
		ev.isSeiyuu = true;
		if (!ev.roles.includes('seiyuu')) ev.roles.push('seiyuu');
		const cid = String(r.cid);
		if (!ev.characters.some((c) => c.cid === cid)) {
			ev.characters.push({
				cid,
				name: String(r.char_latin || r.char_name),
				original: orig(r.char_name, r.char_latin)
			});
		}
	}

	// The alias shown where there is room for one: a pen name before the primary name.
	for (const ev of eventMap.values()) {
		const lead = ev.aliases.find((a) => a.isNonPrimary) ?? ev.aliases[0];
		ev.aliasUsed = lead?.name ?? primaryDisplay;
		ev.isNonPrimaryAlias = ev.aliases.some((a) => a.isNonPrimary);
	}

	const timelineEvents = [...eventMap.values()].sort(
		(a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.vnTitle.localeCompare(b.vnTitle)
	);

	// Brand-to-brand career transitions
	const transRows = db
		.prepare(
			`SELECT t.from_pid, pf.name AS fn, pf.latin AS fl, t.to_pid, pt.name AS tn, pt.latin AS tl,
              t.from_first_year, t.from_last_year, t.to_first_year, t.to_last_year, t.gap_years, t.alias_changed,
              pr.relation AS exp_rel
       FROM staff_brand_transitions t
       JOIN producers pf ON pf.id = t.from_pid
       JOIN producers pt ON pt.id = t.to_pid
       LEFT JOIN producers_relations pr ON pr.id = t.from_pid AND pr.pid = t.to_pid
       WHERE t.sid = ?
       ORDER BY t.to_first_year ASC, t.from_last_year ASC
       LIMIT 160`
		)
		.all(sid) as Array<Record<string, unknown>>;

	const transitions: StaffTransition[] = transRows.map((r) => ({
		fromPid: String(r.from_pid),
		fromName: String(r.fl || r.fn),
		fromOriginal: orig(r.fn, r.fl),
		toPid: String(r.to_pid),
		toName: String(r.tl || r.tn),
		toOriginal: orig(r.tn, r.tl),
		fromFirstYear: r.from_first_year !== null ? Number(r.from_first_year) : null,
		fromLastYear: r.from_last_year !== null ? Number(r.from_last_year) : null,
		toFirstYear: r.to_first_year !== null ? Number(r.to_first_year) : null,
		toLastYear: r.to_last_year !== null ? Number(r.to_last_year) : null,
		gapYears: r.gap_years !== null ? Number(r.gap_years) : null,
		aliasChanged: Boolean(r.alias_changed),
		explicitRelation: r.exp_rel ? (String(r.exp_rel) as ExplicitRelationCode) : null
	}));

	// Frequent Collaborators / Co-Movers (and Co-Stars for Seiyuu)
	// A dual record (voice and development credits) is compared within whichever
	// discipline holds more of its visual novels.
	const seiyuuVns = Number(s.seiyuu_vn_count || 0);
	const devVnRow = db
		.prepare(`SELECT COUNT(DISTINCT vid) AS n FROM vn_staff_credits WHERE sid = ? AND eid IS NULL`)
		.get(sid) as { n: number };
	const collabKind: 'seiyuu' | 'staff' =
		Number(s.is_seiyuu) && seiyuuVns >= Number(devVnRow.n || 0) ? 'seiyuu' : 'staff';
	const collabTable = collabKind === 'seiyuu' ? 'vn_seiyuu_credits' : 'vn_staff_credits';
	const collabFilter = collabTable === 'vn_staff_credits' ? 'AND c1.eid IS NULL AND c2.eid IS NULL' : '';
	// Two lists share one table, and each needs its own top slice: the closest
	// collaborators (most shared VNs, typically a lifelong colleague at a single
	// studio) and the co-movers (most shared brands). One list ranked by brands
	// alone fills up with two-brand acquaintances and drops the first kind.
	const collabRows = db
		.prepare(
			`WITH agg AS (
         SELECT c2.sid, s2.name, s2.latin, s2.primary_discipline, s2.roles_json, s2.potential_alias_count,
                COUNT(DISTINCT c1.vid) AS shared_vns,
                COUNT(DISTINCT vd.pid) AS shared_brands,
                GROUP_CONCAT(
                  CASE WHEN p.id IS NOT NULL
                    THEN p.id || char(30) || COALESCE(p.latin, p.name) || char(30) ||
                         CASE WHEN p.latin IS NOT NULL AND p.name != p.latin THEN p.name ELSE '' END
                  END,
                  char(31)
                ) AS brand_entries
         FROM ${collabTable} c1
         JOIN ${collabTable} c2 ON c2.vid = c1.vid AND c2.sid != c1.sid
         JOIN staff s2 ON s2.id = c2.sid
         LEFT JOIN vn_developers vd ON vd.vid = c1.vid AND vd.is_original_dev = 1
         LEFT JOIN producers p ON p.id = vd.pid
         WHERE c1.sid = ? ${collabFilter}
         GROUP BY c2.sid
       ),
       ranked AS (
         SELECT agg.*,
                ROW_NUMBER() OVER (ORDER BY shared_vns DESC, shared_brands DESC, sid ASC) AS by_vns,
                ROW_NUMBER() OVER (ORDER BY shared_brands DESC, shared_vns DESC, sid ASC) AS by_brands
         FROM agg
       )
       SELECT * FROM ranked
       WHERE by_vns <= ${COLLAB_SLICE} OR (shared_brands >= 2 AND by_brands <= ${COLLAB_SLICE})
       ORDER BY by_vns ASC`
		)
		.all(sid) as Array<Record<string, unknown>>;

	const collaborators: StaffCollaborator[] = collabRows.map((r) => {
		const seenBrands = new Map<string, { pid: string; name: string; original: string | null }>();
		if (r.brand_entries) {
			for (const entry of String(r.brand_entries).split('\x1f')) {
				if (!entry) continue;
				const [pid, name, original] = entry.split('\x1e');
				if (pid && name && !seenBrands.has(pid)) {
					seenBrands.set(pid, { pid, name, original: original || null });
				}
			}
		}
		const brands = [...seenBrands.values()];
		return {
			sid: String(r.sid),
			name: String(r.latin || r.name),
			latin: r.latin ? String(r.latin) : null,
			primaryDiscipline: String(r.primary_discipline) as StaffDiscipline,
			sharedVns: Number(r.shared_vns),
			sharedBrands: Number(r.shared_brands),
			brandNames: brands.map((b) => b.name),
			brands,
			roles: safeJson<string[]>(r.roles_json, []),
			potentialAliasCount: Number(r.potential_alias_count || 0),
			original: orig(r.name, r.latin)
		};
	});

	return {
		staff: {
			id: String(s.id),
			name: primaryDisplay,
			original: s.latin && s.name !== s.latin ? String(s.name) : null,
			gender: s.gender ? String(s.gender) : null,
			lang: s.lang ? String(s.lang) : null,
			description: s.description ? String(s.description) : null,
			primaryDiscipline: String(s.primary_discipline) as StaffDiscipline,
			roles: safeJson<string[]>(s.roles_json, []),
			isSeiyuu: Boolean(s.is_seiyuu),
			isCoreStaff: Boolean(s.is_core_staff),
			brandCount: Number(s.brand_count),
			seiyuuBrandCount: Number(s.seiyuu_brand_count),
			vnCount: Number(s.vn_count),
			seiyuuVnCount: Number(s.seiyuu_vn_count),
			firstYear: s.first_year !== null ? Number(s.first_year) : null,
			lastYear: s.last_year !== null ? Number(s.last_year) : null,
			aliasCount: Number(s.alias_count),
			potentialAliasCount: Number(s.potential_alias_count),
			eroRate: s.ero_rate !== null ? Number(s.ero_rate) : null,
			personalProducer: personalProducer
				? {
						id: String(personalProducer.id),
						name: String(personalProducer.latin || personalProducer.name),
						original: orig(personalProducer.name, personalProducer.latin),
						type: String(personalProducer.type) as ProducerType
					}
				: null
		},
		extlinks,
		confirmedAliases,
		potentialAliases,
		brandTracks,
		timelineEvents,
		transitions,
		collaborators,
		collabKind
	};
}

/** Shared people listed on Compare; `sharedTotals` reports the true counts. */
const SHARED_PEOPLE_LIMIT = 300;

export function compareBrands(rawA: string, rawB: string) {
	const db = getDb();
	const pidAInput = normId(rawA);
	const pidBInput = normId(rawB);
	const pA = db.prepare(`SELECT * FROM producers WHERE id = ?`).get(pidAInput) as
		| Record<string, unknown>
		| undefined;
	const pB = db.prepare(`SELECT * FROM producers WHERE id = ?`).get(pidBInput) as
		| Record<string, unknown>
		| undefined;
	if (!pA || !pB) return null;

	const [lo, hi] = pidAInput < pidBInput ? [pidAInput, pidBInput] : [pidBInput, pidAInput];
	const infRow = db
		.prepare(`${INFERRED_BRAND_SELECT} WHERE b.pid_a = ? AND b.pid_b = ?`)
		.get(lo, hi) as Record<string, unknown> | undefined;

	// Shortest explicit VNDB path via BFS (max 5 hops)
	const findExplicitPath = (): Array<{
		id: string;
		name: string;
		original: string | null;
		relationFromPrev?: ExplicitRelationCode;
	}> | null => {
		if (pidAInput === pidBInput) {
			return [
				{ id: pidAInput, name: String(pA.latin || pA.name), original: orig(pA.name, pA.latin) }
			];
		}
		const relStmt = db.prepare(`SELECT pid, relation FROM producers_relations WHERE id = ?`);
		const visited = new Map<string, { prev: string | null; rel: string | null }>([
			[pidAInput, { prev: null, rel: null }]
		]);
		const queue: Array<{ id: string; depth: number }> = [{ id: pidAInput, depth: 0 }];
		let found = false;
		while (queue.length > 0) {
			const cur = queue.shift()!;
			if (cur.depth >= 5) continue;
			const neighbors = relStmt.all(cur.id) as Array<{ pid: string; relation: string }>;
			for (const n of neighbors) {
				if (visited.has(n.pid)) continue;
				visited.set(n.pid, { prev: cur.id, rel: n.relation });
				if (n.pid === pidBInput) {
					found = true;
					break;
				}
				queue.push({ id: n.pid, depth: cur.depth + 1 });
			}
			if (found) break;
		}
		if (!found) return null;
		const chain: Array<{ id: string; rel: string | null }> = [];
		let curr: string | null = pidBInput;
		while (curr) {
			const step: { prev: string | null; rel: string | null } = visited.get(curr)!;
			chain.push({ id: curr, rel: step.rel });
			curr = step.prev;
		}
		chain.reverse();
		const nameStmt = db.prepare(`SELECT name, latin FROM producers WHERE id = ?`);
		return chain.map((c) => {
			const row = nameStmt.get(c.id) as { name: string; latin: string | null } | undefined;
			return {
				id: c.id,
				name: row ? row.latin || row.name : c.id,
				original: row ? orig(row.name, row.latin) : null,
				...(c.rel ? { relationFromPrev: c.rel as ExplicitRelationCode } : {})
			};
		});
	};

	const explicitPath = findExplicitPath();

	// Shared people (core staff + seiyuu) with alias-at-A vs alias-at-B!
	const sharedRows = db
		.prepare(
			`SELECT ta.sid, s.name, s.latin, s.main_aid, s.primary_discipline, s.brand_count, s.potential_alias_count,
              ta.vn_count AS vns_a, ta.core_vn_count AS core_a, ta.seiyuu_vn_count AS sei_a,
              ta.first_year AS first_a, ta.last_year AS last_a, ta.roles_json AS roles_a, ta.aliases_json AS aliases_a,
              tb.vn_count AS vns_b, tb.core_vn_count AS core_b, tb.seiyuu_vn_count AS sei_b,
              tb.first_year AS first_b, tb.last_year AS last_b, tb.roles_json AS roles_b, tb.aliases_json AS aliases_b
       FROM staff_brand_tenure ta
       JOIN staff_brand_tenure tb ON tb.sid = ta.sid
       JOIN staff s ON s.id = ta.sid
       WHERE ta.pid = ? AND tb.pid = ?
       ORDER BY (ta.core_vn_count > 0 AND tb.core_vn_count > 0) DESC, s.brand_count ASC, (ta.vn_count + tb.vn_count) DESC, ta.sid ASC
       LIMIT ${SHARED_PEOPLE_LIMIT}`
		)
		.all(pidAInput, pidBInput) as Array<Record<string, unknown>>;

	// True head counts: the list above is capped, and these are the figures the
	// verdict's "Shared staff" and "Shared seiyuu" must agree with.
	const sharedCount = db
		.prepare(
			`SELECT COUNT(*) AS total,
              SUM(CASE WHEN ta.core_vn_count > 0 AND tb.core_vn_count > 0 THEN 1 ELSE 0 END) AS core,
              SUM(CASE WHEN ta.seiyuu_vn_count > 0 AND tb.seiyuu_vn_count > 0 THEN 1 ELSE 0 END) AS seiyuu,
              SUM(CASE WHEN ta.core_vn_count > 0 AND tb.core_vn_count > 0
                        AND ta.seiyuu_vn_count > 0 AND tb.seiyuu_vn_count > 0 THEN 1 ELSE 0 END) AS both_kinds
       FROM staff_brand_tenure ta
       JOIN staff_brand_tenure tb ON tb.sid = ta.sid
       WHERE ta.pid = ? AND tb.pid = ?`
		)
		.get(pidAInput, pidBInput) as Record<string, unknown>;
	const sharedTotals = {
		all: Number(sharedCount.total || 0),
		core: Number(sharedCount.core || 0),
		seiyuu: Number(sharedCount.seiyuu || 0),
		/** Shared in a core role and as a voice: counted under both of the above. */
		both: Number(sharedCount.both_kinds || 0),
		/** Credited at both brands, but neither in a core role at both nor as a voice at both. */
		other:
			Number(sharedCount.total || 0) -
			Number(sharedCount.core || 0) -
			Number(sharedCount.seiyuu || 0) +
			Number(sharedCount.both_kinds || 0),
		limit: SHARED_PEOPLE_LIMIT
	};

	const sharedPeople = sharedRows.map((r) => {
		const primaryShown = String(r.latin || r.name);
		const rawA = tenureAliases(r.aliases_a);
		const rawB = tenureAliases(r.aliases_b);
		const viewA = tenureAliasView(rawA, r.main_aid, primaryShown, r.name);
		const viewB = tenureAliasView(rawB, r.main_aid, primaryShown, r.name);
		const aliasSwitched = aliasesSwitched(rawA, rawB);
		const isSharedCore = Number(r.core_a) > 0 && Number(r.core_b) > 0;
		const isSharedSeiyuu = Number(r.sei_a) > 0 && Number(r.sei_b) > 0;
		return {
			sid: String(r.sid),
			name: String(r.latin || r.name),
			original: r.latin && r.name !== r.latin ? String(r.name) : null,
			primaryDiscipline: String(r.primary_discipline) as StaffDiscipline,
			brandCount: Number(r.brand_count),
			potentialAliasCount: Number(r.potential_alias_count),
			isSharedCore,
			isSharedSeiyuu,
			vnsA: Number(r.vns_a),
			vnsB: Number(r.vns_b),
			firstYearA: r.first_a !== null ? Number(r.first_a) : null,
			lastYearA: r.last_a !== null ? Number(r.last_a) : null,
			firstYearB: r.first_b !== null ? Number(r.first_b) : null,
			lastYearB: r.last_b !== null ? Number(r.last_b) : null,
			rolesA: safeJson<string[]>(r.roles_a, []),
			rolesB: safeJson<string[]>(r.roles_b, []),
			aliasesA: viewA.labels,
			aliasesB: viewB.labels,
			penNamesA: viewA.penNames,
			penNamesB: viewB.penNames,
			aliasSwitched
		};
	});

	// Side-by-side yearly release counts AND the actual VNs released each year.
	const yearVns = (pid: string) => {
		const rows = db
			.prepare(
				`SELECT v.first_year AS yr, v.id, v.title, v.original
         FROM vn_developers vd
         JOIN vns v ON v.id = vd.vid
         WHERE vd.pid = ? AND vd.is_original_dev = 1 AND v.first_year IS NOT NULL
         ORDER BY v.first_year ASC, v.c_votecount DESC, v.title ASC`
			)
			.all(pid) as Array<{ yr: number; id: string; title: string; original: string | null }>;
		const map = new Map<number, Array<{ id: string; title: string; original: string | null }>>();
		for (const r of rows) {
			const yr = Number(r.yr);
			let list = map.get(yr);
			if (!list) {
				list = [];
				map.set(yr, list);
			}
			list.push({ id: String(r.id), title: String(r.title), original: r.original ? String(r.original) : null });
		}
		return map;
	};
	const yA = yearVns(pidAInput);
	const yB = yearVns(pidBInput);
	const allYears = [...new Set([...yA.keys(), ...yB.keys()])].sort((a, b) => a - b);
	const timelineSeries = allYears.map((year) => {
		const vnsA = yA.get(year) ?? [];
		const vnsB = yB.get(year) ?? [];
		return {
			year,
			countA: vnsA.length,
			countB: vnsB.length,
			vnsA,
			vnsB
		};
	});

	// Co-developed VNs
	const coDevVns = db
		.prepare(
			`SELECT v.id, v.title, v.original, v.first_year
       FROM vn_developers da
       JOIN vn_developers db2 ON db2.vid = da.vid
       JOIN vns v ON v.id = da.vid
       WHERE da.pid = ? AND db2.pid = ? AND da.is_original_dev = 1 AND db2.is_original_dev = 1
       ORDER BY v.first_year DESC`
		)
		.all(pidAInput, pidBInput) as Array<{
		id: string;
		title: string;
		original: string | null;
		first_year: number | null;
	}>;

	// Shared external links
	const sharedExtlinks = db
		.prepare(
			`SELECT DISTINCT ea.site, ea.value, ea.url
       FROM producer_extlinks ea
       JOIN producer_extlinks eb ON eb.site = ea.site AND eb.value = ea.value
       WHERE ea.pid = ? AND eb.pid = ?`
		)
		.all(pidAInput, pidBInput) as Array<{ site: string; value: string; url: string | null }>;

	const toProdSummary = (r: Record<string, unknown>): ProducerSummary => ({
		id: String(r.id),
		type: String(r.type) as ProducerType,
		lang: r.lang ? String(r.lang) : null,
		name: String(r.latin || r.name),
		latin: r.latin ? String(r.latin) : null,
		alias: r.alias ? String(r.alias) : null,
		vnCount: Number(r.vn_count),
		staffCount: Number(r.staff_count),
		seiyuuCount: Number(r.seiyuu_count),
		firstYear: r.first_year !== null ? Number(r.first_year) : null,
		lastYear: r.last_year !== null ? Number(r.last_year) : null,
		original: orig(r.name, r.latin)
	});

	return {
		producerA: toProdSummary(pA),
		producerB: toProdSummary(pB),
		inferred: infRow ? mapInferredBrandRow(infRow) : null,
		explicitPath,
		sharedPeople,
		sharedTotals,
		timelineSeries,
		coDevVns: coDevVns.map((v) => ({
			id: v.id,
			title: v.title,
			original: v.original || null,
			firstYear: v.first_year
		})),
		sharedExtlinks
	};
}

export function getVnDetail(vidInput: string) {
	const db = getDb();
	const vid = normId(vidInput);
	const v = db.prepare(`SELECT * FROM vns WHERE id = ?`).get(vid) as
		| Record<string, unknown>
		| undefined;
	if (!v) return null;

	const developers = db
		.prepare(
			`SELECT vd.pid, vd.first_year, vd.is_original_dev, vd.is_publisher, p.name, p.latin, p.type, p.lang
       FROM vn_developers vd
       JOIN producers p ON p.id = vd.pid
       WHERE vd.vid = ?
       ORDER BY vd.is_original_dev DESC, vd.is_publisher ASC, p.vn_count DESC`
		)
		.all(vid) as Array<Record<string, unknown>>;

	const staffCredits = db
		.prepare(
			`SELECT c.sid, c.aid, c.alias_name, c.alias_latin, c.role, c.note, c.eid, c.is_core,
              s.name, s.latin, s.main_aid, s.brand_count, s.potential_alias_count, s.lang AS s_lang
       FROM vn_staff_credits c
       JOIN staff s ON s.id = c.sid
       WHERE c.vid = ?
       ORDER BY c.is_core DESC, c.role ASC, s.brand_count ASC`
		)
		.all(vid) as Array<Record<string, unknown>>;

	const seiyuuCredits = db
		.prepare(
			`SELECT c.cid, c.char_name, c.char_latin, c.sid, c.aid, c.alias_name, c.alias_latin, c.note,
              s.name, s.latin, s.main_aid, s.brand_count, s.potential_alias_count, s.lang AS s_lang
       FROM vn_seiyuu_credits c
       JOIN staff s ON s.id = c.sid
       WHERE c.vid = ?
       ORDER BY c.char_latin ASC, c.char_name ASC`
		)
		.all(vid) as Array<Record<string, unknown>>;

	const relatedVns = db
		.prepare(
			`SELECT vr.vid2 AS vid, vr.relation, vr.official, v2.title, v2.first_year
       FROM vn_relations vr
       JOIN vns v2 ON v2.id = vr.vid2
       WHERE vr.vid1 = ?
       ORDER BY v2.first_year ASC`
		)
		.all(vid) as Array<Record<string, unknown>>;

	const relatedDevStmt = db.prepare(
		`SELECT vd.pid, p.name, p.latin
     FROM vn_developers vd
     JOIN producers p ON p.id = vd.pid
     WHERE vd.vid = ? AND vd.is_original_dev = 1
     ORDER BY p.vn_count DESC
     LIMIT 3`
	);
	const relatedOrigStmt = db.prepare(`SELECT original FROM vns WHERE id = ?`);

	return {
		vn: {
			id: String(v.id),
			title: String(v.title),
			original: v.original ? String(v.original) : null,
			olang: v.olang ? String(v.olang) : null,
			firstYear: v.first_year !== null ? Number(v.first_year) : null,
			rating: v.c_rating !== null ? Number(v.c_rating) : null,
			votecount: Number(v.c_votecount || 0),
			hasEro: Boolean(v.has_ero),
			hasAllAges: Boolean(v.has_all_ages)
		},
		producers: developers.map((d) => ({
			pid: String(d.pid),
			name: String(d.latin || d.name),
			original: orig(d.name, d.latin),
			type: String(d.type) as ProducerType,
			lang: d.lang ? String(d.lang) : null,
			firstYear: d.first_year !== null ? Number(d.first_year) : null,
			isOriginalDev: Boolean(d.is_original_dev),
			isPublisher: Boolean(d.is_publisher)
		})),
		staffCredits: staffCredits.map((c) => {
			const primary = String(c.latin || c.name);
			const aliasShown = String(c.alias_latin || c.alias_name);
			const aliasOriginal = orig(c.alias_name, c.alias_latin);
			const isNonPrimaryAlias = isNonPrimaryCredit(c.aid, c.main_aid, aliasShown, primary, c.name);
			return {
				sid: String(c.sid),
				name: primary,
				original: orig(c.name, c.latin),
				lang: c.s_lang ? String(c.s_lang) : null,
				aliasUsed: isNonPrimaryAlias ? penNameLabel(aliasShown, aliasOriginal, primary) : aliasShown,
				aliasOriginal,
				isNonPrimaryAlias,
				role: String(c.role),
				note: c.note ? String(c.note) : null,
				isEditionCredit: c.eid !== null,
				isCore: Boolean(c.is_core),
				brandCount: Number(c.brand_count),
				potentialAliasCount: Number(c.potential_alias_count)
			};
		}),
		seiyuuCredits: seiyuuCredits.map((c) => {
			const primary = String(c.latin || c.name);
			const aliasShown = String(c.alias_latin || c.alias_name);
			const aliasOriginal = orig(c.alias_name, c.alias_latin);
			const isNonPrimaryAlias = isNonPrimaryCredit(c.aid, c.main_aid, aliasShown, primary, c.name);
			return {
				cid: String(c.cid),
				charName: String(c.char_latin || c.char_name),
				charOriginal: orig(c.char_name, c.char_latin),
				sid: String(c.sid),
				name: primary,
				original: orig(c.name, c.latin),
				lang: c.s_lang ? String(c.s_lang) : null,
				aliasUsed: isNonPrimaryAlias ? penNameLabel(aliasShown, aliasOriginal, primary) : aliasShown,
				aliasOriginal,
				isNonPrimaryAlias,
				note: c.note ? String(c.note) : null,
				brandCount: Number(c.brand_count),
				potentialAliasCount: Number(c.potential_alias_count)
			};
		}),
		relatedVns: relatedVns.map((r) => {
			const devs = relatedDevStmt.all(String(r.vid)) as Array<Record<string, unknown>>;
			const origRow = relatedOrigStmt.get(String(r.vid)) as Record<string, unknown> | undefined;
			return {
				vid: String(r.vid),
				title: String(r.title),
				original: origRow?.original ? String(origRow.original) : null,
				relation: String(r.relation),
				official: Boolean(r.official),
				firstYear: r.first_year !== null ? Number(r.first_year) : null,
				developers: devs.map((d) => ({
					pid: String(d.pid),
					name: String(d.latin || d.name),
					original: orig(d.name, d.latin)
				}))
			};
		})
	};
}

/** Strongest inferred neighbours of one brand, for one-click Compare suggestions. */
export function getBrandNeighbours(pidInput: string, limit = 8): InferredBrandLink[] {
	const db = getDb();
	const pid = normId(pidInput);
	const cap = Math.min(30, Math.max(1, Math.trunc(finiteNumber(limit, 8))));
	const rows = db
		.prepare(
			`${INFERRED_BRAND_SELECT}
       WHERE (b.pid_a = ? OR b.pid_b = ?)
         AND ${CORE_DRIVEN_SQL}
       ORDER BY b.confidence DESC, b.weighted_core_score DESC, ${PAIR_TIEBREAK}
       LIMIT ?`
		)
		.all(pid, pid, cap) as Array<Record<string, unknown>>;
	return rows.map(mapInferredBrandRow);
}

/** Minimal producer identity for pickers and headers. */
export function getProducerSummary(pidInput: string): ProducerSummary | null {
	const db = getDb();
	const r = db.prepare(`SELECT * FROM producers WHERE id = ?`).get(normId(pidInput)) as
		| Record<string, unknown>
		| undefined;
	if (!r) return null;
	return {
		id: String(r.id),
		type: String(r.type) as ProducerType,
		lang: r.lang ? String(r.lang) : null,
		name: String(r.latin || r.name),
		latin: r.latin ? String(r.latin) : null,
		alias: r.alias ? String(r.alias) : null,
		vnCount: Number(r.vn_count),
		staffCount: Number(r.staff_count),
		seiyuuCount: Number(r.seiyuu_count),
		firstYear: r.first_year !== null ? Number(r.first_year) : null,
		lastYear: r.last_year !== null ? Number(r.last_year) : null,
		original: orig(r.name, r.latin)
	};
}

// ───────────────────────── On-demand proof queries ─────────────────────────

/** Helper: shortest explicit VNDB path between two producers (max 5 hops). */
function shortestExplicitProducerPath(
	db: DatabaseSync,
	pidA: string,
	pidB: string
): Array<{ id: string; name: string; original: string | null; relationFromPrev?: ExplicitRelationCode }> | null {
	if (pidA === pidB) return null;
	const relStmt = db.prepare(`SELECT pid, relation FROM producers_relations WHERE id = ?`);
	const visited = new Map<string, { prev: string | null; rel: string | null }>([
		[pidA, { prev: null, rel: null }]
	]);
	const queue: Array<{ id: string; depth: number }> = [{ id: pidA, depth: 0 }];
	let found = false;
	while (queue.length > 0) {
		const cur = queue.shift()!;
		if (cur.depth >= 5) continue;
		const neighbors = relStmt.all(cur.id) as Array<{ pid: string; relation: string }>;
		for (const n of neighbors) {
			if (visited.has(n.pid)) continue;
			visited.set(n.pid, { prev: cur.id, rel: n.relation });
			if (n.pid === pidB) {
				found = true;
				break;
			}
			queue.push({ id: n.pid, depth: cur.depth + 1 });
		}
		if (found) break;
	}
	if (!found) return null;
	const chain: Array<{ id: string; rel: string | null }> = [];
	let curr: string | null = pidB;
	while (curr) {
		const step: { prev: string | null; rel: string | null } = visited.get(curr)!;
		chain.push({ id: curr, rel: step.rel });
		curr = step.prev;
	}
	chain.reverse();
	const nameStmt = db.prepare(`SELECT name, latin FROM producers WHERE id = ?`);
	return chain.map((c) => {
		const row = nameStmt.get(c.id) as { name: string; latin: string | null } | undefined;
		return {
			id: c.id,
			name: row ? row.latin || row.name : c.id,
			original: row ? orig(row.name, row.latin) : null,
			...(c.rel ? { relationFromPrev: c.rel as ExplicitRelationCode } : {})
		};
	});
}

/** Walk upward ownership (`par`, `ipa`) in VNDB to show a brand's parent chain. */
function ownershipChain(
	db: DatabaseSync,
	startPid: string
): Array<{ id: string; name: string; original: string | null; relation?: ExplicitRelationCode }> {
	const nameStmt = db.prepare(`SELECT name, latin FROM producers WHERE id = ?`);
	const upStmt = db.prepare(
		`SELECT pid, relation FROM producers_relations WHERE id = ? AND relation IN ('par', 'ipa') LIMIT 1`
	);
	const out: Array<{ id: string; name: string; original: string | null; relation?: ExplicitRelationCode }> = [];
	const seen = new Set<string>();
	let cur = startPid;
	for (let step = 0; step < 6; step++) {
		if (seen.has(cur)) break;
		seen.add(cur);
		const row = nameStmt.get(cur) as { name: string; latin: string | null } | undefined;
		const up = upStmt.get(cur) as { pid: string; relation: string } | undefined;
		out.push({
			id: cur,
			name: row ? row.latin || row.name : cur,
			original: row ? orig(row.name, row.latin) : null,
			...(up ? { relation: up.relation as ExplicitRelationCode } : {})
		});
		if (!up) break;
		cur = up.pid;
	}
	return out;
}

/** Exact proof records behind any brand-pair evidence chip. */
export function getBrandPairProof(rawA: string, rawB: string, type: string) {
	const db = getDb();
	const pidA = normId(rawA);
	const pidB = normId(rawB);
	if (!pidA || !pidB) return null;

	if (type === 'shared_staff' || type === 'containment') {
		const rows = db
			.prepare(
				`SELECT ta.sid, s.name, s.latin, s.brand_count,
                ta.vn_count AS vns_a, ta.first_year AS first_a, ta.last_year AS last_a, ta.roles_json AS roles_a,
                tb.vn_count AS vns_b, tb.first_year AS first_b, tb.last_year AS last_b, tb.roles_json AS roles_b
         FROM staff_brand_tenure ta
         JOIN staff_brand_tenure tb ON tb.sid = ta.sid
         JOIN staff s ON s.id = ta.sid
         WHERE ta.pid = ? AND tb.pid = ? AND ta.core_vn_count > 0 AND tb.core_vn_count > 0
         ORDER BY s.brand_count ASC, (ta.core_vn_count + tb.core_vn_count) DESC, ta.sid ASC`
			)
			.all(pidA, pidB) as Array<Record<string, unknown>>;
		return {
			kind: 'people' as const,
			total: rows.length,
			people: rows.map((r) => ({
				sid: String(r.sid),
				name: String(r.latin || r.name),
				original: orig(r.name, r.latin),
				brandCount: Number(r.brand_count),
				vnsA: Number(r.vns_a),
				vnsB: Number(r.vns_b),
				firstYearA: r.first_a !== null ? Number(r.first_a) : null,
				lastYearA: r.last_a !== null ? Number(r.last_a) : null,
				firstYearB: r.first_b !== null ? Number(r.first_b) : null,
				lastYearB: r.last_b !== null ? Number(r.last_b) : null,
				rolesA: safeJson<string[]>(r.roles_a, []).filter((x) => x !== 'seiyuu'),
				rolesB: safeJson<string[]>(r.roles_b, []).filter((x) => x !== 'seiyuu')
			}))
		};
	}

	if (type === 'shared_seiyuu') {
		const rows = db
			.prepare(
				`SELECT ta.sid, s.name, s.latin, s.brand_count,
                ta.seiyuu_vn_count AS vns_a, ta.first_year AS first_a, ta.last_year AS last_a,
                tb.seiyuu_vn_count AS vns_b, tb.first_year AS first_b, tb.last_year AS last_b
         FROM staff_brand_tenure ta
         JOIN staff_brand_tenure tb ON tb.sid = ta.sid
         JOIN staff s ON s.id = ta.sid
         WHERE ta.pid = ? AND tb.pid = ? AND ta.seiyuu_vn_count > 0 AND tb.seiyuu_vn_count > 0
         ORDER BY s.brand_count ASC, (ta.seiyuu_vn_count + tb.seiyuu_vn_count) DESC, ta.sid ASC`
			)
			.all(pidA, pidB) as Array<Record<string, unknown>>;
		return {
			kind: 'people' as const,
			total: rows.length,
			people: rows.map((r) => ({
				sid: String(r.sid),
				name: String(r.latin || r.name),
				original: orig(r.name, r.latin),
				brandCount: Number(r.brand_count),
				vnsA: Number(r.vns_a),
				vnsB: Number(r.vns_b),
				firstYearA: r.first_a !== null ? Number(r.first_a) : null,
				lastYearA: r.last_a !== null ? Number(r.last_a) : null,
				firstYearB: r.first_b !== null ? Number(r.first_b) : null,
				lastYearB: r.last_b !== null ? Number(r.last_b) : null,
				rolesA: ['seiyuu'],
				rolesB: ['seiyuu']
			}))
		};
	}

	if (type === 'shared_series') {
		const rows = db
			.prepare(
				`SELECT vr.vid1, v1.title AS title1, v1.original AS orig1, v1.first_year AS year1,
                vr.vid2, v2.title AS title2, v2.original AS orig2, v2.first_year AS year2,
                vr.relation
         FROM vn_relations vr
         JOIN vn_developers d1 ON d1.vid = vr.vid1 AND d1.pid = ? AND d1.is_original_dev = 1
         JOIN vn_developers d2 ON d2.vid = vr.vid2 AND d2.pid = ? AND d2.is_original_dev = 1
         JOIN vns v1 ON v1.id = vr.vid1
         JOIN vns v2 ON v2.id = vr.vid2
         WHERE vr.official = 1 AND vr.vid1 != vr.vid2
         ORDER BY COALESCE(v1.first_year, 9999) ASC, v1.title ASC`
			)
			.all(pidA, pidB) as Array<Record<string, unknown>>;
		const seen = new Set<string>();
		const pairs: Array<{
			vidA: string;
			titleA: string;
			originalA: string | null;
			yearA: number | null;
			relation: string;
			vidB: string;
			titleB: string;
			originalB: string | null;
			yearB: number | null;
		}> = [];
		for (const r of rows) {
			const v1 = String(r.vid1);
			const v2 = String(r.vid2);
			const key = v1 < v2 ? `${v1}|${v2}` : `${v2}|${v1}`;
			if (seen.has(key)) continue;
			seen.add(key);
			pairs.push({
				vidA: v1,
				titleA: String(r.title1),
				originalA: r.orig1 ? String(r.orig1) : null,
				yearA: r.year1 !== null ? Number(r.year1) : null,
				relation: String(r.relation),
				vidB: v2,
				titleB: String(r.title2),
				originalB: r.orig2 ? String(r.orig2) : null,
				yearB: r.year2 !== null ? Number(r.year2) : null
			});
		}
		return { kind: 'vn_relations' as const, total: pairs.length, pairs };
	}

	if (type === 'co_release') {
		const rows = db
			.prepare(
				`SELECT v.id, v.title, v.original, v.first_year
         FROM vn_developers da
         JOIN vn_developers db2 ON db2.vid = da.vid
         JOIN vns v ON v.id = da.vid
         WHERE da.pid = ? AND db2.pid = ? AND da.is_original_dev = 1 AND db2.is_original_dev = 1
         ORDER BY v.first_year IS NULL ASC, v.first_year DESC, v.title ASC`
			)
			.all(pidA, pidB) as Array<Record<string, unknown>>;
		return {
			kind: 'vns' as const,
			total: rows.length,
			vns: rows.map((r) => ({
				vid: String(r.id),
				title: String(r.title),
				original: r.original ? String(r.original) : null,
				year: r.first_year !== null ? Number(r.first_year) : null
			}))
		};
	}

	if (type === 'shared_link') {
		const rows = db
			.prepare(
				`SELECT DISTINCT ea.site, ea.value, ea.url
         FROM producer_extlinks ea
         JOIN producer_extlinks eb ON eb.site = ea.site AND eb.value = ea.value
         WHERE ea.pid = ? AND eb.pid = ?`
			)
			.all(pidA, pidB) as Array<{ site: string; value: string; url: string | null }>;
		return { kind: 'extlinks' as const, total: rows.length, links: rows };
	}

	if (type === 'staff_flow') {
		const rows = db
			.prepare(
				`SELECT t.from_pid, t.to_pid, t.sid, s.name, s.latin,
                t.from_first_year, t.from_last_year, t.to_first_year, t.to_last_year, t.gap_years, t.alias_changed
         FROM staff_brand_transitions t
         JOIN staff s ON s.id = t.sid
         WHERE ((t.from_pid = ? AND t.to_pid = ?) OR (t.from_pid = ? AND t.to_pid = ?))
           AND t.is_core_move = 1
         ORDER BY COALESCE(t.to_first_year, 9999) ASC, s.name ASC`
			)
			.all(pidA, pidB, pidB, pidA) as Array<Record<string, unknown>>;
		const mapMove = (r: Record<string, unknown>) => ({
			sid: String(r.sid),
			name: String(r.latin || r.name),
			original: orig(r.name, r.latin),
			fromFirstYear: r.from_first_year !== null ? Number(r.from_first_year) : null,
			fromLastYear: r.from_last_year !== null ? Number(r.from_last_year) : null,
			toFirstYear: r.to_first_year !== null ? Number(r.to_first_year) : null,
			toLastYear: r.to_last_year !== null ? Number(r.to_last_year) : null,
			gapYears: r.gap_years !== null ? Number(r.gap_years) : null,
			aliasChanged: Boolean(r.alias_changed)
		});
		const aToB = rows.filter((r) => String(r.from_pid) === pidA).map(mapMove);
		const bToA = rows.filter((r) => String(r.from_pid) === pidB).map(mapMove);
		return { kind: 'moves' as const, total: aToB.length + bToA.length, aToB, bToA };
	}

	if (type === 'explicit_2hop') {
		const pathNodes = shortestExplicitProducerPath(db, pidA, pidB) ?? [];
		return { kind: 'path' as const, total: pathNodes.length, path: pathNodes };
	}

	if (type === 'separate_owners') {
		return {
			kind: 'owners' as const,
			chainA: ownershipChain(db, pidA),
			chainB: ownershipChain(db, pidB)
		};
	}

	return null;
}

/** Exact proof records behind any potential-alias evidence chip. */
export function getAliasPairProof(rawA: string, rawB: string, type: string) {
	const db = getDb();
	const sidA = normId(rawA);
	const sidB = normId(rawB);
	if (!sidA || !sidB) return null;

	if (type === 'shared_character') {
		const rows = db
			.prepare(
				`SELECT c.cid, c.char_name, c.char_latin, c.sid, c.vid, v.title, v.original, v.first_year
         FROM vn_seiyuu_credits c
         JOIN vns v ON v.id = c.vid
         WHERE c.sid IN (?, ?)
           AND c.cid IN (
             SELECT a.cid FROM vn_seiyuu_credits a
             JOIN vn_seiyuu_credits b ON b.cid = a.cid
             WHERE a.sid = ? AND b.sid = ?
           )
         ORDER BY c.char_latin ASC, c.char_name ASC, COALESCE(v.first_year, 9999) ASC`
			)
			.all(sidA, sidB, sidA, sidB) as Array<Record<string, unknown>>;
		const byCid = new Map<
			string,
			{
				cid: string;
				name: string;
				original: string | null;
				vnsA: Array<{ vid: string; title: string; original: string | null; year: number | null }>;
				vnsB: Array<{ vid: string; title: string; original: string | null; year: number | null }>;
			}
		>();
		for (const r of rows) {
			const cid = String(r.cid);
			let entry = byCid.get(cid);
			if (!entry) {
				entry = {
					cid,
					name: String(r.char_latin || r.char_name),
					original: orig(r.char_name, r.char_latin),
					vnsA: [],
					vnsB: []
				};
				byCid.set(cid, entry);
			}
			const list = String(r.sid) === sidA ? entry.vnsA : entry.vnsB;
			const vid = String(r.vid);
			if (!list.some((x) => x.vid === vid)) {
				list.push({
					vid,
					title: String(r.title),
					original: r.original ? String(r.original) : null,
					year: r.first_year !== null ? Number(r.first_year) : null
				});
			}
		}
		const characters = [...byCid.values()].map((c) => {
			const vidsA = new Set(c.vnsA.map((v) => v.vid));
			return { ...c, sameVn: c.vnsB.some((v) => vidsA.has(v.vid)) };
		});
		return { kind: 'characters' as const, total: characters.length, characters };
	}

	if (type === 'shared_link') {
		const rows = db
			.prepare(
				`SELECT DISTINCT ea.site, ea.value, ea.url
         FROM staff_extlinks ea
         JOIN staff_extlinks eb ON eb.site = ea.site AND eb.value = ea.value
         WHERE ea.sid = ? AND eb.sid = ?`
			)
			.all(sidA, sidB) as Array<{ site: string; value: string; url: string | null }>;
		return { kind: 'extlinks' as const, total: rows.length, links: rows };
	}

	if (type === 'bio_xref') {
		const rows = db
			.prepare(`SELECT id, name, latin, description FROM staff WHERE id IN (?, ?)`)
			.all(sidA, sidB) as Array<{ id: string; name: string; latin: string | null; description: string | null }>;
		return {
			kind: 'bios' as const,
			bios: rows.map((r) => ({
				sid: String(r.id),
				name: String(r.latin || r.name),
				original: orig(r.name, r.latin),
				description: r.description ? String(r.description) : null
			}))
		};
	}

	if (type === 'shared_brands' || type === 'complementary_timeline' || type === 'name_overlap') {
		const rows = db
			.prepare(
				`SELECT ta.pid, p.name, p.latin, p.type,
                ta.vn_count AS vns_a, ta.first_year AS first_a, ta.last_year AS last_a,
                tb.vn_count AS vns_b, tb.first_year AS first_b, tb.last_year AS last_b
         FROM staff_brand_tenure ta
         JOIN staff_brand_tenure tb ON tb.pid = ta.pid
         JOIN producers p ON p.id = ta.pid
         WHERE ta.sid = ? AND tb.sid = ?
         ORDER BY (ta.vn_count + tb.vn_count) DESC, p.name ASC`
			)
			.all(sidA, sidB) as Array<Record<string, unknown>>;
		return {
			kind: 'brands' as const,
			total: rows.length,
			brands: rows.map((r) => ({
				pid: String(r.pid),
				name: String(r.latin || r.name),
				original: orig(r.name, r.latin),
				type: String(r.type) as ProducerType,
				vnsA: Number(r.vns_a),
				vnsB: Number(r.vns_b),
				firstYearA: r.first_a !== null ? Number(r.first_a) : null,
				lastYearA: r.last_a !== null ? Number(r.last_a) : null,
				firstYearB: r.first_b !== null ? Number(r.first_b) : null,
				lastYearB: r.last_b !== null ? Number(r.last_b) : null
			}))
		};
	}

	if (type === 'co_credit') {
		const rows = db
			.prepare(
				`WITH creds AS (
           SELECT vid, sid, role, NULL AS cid FROM vn_staff_credits WHERE sid IN (?, ?) AND eid IS NULL
           UNION ALL
           SELECT vid, sid, 'seiyuu' AS role, cid FROM vn_seiyuu_credits WHERE sid IN (?, ?)
         ),
         same_char_vns AS (
           SELECT DISTINCT a.vid FROM vn_seiyuu_credits a
           JOIN vn_seiyuu_credits b ON b.vid = a.vid AND b.cid = a.cid
           WHERE a.sid = ? AND b.sid = ?
         ),
         shared_vids AS (
           SELECT DISTINCT ca.vid
           FROM creds ca
           JOIN creds cb ON cb.vid = ca.vid
           WHERE ca.sid = ? AND cb.sid = ?
             AND ca.vid NOT IN (SELECT vid FROM same_char_vns)
         )
         SELECT c.vid, c.sid, c.role, v.title, v.original, v.first_year
         FROM creds c
         JOIN shared_vids sv ON sv.vid = c.vid
         JOIN vns v ON v.id = c.vid
         ORDER BY v.first_year IS NULL ASC, v.first_year DESC, v.title ASC`
			)
			.all(sidA, sidB, sidA, sidB, sidA, sidB, sidA, sidB) as Array<Record<string, unknown>>;
		const byVid = new Map<
			string,
			{ vid: string; title: string; original: string | null; year: number | null; rolesA: string[]; rolesB: string[] }
		>();
		for (const r of rows) {
			const vid = String(r.vid);
			let entry = byVid.get(vid);
			if (!entry) {
				entry = {
					vid,
					title: String(r.title),
					original: r.original ? String(r.original) : null,
					year: r.first_year !== null ? Number(r.first_year) : null,
					rolesA: [],
					rolesB: []
				};
				byVid.set(vid, entry);
			}
			const list = String(r.sid) === sidA ? entry.rolesA : entry.rolesB;
			const role = String(r.role);
			if (!list.includes(role)) list.push(role);
		}
		const vns = [...byVid.values()];
		return { kind: 'co_credits' as const, total: vns.length, vns };
	}

	if (type === 'listed_apart') {
		const rows = db
			.prepare(
				`SELECT sid, site, value, url FROM staff_extlinks
         WHERE sid IN (?, ?) AND site IN ('anidb', 'wikidata', 'vgmdb', 'mobygames', 'anison')
         ORDER BY site ASC, sid ASC`
			)
			.all(sidA, sidB) as Array<{ sid: string; site: string; value: string; url: string | null }>;
		const bySite = new Map<
			string,
			{ site: string; a: Array<{ value: string; url: string | null }>; b: Array<{ value: string; url: string | null }> }
		>();
		for (const r of rows) {
			let entry = bySite.get(r.site);
			if (!entry) {
				entry = { site: r.site, a: [], b: [] };
				bySite.set(r.site, entry);
			}
			const target = r.sid === sidA ? entry.a : entry.b;
			if (!target.some((x) => x.value === r.value)) target.push({ value: r.value, url: r.url });
		}
		const sites = [...bySite.values()].filter((s) => s.a.length > 0 && s.b.length > 0);
		return { kind: 'listed_apart' as const, total: sites.length, sites };
	}

	return null;
}

/** All brands a staff member has worked at (powers clicking "Mobility: N brands"). */
export function getStaffBrandsProof(sidInput: string) {
	const db = getDb();
	const sid = normId(sidInput);
	const rows = db
		.prepare(
			`SELECT t.pid, p.name, p.latin, p.type, t.vn_count, t.core_vn_count, t.seiyuu_vn_count,
              t.first_year, t.last_year, t.roles_json
       FROM staff_brand_tenure t
       JOIN producers p ON p.id = t.pid
       WHERE t.sid = ?
       ORDER BY t.vn_count DESC, COALESCE(t.first_year, 9999) ASC, p.name ASC`
		)
		.all(sid) as Array<Record<string, unknown>>;
	return {
		sid,
		total: rows.length,
		brands: rows.map((r) => ({
			pid: String(r.pid),
			name: String(r.latin || r.name),
			original: orig(r.name, r.latin),
			type: String(r.type) as ProducerType,
			vnCount: Number(r.vn_count),
			coreVnCount: Number(r.core_vn_count),
			seiyuuVnCount: Number(r.seiyuu_vn_count),
			firstYear: r.first_year !== null ? Number(r.first_year) : null,
			lastYear: r.last_year !== null ? Number(r.last_year) : null,
			roles: safeJson<string[]>(r.roles_json, [])
		}))
	};
}

/** Exact VNs a person worked on (optionally filtered to one brand & dev/seiyuu mode). */
export function getStaffVnsProof(
	sidInput: string,
	pidInput?: string | null,
	mode: 'all' | 'dev' | 'seiyuu' = 'all'
) {
	const db = getDb();
	const sid = normId(sidInput);
	const pid = pidInput ? normId(pidInput) : null;
	const sRow = db.prepare(`SELECT name, latin, main_aid FROM staff WHERE id = ?`).get(sid) as
		| { name: string; latin: string | null; main_aid: number | null }
		| undefined;
	if (!sRow) return null;
	const primaryDisplay = String(sRow.latin || sRow.name);

	const devJoin = pid ? `JOIN vn_developers vd ON vd.vid = c.vid AND vd.pid = ? AND vd.is_original_dev = 1` : '';
	const devArgs = pid ? [pid, sid] : [sid];

	const staffCreds =
		mode === 'seiyuu'
			? []
			: (db
					.prepare(
						`SELECT c.vid, c.aid, c.role, c.alias_name, c.alias_latin, c.first_year,
                    v.title, v.original, v.has_ero, v.has_all_ages
             FROM vn_staff_credits c
             ${devJoin}
             JOIN vns v ON v.id = c.vid
             WHERE c.sid = ? ${pid ? 'AND c.eid IS NULL' : ''}
             ORDER BY c.first_year IS NULL ASC, c.first_year DESC, v.title ASC`
					)
					.all(...devArgs) as Array<Record<string, unknown>>);

	const seiyuuCreds =
		mode === 'dev'
			? []
			: (db
					.prepare(
						`SELECT c.vid, c.aid, c.cid, c.char_name, c.char_latin, c.alias_name, c.alias_latin, c.first_year,
                    v.title, v.original, v.has_ero, v.has_all_ages
             FROM vn_seiyuu_credits c
             ${devJoin}
             JOIN vns v ON v.id = c.vid
             WHERE c.sid = ?
             ORDER BY c.first_year IS NULL ASC, c.first_year DESC, v.title ASC`
					)
					.all(...devArgs) as Array<Record<string, unknown>>);

	const byVid = new Map<
		string,
		{
			vid: string;
			title: string;
			original: string | null;
			year: number | null;
			roles: string[];
			penNames: string[];
			characters: Array<{ cid: string; name: string; original: string | null }>;
			hasEro: boolean;
			hasAllAges: boolean;
		}
	>();
	const ensure = (r: Record<string, unknown>) => {
		const vid = String(r.vid);
		let entry = byVid.get(vid);
		if (!entry) {
			entry = {
				vid,
				title: String(r.title),
				original: r.original ? String(r.original) : null,
				year: r.first_year !== null ? Number(r.first_year) : null,
				roles: [],
				penNames: [],
				characters: [],
				hasEro: Boolean(r.has_ero),
				hasAllAges: Boolean(r.has_all_ages)
			};
			byVid.set(vid, entry);
		}
		const aliasShown = String(r.alias_latin || r.alias_name);
		const aliasOrig = orig(r.alias_name, r.alias_latin);
		if (isNonPrimaryCredit(r.aid, sRow.main_aid, aliasShown, primaryDisplay, sRow.name)) {
			const label = penNameLabel(aliasShown, aliasOrig, primaryDisplay);
			if (!entry.penNames.includes(label)) entry.penNames.push(label);
		}
		return entry;
	};
	for (const r of staffCreds) {
		const e = ensure(r);
		const role = String(r.role);
		if (!e.roles.includes(role)) e.roles.push(role);
	}
	for (const r of seiyuuCreds) {
		const e = ensure(r);
		if (!e.roles.includes('seiyuu')) e.roles.push('seiyuu');
		const cid = String(r.cid);
		if (!e.characters.some((c) => c.cid === cid)) {
			e.characters.push({
				cid,
				name: String(r.char_latin || r.char_name),
				original: orig(r.char_name, r.char_latin)
			});
		}
	}
	const vns = [...byVid.values()].sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || a.title.localeCompare(b.title));
	return { sid, pid, mode, total: vns.length, vns };
}

/** Exact shared VNs between two collaborators or co-stars (powers clicking "Shared VNs"). */
export function getCollabVnsProof(rawA: string, rawB: string, kind: 'staff' | 'seiyuu' = 'staff') {
	const db = getDb();
	const sidA = normId(rawA);
	const sidB = normId(rawB);
	const table = kind === 'seiyuu' ? 'vn_seiyuu_credits' : 'vn_staff_credits';
	const extra = table === 'vn_staff_credits' ? 'AND c1.eid IS NULL AND c2.eid IS NULL' : '';
	const roleColA = table === 'vn_seiyuu_credits' ? `'seiyuu'` : 'c1.role';
	const roleColB = table === 'vn_seiyuu_credits' ? `'seiyuu'` : 'c2.role';

	const rows = db
		.prepare(
			`SELECT c1.vid, v.title, v.original, v.first_year,
              ${roleColA} AS role_a, ${roleColB} AS role_b,
              vd.pid, p.name AS p_name, p.latin AS p_latin
       FROM ${table} c1
       JOIN ${table} c2 ON c2.vid = c1.vid AND c2.sid = ?
       JOIN vns v ON v.id = c1.vid
       LEFT JOIN vn_developers vd ON vd.vid = c1.vid AND vd.is_original_dev = 1
       LEFT JOIN producers p ON p.id = vd.pid
       WHERE c1.sid = ? ${extra}
       ORDER BY v.first_year IS NULL ASC, v.first_year DESC, v.title ASC`
		)
		.all(sidB, sidA) as Array<Record<string, unknown>>;

	const byVid = new Map<
		string,
		{
			vid: string;
			title: string;
			original: string | null;
			year: number | null;
			pid: string | null;
			producerName: string | null;
			producerOriginal: string | null;
			rolesA: string[];
			rolesB: string[];
		}
	>();
	for (const r of rows) {
		const vid = String(r.vid);
		let entry = byVid.get(vid);
		if (!entry) {
			entry = {
				vid,
				title: String(r.title),
				original: r.original ? String(r.original) : null,
				year: r.first_year !== null ? Number(r.first_year) : null,
				pid: r.pid ? String(r.pid) : null,
				producerName: r.pid ? String(r.p_latin || r.p_name) : null,
				producerOriginal: r.pid ? orig(r.p_name, r.p_latin) : null,
				rolesA: [],
				rolesB: []
			};
			byVid.set(vid, entry);
		}
		const ra = String(r.role_a);
		const rb = String(r.role_b);
		if (!entry.rolesA.includes(ra)) entry.rolesA.push(ra);
		if (!entry.rolesB.includes(rb)) entry.rolesB.push(rb);
	}
	const vns = [...byVid.values()];
	return { sidA, sidB, kind, total: vns.length, vns };
}

/** Every visual novel developed (or published) by a given producer, for universal clickable VN counts. */
export function getProducerVnsProof(pidInput: string, role: 'dev' | 'all' = 'dev') {
	const db = getDb();
	const pid = normId(pidInput);
	const p = db.prepare(`SELECT id, name, latin FROM producers WHERE id = ?`).get(pid) as
		| { id: string; name: string; latin: string | null }
		| undefined;
	if (!p) return null;
	const filterSql = role === 'dev' ? 'AND vd.is_original_dev = 1' : '';
	const rows = db
		.prepare(
			`SELECT v.id AS vid, v.title, v.original, v.first_year,
              v.has_ero, v.has_all_ages,
              MAX(vd.is_original_dev) AS is_original_dev,
              MAX(vd.is_publisher) AS is_publisher
       FROM vn_developers vd
       JOIN vns v ON v.id = vd.vid
       WHERE vd.pid = ? ${filterSql}
       GROUP BY v.id
       ORDER BY v.first_year IS NULL ASC, v.first_year DESC, v.c_votecount DESC, v.title ASC`
		)
		.all(pid) as Array<Record<string, unknown>>;
	const vns = rows.map((r) => ({
		vid: String(r.vid),
		title: String(r.title),
		original: r.original ? String(r.original) : null,
		year: r.first_year !== null ? Number(r.first_year) : null,
		hasEro: Boolean(r.has_ero),
		hasAllAges: Boolean(r.has_all_ages),
		isOriginalDev: Boolean(r.is_original_dev),
		isPublisher: Boolean(r.is_publisher)
	}));
	return {
		pid,
		producerName: String(p.latin || p.name),
		total: vns.length,
		vns
	};
}

// ───────────────────────── Global studio landscape graph ─────────────────────────

export interface LandscapeNode {
	id: string;
	name: string;
	original: string | null;
	type: ProducerType;
	lang: string | null;
	vnCount: number;
	staffCount: number;
	/** Summed VNDB votes of the VNs this producer developed: how well known it is. */
	votes: number;
	firstYear: number | null;
	lastYear: number | null;
}

export interface LandscapeEdge {
	id: string;
	/** Always oriented parent → child (ownership) or origin → successor (lineage) when directed. */
	source: string;
	target: string;
	register: 'confirmed' | 'inferred';
	kind: 'ownership' | 'sister' | 'lineage' | 'partner';
	/** Plain-English edge tag (`Imprint`, `Renamed`, `Sister?`): never an abbreviation. */
	code: string;
	directed: boolean;
	relationCode?: ExplicitRelationCode;
	inferredType?: InferredBrandType;
	direction?: 'a_to_b' | 'b_to_a' | 'bidirectional';
	confidence?: number;
	confidenceTier?: InferredBrandLink['confidenceTier'];
	sharedCoreStaff?: number;
	coDevVns?: number;
	seiyuuDriven?: boolean;
}

export interface LandscapeParams {
	producerType?: 'co' | 'all';
	lang?: string;
	minConfidence?: number;
	includeExplicit?: boolean;
	includeInferred?: boolean;
}

/** Which way a stored VNDB relation runs once canonicalised to parent → child / origin → successor. */
const EXPLICIT_OUTWARD: Record<ExplicitRelationCode, { kind: 'ownership' | 'lineage'; forward: boolean }> = {
	sub: { kind: 'ownership', forward: true },
	imp: { kind: 'ownership', forward: true },
	new: { kind: 'lineage', forward: true },
	spa: { kind: 'lineage', forward: true },
	par: { kind: 'ownership', forward: false },
	ipa: { kind: 'ownership', forward: false },
	old: { kind: 'lineage', forward: false },
	ori: { kind: 'lineage', forward: false }
};

let _producerVotes: Map<string, number> | null = null;

/** Summed votes of every VN a producer originally developed, cached for the life of the process. */
function producerVotes(): Map<string, number> {
	if (!_producerVotes) {
		const rows = getDb()
			.prepare(
				`SELECT d.pid AS pid, SUM(COALESCE(v.c_votecount, 0)) AS votes
         FROM vn_developers d
         JOIN vns v ON v.id = d.vid
         WHERE d.is_original_dev = 1
         GROUP BY d.pid`
			)
			.all() as Array<{ pid: string; votes: number | null }>;
		_producerVotes = new Map(rows.map((r) => [String(r.pid), Number(r.votes || 0)]));
	}
	return _producerVotes;
}

/**
 * Bird's-eye landscape of VN studios: all connected studios under the selected
 * scope, with canonicalized VNDB explicit edges (parent → child, origin → successor)
 * and inferred relationships above `minConfidence`.
 */
export function getLandscapeGraph(params: LandscapeParams = {}) {
	const db = getDb();
	const producerType = params.producerType === 'all' ? 'all' : 'co';
	const lang = params.lang && params.lang !== 'all' ? params.lang : 'all';
	const minConfidence = Math.min(1, Math.max(0, finiteNumber(params.minConfidence, 0.55)));
	const includeExplicit = params.includeExplicit !== false;
	const includeInferred = params.includeInferred !== false;

	const votes = producerVotes();
	const nodeMap = new Map<string, LandscapeNode>();
	const addNode = (
		id: string,
		name: unknown,
		latin: unknown,
		type: unknown,
		nLang: unknown,
		vnCount: unknown,
		staffCount: unknown,
		firstYear: unknown,
		lastYear: unknown
	) => {
		if (nodeMap.has(id)) return;
		nodeMap.set(id, {
			id,
			name: String(latin || name),
			original: orig(name, latin),
			type: String(type) as ProducerType,
			lang: nLang ? String(nLang) : null,
			vnCount: Number(vnCount || 0),
			staffCount: Number(staffCount || 0),
			votes: votes.get(id) ?? 0,
			firstYear: firstYear !== null && firstYear !== undefined ? Number(firstYear) : null,
			lastYear: lastYear !== null && lastYear !== undefined ? Number(lastYear) : null
		});
	};

	const edges: LandscapeEdge[] = [];
	const seenExplicit = new Set<string>();

	const typeFilter = producerType === 'co' ? `AND pa.type = 'co' AND pb.type = 'co'` : '';
	const langFilter = lang !== 'all' ? `AND (pa.lang = ? OR pb.lang = ?)` : '';
	const langArgs = lang !== 'all' ? [lang, lang] : [];

	if (includeExplicit) {
		const expRows = db
			.prepare(
				`SELECT r.id AS id_a, r.pid AS id_b, r.relation,
                pa.name AS name_a, pa.latin AS latin_a, pa.type AS type_a, pa.lang AS lang_a,
                pa.vn_count AS vns_a, pa.staff_count AS staff_a, pa.first_year AS fy_a, pa.last_year AS ly_a,
                pb.name AS name_b, pb.latin AS latin_b, pb.type AS type_b, pb.lang AS lang_b,
                pb.vn_count AS vns_b, pb.staff_count AS staff_b, pb.first_year AS fy_b, pb.last_year AS ly_b
         FROM producers_relations r
         JOIN producers pa ON pa.id = r.id
         JOIN producers pb ON pb.id = r.pid
         WHERE r.id != r.pid ${typeFilter} ${langFilter}`
			)
			.all(...langArgs) as Array<Record<string, unknown>>;

		for (const r of expRows) {
			const rel = String(r.relation) as ExplicitRelationCode;
			const meta = EXPLICIT_OUTWARD[rel];
			if (!meta) continue;
			// Only emit forward direction (`sub`, `imp`, `new`, `spa`) so each pair
			// appears once with a consistent parent → child / origin → successor arrow.
			const idA = String(r.id_a);
			const idB = String(r.id_b);
			const source = meta.forward ? idA : idB;
			const target = meta.forward ? idB : idA;
			const canonicalRel: ExplicitRelationCode =
				rel === 'par' ? 'sub' : rel === 'ipa' ? 'imp' : rel === 'old' ? 'new' : rel === 'ori' ? 'spa' : rel;
			const key = `${source}|${target}|${canonicalRel}`;
			if (seenExplicit.has(key)) continue;
			seenExplicit.add(key);

			addNode(idA, r.name_a, r.latin_a, r.type_a, r.lang_a, r.vns_a, r.staff_a, r.fy_a, r.ly_a);
			addNode(idB, r.name_b, r.latin_b, r.type_b, r.lang_b, r.vns_b, r.staff_b, r.fy_b, r.ly_b);

			edges.push({
				id: `exp|${key}`,
				source,
				target,
				register: 'confirmed',
				kind: meta.kind,
				code: EXPLICIT_META[canonicalRel].code,
				directed: true,
				relationCode: canonicalRel
			});
		}
	}

	if (includeInferred) {
		const infRows = db
			.prepare(
				`SELECT b.pid_a, b.pid_b, b.inferred_type, b.direction, b.confidence, b.confidence_tier,
                b.shared_core_staff, b.scored_core_staff, b.co_dev_vns, b.shared_extlinks,
                pa.name AS name_a, pa.latin AS latin_a, pa.type AS type_a, pa.lang AS lang_a,
                pa.vn_count AS vns_a, pa.staff_count AS staff_a, pa.first_year AS fy_a, pa.last_year AS ly_a,
                pb.name AS name_b, pb.latin AS latin_b, pb.type AS type_b, pb.lang AS lang_b,
                pb.vn_count AS vns_b, pb.staff_count AS staff_b, pb.first_year AS fy_b, pb.last_year AS ly_b
         FROM brand_relations_inferred b
         JOIN producers pa ON pa.id = b.pid_a
         JOIN producers pb ON pb.id = b.pid_b
         WHERE b.confidence >= ? AND ${CORE_DRIVEN_SQL} ${typeFilter} ${langFilter}
         ORDER BY b.confidence DESC, b.weighted_core_score DESC`
			)
			.all(minConfidence, ...langArgs) as Array<Record<string, unknown>>;

		for (const r of infRows) {
			const idA = String(r.pid_a);
			const idB = String(r.pid_b);
			const infType = String(r.inferred_type) as InferredBrandType;
			const dir = String(r.direction) as 'a_to_b' | 'b_to_a' | 'bidirectional';
			const meta = INFERRED_META[infType];
			if (!meta) continue;

			addNode(idA, r.name_a, r.latin_a, r.type_a, r.lang_a, r.vns_a, r.staff_a, r.fy_a, r.ly_a);
			addNode(idB, r.name_b, r.latin_b, r.type_b, r.lang_b, r.vns_b, r.staff_b, r.fy_b, r.ly_b);

			// Orient directed inferred links consistently: parent → subbrand, origin → successor.
			let source = idA;
			let target = idB;
			let directed = false;
			if (infType === 'subbrand') {
				directed = true;
				// Inferred subbrand: a_to_b means A is child of B → parent is B, child is A.
				if (dir === 'b_to_a') {
					source = idA;
					target = idB;
				} else {
					source = idB;
					target = idA;
				}
			} else if (infType === 'successor') {
				directed = true;
				if (dir === 'b_to_a') {
					source = idB;
					target = idA;
				} else {
					source = idA;
					target = idB;
				}
			}

			edges.push({
				id: `inf|${idA}|${idB}`,
				source,
				target,
				register: 'inferred',
				kind: meta.kind,
				code: meta.code,
				directed,
				inferredType: infType,
				direction: dir,
				confidence: Number(r.confidence),
				confidenceTier: String(r.confidence_tier) as InferredBrandLink['confidenceTier'],
				sharedCoreStaff: Number(r.shared_core_staff || 0),
				coDevVns: Number(r.co_dev_vns || 0),
				seiyuuDriven: false
			});
		}
	}

	return {
		nodes: [...nodeMap.values()],
		edges,
		dumpYear: getDumpYear()
	};
}

let _popularityCache: PopularityRankings | null = null;

/**
 * Corpus-wide popularity rankings & stats (most voted / highest rated creators,
 * seiyuu, studios, visual novels, career records, and decade breakdown).
 * Cached in-process since the SQLite dump is read-only.
 */
export function getPopularityRankings(): PopularityRankings {
	if (_popularityCache) return _popularityCache;

	const db = getDb();
	const currentYear = getDumpYear();

	const summaryRow = db
		.prepare(
			`SELECT
         SUM(COALESCE(c_votecount, 0)) AS total_votes,
         SUM(CASE WHEN c_votecount > 0 THEN 1 ELSE 0 END) AS rated_vns,
         ROUND(
           SUM(CASE WHEN c_rating IS NOT NULL AND c_votecount > 0 THEN c_rating * c_votecount ELSE 0 END)
           / NULLIF(SUM(CASE WHEN c_rating IS NOT NULL AND c_votecount > 0 THEN c_votecount ELSE 0 END), 0),
           2
         ) AS weighted_avg_rating,
         ROUND(100.0 * SUM(CASE WHEN has_ero = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS ero_pct
       FROM vns`
		)
		.get() as Record<string, unknown>;

	const staffCounts = db
		.prepare(
			`SELECT
         SUM(CASE WHEN is_core_staff = 1 THEN 1 ELSE 0 END) AS creators_total,
         SUM(CASE WHEN is_seiyuu = 1 THEN 1 ELSE 0 END) AS seiyuu_total
       FROM staff`
		)
		.get() as Record<string, unknown>;

	const hydrateTopCreatorVn = db.prepare(
		`SELECT v.id, v.title, v.original, COALESCE(v.c_votecount, 0) AS votes
     FROM (SELECT DISTINCT vid FROM vn_staff_credits WHERE sid = ? AND is_core = 1) c
     JOIN vns v ON v.id = c.vid
     ORDER BY COALESCE(v.c_votecount, 0) DESC, COALESCE(v.c_rating, 0) DESC
     LIMIT 1`
	);

	const hydrateTopSeiyuuVn = db.prepare(
		`SELECT v.id, v.title, v.original, COALESCE(v.c_votecount, 0) AS votes
     FROM (SELECT DISTINCT vid FROM vn_seiyuu_credits WHERE sid = ?) c
     JOIN vns v ON v.id = c.vid
     ORDER BY COALESCE(v.c_votecount, 0) DESC, COALESCE(v.c_rating, 0) DESC
     LIMIT 1`
	);

	const hydrateTopStudioVn = db.prepare(
		`SELECT v.id, v.title, v.original
     FROM (SELECT DISTINCT vid FROM vn_developers WHERE pid = ? AND is_original_dev = 1) d
     JOIN vns v ON v.id = d.vid
     ORDER BY COALESCE(v.c_votecount, 0) DESC, COALESCE(v.c_rating, 0) DESC
     LIMIT 1`
	);

	const mapPersonRow = (
		r: Record<string, unknown>,
		mode: 'creator' | 'seiyuu'
	): PopularPersonEntry => {
		const id = String(r.id);
		const topVn = (mode === 'creator' ? hydrateTopCreatorVn : hydrateTopSeiyuuVn).get(id) as
			| Record<string, unknown>
			| undefined;
		return {
			id,
			name: String(r.latin || r.name),
			original: orig(r.name, r.latin),
			roles: mode === 'seiyuu' ? ['seiyuu'] : safeJson<string[]>(r.roles_json, []),
			totalVotes: Number(r.total_votes || 0),
			weightedRating: r.weighted_rating !== null && r.weighted_rating !== undefined ? Number(r.weighted_rating) : null,
			vnCount: Number(r.vn_count || 0),
			brandCount: Number(r.brand_count || 0),
			firstYear: r.first_year !== null && r.first_year !== undefined ? Number(r.first_year) : null,
			lastYear: r.last_year !== null && r.last_year !== undefined ? Number(r.last_year) : null,
			aliasCount: Number(r.alias_count || 0),
			potentialAliasCount: Number(r.potential_alias_count || 0),
			topVnId: topVn ? String(topVn.id) : null,
			topVnTitle: topVn ? String(topVn.title) : null,
			topVnOriginal: topVn?.original ? String(topVn.original) : null,
			topVnVotes: topVn ? Number(topVn.votes || 0) : 0
		};
	};

	const creatorBaseSql = `
    WITH agg AS (
      SELECT
        c.sid,
        COUNT(*) AS vn_count,
        SUM(COALESCE(v.c_votecount, 0)) AS total_votes,
        ROUND(
          SUM(CASE WHEN v.c_rating IS NOT NULL AND v.c_votecount > 0 THEN v.c_rating * v.c_votecount ELSE 0 END)
          / NULLIF(SUM(CASE WHEN v.c_rating IS NOT NULL AND v.c_votecount > 0 THEN v.c_votecount ELSE 0 END), 0),
          2
        ) AS weighted_rating
      FROM (SELECT DISTINCT sid, vid FROM vn_staff_credits WHERE is_core = 1) c
      JOIN vns v ON v.id = c.vid
      GROUP BY c.sid
    )
    SELECT
      s.id, s.name, s.latin, s.roles_json, s.brand_count,
      s.first_year, s.last_year, s.alias_count, s.potential_alias_count,
      agg.vn_count, agg.total_votes, agg.weighted_rating
    FROM agg
    JOIN staff s ON s.id = agg.sid`;

	const popularCreators = (
		db
			.prepare(`${creatorBaseSql} WHERE agg.total_votes > 0 ORDER BY agg.total_votes DESC, agg.weighted_rating DESC LIMIT 25`)
			.all() as Array<Record<string, unknown>>
	).map((r) => mapPersonRow(r, 'creator'));

	const topRatedCreators = (
		db
			.prepare(
				`${creatorBaseSql}
         WHERE agg.vn_count >= 3 AND agg.total_votes >= 1500 AND agg.weighted_rating IS NOT NULL
         ORDER BY agg.weighted_rating DESC, agg.total_votes DESC
         LIMIT 20`
			)
			.all() as Array<Record<string, unknown>>
	).map((r) => mapPersonRow(r, 'creator'));

	const seiyuuBaseSql = `
    WITH agg AS (
      SELECT
        c.sid,
        COUNT(*) AS vn_count,
        SUM(COALESCE(v.c_votecount, 0)) AS total_votes,
        ROUND(
          SUM(CASE WHEN v.c_rating IS NOT NULL AND v.c_votecount > 0 THEN v.c_rating * v.c_votecount ELSE 0 END)
          / NULLIF(SUM(CASE WHEN v.c_rating IS NOT NULL AND v.c_votecount > 0 THEN v.c_votecount ELSE 0 END), 0),
          2
        ) AS weighted_rating
      FROM (SELECT DISTINCT sid, vid FROM vn_seiyuu_credits) c
      JOIN vns v ON v.id = c.vid
      GROUP BY c.sid
    )
    SELECT
      s.id, s.name, s.latin, s.roles_json,
      COALESCE(NULLIF(s.seiyuu_brand_count, 0), s.brand_count) AS brand_count,
      s.first_year, s.last_year, s.alias_count, s.potential_alias_count,
      agg.vn_count, agg.total_votes, agg.weighted_rating
    FROM agg
    JOIN staff s ON s.id = agg.sid`;

	const popularSeiyuu = (
		db
			.prepare(`${seiyuuBaseSql} WHERE agg.total_votes > 0 ORDER BY agg.total_votes DESC, agg.weighted_rating DESC LIMIT 25`)
			.all() as Array<Record<string, unknown>>
	).map((r) => mapPersonRow(r, 'seiyuu'));

	const topRatedSeiyuu = (
		db
			.prepare(
				`${seiyuuBaseSql}
         WHERE agg.vn_count >= 5 AND agg.total_votes >= 2500 AND agg.weighted_rating IS NOT NULL
         ORDER BY agg.weighted_rating DESC, agg.total_votes DESC
         LIMIT 20`
			)
			.all() as Array<Record<string, unknown>>
	).map((r) => mapPersonRow(r, 'seiyuu'));

	const studioBaseSql = `
    WITH agg AS (
      SELECT
        d.pid,
        COUNT(*) AS vn_count,
        SUM(COALESCE(v.c_votecount, 0)) AS total_votes,
        ROUND(
          SUM(CASE WHEN v.c_rating IS NOT NULL AND v.c_votecount > 0 THEN v.c_rating * v.c_votecount ELSE 0 END)
          / NULLIF(SUM(CASE WHEN v.c_rating IS NOT NULL AND v.c_votecount > 0 THEN v.c_votecount ELSE 0 END), 0),
          2
        ) AS weighted_rating
      FROM (SELECT DISTINCT pid, vid FROM vn_developers WHERE is_original_dev = 1) d
      JOIN vns v ON v.id = d.vid
      GROUP BY d.pid
    )
    SELECT
      p.id, p.name, p.latin, p.type, p.lang, p.staff_count, p.first_year, p.last_year,
      agg.vn_count, agg.total_votes, agg.weighted_rating
    FROM agg
    JOIN producers p ON p.id = agg.pid`;

	const mapStudioRow = (r: Record<string, unknown>): PopularStudioEntry => {
		const id = String(r.id);
		const topVn = hydrateTopStudioVn.get(id) as Record<string, unknown> | undefined;
		return {
			id,
			name: String(r.latin || r.name),
			original: orig(r.name, r.latin),
			type: String(r.type) as ProducerType,
			lang: r.lang ? String(r.lang) : null,
			totalVotes: Number(r.total_votes || 0),
			weightedRating: r.weighted_rating !== null && r.weighted_rating !== undefined ? Number(r.weighted_rating) : null,
			vnCount: Number(r.vn_count || 0),
			staffCount: Number(r.staff_count || 0),
			firstYear: r.first_year !== null && r.first_year !== undefined ? Number(r.first_year) : null,
			lastYear: r.last_year !== null && r.last_year !== undefined ? Number(r.last_year) : null,
			topVnId: topVn ? String(topVn.id) : null,
			topVnTitle: topVn ? String(topVn.title) : null,
			topVnOriginal: topVn?.original ? String(topVn.original) : null
		};
	};

	const popularStudios = (
		db
			.prepare(`${studioBaseSql} WHERE agg.total_votes > 0 ORDER BY agg.total_votes DESC, agg.weighted_rating DESC LIMIT 25`)
			.all() as Array<Record<string, unknown>>
	).map(mapStudioRow);

	const topRatedStudios = (
		db
			.prepare(
				`${studioBaseSql}
         WHERE agg.vn_count >= 3 AND agg.total_votes >= 2000 AND agg.weighted_rating IS NOT NULL
         ORDER BY agg.weighted_rating DESC, agg.total_votes DESC
         LIMIT 20`
			)
			.all() as Array<Record<string, unknown>>
	).map(mapStudioRow);

	const primaryDevStmt = db.prepare(
		`SELECT p.id, p.name, p.latin
     FROM vn_developers d
     JOIN producers p ON p.id = d.pid
     WHERE d.vid = ? AND d.is_original_dev = 1
     ORDER BY p.vn_count DESC
     LIMIT 1`
	);

	const mapVnRow = (r: Record<string, unknown>): PopularVnEntry => {
		const id = String(r.id);
		const dev = primaryDevStmt.get(id) as Record<string, unknown> | undefined;
		return {
			id,
			title: String(r.title),
			original: r.original ? String(r.original) : null,
			firstYear: r.first_year !== null && r.first_year !== undefined ? Number(r.first_year) : null,
			rating: r.c_rating !== null && r.c_rating !== undefined ? Number(r.c_rating) : null,
			votes: Number(r.c_votecount || 0),
			hasEro: Boolean(r.has_ero),
			hasAllAges: Boolean(r.has_all_ages),
			developerId: dev ? String(dev.id) : null,
			developerName: dev ? String(dev.latin || dev.name) : null,
			developerOriginal: dev ? orig(dev.name, dev.latin) : null
		};
	};

	const topVnsByVotes = (
		db
			.prepare(
				`SELECT id, title, original, first_year, c_rating, c_votecount, has_ero, has_all_ages
         FROM vns
         WHERE c_votecount > 0
         ORDER BY c_votecount DESC, c_rating DESC
         LIMIT 25`
			)
			.all() as Array<Record<string, unknown>>
	).map(mapVnRow);

	const topVnsByRating = (
		db
			.prepare(
				`SELECT id, title, original, first_year, c_rating, c_votecount, has_ero, has_all_ages
         FROM vns
         WHERE c_votecount >= 1000 AND c_rating IS NOT NULL
         ORDER BY c_rating DESC, c_votecount DESC
         LIMIT 25`
			)
			.all() as Array<Record<string, unknown>>
	).map(mapVnRow);

	const mapCareerRecord = (r: Record<string, unknown>): CareerRecordEntry => {
		const fy = r.first_year !== null && r.first_year !== undefined ? Number(r.first_year) : null;
		const ly = r.last_year !== null && r.last_year !== undefined ? Number(r.last_year) : null;
		const isSeiyuu = Boolean(r.is_seiyuu) && !Boolean(r.is_core_staff);
		return {
			id: String(r.id),
			name: String(r.latin || r.name),
			original: orig(r.name, r.latin),
			roles: isSeiyuu ? ['seiyuu'] : safeJson<string[]>(r.roles_json, []),
			isSeiyuu,
			firstYear: fy,
			lastYear: ly,
			spanYears: fy !== null && ly !== null ? Math.max(0, ly - fy) : 0,
			vnCount: Number(r.vn_count || 0),
			brandCount: Number(r.brand_count || 0),
			aliasCount: Number(r.alias_count || 0),
			potentialAliasCount: Number(r.potential_alias_count || 0)
		};
	};

	const longestCareers = (
		db
			.prepare(
				`SELECT id, name, latin, roles_json, is_seiyuu, is_core_staff, first_year, last_year,
                vn_count, brand_count, alias_count, potential_alias_count
         FROM staff
         WHERE first_year IS NOT NULL AND last_year IS NOT NULL
           AND first_year >= 1982 AND last_year <= ?
           AND vn_count >= 10
         ORDER BY (last_year - first_year) DESC, vn_count DESC
         LIMIT 15`
			)
			.all(currentYear + 1) as Array<Record<string, unknown>>
	).map(mapCareerRecord);

	const mostAliases = (
		db
			.prepare(
				`SELECT id, name, latin, roles_json, is_seiyuu, is_core_staff, first_year, last_year,
                vn_count, brand_count, alias_count, potential_alias_count
         FROM staff
         WHERE alias_count >= 3 AND vn_count >= 5
         ORDER BY alias_count DESC, vn_count DESC
         LIMIT 15`
			)
			.all() as Array<Record<string, unknown>>
	).map(mapCareerRecord);

	const decades: DecadeStatEntry[] = (
		db
			.prepare(
				`SELECT
           (first_year / 10) * 10 AS decade,
           COUNT(*) AS vn_count,
           SUM(COALESCE(c_votecount, 0)) AS total_votes,
           ROUND(
             SUM(CASE WHEN c_rating IS NOT NULL AND c_votecount > 0 THEN c_rating * c_votecount ELSE 0 END)
             / NULLIF(SUM(CASE WHEN c_rating IS NOT NULL AND c_votecount > 0 THEN c_votecount ELSE 0 END), 0),
             2
           ) AS weighted_rating,
           ROUND(100.0 * SUM(CASE WHEN has_ero = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS ero_pct
         FROM vns
         WHERE first_year BETWEEN 1980 AND ?
         GROUP BY decade
         ORDER BY decade ASC`
			)
			.all(currentYear + 1) as Array<Record<string, unknown>>
	).map((r) => {
		const dec = Number(r.decade);
		return {
			decade: dec,
			label: `${dec}s`,
			vnCount: Number(r.vn_count || 0),
			totalVotes: Number(r.total_votes || 0),
			weightedRating: r.weighted_rating !== null && r.weighted_rating !== undefined ? Number(r.weighted_rating) : null,
			eroPct: Number(r.ero_pct || 0)
		};
	});

	_popularityCache = {
		summary: {
			totalVotes: Number(summaryRow.total_votes || 0),
			ratedVns: Number(summaryRow.rated_vns || 0),
			weightedAvgRating:
				summaryRow.weighted_avg_rating !== null && summaryRow.weighted_avg_rating !== undefined
					? Number(summaryRow.weighted_avg_rating)
					: null,
			eroPct: Number(summaryRow.ero_pct || 0),
			creatorsTotal: Number(staffCounts.creators_total || 0),
			seiyuuTotal: Number(staffCounts.seiyuu_total || 0)
		},
		popularCreators,
		topRatedCreators,
		popularSeiyuu,
		topRatedSeiyuu,
		popularStudios,
		topRatedStudios,
		topVnsByVotes,
		topVnsByRating,
		longestCareers,
		mostAliases,
		decades
	};

	return _popularityCache;
}
