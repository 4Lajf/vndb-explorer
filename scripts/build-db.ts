import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CONFIDENCE_TIER_MIN, tierForConfidence } from '#lib/relations.ts';
import { MOBILITY_THRESHOLDS } from '#lib/roles.ts';

const ROOT = process.cwd();
const DATA_DIR = path.resolve(process.env.VNDB_DATA_DIR || path.join(ROOT, 'data'));
const DUMP_DIR = path.join(DATA_DIR, 'vndb-db');
const DB_DIR = path.join(DUMP_DIR, 'db');
const OUT_DB = path.resolve(process.env.VNDB_DB_PATH || path.join(DATA_DIR, 'vndb.sqlite'));
const TMP_DB = `${OUT_DB}.tmp`;
const CLEAN_DUMP = process.argv.includes('--clean') || process.env.CLEAN_DUMP === '1';

fs.mkdirSync(path.dirname(OUT_DB), { recursive: true });

const CORE_ROLES = new Set(['director', 'scenario', 'chardesign', 'art', 'music']);
const ROLE_WEIGHTS: Record<string, number> = {
	director: 1.5,
	chardesign: 1.3,
	scenario: 1.2,
	art: 1.0,
	music: 0.65
};
/**
 * Relations that keep two producers in one ownership component: the hierarchy
 * itself, plus renames (a parent listed under an old and a new name is still
 * one owner).
 */
const OWNERSHIP_COMPONENT_RELS = new Set(['imp', 'ipa', 'sub', 'par', 'old', 'new']);
/**
 * Relations drawn as an ownership edge. A rename is lineage, not ownership: it
 * shares a component above, but `producers_relations.edge_kind` files it with
 * successors and spin-offs.
 */
const OWNERSHIP_EDGE_RELS = new Set(['imp', 'ipa', 'sub', 'par']);
const PERSONAL_EXTLINK_SITES = new Set([
	'wikidata',
	'anidb',
	'pixiv',
	'twitter',
	'vgmdb',
	'cien',
	'fanbox',
	'skeb',
	// The dump's own key for Bluesky; `bluesky` is the older spelling.
	'bsky',
	'bluesky',
	'nicovideo',
	'youtube',
	'website',
	// ErogameScape creator page: one per person. `egs` is a game or brand page,
	// which says nothing about who a person is, so it is not listed here.
	'egs_creator'
]);
/**
 * Databases that keep one entry per person, with that person's other names
 * listed on it. Two staff records that each have their own entry in one of
 * these are, by that database's account, two people.
 */
const ONE_PER_PERSON_SITES = new Set(['anidb', 'wikidata', 'vgmdb', 'mobygames', 'anison']);
const ONE_PER_PERSON_LABEL: Record<string, string> = {
	anidb: 'AniDB',
	wikidata: 'Wikidata',
	vgmdb: 'VGMdb',
	mobygames: 'MobyGames',
	anison: 'Anison'
};
const AGENCY_URL_RE =
	/(81produce|artsvision|aoni|haikyo|imenterprise|axl-one|kenproduction|osawa|mausu|sigma7|earlywing|stay-luck|atomicmonkey|pro-fit|vims|aksent|office-pac|air-agency|kaleido|ive\.mu|zizz|atelierpeach|activeplanets|angelnote)/i;

function unescapeCopy(val: string | undefined): string | null {
	if (val === undefined || val === '\\N') return null;
	if (!val.includes('\\')) return val;
	let out = '';
	for (let i = 0; i < val.length; i++) {
		const ch = val[i];
		if (ch === '\\' && i + 1 < val.length) {
			const next = val[++i];
			if (next === 'n') out += '\n';
			else if (next === 'r') out += '\r';
			else if (next === 't') out += '\t';
			else if (next === '\\') out += '\\';
			else out += next;
		} else {
			out += ch;
		}
	}
	return out;
}

function readTsv(table: string): Record<string, string | null>[] {
	const headerPath = path.join(DB_DIR, `${table}.header`);
	const dataPath = path.join(DB_DIR, table);
	const headers = fs.readFileSync(headerPath, 'utf8').trim().split('\t');
	const raw = fs.readFileSync(dataPath, 'utf8');
	const lines = raw.split('\n');
	const rows: Record<string, string | null>[] = [];
	for (let li = 0; li < lines.length; li++) {
		const line = lines[li];
		if (!line) continue;
		const cols = line.split('\t');
		const obj: Record<string, string | null> = {};
		for (let i = 0; i < headers.length; i++) {
			obj[headers[i]] = unescapeCopy(cols[i]);
		}
		rows.push(obj);
	}
	return rows;
}

function parseReleaseYear(released: string | null): number | null {
	if (!released) return null;
	const n = Number(released);
	if (!Number.isFinite(n) || n >= 99990000 || n <= 0) return null;
	const yr = Math.floor(n / 10000);
	return yr >= 1975 && yr <= 2035 ? yr : null;
}

function normName(str: string | null): string {
	if (!str) return '';
	return str
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[\s\-_.'’"·・,()（）\[\]【】]/g, '')
		.replace(/ou/g, 'o')
		.replace(/uu/g, 'u');
}

function swapTokens(str: string | null): string {
	if (!str) return '';
	const parts = str.trim().split(/\s+/).filter(Boolean);
	if (parts.length !== 2) return '';
	return normName(`${parts[1]} ${parts[0]}`);
}

function compatGender(a: string | null, b: string | null): boolean {
	if (!a || !b) return true;
	return a === b;
}

/** Tier floors live in `src/lib/relations.ts`, shared with the UI's confidence meter. */
const confidenceTier = tierForConfidence;
/** "Low-mobility" core staff: the same cut-off the UI labels Anchored. */
const LOW_MOBILITY_MAX = MOBILITY_THRESHOLDS.anchoredMax;

/**
 * VNDB stores an external link as a site key plus the variable part of its URL.
 * The keys are the dump's own (`bsky`, `wp`, `egs_creator`...); the long-form
 * spellings are kept beside them for older dumps. A site with no known format
 * yields null and is not linked.
 */
function extlinkUrl(site: string, value: string): string | null {
	if (/^https?:\/\//i.test(value)) return value;
	const v = encodeURI(value);
	switch (site) {
		case 'website':
			return `https://${value}`;
		case 'twitter':
			return `https://x.com/${v.replace(/^@/, '')}`;
		case 'bsky':
		case 'bluesky':
			return `https://bsky.app/profile/${v}`;
		case 'pixiv':
			return `https://www.pixiv.net/users/${v}`;
		case 'wikidata':
			return `https://www.wikidata.org/wiki/Q${v}`;
		case 'wp':
		case 'wikipedia':
			return `https://en.wikipedia.org/wiki/${v}`;
		case 'anidb':
			return `https://anidb.net/creator/${v}`;
		case 'vgmdb':
			return `https://vgmdb.net/artist/${v}`;
		case 'vgmdb_org':
			return `https://vgmdb.net/org/${v}`;
		// ErogameScape: `egs` is a game page, `egs_creator` a person's page.
		case 'egs':
			return `https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${v}`;
		case 'egs_creator':
			return `https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/creater.php?creater=${v}`;
		case 'nicovideo':
			return `https://www.nicovideo.jp/user/${v}`;
		case 'youtube':
			return `https://www.youtube.com/@${v.replace(/^@/, '')}`;
		case 'cien':
			return `https://ci-en.dlsite.com/creator/${v}`;
		case 'fanbox':
			return `https://${v}.fanbox.cc/`;
		case 'fantia':
			return `https://fantia.jp/fanclubs/${v}`;
		case 'skeb':
			return `https://skeb.jp/@${v}`;
		case 'booth_pub':
			return `https://${v}.booth.pm/`;
		case 'instagram':
			return `https://www.instagram.com/${v}/`;
		case 'facebook':
			return `https://www.facebook.com/${v}`;
		case 'tumblr':
			return `https://${v}.tumblr.com/`;
		case 'itch_dev':
			return `https://${v}.itch.io/`;
		case 'patreon':
			return `https://www.patreon.com/${v}`;
		case 'substar':
			return `https://subscribestar.${v}`;
		case 'kofi':
			return `https://ko-fi.com/${v}`;
		case 'boosty':
			return `https://boosty.to/${v}`;
		case 'scloud':
			return `https://soundcloud.com/${v}`;
		case 'mbrainz':
			return `https://musicbrainz.org/artist/${v}`;
		case 'discogs':
			return `https://www.discogs.com/artist/${v}`;
		case 'anison':
			return `http://anison.info/data/person/${v}.html`;
		case 'imdb':
			return `https://www.imdb.com/name/nm${v.padStart(7, '0')}/`;
		case 'mobygames':
			return `https://www.mobygames.com/person/${v}`;
		case 'mobygames_comp':
			return `https://www.mobygames.com/company/${v}`;
		case 'gamefaqs_comp':
			return `https://gamefaqs.gamespot.com/company/${v}-`;
		case 'steam_curator':
			return `https://store.steampowered.com/curator/${v}`;
		case 'bgmtv':
			return `https://bgm.tv/person/${v}`;
		case 'bilibili':
			return `https://space.bilibili.com/${v}`;
		case 'weibo':
			return `https://weibo.com/u/${v}`;
		case 'vk':
			return `https://vk.com/${v}`;
		case 'nijie':
			return `https://nijie.info/members.php?id=${v}`;
		case 'deviantar':
			return `https://www.deviantart.com/${v}`;
		case 'afdian':
			return `https://afdian.com/a/${v}`;
		case 'vndb':
			return `https://vndb.org/${v}`;
		default:
			return null;
	}
}

/** VNDB BBCode → plain text, for a quote shown inside an evidence sentence. */
function stripBbcode(text: string): string {
	return text
		.replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, '$1')
		.replace(/\[\/?(?:url|b|i|u|s|spoiler|quote|code|raw)(?:=[^\]]*)?\]/gi, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * A release date as a comparable day ordinal. VNDB writes an unknown month or
 * day as `00` or `99`; those sort at the end of the period they do name, so a
 * release with an exact earlier date always comes first.
 */
interface ReleaseDate {
	year: number;
	/** Null when the dump names only the year. */
	month: number | null;
	/** Null when the dump names only the year or month. */
	day: number | null;
	/** Days since 1970-01-01 (UTC) of the date, or of the end of its period. */
	ord: number;
}

function parseReleaseDate(released: string | null): ReleaseDate | null {
	const year = parseReleaseYear(released);
	if (year === null) return null;
	const n = Number(released);
	const mm = Math.floor(n / 100) % 100;
	const dd = n % 100;
	const month = mm >= 1 && mm <= 12 ? mm : null;
	const day = month !== null && dd >= 1 && dd <= 31 ? dd : null;
	// Day 0 of the next month is the last day of this one.
	const ms =
		month === null
			? Date.UTC(year, 11, 31)
			: day === null
				? Date.UTC(year, month, 0)
				: Date.UTC(year, month - 1, day);
	return { year, month, day, ord: Math.round(ms / 86_400_000) };
}

/** Releases this close to the first one are the same launch, not a later port. */
const SIMULTANEOUS_LAUNCH_DAYS = 14;

/** Does release `c` belong to the same launch as the earliest release `first`? */
function sameLaunch(c: ReleaseDate, first: ReleaseDate): boolean {
	// The first release names only a year or a month: nothing finer can be compared.
	if (first.month === null) return c.year === first.year && c.month === null;
	if (first.day === null) return c.year === first.year && c.month === first.month;
	return c.ord - first.ord <= SIMULTANEOUS_LAUNCH_DAYS;
}

function plural(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}

const t0 = Date.now();
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

console.log(`[${elapsed()}] Reading VNDB TSV tables from ${DB_DIR}...`);
const dumpTimestamp = fs.existsSync(path.join(DUMP_DIR, 'TIMESTAMP'))
	? fs.readFileSync(path.join(DUMP_DIR, 'TIMESTAMP'), 'utf8').trim()
	: 'unknown';

const producersRaw = readTsv('producers');
const prodRelsRaw = readTsv('producers_relations');
const prodExtRaw = readTsv('producers_extlinks');
const staffRaw = readTsv('staff');
const staffAliasRaw = readTsv('staff_alias');
const staffExtRaw = readTsv('staff_extlinks');
const vnRaw = readTsv('vn');
const vnTitlesRaw = readTsv('vn_titles');
const vnStaffRaw = readTsv('vn_staff');
const vnSeiyuuRaw = readTsv('vn_seiyuu');
const vnRelsRaw = readTsv('vn_relations');
const releasesRaw = readTsv('releases');
const relVnRaw = readTsv('releases_vn');
const relProdRaw = readTsv('releases_producers');
const charNamesRaw = readTsv('chars_names');
const extlinksRaw = readTsv('extlinks');

console.log(
	`[${elapsed()}] Loaded raw tables: producers=${producersRaw.length}, staff=${staffRaw.length}, vns=${vnRaw.length}, vn_staff=${vnStaffRaw.length}, vn_seiyuu=${vnSeiyuuRaw.length}`
);

// 1. Lookup maps
const extMap = new Map<string, { site: string; value: string }>();
for (const e of extlinksRaw) {
	if (e.id && e.site && e.value) extMap.set(e.id, { site: e.site, value: e.value });
}

const prodMap = new Map<string, Record<string, string | null>>();
for (const p of producersRaw) if (p.id) prodMap.set(p.id, p);

const staffMap = new Map<string, Record<string, string | null>>();
for (const s of staffRaw) if (s.id) staffMap.set(s.id, s);

const aidToAlias = new Map<
	number,
	{ aid: number; sid: string; name: string; latin: string | null; isMain: boolean }
>();
const sidToMain = new Map<string, { aid: number; name: string; latin: string | null }>();
const sidToAliases = new Map<
	string,
	Array<{ aid: number; name: string; latin: string | null; isMain: boolean }>
>();

for (const a of staffAliasRaw) {
	if (!a.id || !a.aid) continue;
	const aid = Number(a.aid);
	const st = staffMap.get(a.id);
	const isMain = st?.main === a.aid;
	const rec = {
		aid,
		sid: a.id,
		name: a.name || a.latin || a.id,
		latin: a.latin || null,
		isMain
	};
	aidToAlias.set(aid, rec);
	if (!sidToAliases.has(a.id)) sidToAliases.set(a.id, []);
	sidToAliases.get(a.id)!.push({ aid, name: rec.name, latin: rec.latin, isMain });
	if (isMain) sidToMain.set(a.id, { aid, name: rec.name, latin: rec.latin });
}

function staffDisplayName(sid: string): string {
	const m = sidToMain.get(sid);
	return m ? m.latin || m.name : sid;
}

function prodDisplayName(pid: string): string {
	const p = prodMap.get(pid);
	return p ? p.latin || p.name || pid : pid;
}

// Character names map (prefer ja / latin, fallback first)
const charNameMap = new Map<string, { name: string; latin: string | null }>();
for (const cn of charNamesRaw) {
	if (!cn.id) continue;
	const existing = charNameMap.get(cn.id);
	if (!existing || (cn.lang === 'ja' && !existing.latin && cn.latin) || cn.lang === 'en') {
		charNameMap.set(cn.id, { name: cn.name || cn.latin || cn.id, latin: cn.latin || null });
	}
}

// VN titles map
const vnTitleMap = new Map<string, { title: string; original: string | null }>();
const vnOlang = new Map<string, string>();
for (const v of vnRaw) {
	if (v.id && v.olang) vnOlang.set(v.id, v.olang);
}
const vnTitlesByVid = new Map<string, Array<Record<string, string | null>>>();
for (const t of vnTitlesRaw) {
	if (!t.id) continue;
	if (!vnTitlesByVid.has(t.id)) vnTitlesByVid.set(t.id, []);
	vnTitlesByVid.get(t.id)!.push(t);
}
for (const v of vnRaw) {
	if (!v.id) continue;
	const list = vnTitlesByVid.get(v.id) || [];
	const olang = v.olang || 'ja';
	const origRow =
		list.find((t) => t.lang === olang && t.official === 't') ||
		list.find((t) => t.lang === olang) ||
		list[0];
	const enRow = list.find((t) => t.lang === 'en' && t.official === 't') || list.find((t) => t.lang === 'en');
	const title =
		enRow?.title ||
		origRow?.latin ||
		origRow?.title ||
		list[0]?.latin ||
		list[0]?.title ||
		v.id;
	const original = origRow?.title && origRow.title !== title ? origRow.title : null;
	vnTitleMap.set(v.id, { title, original });
}

// 2. Releases -> VN original developer & years & has_ero
console.log(`[${elapsed()}] Resolving original-developer attribution & release years...`);
const relMap = new Map<string, Record<string, string | null>>();
for (const r of releasesRaw) if (r.id) relMap.set(r.id, r);

const relVnCount = new Map<string, number>();
const vnToRels = new Map<string, Array<{ rid: string; rtype: string | null }>>();
for (const rv of relVnRaw) {
	if (!rv.id || !rv.vid) continue;
	relVnCount.set(rv.id, (relVnCount.get(rv.id) || 0) + 1);
	if (!vnToRels.has(rv.vid)) vnToRels.set(rv.vid, []);
	vnToRels.get(rv.vid)!.push({ rid: rv.id, rtype: rv.rtype });
}

const relToProds = new Map<
	string,
	Array<{ pid: string; developer: boolean; publisher: boolean }>
>();
for (const rp of relProdRaw) {
	if (!rp.id || !rp.pid) continue;
	if (!relToProds.has(rp.id)) relToProds.set(rp.id, []);
	relToProds.get(rp.id)!.push({
		pid: rp.pid,
		developer: rp.developer === 't',
		publisher: rp.publisher === 't'
	});
}

const vnFirstYear = new Map<string, number | null>();
const vnHasEro = new Map<string, { ero: boolean; allAges: boolean }>();
const vnOrigDevs = new Map<string, Set<string>>();
const vnAllProdLinks = new Map<
	string,
	Map<string, { firstYear: number | null; isOrigDev: boolean; isPublisher: boolean }>
>();

for (const v of vnRaw) {
	const vid = v.id!;
	const olang = v.olang || 'ja';
	const rels = vnToRels.get(vid) || [];
	let minAnyYear: number | null = null;
	// Age rating, read from the releases that are the game itself. A free trial
	// is all-ages by design and a patch adds or removes 18+ content: neither says
	// what the VN is. Tiers, strictest first: official complete non-patch
	// releases, then any complete non-patch release, then every release.
	const ratingTiers = [
		{ ero: false, allAges: false, seen: false },
		{ ero: false, allAges: false, seen: false },
		{ ero: false, allAges: false, seen: false }
	];

	interface CandRel {
		rid: string;
		year: number | null;
		date: ReleaseDate | null;
		sameOlang: boolean;
		devs: string[];
	}
	const cleanCands: CandRel[] = [];
	const fallbackCands: CandRel[] = [];
	const prodLinks = new Map<
		string,
		{ firstYear: number | null; isOrigDev: boolean; isPublisher: boolean }
	>();

	for (const { rid, rtype } of rels) {
		const r = relMap.get(rid);
		if (!r) continue;
		const date = parseReleaseDate(r.released);
		const yr = date?.year ?? null;
		const isGame = rtype === 'complete' && r.patch !== 't';
		const ratingTier = isGame && r.official === 't' ? 0 : isGame ? 1 : 2;
		for (let t = ratingTier; t < ratingTiers.length; t++) {
			ratingTiers[t].seen = true;
			if (r.has_ero === 't') ratingTiers[t].ero = true;
			else ratingTiers[t].allAges = true;
		}

		if (yr !== null && r.patch !== 't' && rtype === 'complete') {
			if (minAnyYear === null || yr < minAnyYear) minAnyYear = yr;
		}

		const prods = relToProds.get(rid) || [];
		const devs: string[] = [];
		for (const p of prods) {
			if (!prodMap.has(p.pid)) continue;
			if (p.developer) devs.push(p.pid);
			const cur = prodLinks.get(p.pid) || {
				firstYear: null,
				isOrigDev: false,
				isPublisher: false
			};
			if (p.publisher) cur.isPublisher = true;
			if (yr !== null && (cur.firstYear === null || yr < cur.firstYear)) cur.firstYear = yr;
			prodLinks.set(p.pid, cur);
		}

		if (devs.length > 0 && r.patch !== 't') {
			const bundleSize = relVnCount.get(rid) || 1;
			const isClean = r.official === 't' && rtype === 'complete' && bundleSize <= 3;
			const cand: CandRel = {
				rid,
				year: yr,
				date,
				sameOlang: r.olang === olang,
				devs
			};
			if (isClean) cleanCands.push(cand);
			else fallbackCands.push(cand);
		}
	}

	const pool = cleanCands.length > 0 ? cleanCands : fallbackCands;
	const olangPool = pool.filter((c) => c.sameOlang);
	const chosenPool = olangPool.length > 0 ? olangPool : pool;

	// The original developers are those of the first release and of any release in
	// the same launch window. A port later in the same year (a console edition by
	// another house) is not an original development and brings no staff with it.
	let firstDate: ReleaseDate | null = null;
	for (const c of chosenPool) {
		if (c.date !== null && (firstDate === null || c.date.ord < firstDate.ord)) firstDate = c.date;
	}
	const earliestDevYear = firstDate?.year ?? null;

	const origSet = new Set<string>();
	for (const c of chosenPool) {
		if (firstDate === null || (c.date !== null && sameLaunch(c.date, firstDate))) {
			for (const pid of c.devs) {
				origSet.add(pid);
				const cur = prodLinks.get(pid);
				if (cur) cur.isOrigDev = true;
			}
		}
	}

	const rating = ratingTiers.find((t) => t.seen) ?? ratingTiers[2];
	vnFirstYear.set(vid, earliestDevYear ?? minAnyYear);
	vnHasEro.set(vid, { ero: rating.ero, allAges: rating.allAges });
	vnOrigDevs.set(vid, origSet);
	vnAllProdLinks.set(vid, prodLinks);
}

// 3. Explicit producer relations graph (ownership vs lineage + BFS distances up to 5)
console.log(`[${elapsed()}] Computing explicit producer relation graph...`);
const explicitRelMap = new Map<string, string>(); // "a|b" -> relation from a to b
const fullAdj = new Map<string, Set<string>>();
const ownAdj = new Map<string, Set<string>>();

for (const pr of prodRelsRaw) {
	if (!pr.id || !pr.pid || !pr.relation) continue;
	if (!prodMap.has(pr.id) || !prodMap.has(pr.pid)) continue;
	explicitRelMap.set(`${pr.id}|${pr.pid}`, pr.relation);
	if (!fullAdj.has(pr.id)) fullAdj.set(pr.id, new Set());
	fullAdj.get(pr.id)!.add(pr.pid);
	if (OWNERSHIP_COMPONENT_RELS.has(pr.relation)) {
		if (!ownAdj.has(pr.id)) ownAdj.set(pr.id, new Set());
		ownAdj.get(pr.id)!.add(pr.pid);
	}
}

function computeComponents(adj: Map<string, Set<string>>): Map<string, number> {
	const comp = new Map<string, number>();
	let cid = 0;
	for (const node of adj.keys()) {
		if (comp.has(node)) continue;
		cid++;
		const q = [node];
		comp.set(node, cid);
		while (q.length > 0) {
			const u = q.shift()!;
			for (const v of adj.get(u) || []) {
				if (!comp.has(v)) {
					comp.set(v, cid);
					q.push(v);
				}
			}
		}
	}
	return comp;
}
const ownComp = computeComponents(ownAdj);

// Explicit parents per producer. `(id, pid, par|ipa)` says pid is id's parent;
// `(id, pid, sub|imp)` says the same thing from the parent's side.
const parentMap = new Map<string, Set<string>>();
const addParent = (child: string, parent: string) => {
	if (!parentMap.has(child)) parentMap.set(child, new Set());
	parentMap.get(child)!.add(parent);
};
for (const pr of prodRelsRaw) {
	if (!pr.id || !pr.pid || !pr.relation) continue;
	if (!prodMap.has(pr.id) || !prodMap.has(pr.pid)) continue;
	if (pr.relation === 'par' || pr.relation === 'ipa') addParent(pr.id, pr.pid);
	else if (pr.relation === 'sub' || pr.relation === 'imp') addParent(pr.pid, pr.id);
}
/** Two brands VNDB places under the same parent company: siblings, not parent and child. */
function shareExplicitParent(a: string, b: string): boolean {
	const pa = parentMap.get(a);
	const pb = parentMap.get(b);
	if (!pa || !pb) return false;
	for (const x of pa) if (pb.has(x)) return true;
	return false;
}
/** Producers VNDB records as owning another: parent companies and brands with imprints. */
const ownsOthers = new Set<string>();
for (const parents of parentMap.values()) for (const p of parents) ownsOthers.add(p);
/**
 * VNDB places both brands in an ownership hierarchy (each has a parent, or is
 * one) and the two hierarchies do not meet: separately owned, by the record.
 * Components are taken over ownership and rename relations together, so a
 * parent listed under an old and a new name is still one owner, and neither
 * brand can be an ancestor of the other. A brand with no ownership relation at
 * all says nothing either way and never counts.
 */
function separatelyOwned(a: string, b: string): boolean {
	const ca = ownComp.get(a);
	const cb = ownComp.get(b);
	if (ca === undefined || cb === undefined || ca === cb) return false;
	return (
		(parentMap.has(a) || ownsOthers.has(a)) && (parentMap.has(b) || ownsOthers.has(b))
	);
}
const fullComp = computeComponents(fullAdj);

// Precompute shortest path distances (1..5) for all nodes in fullAdj: the same
// five-hop horizon the Compare page searches.
const pairDist = new Map<string, number>();
for (const start of fullAdj.keys()) {
	const dist = new Map<string, number>([[start, 0]]);
	const q = [start];
	while (q.length > 0) {
		const u = q.shift()!;
		const d = dist.get(u)!;
		if (d >= 5) continue;
		for (const v of fullAdj.get(u) || []) {
			if (!dist.has(v)) {
				dist.set(v, d + 1);
				q.push(v);
				if (start < v) {
					pairDist.set(`${start}|${v}`, d + 1);
				}
			}
		}
	}
}

// 4. Staff <-> Brand Tenures & Stats
console.log(`[${elapsed()}] Aggregating staff & seiyuu brand tenures...`);
interface TenureAcc {
	vns: Set<string>;
	coreVns: Set<string>;
	/** VNs with any non-seiyuu (development) credit at this brand. */
	devVns: Set<string>;
	seiyuuVns: Set<string>;
	firstYear: number | null;
	lastYear: number | null;
	roles: Set<string>;
	/** Aliases credited at this brand, by VNDB alias id. */
	aliases: Map<number, TenureAlias>;
}
/**
 * One alias as credited at a brand. Kept by id with its original script: two
 * aliases can share a romanisation and differ only in script (ヒマリ and 陽茉莉
 * are both "Himari"), so a romanised string cannot tell them apart.
 */
interface TenureAlias {
	aid: number;
	/** Romanised form, or the only form. */
	name: string;
	/** Original script, when it differs from `name`. */
	original: string | null;
}
function tenureAlias(a: { aid: number; name: string; latin: string | null }): TenureAlias {
	return {
		aid: a.aid,
		name: a.latin || a.name,
		original: a.latin && a.name !== a.latin ? a.name : null
	};
}
/** The alias to show where there is room for one: a pen name before the primary name. */
function leadAlias(acc: TenureAcc | undefined, mainAid: number | undefined): TenureAlias | null {
	if (!acc || acc.aliases.size === 0) return null;
	const list = [...acc.aliases.values()];
	return list.find((a) => a.aid !== mainAid) ?? list[0];
}
/** Credited at both brands, and under no alias the two have in common. */
function aliasesDisjoint(a: TenureAcc | undefined, b: TenureAcc | undefined): boolean {
	if (!a || !b || a.aliases.size === 0 || b.aliases.size === 0) return false;
	for (const aid of a.aliases.keys()) if (b.aliases.has(aid)) return false;
	return true;
}
const tenureMap = new Map<string, TenureAcc>(); // "sid|pid"
const staffAllVns = new Map<string, Set<string>>();
const staffCoreVns = new Map<string, Set<string>>();
const staffSeiyuuVns = new Map<string, Set<string>>();
const staffRoles = new Map<string, Set<string>>();
const staffYears = new Map<string, { first: number | null; last: number | null }>();
const staffCoreBrands = new Map<string, Map<string, Set<string>>>(); // sid -> pid -> core roles
const staffSeiyuuBrands = new Map<string, Set<string>>(); // sid -> Set(pid)
const prodCoreStaff = new Map<string, Set<string>>();
const prodSeiyuu = new Map<string, Set<string>>();
const prodYears = new Map<string, { first: number | null; last: number | null }>();
const prodVnCount = new Map<string, number>();
/** VNs a brand developed on its own: the titles whose staff are unambiguously its own. */
const prodSoloVnCount = new Map<string, number>();

for (const [vid, devs] of vnOrigDevs) {
	const yr = vnFirstYear.get(vid) ?? null;
	for (const pid of devs) {
		prodVnCount.set(pid, (prodVnCount.get(pid) || 0) + 1);
		if (devs.size === 1) prodSoloVnCount.set(pid, (prodSoloVnCount.get(pid) || 0) + 1);
		if (yr !== null) {
			const py = prodYears.get(pid) || { first: null, last: null };
			if (py.first === null || yr < py.first) py.first = yr;
			if (py.last === null || yr > py.last) py.last = yr;
			prodYears.set(pid, py);
		}
	}
}

function addTenure(
	sid: string,
	pid: string,
	vid: string,
	role: string,
	alias: TenureAlias,
	year: number | null,
	isCore: boolean,
	isSeiyuu: boolean
) {
	const key = `${sid}|${pid}`;
	let acc = tenureMap.get(key);
	if (!acc) {
		acc = {
			vns: new Set(),
			coreVns: new Set(),
			devVns: new Set(),
			seiyuuVns: new Set(),
			firstYear: null,
			lastYear: null,
			roles: new Set(),
			aliases: new Map()
		};
		tenureMap.set(key, acc);
	}
	acc.vns.add(vid);
	if (isCore) acc.coreVns.add(vid);
	if (isSeiyuu) acc.seiyuuVns.add(vid);
	else acc.devVns.add(vid);
	acc.roles.add(role);
	if (!acc.aliases.has(alias.aid)) acc.aliases.set(alias.aid, alias);
	if (year !== null) {
		if (acc.firstYear === null || year < acc.firstYear) acc.firstYear = year;
		if (acc.lastYear === null || year > acc.lastYear) acc.lastYear = year;
	}
}

function bumpStaffYear(sid: string, yr: number | null) {
	if (yr === null) return;
	const cur = staffYears.get(sid) || { first: null, last: null };
	if (cur.first === null || yr < cur.first) cur.first = yr;
	if (cur.last === null || yr > cur.last) cur.last = yr;
	staffYears.set(sid, cur);
}

for (const r of vnStaffRaw) {
	if (!r.id || !r.aid || !r.role) continue;
	const alias = aidToAlias.get(Number(r.aid));
	if (!alias) continue;
	const sid = alias.sid;
	const vid = r.id;
	const yr = vnFirstYear.get(vid) ?? null;
	const isCore = CORE_ROLES.has(r.role) && r.eid === null;
	const creditedAs = tenureAlias(alias);

	if (!staffAllVns.has(sid)) staffAllVns.set(sid, new Set());
	staffAllVns.get(sid)!.add(vid);
	if (isCore) {
		if (!staffCoreVns.has(sid)) staffCoreVns.set(sid, new Set());
		staffCoreVns.get(sid)!.add(vid);
	}
	if (!staffRoles.has(sid)) staffRoles.set(sid, new Set());
	staffRoles.get(sid)!.add(r.role);
	bumpStaffYear(sid, yr);

	if (r.eid === null) {
		const devs = vnOrigDevs.get(vid);
		if (devs) {
			for (const pid of devs) {
				addTenure(sid, pid, vid, r.role, creditedAs, yr, isCore, false);
				if (isCore) {
					if (!staffCoreBrands.has(sid)) staffCoreBrands.set(sid, new Map());
					const bm = staffCoreBrands.get(sid)!;
					if (!bm.has(pid)) bm.set(pid, new Set());
					bm.get(pid)!.add(r.role);
					if (!prodCoreStaff.has(pid)) prodCoreStaff.set(pid, new Set());
					prodCoreStaff.get(pid)!.add(sid);
				}
			}
		}
	}
}

for (const r of vnSeiyuuRaw) {
	if (!r.id || !r.aid) continue;
	const alias = aidToAlias.get(Number(r.aid));
	if (!alias) continue;
	const sid = alias.sid;
	const vid = r.id;
	const yr = vnFirstYear.get(vid) ?? null;
	const creditedAs = tenureAlias(alias);

	if (!staffAllVns.has(sid)) staffAllVns.set(sid, new Set());
	staffAllVns.get(sid)!.add(vid);
	if (!staffSeiyuuVns.has(sid)) staffSeiyuuVns.set(sid, new Set());
	staffSeiyuuVns.get(sid)!.add(vid);
	if (!staffRoles.has(sid)) staffRoles.set(sid, new Set());
	staffRoles.get(sid)!.add('seiyuu');
	bumpStaffYear(sid, yr);

	const devs = vnOrigDevs.get(vid);
	if (devs) {
		for (const pid of devs) {
			addTenure(sid, pid, vid, 'seiyuu', creditedAs, yr, false, true);
			if (!staffSeiyuuBrands.has(sid)) staffSeiyuuBrands.set(sid, new Set());
			staffSeiyuuBrands.get(sid)!.add(pid);
			if (!prodSeiyuu.has(pid)) prodSeiyuu.set(pid, new Set());
			prodSeiyuu.get(pid)!.add(sid);
		}
	}
}

// Organize tenures by staff for transition computation
const tenuresBySid = new Map<string, Array<{ pid: string; acc: TenureAcc }>>();
for (const [k, acc] of tenureMap) {
	const [sid, pid] = k.split('|');
	if (!tenuresBySid.has(sid)) tenuresBySid.set(sid, []);
	tenuresBySid.get(sid)!.push({ pid, acc });
}

// 5. Staff Brand Transitions
console.log(`[${elapsed()}] Computing brand-to-brand career transitions...`);
interface TransitionRow {
	sid: string;
	fromPid: string;
	toPid: string;
	isSeiyuu: number;
	/** Both ends carry a core (director/scenario/chardesign/art/music) credit. */
	isCoreMove: number;
	fromFirstYear: number | null;
	fromLastYear: number | null;
	toFirstYear: number | null;
	toLastYear: number | null;
	gapYears: number | null;
	fromRolesJson: string;
	toRolesJson: string;
	aliasChanged: number;
}
const transitions: TransitionRow[] = [];
const pairFlow = new Map<string, { aToB: number; bToA: number }>();

/** Above this many brands a person is a freelancer: their moves say nothing about brand kinship. */
const FLOW_BRAND_CAP = 45;
/** Prolific people still get career moves, over their most-credited brands only. */
const PROLIFIC_TOP_BRANDS = 35;
let prolificWithTransitions = 0;
/** Core moves found only by the core lookback: crowded out before it existed. */
let coreLookbackExtra = 0;

for (const [sid, list] of tenuresBySid) {
	if (list.length < 2) continue;
	const prolific = list.length > FLOW_BRAND_CAP;
	const pool = prolific
		? [...list]
				.sort((a, b) => b.acc.vns.size - a.acc.vns.size || a.pid.localeCompare(b.pid))
				.slice(0, PROLIFIC_TOP_BRANDS)
		: list;
	const withYear = pool
		.filter((x) => x.acc.firstYear !== null && x.acc.lastYear !== null)
		.sort((a, b) => a.acc.firstYear! - b.acc.firstYear! || a.acc.lastYear! - b.acc.lastYear!);
	if (withYear.length < 2) continue;

	// Regular careers: up to 3 most recent preceding brands within 10 years.
	// Prolific careers: up to 2 within 8 years, so the list stays readable.
	// Core-to-core moves keep a lookback of their own with the same limits: a run
	// of voice or QA credits between two core stints must not use up the slots
	// and hide the studio move A → B from the flow counts.
	const maxLinks = prolific ? 2 : 3;
	const maxGap = prolific ? 8 : 10;
	let emitted = 0;

	for (let j = 1; j < withYear.length; j++) {
		const dst = withYear[j];
		const dstIsCore = dst.acc.coreVns.size > 0;
		const dstIsSeiyuu = dst.acc.seiyuuVns.size > 0 && !dstIsCore;
		let linked = 0;
		let coreLinked = 0;
		for (let i = j - 1; i >= 0; i--) {
			const anyRoom = linked < maxLinks;
			const coreRoom = dstIsCore && coreLinked < maxLinks;
			if (!anyRoom && !coreRoom) break;
			const src = withYear[i];
			if (src.pid === dst.pid) continue;
			if (dst.acc.firstYear! <= src.acc.firstYear!) continue;
			const gap = dst.acc.firstYear! - src.acc.lastYear!;
			if (gap > maxGap) continue;
			const isCoreMove = src.acc.coreVns.size > 0 && dstIsCore;
			// Past the general lookback only a core move still counts.
			if (!anyRoom && !isCoreMove) continue;
			if (!anyRoom) coreLookbackExtra++;

			// By alias id: a switch between two scripts of one romanisation is a
			// name change, and two ids never collapse into one string.
			const aliasChanged = aliasesDisjoint(src.acc, dst.acc) ? 1 : 0;

			transitions.push({
				sid,
				fromPid: src.pid,
				toPid: dst.pid,
				isSeiyuu: dstIsSeiyuu ? 1 : 0,
				isCoreMove: isCoreMove ? 1 : 0,
				fromFirstYear: src.acc.firstYear,
				fromLastYear: src.acc.lastYear,
				toFirstYear: dst.acc.firstYear,
				toLastYear: dst.acc.lastYear,
				gapYears: gap,
				fromRolesJson: JSON.stringify([...src.acc.roles]),
				toRolesJson: JSON.stringify([...dst.acc.roles]),
				aliasChanged
			});
			if (anyRoom) linked++;
			if (isCoreMove) coreLinked++;
			emitted++;

			// Directional core-staff flow between producer pairs feeds brand inference.
			// Prolific freelancers are excluded: they would link every brand to every other.
			if (isCoreMove && !prolific) {
				const a = src.pid < dst.pid ? src.pid : dst.pid;
				const b = src.pid < dst.pid ? dst.pid : src.pid;
				const pk = `${a}|${b}`;
				const fl = pairFlow.get(pk) || { aToB: 0, bToA: 0 };
				if (src.pid === a) fl.aToB++;
				else fl.bToA++;
				pairFlow.set(pk, fl);
			}
		}
	}
	if (prolific && emitted > 0) prolificWithTransitions++;
}
console.log(
	`[${elapsed()}] ${transitions.length} transitions (${prolificWithTransitions} people with >${FLOW_BRAND_CAP} brands covered; ${coreLookbackExtra} core moves recovered by the core-only lookback).`
);

// 6. Implicit Brand Relationship Inference
console.log(`[${elapsed()}] Inferring implicit brand relationships...`);
// Co-developed VNs per producer pair
const pairCoDev = new Map<string, number>();
for (const [, devs] of vnOrigDevs) {
	if (devs.size < 2 || devs.size > 6) continue;
	const arr = [...devs].sort();
	for (let i = 0; i < arr.length; i++) {
		for (let j = i + 1; j < arr.length; j++) {
			const pk = `${arr[i]}|${arr[j]}`;
			pairCoDev.set(pk, (pairCoDev.get(pk) || 0) + 1);
		}
	}
}

// Every pair sharing an original-developer credit, with no cap on the size of
// the developer list: used to tell co-dev-only staff from independent ones.
const pairCoDevAny = new Set<string>();
for (const [, devs] of vnOrigDevs) {
	if (devs.size < 2) continue;
	const arr = [...devs].sort();
	for (let i = 0; i < arr.length; i++) {
		for (let j = i + 1; j < arr.length; j++) pairCoDevAny.add(`${arr[i]}|${arr[j]}`);
	}
}

// Cross-brand vn_relations
const pairCrossVnRel = new Map<string, Set<string>>();
// Unofficial relations are fan games, parodies and doujin fandiscs: they tie a
// title to its fandom, not one studio to another. They are tallied apart, for
// the build log only, and never reach a score.
const pairUnofficialVnRel = new Map<string, Set<string>>();
for (const vr of vnRelsRaw) {
	if (!vr.id || !vr.vid || vr.id >= vr.vid) continue;
	const target = vr.official === 't' ? pairCrossVnRel : pairUnofficialVnRel;
	const d1 = vnOrigDevs.get(vr.id);
	const d2 = vnOrigDevs.get(vr.vid);
	if (!d1 || !d2) continue;
	for (const p1 of d1) {
		for (const p2 of d2) {
			if (p1 === p2) continue;
			// A relation that touches a title the two made together is the
			// co-development again, not a second link between the brands.
			if (d1.has(p2) || d2.has(p1)) continue;
			const pk = p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
			if (!target.has(pk)) target.set(pk, new Set());
			target.get(pk)!.add(`${vr.id}|${vr.vid}`);
		}
	}
}
{
	const links = (m: Map<string, Set<string>>) => [...m.values()].reduce((n, s) => n + s.size, 0);
	let unofficialOnlyPairs = 0;
	for (const pk of pairUnofficialVnRel.keys()) if (!pairCrossVnRel.has(pk)) unofficialOnlyPairs++;
	console.log(
		`[${elapsed()}] Cross-brand VN relations: ${pairCrossVnRel.size} producer pairs (${links(pairCrossVnRel)} official relations) kept; ${pairUnofficialVnRel.size} pairs (${links(pairUnofficialVnRel)} unofficial relations) left out, ${unofficialOnlyPairs} of those pairs tied by unofficial relations alone.`
	);
}

// Shared producer extlinks
const extToProds = new Map<string, Set<string>>();
for (const pe of prodExtRaw) {
	if (!pe.id || !pe.link) continue;
	if (!extToProds.has(pe.link)) extToProds.set(pe.link, new Set());
	extToProds.get(pe.link)!.add(pe.id);
}
const pairSharedExt = new Map<string, number>();
for (const [, pset] of extToProds) {
	if (pset.size < 2 || pset.size > 6) continue;
	const arr = [...pset].sort();
	for (let i = 0; i < arr.length; i++) {
		for (let j = i + 1; j < arr.length; j++) {
			const pk = `${arr[i]}|${arr[j]}`;
			pairSharedExt.set(pk, (pairSharedExt.get(pk) || 0) + 1);
		}
	}
}

interface PairAcc {
	sharedCore: number;
	lowMobCore: number;
	weightedCore: number;
	/**
	 * The same three counts over people whose only link between the two brands is
	 * a co-developed VN. A co-developed title credits its whole staff to both
	 * developers, so these people are one fact (the co-development), not two.
	 */
	coDevOnlyCore: number;
	coDevOnlyLowMob: number;
	coDevOnlyWeighted: number;
	sharedSeiyuu: number;
	weightedSeiyuu: number;
	/** Voice actors shared only through the cast of a co-developed VN. */
	coDevOnlySeiyuu: number;
	coDevOnlyWeightedSeiyuu: number;
	topPeople: Array<{ sid: string; score: number; roles: string[]; isSeiyuu: boolean }>;
}
const pairAccMap = new Map<string, PairAcc>();
const ensurePair = (pk: string): PairAcc => {
	let p = pairAccMap.get(pk);
	if (!p) {
		p = {
			sharedCore: 0,
			lowMobCore: 0,
			weightedCore: 0,
			coDevOnlyCore: 0,
			coDevOnlyLowMob: 0,
			coDevOnlyWeighted: 0,
			sharedSeiyuu: 0,
			weightedSeiyuu: 0,
			coDevOnlySeiyuu: 0,
			coDevOnlyWeightedSeiyuu: 0,
			topPeople: []
		};
		pairAccMap.set(pk, p);
	}
	return p;
};

/**
 * Mobility caps. Someone credited at more brands than this is a freelancer or a
 * stock library: they link every brand to every other, so they generate no
 * candidate pair and add nothing to any score. They are still counted in the
 * head counts a reader sees (`exactShared` below).
 */
const CORE_BRAND_CAP = 50;
const SEIYUU_BRAND_CAP = 60;

/** Preview rank of a person shared only through co-developed VNs, relative to an independent one. */
const CODEV_ONLY_RANK = 0.25;

/** Does `sid` hold a core (or voice) credit at `pid` on a VN that `otherPid` did not co-develop? */
function hasIndependentCredit(
	sid: string,
	pid: string,
	otherPid: string,
	kind: 'coreVns' | 'seiyuuVns'
): boolean {
	const t = tenureMap.get(`${sid}|${pid}`);
	if (!t) return false;
	for (const vid of t[kind]) {
		if (!vnOrigDevs.get(vid)?.has(otherPid)) return true;
	}
	return false;
}

// Accumulate core staff overlaps (the cap drops stock BGM libraries automatically)
for (const [sid, brandRoleMap] of staffCoreBrands) {
	const brandCount = brandRoleMap.size;
	if (brandCount < 2 || brandCount > CORE_BRAND_CAP) continue;
	const idf = 1 / Math.log2(1 + brandCount);
	const isLowMob = brandCount <= LOW_MOBILITY_MAX;
	const pids = [...brandRoleMap.keys()].sort();

	for (let i = 0; i < pids.length; i++) {
		const pa = pids[i];
		const rolesA = brandRoleMap.get(pa)!;
		for (let j = i + 1; j < pids.length; j++) {
			const pb = pids[j];
			const rolesB = brandRoleMap.get(pb)!;
			let bestRoleWeight = 0.65;
			const combinedRoles = new Set<string>();
			for (const r of rolesA) {
				combinedRoles.add(r);
				if ((ROLE_WEIGHTS[r] || 0.65) > bestRoleWeight) bestRoleWeight = ROLE_WEIGHTS[r] || 0.65;
			}
			for (const r of rolesB) {
				combinedRoles.add(r);
				if ((ROLE_WEIGHTS[r] || 0.65) > bestRoleWeight) bestRoleWeight = ROLE_WEIGHTS[r] || 0.65;
			}
			const w = idf * bestRoleWeight;
			const pk = `${pa}|${pb}`;
			const acc = ensurePair(pk);
			acc.sharedCore++;
			if (isLowMob) acc.lowMobCore++;
			acc.weightedCore += w;
			// Only pairs that co-developed something can have co-dev-only people.
			const coDevOnly =
				pairCoDevAny.has(pk) &&
				!(
					hasIndependentCredit(sid, pa, pb, 'coreVns') &&
					hasIndependentCredit(sid, pb, pa, 'coreVns')
				);
			if (coDevOnly) {
				acc.coDevOnlyCore++;
				if (isLowMob) acc.coDevOnlyLowMob++;
				acc.coDevOnlyWeighted += w;
			}
			// Independent people lead the preview: they are the stronger evidence.
			const rank = coDevOnly ? w * CODEV_ONLY_RANK : w;
			if (acc.topPeople.length < 16) {
				acc.topPeople.push({ sid, score: rank, roles: [...combinedRoles], isSeiyuu: false });
			} else {
				let minIdx = 0;
				for (let k = 1; k < acc.topPeople.length; k++) {
					if (acc.topPeople[k].score < acc.topPeople[minIdx].score) minIdx = k;
				}
				if (rank > acc.topPeople[minIdx].score) {
					acc.topPeople[minIdx] = { sid, score: rank, roles: [...combinedRoles], isSeiyuu: false };
				}
			}
		}
	}
}

// Accumulate seiyuu overlaps (capped the same way)
for (const [sid, bset] of staffSeiyuuBrands) {
	const brandCount = bset.size;
	if (brandCount < 2 || brandCount > SEIYUU_BRAND_CAP) continue;
	const idf = 1 / Math.log2(1 + brandCount);
	const pids = [...bset].sort();
	for (let i = 0; i < pids.length; i++) {
		for (let j = i + 1; j < pids.length; j++) {
			const pk = `${pids[i]}|${pids[j]}`;
			const acc = ensurePair(pk);
			acc.sharedSeiyuu++;
			acc.weightedSeiyuu += idf;
			if (
				pairCoDevAny.has(pk) &&
				!(
					hasIndependentCredit(sid, pids[i], pids[j], 'seiyuuVns') &&
					hasIndependentCredit(sid, pids[j], pids[i], 'seiyuuVns')
				)
			) {
				acc.coDevOnlySeiyuu++;
				acc.coDevOnlyWeightedSeiyuu += idf;
			}
		}
	}
}

// Also ensure co-dev / shared extlink / strong cross-vn pairs exist
for (const [pk, cd] of pairCoDev) if (cd >= 2) ensurePair(pk);
for (const [pk] of pairSharedExt) ensurePair(pk);

interface InferredBrandRow {
	pidA: string;
	pidB: string;
	inferredType: 'subbrand' | 'sister' | 'successor' | 'partner';
	direction: 'a_to_b' | 'b_to_a' | 'bidirectional';
	confidence: number;
	confidenceTier: 'high' | 'medium' | 'speculative';
	explicitRelation: string | null;
	explicitDist: number | null;
	/** Every core staff member credited at both brands: exact, no mobility cap. */
	sharedCoreStaff: number;
	/** The subset the classifier scored: people at no more than `CORE_BRAND_CAP` brands. */
	scoredCoreStaff: number;
	lowMobCoreStaff: number;
	/** Shared core staff linked only through co-developed VNs (a subset of `sharedCoreStaff`). */
	coDevOnlyStaff: number;
	weightedCoreScore: number;
	containmentAInB: number;
	containmentBInA: number;
	maxContainment: number;
	jaccardCore: number;
	sharedSeiyuu: number;
	weightedSeiyuuScore: number;
	coDevVns: number;
	crossVnRelations: number;
	sharedExtlinks: number;
	yearOverlap: number;
	flowAToB: number;
	flowBToA: number;
	evidence: string[];
	topShared: Array<Record<string, unknown>>;
}

const inferredBrandRows: InferredBrandRow[] = [];

function pairPasses(pk: string, acc: PairAcc): boolean {
	const coDev = pairCoDev.get(pk) || 0;
	const crossVn = pairCrossVnRel.get(pk)?.size || 0;
	const sharedExt = pairSharedExt.get(pk) || 0;
	return (
		(acc.sharedCore >= 2 && acc.weightedCore >= 1.15) ||
		coDev >= 2 ||
		(acc.sharedCore >= 1 && (crossVn >= 2 || sharedExt >= 1)) ||
		(acc.sharedSeiyuu >= 8 && acc.weightedSeiyuu >= 2.2)
	);
}

// Top shared seiyuu per surviving pair. A second pass keeps memory flat: the
// many seiyuu-only pairs that never clear the filter store nothing.
const TOP_SEIYUU_PER_PAIR = 8;
const pairTopSeiyuu = new Map<string, Array<{ sid: string; score: number }>>();
for (const [pk, acc] of pairAccMap) {
	if (acc.sharedSeiyuu > 0 && pairPasses(pk, acc)) pairTopSeiyuu.set(pk, []);
}
for (const [sid, bset] of staffSeiyuuBrands) {
	const brandCount = bset.size;
	if (brandCount < 2 || brandCount > SEIYUU_BRAND_CAP) continue;
	const idf = 1 / Math.log2(1 + brandCount);
	const pids = [...bset].sort();
	for (let i = 0; i < pids.length; i++) {
		for (let j = i + 1; j < pids.length; j++) {
			const top = pairTopSeiyuu.get(`${pids[i]}|${pids[j]}`);
			if (!top) continue;
			if (top.length < TOP_SEIYUU_PER_PAIR) {
				top.push({ sid, score: idf });
			} else {
				let minIdx = 0;
				for (let k = 1; k < top.length; k++) if (top[k].score < top[minIdx].score) minIdx = k;
				if (idf > top[minIdx].score) top[minIdx] = { sid, score: idf };
			}
		}
	}
}

/**
 * Exact shared head counts for one pair, with no mobility cap: the numbers the
 * Compare page arrives at by listing everyone credited at both brands. The
 * classifier's own counts (`PairAcc`) leave the busiest freelancers out, which
 * is right for a score and wrong for a statement like "9 shared core staff".
 * Run only for the pairs that survive `pairPasses`.
 */
function exactShared(
	pidA: string,
	pidB: string,
	pk: string
): { core: number; coDevOnlyCore: number; seiyuu: number } {
	const coDevPair = pairCoDevAny.has(pk);
	let core = 0;
	let coDevOnlyCore = 0;
	const coreA = prodCoreStaff.get(pidA);
	const coreB = prodCoreStaff.get(pidB);
	if (coreA && coreB) {
		const [small, large] = coreA.size <= coreB.size ? [coreA, coreB] : [coreB, coreA];
		for (const sid of small) {
			if (!large.has(sid)) continue;
			core++;
			if (
				coDevPair &&
				!(
					hasIndependentCredit(sid, pidA, pidB, 'coreVns') &&
					hasIndependentCredit(sid, pidB, pidA, 'coreVns')
				)
			) {
				coDevOnlyCore++;
			}
		}
	}
	let seiyuu = 0;
	const seiA = prodSeiyuu.get(pidA);
	const seiB = prodSeiyuu.get(pidB);
	if (seiA && seiB) {
		const [small, large] = seiA.size <= seiB.size ? [seiA, seiB] : [seiB, seiA];
		for (const sid of small) if (large.has(sid)) seiyuu++;
	}
	return { core, coDevOnlyCore, seiyuu };
}

/**
 * Year of the dump. A brand is taken to have stopped once two full years pass
 * with no release: a studio that skipped last year is between titles, not gone.
 */
const DUMP_YEAR = Number(/^(\d{4})/.exec(dumpTimestamp)?.[1]) || new Date().getFullYear();
function hasEnded(span: { first: number | null; last: number | null }): boolean {
	return span.last !== null && span.last <= DUMP_YEAR - 2;
}

/**
 * Raw evidence sum → confidence. Identity up to the knee, so the low and middle
 * of the scale keep their meaning; above it the curve saturates towards the
 * ceiling, spreading strong pairs out instead of clamping them all at the top.
 */
const CONF_KNEE = 0.6;
const CONF_CEIL = 0.98;
function calibrateConfidence(raw: number, knee = CONF_KNEE, ceil = CONF_CEIL): number {
	if (raw <= knee) return raw;
	const span = ceil - knee;
	return knee + span * (1 - Math.exp(-(raw - knee) / span));
}

/** Core-staff overlap below these shares of both studios is routine freelance traffic. */
const THIN_OVERLAP_CONT = 0.2;
const THIN_OVERLAP_JACCARD = 0.1;
/** Raw-score cap for pairs that must not reach High (the tier starts at 0.72). */
const BELOW_HIGH_RAW_MAX = 0.65;
/**
 * A pair tied by nothing but a shared voice cast is always Speculative: its
 * score climbs with the weighted cast overlap and stops just under Medium.
 */
const CAST_ONLY_RAW_MAX = CONFIDENCE_TIER_MIN.medium - 0.01;
function castOnlyScore(weightedSeiyuu: number): number {
	return 0.15 + Math.min(0.32, weightedSeiyuu * 0.025);
}

/** Where VNDB puts a brand in its ownership records, for a classifier note. */
function ownershipPlacement(pid: string): string {
	const parents = [...(parentMap.get(pid) ?? [])].map((p) => prodDisplayName(p)).sort();
	if (parents.length === 0) return `${prodDisplayName(pid)} heads its own group`;
	const shown =
		parents.length <= 2
			? parents.join(' and ')
			: `${parents.slice(0, 2).join(', ')} and ${parents.length - 2} more`;
	return `${prodDisplayName(pid)} under ${shown}`;
}
/** Pairs VNDB places under different owners / of those, moved out of sister / out of sub-brand / capped. */
let separateOwnerPairs = 0;
let separateOwnerFromSister = 0;
let separateOwnerFromSubbrand = 0;
let separateOwnerCapped = 0;

for (const [pk, acc] of pairAccMap) {
	const [pidA, pidB] = pk.split('|');
	const coDev = pairCoDev.get(pk) || 0;
	const crossVn = pairCrossVnRel.get(pk)?.size || 0;
	const sharedExt = pairSharedExt.get(pk) || 0;

	if (!pairPasses(pk, acc)) continue;

	// People shared only through a co-developed VN are set apart everywhere below:
	// counted as overlap they would inflate the score and containment of every partner pair.
	const indepCore = acc.sharedCore - acc.coDevOnlyCore;
	const indepWeighted = acc.weightedCore - acc.coDevOnlyWeighted;
	const indepLowMob = acc.lowMobCore - acc.coDevOnlyLowMob;

	// Containment counts independent people only: "also credited at the other
	// brand on a title the two did not make together". These are the scoring
	// values: the numerator is the capped population the classifier works on.
	const sizeA = prodCoreStaff.get(pidA)?.size || 0;
	const sizeB = prodCoreStaff.get(pidB)?.size || 0;
	const contAInB = sizeA > 0 ? indepCore / sizeA : 0;
	const contBInA = sizeB > 0 ? indepCore / sizeB : 0;
	const maxCont = Math.max(contAInB, contBInA);
	const unionSize = sizeA + sizeB - indepCore;
	const jaccard = unionSize > 0 ? indepCore / unionSize : 0;

	// The same figures over everyone, for what is stored and shown: an exact
	// numerator over the exact denominator, so "x% of A's core staff also appear
	// at B" is literally true and agrees with the people Compare lists.
	const exact = exactShared(pidA, pidB, pk);
	const exactIndepCore = exact.core - exact.coDevOnlyCore;
	const shownContAInB = sizeA > 0 ? exactIndepCore / sizeA : 0;
	const shownContBInA = sizeB > 0 ? exactIndepCore / sizeB : 0;
	const shownMaxCont = Math.max(shownContAInB, shownContBInA);
	const shownUnion = sizeA + sizeB - exactIndepCore;
	const shownJaccard = shownUnion > 0 ? exactIndepCore / shownUnion : 0;
	/** Shared core staff past the mobility cap: counted, never scored. */
	const uncappedOnlyCore = exact.core - acc.sharedCore;

	const yA = prodYears.get(pidA) || { first: null, last: null };
	const yB = prodYears.get(pidB) || { first: null, last: null };
	let yearOverlap = 0;
	if (yA.first !== null && yA.last !== null && yB.first !== null && yB.last !== null) {
		yearOverlap = Math.min(yA.last, yB.last) - Math.max(yA.first, yB.first) + 1;
	}

	const flow = pairFlow.get(pk) || { aToB: 0, bToA: 0 };
	const explicitRel = explicitRelMap.get(pk) || null;
	const explicitDist = pairDist.get(pk) ?? null;

	// Classification logic
	let inferredType: 'subbrand' | 'sister' | 'successor' | 'partner' = 'sister';
	let direction: 'a_to_b' | 'b_to_a' | 'bidirectional' = 'bidirectional';

	const sizeRatio = sizeA > 0 && sizeB > 0 ? Math.max(sizeA, sizeB) / Math.min(sizeA, sizeB) : 1;
	const aEarlier =
		yA.first !== null &&
		yB.first !== null &&
		yA.last !== null &&
		yB.last !== null &&
		yA.first < yB.first &&
		// Strictly earlier at both ends: a brand that ends in the same year as the
		// other handed nothing off to it (a one-year imprint in its parent's final
		// year is an imprint, not a successor).
		yA.last < yB.last;
	const bEarlier =
		yA.first !== null &&
		yB.first !== null &&
		yA.last !== null &&
		yB.last !== null &&
		yB.first < yA.first &&
		yB.last < yA.last;

	// A brand still releasing in the dump year has handed nothing off yet: it can
	// have spun a new brand out, but it is nobody's predecessor.
	const aHandsOff = aEarlier && hasEnded(yA);
	const bHandsOff = bEarlier && hasEnded(yB);

	/**
	 * A flow-based hand-off from `early` to `late`: the earlier brand must have
	 * stopped, must not outlive the later one, and the two must not run side by
	 * side for long. Studios that overlap for a decade are concurrent, whatever
	 * the staff flow.
	 */
	const isHandoff = (
		early: { first: number | null; last: number | null },
		late: { first: number | null; last: number | null }
	): boolean =>
		early.first !== null &&
		early.last !== null &&
		late.first !== null &&
		late.last !== null &&
		late.first - early.first >= 3 &&
		hasEnded(early) &&
		early.last <= late.last &&
		// More than five years between the two is a gap, not a hand-off.
		yearOverlap >= -5 &&
		(yearOverlap <= 5 || early.last - late.first <= 3);

	// VNDB places both under one parent company without relating them to each
	// other: siblings by record. A direct VNDB relation between the two wins.
	const siblings = explicitDist !== 1 && shareExplicitParent(pidA, pidB);
	// Without an explicit VNDB link the containment bar is a little higher.
	const subbrandShape =
		explicitDist === 1
			? maxCont >= 0.45 && sizeRatio >= 1.55
			: maxCont >= 0.5 && sizeRatio >= 1.6;
	// Near-total containment in a much larger brand reads as an imprint even
	// between recorded siblings, and even when the two also co-develop.
	const nearTotalContainment = maxCont >= 0.85 && sizeRatio >= 4 && indepCore >= 3;

	const recurringCoDev =
		coDev >= 2 ||
		(coDev >= 1 &&
			acc.sharedCore <= 4 &&
			coDev >= Math.min(prodVnCount.get(pidA) || 1, prodVnCount.get(pidB) || 1) * 0.4);

	// Joint titles and nobody shared outside them: whatever the head count, the
	// one thing the record shows is that the two made something together.
	const coDevOnlyLink = coDev >= 1 && indepCore === 0;

	if (recurringCoDev || coDevOnlyLink) {
		// Partners, unless one brand also sits almost wholly inside the other
		// on titles they did not make together.
		inferredType = nearTotalContainment ? 'subbrand' : 'partner';
		direction = nearTotalContainment
			? contAInB >= contBInA
				? 'a_to_b'
				: 'b_to_a'
			: 'bidirectional';
	} else if (
		// A hand-off needs real shared core staff and brands close in time:
		// 15 years apart, or only voice actors in common, is not succession.
		(yearOverlap <= 1 && yearOverlap >= -5 && (aHandsOff || bHandsOff) && indepCore >= 2) ||
		(yearOverlap <= 3 &&
			yearOverlap >= -5 &&
			aHandsOff &&
			flow.aToB >= Math.max(2, flow.bToA * 1.8)) ||
		(yearOverlap <= 3 &&
			yearOverlap >= -5 &&
			bHandsOff &&
			flow.bToA >= Math.max(2, flow.aToB * 1.8))
	) {
		inferredType = 'successor';
		// The earlier brand is always the predecessor.
		direction = aHandsOff ? 'a_to_b' : 'b_to_a';
	} else if (nearTotalContainment || (subbrandShape && !siblings)) {
		inferredType = 'subbrand';
		direction = contAInB >= contBInA ? 'a_to_b' : 'b_to_a'; // child -> parent
	} else if (
		coDev === 0 &&
		((flow.aToB >= 3 && flow.aToB >= flow.bToA * 2.5 && isHandoff(yA, yB)) ||
			(flow.bToA >= 3 && flow.bToA >= flow.aToB * 2.5 && isHandoff(yB, yA)))
	) {
		inferredType = 'successor';
		direction = flow.aToB > flow.bToA ? 'a_to_b' : 'b_to_a';
	} else if (!siblings && maxCont < 0.2 && crossVn >= 2) {
		// Under a fifth of either studio in common, and what ties the two is titles
		// related across them (ports, sequels, a shared series): a working
		// relationship between two houses, not sister brands under one roof.
		inferredType = 'partner';
		direction = 'bidirectional';
	} else {
		// Concurrent studios with shared staff, including siblings under one parent.
		inferredType = 'sister';
		direction = 'bidirectional';
	}

	// VNDB places the two under different owners and relates them neither
	// directly nor through one shared neighbour (a studio spun off from another
	// keeps its lineage reading). Sister brands and imprints share an owner, so
	// neither class can stand against the record: what shared staff, joint titles
	// or a shared series show between separate companies is a working
	// partnership. A hand-off stays a hand-off: brands do change owners.
	const separateOwners =
		(explicitDist === null || explicitDist > 2) && separatelyOwned(pidA, pidB);
	const reclassifiedFrom =
		separateOwners && (inferredType === 'sister' || inferredType === 'subbrand')
			? inferredType
			: null;
	if (reclassifiedFrom) {
		inferredType = 'partner';
		direction = 'bidirectional';
	}
	// Short of recurring co-development, such a partnership is never rated High.
	const separateOwnersCapped = separateOwners && inferredType === 'partner' && coDev < 2;
	if (separateOwners) {
		separateOwnerPairs++;
		if (reclassifiedFrom === 'sister') separateOwnerFromSister++;
		if (reclassifiedFrom === 'subbrand') separateOwnerFromSubbrand++;
	}

	// Confidence (0..1). The parts add up to a raw score, which is then bent
	// through a saturating curve: a pair strong on every signal approaches the
	// ceiling without dozens of pairs piling up on it.
	//
	// Shared people reach the score through two families that describe the same
	// kind of fact: staff who worked at both brands on separate titles, and titles
	// the brands made together (whose staff restate the co-development). The
	// stronger family counts in full, the weaker one at a quarter, so a pair is
	// not paid twice for being close.
	//
	// Head counts are judged against the size of the studios. Two large houses
	// share dozens of freelancers as a matter of course: when the overlap is a
	// thin slice of both and nothing else ties them (one joint title or one
	// related VN does not), the staff part is discounted towards half and the
	// pair stays below High. A hand-off is such a tie: the earlier brand stopped
	// and its staff moved one way, which freelance traffic does not explain.
	const corroborated =
		coDev >= 2 || crossVn >= 2 || sharedExt >= 1 || inferredType === 'successor';
	const contShare = Math.min(1, maxCont / THIN_OVERLAP_CONT);
	const thinOverlap =
		maxCont < THIN_OVERLAP_CONT && jaccard < THIN_OVERLAP_JACCARD && !corroborated;
	const staffPartFull =
		Math.min(0.45, indepWeighted * 0.085) + Math.min(0.24, indepLowMob * 0.055);
	const staffPart = thinOverlap ? staffPartFull * (0.5 + 0.5 * contShare) : staffPartFull;
	const coDevPart =
		(coDev >= 2 ? Math.min(0.5, 0.18 + Math.log2(coDev) * 0.12) : coDev === 1 ? 0.12 : 0) +
		Math.min(0.1, acc.coDevOnlyWeighted * 0.02);
	const indepSeiyuu = acc.sharedSeiyuu - acc.coDevOnlySeiyuu;
	const indepWeightedSeiyuu = acc.weightedSeiyuu - acc.coDevOnlyWeightedSeiyuu;
	let raw = Math.max(staffPart, coDevPart) + 0.25 * Math.min(staffPart, coDevPart);
	raw += Math.min(0.18, maxCont * 0.22);
	if (crossVn >= 1) raw += Math.min(0.18, crossVn * 0.06);
	if (sharedExt >= 1) raw += Math.min(0.22, sharedExt * 0.18);
	// Voice actors are freelancers: a shared cast supports a link something else
	// already shows. Counted in full for a corroborated pair, otherwise in
	// proportion to how much of a studio the core overlap is.
	if (indepSeiyuu >= 6) {
		raw += Math.min(0.1, indepWeightedSeiyuu * 0.02) * (corroborated ? 1 : contShare);
	}
	// A cast and nothing else (no core staff, joint title or shared link): the
	// term above is multiplied by a zero containment, which used to leave every
	// such pair on the same floor. They are ranked among themselves instead, by
	// the weighted cast overlap, a related VN adding a little; never past
	// Speculative.
	if (acc.sharedCore === 0 && coDev === 0 && sharedExt === 0 && indepSeiyuu > 0) {
		raw = Math.max(
			raw,
			Math.min(
				CAST_ONLY_RAW_MAX,
				castOnlyScore(indepWeightedSeiyuu) + Math.min(0.06, crossVn * 0.02)
			)
		);
	}
	// Nearly a whole core team found at the other brand, on separate titles, is
	// the signature of an imprint: far stronger than the same head count spread
	// thinly across two large studios.
	const nearWholeTeam = maxCont >= 0.8 && indepCore >= 5;
	if (nearWholeTeam) raw += Math.min(0.16, 0.08 + (indepCore - 5) * 0.02);
	// Penalize tiny 2-person indie collisions without corroboration
	if (acc.sharedCore <= 2 && coDev === 0 && crossVn === 0 && sharedExt === 0) {
		raw = Math.min(raw, 0.56);
	}
	// A brand with a single title is one staff list. Unless that title is its
	// own (no co-developer to whom the same people may belong) and nearly the
	// whole team is found at the other brand, or a shared link or related VN
	// backs it up, one credit list cannot carry a High.
	const smallerPid =
		(prodVnCount.get(pidA) || 0) <= (prodVnCount.get(pidB) || 0) ? pidA : pidB;
	const singleTitleBrand = (prodVnCount.get(smallerPid) || 0) <= 1;
	const ownsItsTitle = (prodSoloVnCount.get(smallerPid) || 0) >= 1 && nearWholeTeam;
	const singleTitleCapped =
		singleTitleBrand && sharedExt === 0 && crossVn === 0 && !ownsItsTitle;
	const belowHighCapped =
		(thinOverlap || singleTitleCapped || separateOwnersCapped) && raw > BELOW_HIGH_RAW_MAX;
	if (thinOverlap || singleTitleCapped || separateOwnersCapped) {
		raw = Math.min(raw, BELOW_HIGH_RAW_MAX);
	}
	// Counted where this is the cap that bites: the note below names one reason.
	if (separateOwnersCapped && belowHighCapped && !thinOverlap && !singleTitleCapped) {
		separateOwnerCapped++;
	}
	const confidence = Number(Math.max(0.12, calibrateConfidence(raw)).toFixed(3));

	// Notes state the exact head counts; where the score saw fewer people, a note says so.
	const evidence: string[] = [];
	if (exact.core > 0) {
		evidence.push(
			`${exact.core} shared core staff (${acc.lowMobCore} low-mobility ≤${LOW_MOBILITY_MAX} brands)`
		);
		if (exact.coDevOnlyCore > 0) {
			evidence.push(
				`${exact.coDevOnlyCore} of them shared only through co-developed VNs (scored as part of the co-development, not as overlap)`
			);
		}
		if (uncappedOnlyCore > 0) {
			evidence.push(
				`${uncappedOnlyCore} of them credited at more than ${CORE_BRAND_CAP} brands: counted here, left out of the score`
			);
		}
	}
	if (siblings) evidence.push('VNDB lists both under the same parent company');
	if (separateOwners) {
		evidence.push(
			`${
				parentMap.has(pidA) && parentMap.has(pidB)
					? 'VNDB places each under a different parent company'
					: 'VNDB places the two in separate ownership groups'
			} (${ownershipPlacement(pidA)}; ${ownershipPlacement(pidB)})${
				reclassifiedFrom
					? `: read as a partnership between separate companies, not as ${reclassifiedFrom === 'sister' ? 'sister brands' : 'a sub-brand'}`
					: ''
			}`
		);
	}
	if (shownMaxCont >= 0.35 && exactIndepCore >= 2) {
		const smaller =
			shownContAInB >= shownContBInA ? prodDisplayName(pidA) : prodDisplayName(pidB);
		evidence.push(`${Math.round(shownMaxCont * 100)}% of ${smaller}'s core staff overlap`);
	}
	if (coDev > 0) evidence.push(`${coDev} co-developed VN${coDev > 1 ? 's' : ''}`);
	if (crossVn > 0) evidence.push(`${crossVn} cross-brand VN relation${crossVn > 1 ? 's' : ''}`);
	if (sharedExt > 0) evidence.push(`${sharedExt} shared external link${sharedExt > 1 ? 's' : ''}`);
	if (inferredType === 'successor' && (flow.aToB > 0 || flow.bToA > 0)) {
		const [srcName, dstName, flCount] =
			direction === 'a_to_b'
				? [prodDisplayName(pidA), prodDisplayName(pidB), flow.aToB]
				: [prodDisplayName(pidB), prodDisplayName(pidA), flow.bToA];
		if (flCount > 0) evidence.push(`${flCount} core staff moved ${srcName} → ${dstName}`);
	}
	if (exact.seiyuu >= 5) {
		const uncappedOnlySeiyuu = exact.seiyuu - acc.sharedSeiyuu;
		evidence.push(
			`${exact.seiyuu} shared seiyuu${uncappedOnlySeiyuu > 0 ? ` (${uncappedOnlySeiyuu} of them cast at more than ${SEIYUU_BRAND_CAP} brands: counted here, left out of the score)` : ''}`
		);
	}
	if (belowHighCapped) {
		evidence.push(
			thinOverlap
				? `Held below High: the shared staff${shownMaxCont >= THIN_OVERLAP_CONT ? `, leaving out people at more than ${CORE_BRAND_CAP} brands,` : ''} are under ${Math.round(THIN_OVERLAP_CONT * 100)}% of either studio and nothing else ties the two`
				: singleTitleCapped
					? `Held below High: ${prodDisplayName(smallerPid)} has a single title${(prodSoloVnCount.get(smallerPid) || 0) === 0 ? ', made with another developer' : ''}`
					: `Held below High: separately owned by VNDB's record, with ${coDev === 0 ? 'no co-developed title' : 'a single co-developed title'} between them`
		);
	}

	const topCore = acc.topPeople.sort((x, y) => y.score - x.score).slice(0, 8);
	// Seiyuu fill the preview when core staff do not: a seiyuu-driven link
	// must still show who the shared people are.
	const seenTop = new Set(topCore.map((p) => p.sid));
	const topSei = (pairTopSeiyuu.get(pk) || [])
		.sort((x, y) => y.score - x.score || x.sid.localeCompare(y.sid))
		.filter((p) => !seenTop.has(p.sid))
		.slice(0, Math.max(0, 8 - topCore.length))
		.map((p) => ({ sid: p.sid, score: p.score, roles: ['seiyuu'], isSeiyuu: true }));
	const topShared = [...topCore, ...topSei].map((p) => {
			const tA = tenureMap.get(`${p.sid}|${pidA}`);
			const tB = tenureMap.get(`${p.sid}|${pidB}`);
			const stMain = sidToMain.get(p.sid);
			const leadA = leadAlias(tA, stMain?.aid);
			const leadB = leadAlias(tB, stMain?.aid);
			return {
				sid: p.sid,
				name: stMain?.latin || stMain?.name || p.sid,
				latin: stMain?.latin || null,
				original: stMain?.latin && stMain.name !== stMain.latin ? stMain.name : null,
				roles: p.roles,
				// Every brand the person is credited at, in any role: the figure the
				// staff page and the mobility mark report.
				brandCount: tenuresBySid.get(p.sid)?.length || 1,
				isSeiyuu: p.isSeiyuu,
				aliasA: leadA?.name ?? null,
				aliasOriginalA: leadA?.original ?? null,
				aliasNonPrimaryA: leadA ? leadA.aid !== stMain?.aid : false,
				aliasCountA: tA?.aliases.size ?? 0,
				aliasB: leadB?.name ?? null,
				aliasOriginalB: leadB?.original ?? null,
				aliasNonPrimaryB: leadB ? leadB.aid !== stMain?.aid : false,
				aliasCountB: tB?.aliases.size ?? 0,
				// Over the full alias sets of both tenures, never the first of each.
				aliasSwitched: aliasesDisjoint(tA, tB),
				yearsA: [tA?.firstYear ?? null, tA?.lastYear ?? null],
				yearsB: [tB?.firstYear ?? null, tB?.lastYear ?? null]
			};
		});

	inferredBrandRows.push({
		pidA,
		pidB,
		inferredType,
		direction,
		confidence,
		confidenceTier: confidenceTier(confidence),
		explicitRelation: explicitRel,
		explicitDist,
		sharedCoreStaff: exact.core,
		scoredCoreStaff: acc.sharedCore,
		lowMobCoreStaff: acc.lowMobCore,
		coDevOnlyStaff: exact.coDevOnlyCore,
		weightedCoreScore: Number(indepWeighted.toFixed(3)),
		containmentAInB: Number(shownContAInB.toFixed(3)),
		containmentBInA: Number(shownContBInA.toFixed(3)),
		maxContainment: Number(shownMaxCont.toFixed(3)),
		jaccardCore: Number(shownJaccard.toFixed(3)),
		sharedSeiyuu: exact.seiyuu,
		// The independent cast, as scored: the same people `weightedCoreScore` leaves out.
		weightedSeiyuuScore: Number(indepWeightedSeiyuu.toFixed(3)),
		coDevVns: coDev,
		crossVnRelations: crossVn,
		sharedExtlinks: sharedExt,
		yearOverlap,
		flowAToB: flow.aToB,
		flowBToA: flow.bToA,
		evidence,
		topShared
	});
}
console.log(`[${elapsed()}] Found ${inferredBrandRows.length} inferred brand pairs.`);
console.log(
	`[${elapsed()}] Separately owned by VNDB's record: ${separateOwnerPairs} pairs; ${separateOwnerFromSister} moved from sister and ${separateOwnerFromSubbrand} from sub-brand to partner, ${separateOwnerCapped} held below High.`
);

// 7. Potential Unlinked Aliases Detection (Staff & Seiyuu)
console.log(`[${elapsed()}] Detecting potential unlinked aliases for staff & seiyuu...`);

// Precompute ero_rate per staff
const staffEroRate = new Map<string, number | null>();
for (const [sid, vns] of staffAllVns) {
	if (!vns.size) continue;
	let eroOnly = 0;
	for (const vid of vns) {
		const e = vnHasEro.get(vid);
		if (e && e.ero && !e.allAges) eroOnly++;
	}
	staffEroRate.set(sid, Number((eroOnly / vns.size).toFixed(3)));
}

interface AliasCandAcc {
	sharedChars: Set<string>;
	sameVnSharedChars: Set<string>;
	/** VNs where both records voice the *same* character (not a co-credit in the usual sense). */
	sameVnSharedCharVids: Set<string>;
	nonRecastSharedChars: number;
	sharedExtlinks: string[];
	bioQuote: string | null;
	nameMatchKind: string | null;
}
const aliasCands = new Map<string, AliasCandAcc>();
const ensureAliasCand = (a: string, b: string): AliasCandAcc => {
	const k = a < b ? `${a}|${b}` : `${b}|${a}`;
	let c = aliasCands.get(k);
	if (!c) {
		c = {
			sharedChars: new Set(),
			sameVnSharedChars: new Set(),
			sameVnSharedCharVids: new Set(),
			nonRecastSharedChars: 0,
			sharedExtlinks: [],
			bioQuote: null,
			nameMatchKind: null
		};
		aliasCands.set(k, c);
	}
	return c;
};

// Signal A: Shared character (cid) in vn_seiyuu (same lang, compat gender, strict 2-way, recast-aware)
const cidLangSids = new Map<string, Map<string, Map<string, Set<string>>>>(); // cid -> lang -> sid -> Set(vid)
// Keyed by `vid|lang`: a dual-audio JP+EN release has two voices per character
// by design, which is not a recast and must not read as one.
const vnCharSidCounts = new Map<string, Map<string, Set<string>>>(); // "vid|lang" -> cid -> Set(sid)
for (const r of vnSeiyuuRaw) {
	if (!r.id || !r.cid || !r.aid) continue;
	const al = aidToAlias.get(Number(r.aid));
	if (!al) continue;
	const sid = al.sid;
	const lang = staffMap.get(sid)?.lang || 'unk';

	if (!cidLangSids.has(r.cid)) cidLangSids.set(r.cid, new Map());
	const lm = cidLangSids.get(r.cid)!;
	if (!lm.has(lang)) lm.set(lang, new Map());
	const sm = lm.get(lang)!;
	if (!sm.has(sid)) sm.set(sid, new Set());
	sm.get(sid)!.add(r.id);

	const vlKey = `${r.id}|${lang}`;
	if (!vnCharSidCounts.has(vlKey)) vnCharSidCounts.set(vlKey, new Map());
	const cm = vnCharSidCounts.get(vlKey)!;
	if (!cm.has(r.cid)) cm.set(r.cid, new Set());
	cm.get(r.cid)!.add(sid);
}

// Per-VN, per-language multi-cast rate (spots full-cast console remakes).
const vnRecastRate = new Map<string, number>();
for (const [vlKey, cm] of vnCharSidCounts) {
	let multi = 0;
	for (const [, sids] of cm) if (sids.size >= 2) multi++;
	vnRecastRate.set(vlKey, cm.size > 0 ? multi / cm.size : 0);
}

for (const [cid, lm] of cidLangSids) {
	for (const [lang, sm] of lm) {
		if (sm.size !== 2) continue;
		const [[s1, v1], [s2, v2]] = [...sm.entries()].sort((x, y) => x[0].localeCompare(y[0]));
		if (!compatGender(staffMap.get(s1)?.gender ?? null, staffMap.get(s2)?.gender ?? null)) continue;
		const overlapVns = [...v1].filter((v) => v2.has(v));
		const c = ensureAliasCand(s1, s2);
		c.sharedChars.add(cid);
		if (overlapVns.length > 0) c.sameVnSharedChars.add(cid);
		for (const v of overlapVns) c.sameVnSharedCharVids.add(v);
		// A release that credits both for the part decides the question by itself:
		// if it is a full-cast remake, the part was recast, whatever a single-cast
		// original elsewhere in the list would suggest. Only when the two never
		// share a release do all of the character's VNs get a say.
		const judgedVns = overlapVns.length > 0 ? overlapVns : [...new Set([...v1, ...v2])];
		let lowRecast = false;
		for (const v of judgedVns) {
			if ((vnRecastRate.get(`${v}|${lang}`) || 0) < 0.45) lowRecast = true;
		}
		if (lowRecast) c.nonRecastSharedChars++;
	}
}

// Signal B: Shared personal staff_extlinks
const extToStaff = new Map<string, Set<string>>();
/** Each record's ids in the one-entry-per-person databases: sid -> site -> values. */
const staffPersonIds = new Map<string, Map<string, Set<string>>>();
for (const se of staffExtRaw) {
	if (!se.id || !se.link) continue;
	const info = extMap.get(se.link);
	if (info && ONE_PER_PERSON_SITES.has(info.site)) {
		if (!staffPersonIds.has(se.id)) staffPersonIds.set(se.id, new Map());
		const bySite = staffPersonIds.get(se.id)!;
		if (!bySite.has(info.site)) bySite.set(info.site, new Set());
		bySite.get(info.site)!.add(info.value);
	}
	if (!info || !PERSONAL_EXTLINK_SITES.has(info.site)) continue;
	if (AGENCY_URL_RE.test(info.value)) continue;
	// A link a producer also carries is a studio/circle account, not a personal one.
	if (extToProds.has(se.link)) continue;
	if (!extToStaff.has(se.link)) extToStaff.set(se.link, new Set());
	extToStaff.get(se.link)!.add(se.id);
}
for (const [lid, sids] of extToStaff) {
	if (sids.size !== 2) continue;
	const [s1, s2] = [...sids].sort();
	const i1 = staffMap.get(s1),
		i2 = staffMap.get(s2);
	if (!i1 || !i2) continue;
	if (!compatGender(i1.gender, i2.gender)) continue;
	const info = extMap.get(lid)!;
	const c = ensureAliasCand(s1, s2);
	c.sharedExtlinks.push(`${info.site}:${info.value}`);
}

// Signal C: Local-window VNDB bio alias cross-references
// A bare hedge ("probably worked with", "may be related to", "rumoured to have
// left", "believed to live in") says nothing about identity. It counts only
// next to an alias cue in the same sentence, or when it leads straight into the
// link ("might be [url=/s123]", "rumoured to be [url=/s123]").
//
// An alias cue has to lead into the link it is about: "an alias of [url=/s123]",
// "also known as [url=/s123]". A cue elsewhere in the sentence names somebody
// else's other name ("[url=/s123]X[/url] (also known as mazzy)" gives X's
// nickname; "the real name of [url=/s1]A[/url] of [url=/s2]B[/url]" is about A,
// not B), so the stretch between cue and link is short and holds no bracket,
// no clause break and therefore no other link.
const BIO_HEDGE = '(?:possibly|probably|might be|may be|rumou?red|suspected|believed)';
const BIO_CUE_GAP = '[^,;:()（）\\[\\]]{0,30}$';
/** Says "another name of this person" outright. */
const BIO_STRONG_CUE =
	'(?:alias(?:es)?\\s+(?:of|for)|alias\\s*[:：]|pseudonym\\s+(?:of|for)|pen[ -]?name\\s+(?:of|for)|stage name\\s+(?:of|for)|(?:old|former|alternate|alternative)\\s+name\\s+(?:of|for)|also known as|a\\.k\\.a\\.?|same person as)';
/** Reads as an alias statement only next to a hedge in the same sentence. */
const BIO_WEAK_CUE =
	'(?:(?:real|new|other|another)\\s+name\\s+(?:of|for)|(?:active|credited)\\s+as|same (?:individual|artist|actor|actress|seiyuu|voice)\\s+as|identical\\s+(?:to|with)|true identity\\s+of)';
const BIO_STRONG_INTO_LINK_RE = new RegExp(`${BIO_STRONG_CUE}${BIO_CUE_GAP}`, 'i');
const BIO_WEAK_INTO_LINK_RE = new RegExp(`${BIO_WEAK_CUE}${BIO_CUE_GAP}`, 'i');
const BIO_HEDGE_RE = new RegExp(BIO_HEDGE, 'i');
const BIO_HEDGE_INTO_LINK_RE = new RegExp(
	`${BIO_HEDGE}(?:\\s+to\\s+be)?(?:\\s+(?:be|actually|also|just|really|simply|the|same|as|identical|to))*\\s*$`,
	'i'
);
// A bio that explicitly tells two records apart is the strongest evidence there
// is, and it argues *against* an alias: such pairs are dropped outright below.
const DISAVOW_SRC =
	"not (?:to )?be confused|(?:do not|don't|never) confuse|not (?:the )?same person|not an? alias|different (?:person|people)|separate (?:person|people)|unrelated to|not related to|no relation to|mistaken for";
const DISAVOW_RE = new RegExp(`(?:${DISAVOW_SRC})`, 'i');
/** A band, unit or circle and the people in it: membership, not identity. */
const BIO_GROUP_SRC =
	'\\bmembers?\\b|\\bpart of\\b|\\bfounded by\\b|\\bformed by\\b|\\bgroups?\\b|\\bbands?\\b|\\bduos?\\b|\\btrios?\\b|\\bunits?\\b|\\bcircles?\\b|\\bprojects?\\b|\\borchestra|\\bchorus\\b|\\bconsist(?:s|ed|ing) of\\b|\\bcomprised of\\b|\\bcomposed of\\b';
const BIO_GROUP_RE = new RegExp(`(?:${BIO_GROUP_SRC})`, 'i');
// Whole words: unanchored, `son` also matched "person" and threw out every
// "the same person as" statement, and `unit` matched "community".
const NEG_BIO_RE = new RegExp(
	`(?:${DISAVOW_SRC}|confus|\\bmarried\\b|\\bhusband\\b|\\bwife\\b|\\bspouse\\b|\\bsiblings?\\b|\\bbrothers?\\b|\\bsisters?\\b|\\bfather\\b|\\bmother\\b|\\bdaughters?\\b|\\bsons?\\b|\\baffiliated\\b|\\brepresented by\\b|\\bworks? for\\b|\\bjoined\\b|\\bcollaborat|\\bworked with\\b|\\b(?:vocalist|composer|singer) of\\b|\\bbassist\\b|\\bguitarist\\b|\\bdrummer\\b|\\bkeyboardist\\b|${BIO_GROUP_SRC})`,
	'i'
);
/** An opening sentence about a person's place in a group, not about a group. */
const BIO_MEMBERSHIP_RE =
	/\b(?:member|part|founder|leader|representative|employee|vocalist|composer|singer) of\b|\bbelongs? to\b|\baffiliated\b|\bworks? (?:for|at|as)\b/i;

/**
 * Bounds of the text within ±`radius` chars of a `[url=/sN]` mention, clipped
 * to the sentence that holds it, so a neighbouring sentence about a third
 * person cannot leak in.
 */
function sentenceBounds(text: string, start: number, end: number, radius: number): [number, number] {
	let lo = Math.max(0, start - radius);
	let hi = Math.min(text.length, end + radius);
	const before = text.slice(lo, start);
	const brk = /[.!?。！？]\s|\n/g;
	let last = -1;
	for (let m = brk.exec(before); m; m = brk.exec(before)) last = m.index + m[0].length;
	if (last >= 0) lo += last;
	// Skip past the link text: a name like "Dr. X" must not end the sentence early.
	const closeRel = text.slice(end, hi).search(/\[\/url\]/i);
	const afterFrom = closeRel >= 0 ? end + closeRel + 6 : end;
	const after = text.slice(afterFrom, hi);
	const stop = after.search(/[.!?。！？](?:\s|$)|\n/);
	if (stop >= 0) hi = afterFrom + stop + 1;
	// The radius can land inside a `[url=https://…]` tag: step out of it, so the
	// window never opens or closes on half a tag (which would be quoted as text).
	const head = text.slice(lo, start);
	const headClose = head.indexOf(']');
	const headOpen = head.indexOf('[');
	if (headClose >= 0 && (headOpen < 0 || headClose < headOpen)) lo += headClose + 1;
	const tail = text.slice(afterFrom, hi);
	const tailOpen = tail.lastIndexOf('[');
	if (tailOpen > tail.lastIndexOf(']')) hi = afterFrom + tailOpen;
	return [lo, hi];
}
function sentenceWindow(text: string, start: number, end: number, radius: number): string {
	const [lo, hi] = sentenceBounds(text, start, end, radius);
	return text.slice(lo, hi).replace(/\s+/g, ' ').trim();
}

/** Bracketed remarks opened and closed on one side of the link: asides about something else. */
function stripAsides(text: string): string {
	return text.replace(/[(（][^()（）]*[)）]/g, ' ').replace(/\s+/g, ' ');
}

/** Does the sentence around the link at `start..end` say the two records are one person? */
function bioAliasClaim(desc: string, start: number, end: number): boolean {
	const [lo, hi] = sentenceBounds(desc, start, end, 85);
	const pre = stripAsides(desc.slice(lo, start));
	const post = stripAsides(desc.slice(end, hi));
	return (
		BIO_STRONG_INTO_LINK_RE.test(pre) ||
		BIO_HEDGE_INTO_LINK_RE.test(pre) ||
		(BIO_WEAK_INTO_LINK_RE.test(pre) && BIO_HEDGE_RE.test(`${pre} ${post}`))
	);
}

/**
 * The line that introduces the list a link sits in ("…a duo whose members
 * were:"), looking back over the lines of the same paragraph. A sentence
 * window stops at the line break and never sees it.
 */
function listHeader(text: string, start: number): string | null {
	let lineStart = text.lastIndexOf('\n', start - 1) + 1;
	for (let i = 0; i < 12 && lineStart > 0; i++) {
		const prevEnd = lineStart - 1;
		const prevStart = text.lastIndexOf('\n', prevEnd - 1) + 1;
		const line = text.slice(prevStart, prevEnd).trim();
		if (!line) return null;
		if (/[:：]$/.test(line)) return line;
		lineStart = prevStart;
	}
	return null;
}

/**
 * A record VNDB keeps for a band, unit or circle: no gender, and a bio that
 * opens by saying so. A person linked from it, or linking to it, is a member.
 */
const collectiveCache = new Map<string, boolean>();
function isCollective(sid: string): boolean {
	let known = collectiveCache.get(sid);
	if (known === undefined) {
		const s = staffMap.get(sid);
		known = false;
		if (s && !s.gender && s.description) {
			const opening = s.description.split(/(?<=[.!?。！？])\s|\n/, 1)[0].slice(0, 240);
			known = BIO_GROUP_RE.test(opening) && !BIO_MEMBERSHIP_RE.test(opening);
		}
		collectiveCache.set(sid, known);
	}
	return known;
}

// Bios link staff both as `[url=/s123]` and as `[URL=https://vndb.org/s123]`.
const STAFF_URL_RE = /\[url=(?:https?:\/\/(?:www\.)?vndb\.org)?\/s(\d+)\/?\]/gi;

const disavowedAliasPairs = new Set<string>();
for (const s of staffRaw) {
	if (!s.id || !s.description) continue;
	for (const m of s.description.matchAll(STAFF_URL_RE)) {
		const target = `s${m[1]}`;
		if (target === s.id || !staffMap.has(target)) continue;
		const win = sentenceWindow(s.description, m.index!, m.index! + m[0].length, 300);
		if (DISAVOW_RE.test(win)) {
			disavowedAliasPairs.add(s.id < target ? `${s.id}|${target}` : `${target}|${s.id}`);
		}
	}
}

let bioMatchedPairs = 0;
for (const s of staffRaw) {
	if (!s.id || !s.description) continue;
	for (const m of s.description.matchAll(STAFF_URL_RE)) {
		const target = `s${m[1]}`;
		if (target === s.id || !staffMap.has(target)) continue;
		const start = m.index!;
		const end = start + m[0].length;
		if (!bioAliasClaim(s.description, start, end)) continue;
		// Clipped to the sentence, as for disavowals: a neighbouring sentence about
		// a third person must not lend its "alias of" to this link.
		const win = sentenceWindow(s.description, start, end, 85);
		// A disavowal counts from anywhere in the sentence, however long it runs.
		if (NEG_BIO_RE.test(win) || DISAVOW_RE.test(sentenceWindow(s.description, start, end, 300))) {
			continue;
		}
		// Group context the sentence itself does not show: a member list under a
		// heading, or a record that stands for a band, unit or circle.
		const header = listHeader(s.description, start);
		if (header && BIO_GROUP_RE.test(header)) continue;
		if (isCollective(s.id) || isCollective(target)) continue;
		const tInfo = staffMap.get(target)!;
		if (!compatGender(s.gender, tInfo.gender)) continue;
		const c = ensureAliasCand(s.id, target);
		// Stored as plain text: the quote is shown inside an evidence sentence.
		if (!c.bioQuote) {
			c.bioQuote = stripBbcode(win)
				.replace(/\s+/g, ' ')
				// "[url=…] Name [/url]." leaves a space before the full stop.
				.replace(/ ([.,;:!?])/g, '$1')
				.trim()
				.slice(0, 140);
			bioMatchedPairs++;
		}
	}
}
console.log(`[${elapsed()}] VNDB bio cross-references: ${bioMatchedPairs} pairs.`);

// Signal D: Exact & swapped normalized name collisions (same lang, compat gender)
const exactNameBuckets = new Map<string, Set<string>>();
const swappedNameBuckets = new Map<string, Set<string>>();
for (const a of staffAliasRaw) {
	if (!a.id) continue;
	const lang = staffMap.get(a.id)?.lang || 'unk';
	for (const field of [a.name, a.latin]) {
		const n = normName(field);
		if (!n) continue;
		const isAscii = /^[a-z0-9]+$/.test(n);
		if ((isAscii && n.length < 5) || (!isAscii && n.length < 3)) continue;
		const bk = `${lang}|${n}`;
		if (!exactNameBuckets.has(bk)) exactNameBuckets.set(bk, new Set());
		exactNameBuckets.get(bk)!.add(a.id);

		const sw = swapTokens(field);
		if (sw && sw !== n && sw.length >= 6) {
			const sk = `${lang}|${sw}`;
			if (!swappedNameBuckets.has(sk)) swappedNameBuckets.set(sk, new Set());
			swappedNameBuckets.get(sk)!.add(a.id);
		}
	}
}

for (const [, sids] of exactNameBuckets) {
	if (sids.size < 2 || sids.size > 3) continue;
	const arr = [...sids].sort();
	for (let i = 0; i < arr.length; i++) {
		for (let j = i + 1; j < arr.length; j++) {
			const s1 = arr[i],
				s2 = arr[j];
			if (!compatGender(staffMap.get(s1)?.gender ?? null, staffMap.get(s2)?.gender ?? null))
				continue;
			const c = ensureAliasCand(s1, s2);
			c.nameMatchKind = 'exact_normalized';
		}
	}
}

for (const [sk, swSids] of swappedNameBuckets) {
	const exactSids = exactNameBuckets.get(sk);
	if (!exactSids || exactSids.size > 3 || swSids.size > 3) continue;
	for (const s1 of swSids) {
		for (const s2 of exactSids) {
			if (s1 === s2) continue;
			if (!compatGender(staffMap.get(s1)?.gender ?? null, staffMap.get(s2)?.gender ?? null))
				continue;
			const c = ensureAliasCand(s1, s2);
			if (!c.nameMatchKind) c.nameMatchKind = 'swapped_order';
		}
	}
}

/** One-per-person databases that list the two records under different entries. */
function separatelyListed(sidA: string, sidB: string): string[] {
	const a = staffPersonIds.get(sidA);
	const b = staffPersonIds.get(sidB);
	if (!a || !b) return [];
	const out: string[] = [];
	for (const [site, valsA] of a) {
		const valsB = b.get(site);
		if (!valsB) continue;
		let shared = false;
		for (const v of valsA) if (valsB.has(v)) shared = true;
		if (!shared) out.push(site);
	}
	return out.sort();
}

// Score & filter all potential alias candidates
interface PotentialAliasRow {
	sidA: string;
	sidB: string;
	category: 'seiyuu' | 'staff' | 'mixed';
	confidence: number;
	confidenceTier: 'high' | 'medium' | 'speculative';
	sharedChars: number;
	sameVnSharedChars: number;
	sharedExtlinks: number;
	bioCrossref: number;
	nameMatchKind: string | null;
	sharedBrands: number;
	coCreditVns: number;
	eroSplit: number | null;
	evidence: string[];
	/** One-entry-per-person databases (site keys) that list the two records apart. */
	listedApart: string[];
	sampleChars: Array<{ cid: string; name: string; count: number }>;
	sampleBrands: Array<{ pid: string; name: string; original: string | null }>;
}

const potentialAliasRows: PotentialAliasRow[] = [];
const SINGLE_CHAR_UNCORROBORATED_MAX = 0.57;
/**
 * Alias scores are sums of independent signals and run well past 1. The curve
 * is the brand one with its own knee and ceiling: identity below the knee, then
 * saturating, so a pair backed by an explicit bio statement and four shared
 * characters stays visibly ahead of one that merely adds up to the same clamp.
 * The knee sits on the High floor (0.72): the curve spreads the top out without
 * moving any pair across a tier, so what "High" takes is still set by the
 * signal weights above and not by the curve.
 */
const ALIAS_CONF_KNEE = 0.72;
const ALIAS_CONF_CEIL = 0.97;
/**
 * Ceiling for a pair that a one-entry-per-person authority lists as two people,
 * when no strict personal ID and no bio statement says otherwise. Under the
 * High floor: such a pair is never called "likely the same person".
 */
const LISTED_APART_MAX = 0.68;
/** Kept candidates with separate listings / of those, penalised / capped / held at the floor. */
let listedApartKept = 0;
let listedApartPenalised = 0;
let listedApartCapped = 0;
let listedApartFloored = 0;
const staffPotAliasCount = new Map<string, number>();
let disavowedDropped = 0;
let bareNamesakesDropped = 0;

for (const [k, c] of aliasCands) {
	// Hard negative: a VNDB bio says these are two different people.
	if (disavowedAliasPairs.has(k)) {
		disavowedDropped++;
		continue;
	}
	const [sidA, sidB] = k.split('|');
	const vnsA = staffAllVns.get(sidA) || new Set<string>();
	const vnsB = staffAllVns.get(sidB) || new Set<string>();
	const seiA = (staffSeiyuuVns.get(sidA)?.size || 0) > 0;
	const seiB = (staffSeiyuuVns.get(sidB)?.size || 0) > 0;
	const coreA = (staffCoreVns.get(sidA)?.size || 0) > 0;
	const coreB = (staffCoreVns.get(sidB)?.size || 0) > 0;

	// Credits on the same VN. VNs where both records voice the *same* character
	// are a shared role, not two people working side by side, so they are split out:
	// `diffCharCoVns` is the count that argues against one person.
	let coCreditVns = 0;
	for (const v of vnsA) if (vnsB.has(v)) coCreditVns++;
	const diffCharCoVns = Math.max(0, coCreditVns - c.sameVnSharedCharVids.size);

	// Shared developer brands
	const brandsA = new Set((tenuresBySid.get(sidA) || []).map((t) => t.pid));
	const brandsB = new Set((tenuresBySid.get(sidB) || []).map((t) => t.pid));
	const sharedBrandIds: string[] = [];
	for (const p of brandsA) if (brandsB.has(p)) sharedBrandIds.push(p);

	// Shared roles
	const rolesA = staffRoles.get(sidA) || new Set<string>();
	const rolesB = staffRoles.get(sidB) || new Set<string>();
	let sharedRoleCount = 0;
	for (const r of rolesA) if (rolesB.has(r)) sharedRoleCount++;

	const erA = staffEroRate.get(sidA) ?? null;
	const erB = staffEroRate.get(sidB) ?? null;
	const eroSplit = erA !== null && erB !== null ? Number(Math.abs(erA - erB).toFixed(3)) : null;

	// Calculate honest confidence score
	let score = 0;
	const evidence: string[] = [];
	/** The 18+/all-ages split already raised the shared-character score. */
	let eroSplitScored = false;

	// Strict personal identifiers: one account or record per human being.
	// An ErogameScape creator page is one too, but VNDB editors also attach a
	// circle's or a unit's page to each member. So it counts as strict only when
	// nothing else says "two people": the pair is never credited side by side on
	// a VN, and no one-per-person database lists them under separate entries.
	// Otherwise it is an ordinary shared link, and the co-credit rule below applies.
	const sharesEgsCreator = c.sharedExtlinks.some((e) => e.startsWith('egs_creator:'));
	// Checked for every candidate, whatever signal raised it: an authority that
	// keeps one entry per person and lists these two apart argues against any
	// alias reading, not only against a shared ErogameScape page.
	const listedApart = separatelyListed(sidA, sidB);
	const egsIsPersonal = sharesEgsCreator && diffCharCoVns === 0 && listedApart.length === 0;
	const hasStrongId =
		egsIsPersonal ||
		c.sharedExtlinks.some(
			(e) =>
				e.startsWith('wikidata:') ||
				e.startsWith('anidb:') ||
				e.startsWith('pixiv:') ||
				e.startsWith('cien:')
		);
	if (c.sharedExtlinks.length > 0) {
		score += hasStrongId ? 0.82 : 0.68;
		evidence.push(`Shared external link (${c.sharedExtlinks.slice(0, 2).join(', ')})`);
	}

	if (c.bioQuote) {
		score += 0.72;
		evidence.push(`VNDB bio cross-reference: "${c.bioQuote}"`);
	}

	if (c.sharedChars.size > 0) {
		const nChars = c.sharedChars.size;
		const nonRecast = c.nonRecastSharedChars;
		const sameVn = c.sameVnSharedChars.size;
		// An 18+/all-ages split is a rate, and a rate over one or two titles says
		// nothing: a record with a single all-ages credit is "0% ero" by accident.
		// It may lift a single shared character only when both careers are long
		// enough to have a pattern, or shorter ones also share a developer.
		const eroSplitSupported =
			(vnsA.size >= 3 && vnsB.size >= 3) ||
			(vnsA.size >= 2 && vnsB.size >= 2 && sharedBrandIds.length >= 1);
		if (nonRecast >= 2) score += 0.68;
		else if (
			nonRecast === 1 &&
			(eroSplit ?? 0) >= 0.45 &&
			diffCharCoVns === 0 &&
			eroSplitSupported
		) {
			score += 0.56;
			eroSplitScored = true;
		} else if (nChars >= 2 && (eroSplit ?? 0) >= 0.45) {
			score += 0.54;
			eroSplitScored = true;
		} else if (nChars >= 2) score += 0.42;
		else if (sameVn >= 1 && (eroSplit ?? 0) >= 0.55) {
			score += 0.36;
			eroSplitScored = true;
		} else score += 0.22;

		evidence.push(
			`Voiced ${nChars} shared character${nChars > 1 ? 's' : ''}${sameVn > 0 ? ` (${sameVn} on the same VN)` : ''}${nonRecast === 0 ? ' [caution: occurred in multi-cast/recast title]' : ''}`
		);
	}

	if (c.nameMatchKind) {
		const label =
			c.nameMatchKind === 'exact_normalized'
				? 'Identical normalized name/romanization'
				: 'Swapped First/Last name order match';
		// Shared brands are scored once, in the corroboration block below.
		let nameBoost = c.nameMatchKind === 'exact_normalized' ? 0.36 : 0.32;
		if (sharedRoleCount >= 1) nameBoost += 0.14;
		if (coCreditVns === 0 && vnsA.size > 0 && vnsB.size > 0) nameBoost += 0.06;
		score += nameBoost;
		evidence.push(label);
	}

	// Corroboration & penalties
	if (sharedBrandIds.length >= 1) {
		score += Math.min(0.14, sharedBrandIds.length * 0.05);
		evidence.push(
			`${sharedBrandIds.length} shared developer brand${sharedBrandIds.length > 1 ? 's' : ''}`
		);
	}
	if (eroSplit !== null && eroSplit >= 0.45 && (seiA || seiB)) {
		// A shared-character score that already leans on the split: the split is
		// reported as a fact but not counted a second time.
		if (!eroSplitScored) score += 0.1;
		evidence.push(
			`R18/all-ages split (${Math.round((erA ?? 0) * 100)}% vs ${Math.round((erB ?? 0) * 100)}% ero-only)`
		);
	}
	// Two records that keep appearing side by side on the same VNs are probably two
	// people. A shared website / Twitter / YouTube does not outweigh that (circles and
	// duos share those); only a strict personal ID or an explicit bio statement does.
	// One such VN counts too when it is nearly all that ties the two: namesakes
	// credited side by side on a single title, with no shared character and at
	// most that one brand in common.
	const loneCoCredit =
		diffCharCoVns === 1 && sharedBrandIds.length <= 1 && c.sharedChars.size === 0;
	// A bio statement outweighs one kind of counter-evidence, not both: a pair
	// credited side by side on a VN *and* listed apart by a one-entry-per-person
	// authority keeps its penalties and stays below High, whatever the bio says.
	const bioOutweighs = c.bioQuote !== null && !(diffCharCoVns >= 1 && listedApart.length >= 1);
	if ((diffCharCoVns >= 2 || loneCoCredit) && !hasStrongId && !bioOutweighs) {
		score -= loneCoCredit ? 0.12 : Math.min(0.28, diffCharCoVns * 0.08);
		evidence.push(`Note: co-credited on ${plural(diffCharCoVns, 'other VN')}`);
	}
	// Counter-evidence from the one-entry-per-person authorities. Only a strict
	// personal ID or an explicit bio statement outweighs it: without one, each
	// authority that lists the two apart costs score, and the pair stays below
	// High whatever else adds up (the cap is applied to the calibrated value).
	const listedApartCounts = listedApart.length > 0 && !bioOutweighs && !hasStrongId;
	const listedApartPenalty = listedApartCounts ? (listedApart.length >= 2 ? 0.28 : 0.18) : 0;
	if (listedApart.length > 0) {
		score -= listedApartPenalty;
		const sites = listedApart.map((s) => ONE_PER_PERSON_LABEL[s] ?? s).join(', ');
		evidence.push(
			`Note: listed as separate people on ${sites}` +
				(sharesEgsCreator
					? ', so the shared ErogameScape page is not read as a personal one'
					: '') +
				(listedApartCounts
					? c.bioQuote
						? '; with the shared VN credit as well, the bio statement does not outweigh it'
						: ''
					: bioOutweighs
						? '; the bio statement is kept as the stronger evidence'
						: '; the shared personal ID is kept as the stronger evidence')
		);
	}

	// One shared character and nothing else (no name, bio or link agreement) is
	// most often a recast between two different actors: it stays below High.
	// The cap is applied to the calibrated value below, so it is exact.
	const singleCharUncorroborated =
		c.sharedChars.size === 1 &&
		!c.nameMatchKind &&
		!c.bioQuote &&
		c.sharedExtlinks.length === 0;

	// A matching name with nothing else behind it is a namesake, not a lead.
	const bareNamesake =
		c.nameMatchKind !== null &&
		sharedBrandIds.length === 0 &&
		c.sharedChars.size === 0 &&
		c.sharedExtlinks.length === 0 &&
		!c.bioQuote;
	if (bareNamesake) {
		bareNamesakesDropped++;
		continue;
	}

	// Keep candidates above quality threshold. The separate-listing penalty
	// demotes a pair but never removes it: a pair that cleared the floor on its
	// own evidence stays listed, at the floor, with the counter-evidence shown.
	// (An adult-title pen name often has an AniDB or Wikidata entry of its own,
	// so the listing argues against the alias without settling it.)
	if (score + listedApartPenalty < 0.42) continue;
	if (score < 0.42) listedApartFloored++;
	// Require at least some credits on one side unless extlink/bio
	if (vnsA.size === 0 && vnsB.size === 0 && c.sharedExtlinks.length === 0 && !c.bioQuote) continue;

	let calibrated = calibrateConfidence(score, ALIAS_CONF_KNEE, ALIAS_CONF_CEIL);
	if (singleCharUncorroborated) calibrated = Math.min(calibrated, SINGLE_CHAR_UNCORROBORATED_MAX);
	if (listedApart.length > 0) {
		listedApartKept++;
		if (listedApartCounts) {
			listedApartPenalised++;
			if (calibrated > LISTED_APART_MAX) {
				listedApartCapped++;
				calibrated = LISTED_APART_MAX;
			}
		}
	}
	const confidence = Number(Math.max(0.42, calibrated).toFixed(3));
	const category: 'seiyuu' | 'staff' | 'mixed' =
		seiA && seiB ? 'seiyuu' : !seiA && !seiB ? 'staff' : seiA || seiB ? (c.sharedChars.size > 0 ? 'seiyuu' : 'mixed') : 'staff';

	// VNDB often keeps one character entry per game, so several shared entries
	// can carry the same name: they collapse into one sample with a count.
	const charsByName = new Map<string, { cid: string; name: string; count: number }>();
	for (const cid of c.sharedChars) {
		const cn = charNameMap.get(cid);
		const name = cn?.latin || cn?.name || cid;
		const key = normName(name) || name;
		const seen = charsByName.get(key);
		if (seen) seen.count++;
		else charsByName.set(key, { cid, name, count: 1 });
	}
	const sampleChars = [...charsByName.values()].sort((x, y) => y.count - x.count).slice(0, 5);
	const sampleBrands = sharedBrandIds.slice(0, 5).map((pid) => {
		const name = prodDisplayName(pid);
		const native = prodMap.get(pid)?.name || null;
		// The original-script name, when the romanised one is what `name` holds.
		return { pid, name, original: native && native !== name ? native : null };
	});

	potentialAliasRows.push({
		sidA,
		sidB,
		category,
		confidence,
		confidenceTier: confidenceTier(confidence),
		sharedChars: c.sharedChars.size,
		sameVnSharedChars: c.sameVnSharedChars.size,
		sharedExtlinks: c.sharedExtlinks.length,
		bioCrossref: c.bioQuote ? 1 : 0,
		nameMatchKind: c.nameMatchKind,
		sharedBrands: sharedBrandIds.length,
		// Persisted as the count that argues against identity: same-VN shared
		// characters are already reported under `sameVnSharedChars`.
		coCreditVns: diffCharCoVns,
		eroSplit,
		evidence,
		listedApart,
		sampleChars,
		sampleBrands
	});
	staffPotAliasCount.set(sidA, (staffPotAliasCount.get(sidA) || 0) + 1);
	staffPotAliasCount.set(sidB, (staffPotAliasCount.get(sidB) || 0) + 1);
}

console.log(
	`[${elapsed()}] Dropped ${disavowedDropped} bio-disavowed pairs (${disavowedAliasPairs.size} disavowals found) and ${bareNamesakesDropped} bare namesakes.`
);
console.log(
	`[${elapsed()}] Separate one-per-person listings: ${listedApartKept} kept candidates carry the note; ${listedApartPenalised} penalised (no strict ID, no bio), ${listedApartCapped} of them capped at ${LISTED_APART_MAX}, ${listedApartFloored} held at the 0.42 floor instead of being dropped. Tiers: high=${potentialAliasRows.filter((x) => x.confidenceTier === 'high').length}, medium=${potentialAliasRows.filter((x) => x.confidenceTier === 'medium').length}, speculative=${potentialAliasRows.filter((x) => x.confidenceTier === 'speculative').length}.`
);
console.log(
	`[${elapsed()}] Found ${potentialAliasRows.length} potential unlinked alias candidates (seiyuu=${potentialAliasRows.filter((x) => x.category === 'seiyuu').length}, staff=${potentialAliasRows.filter((x) => x.category === 'staff').length}, mixed=${potentialAliasRows.filter((x) => x.category === 'mixed').length}).`
);

// 8. Write SQLite database
console.log(`[${elapsed()}] Writing SQLite database to ${TMP_DB}...`);
if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
const db = new DatabaseSync(TMP_DB);
db.exec(`
PRAGMA journal_mode = OFF;
PRAGMA synchronous = OFF;
PRAGMA temp_store = MEMORY;
PRAGMA cache_size = -100000;

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE producers (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  lang TEXT,
  name TEXT NOT NULL,
  latin TEXT,
  alias TEXT,
  description TEXT,
  vn_count INTEGER NOT NULL DEFAULT 0,
  staff_count INTEGER NOT NULL DEFAULT 0,
  seiyuu_count INTEGER NOT NULL DEFAULT 0,
  first_year INTEGER,
  last_year INTEGER,
  ownership_group_id INTEGER,
  full_component_id INTEGER
);

CREATE TABLE producers_relations (
  id TEXT NOT NULL,
  pid TEXT NOT NULL,
  relation TEXT NOT NULL,
  edge_kind TEXT NOT NULL,
  PRIMARY KEY (id, pid)
);

CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  main_aid INTEGER,
  name TEXT NOT NULL,
  latin TEXT,
  gender TEXT,
  lang TEXT,
  prod TEXT,
  description TEXT,
  primary_discipline TEXT NOT NULL,
  roles_json TEXT NOT NULL,
  is_seiyuu INTEGER NOT NULL DEFAULT 0,
  is_core_staff INTEGER NOT NULL DEFAULT 0,
  brand_count INTEGER NOT NULL DEFAULT 0,
  seiyuu_brand_count INTEGER NOT NULL DEFAULT 0,
  vn_count INTEGER NOT NULL DEFAULT 0,
  seiyuu_vn_count INTEGER NOT NULL DEFAULT 0,
  first_year INTEGER,
  last_year INTEGER,
  alias_count INTEGER NOT NULL DEFAULT 1,
  potential_alias_count INTEGER NOT NULL DEFAULT 0,
  ero_rate REAL
);

CREATE TABLE staff_alias (
  aid INTEGER PRIMARY KEY,
  sid TEXT NOT NULL,
  name TEXT NOT NULL,
  latin TEXT,
  is_main INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE vns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  original TEXT,
  olang TEXT,
  devstatus INTEGER,
  first_year INTEGER,
  c_rating REAL,
  c_votecount INTEGER,
  c_image TEXT,
  has_ero INTEGER NOT NULL DEFAULT 0,
  has_all_ages INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE vn_developers (
  vid TEXT NOT NULL,
  pid TEXT NOT NULL,
  first_year INTEGER,
  is_original_dev INTEGER NOT NULL DEFAULT 0,
  is_publisher INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (vid, pid)
);

CREATE TABLE vn_relations (
  vid1 TEXT NOT NULL,
  vid2 TEXT NOT NULL,
  relation TEXT NOT NULL,
  official INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE vn_staff_credits (
  vid TEXT NOT NULL,
  sid TEXT NOT NULL,
  aid INTEGER NOT NULL,
  alias_name TEXT NOT NULL,
  alias_latin TEXT,
  role TEXT NOT NULL,
  note TEXT,
  eid INTEGER,
  is_core INTEGER NOT NULL DEFAULT 0,
  first_year INTEGER
);

CREATE TABLE vn_seiyuu_credits (
  vid TEXT NOT NULL,
  cid TEXT NOT NULL,
  char_name TEXT NOT NULL,
  char_latin TEXT,
  sid TEXT NOT NULL,
  aid INTEGER NOT NULL,
  alias_name TEXT NOT NULL,
  alias_latin TEXT,
  note TEXT,
  first_year INTEGER
);

CREATE TABLE producer_extlinks (
  pid TEXT NOT NULL,
  site TEXT NOT NULL,
  value TEXT NOT NULL,
  url TEXT
);

CREATE TABLE staff_extlinks (
  sid TEXT NOT NULL,
  site TEXT NOT NULL,
  value TEXT NOT NULL,
  url TEXT
);

CREATE TABLE staff_brand_tenure (
  sid TEXT NOT NULL,
  pid TEXT NOT NULL,
  is_seiyuu INTEGER NOT NULL DEFAULT 0,
  vn_count INTEGER NOT NULL DEFAULT 0,
  core_vn_count INTEGER NOT NULL DEFAULT 0,
  seiyuu_vn_count INTEGER NOT NULL DEFAULT 0,
  dev_vn_count INTEGER NOT NULL DEFAULT 0,
  first_year INTEGER,
  last_year INTEGER,
  roles_json TEXT NOT NULL,
  aliases_json TEXT NOT NULL,
  PRIMARY KEY (sid, pid)
);

CREATE TABLE staff_brand_transitions (
  sid TEXT NOT NULL,
  from_pid TEXT NOT NULL,
  to_pid TEXT NOT NULL,
  is_seiyuu INTEGER NOT NULL DEFAULT 0,
  from_first_year INTEGER,
  from_last_year INTEGER,
  to_first_year INTEGER,
  to_last_year INTEGER,
  gap_years INTEGER,
  from_roles_json TEXT NOT NULL,
  to_roles_json TEXT NOT NULL,
  alias_changed INTEGER NOT NULL DEFAULT 0,
  is_core_move INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE brand_relations_inferred (
  pid_a TEXT NOT NULL,
  pid_b TEXT NOT NULL,
  inferred_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  confidence REAL NOT NULL,
  confidence_tier TEXT NOT NULL,
  explicit_relation TEXT,
  explicit_dist INTEGER,
  shared_core_staff INTEGER NOT NULL,
  scored_core_staff INTEGER NOT NULL DEFAULT 0,
  low_mob_core_staff INTEGER NOT NULL,
  co_dev_only_staff INTEGER NOT NULL DEFAULT 0,
  weighted_core_score REAL NOT NULL,
  containment_a_in_b REAL NOT NULL,
  containment_b_in_a REAL NOT NULL,
  max_containment REAL NOT NULL,
  jaccard_core REAL NOT NULL,
  shared_seiyuu INTEGER NOT NULL,
  weighted_seiyuu_score REAL NOT NULL,
  co_dev_vns INTEGER NOT NULL,
  cross_vn_relations INTEGER NOT NULL,
  shared_extlinks INTEGER NOT NULL,
  year_overlap INTEGER NOT NULL,
  flow_a_to_b INTEGER NOT NULL,
  flow_b_to_a INTEGER NOT NULL,
  evidence_json TEXT NOT NULL,
  top_shared_json TEXT NOT NULL,
  PRIMARY KEY (pid_a, pid_b)
);

CREATE TABLE potential_aliases (
  sid_a TEXT NOT NULL,
  sid_b TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence REAL NOT NULL,
  confidence_tier TEXT NOT NULL,
  shared_chars INTEGER NOT NULL,
  same_vn_shared_chars INTEGER NOT NULL,
  shared_extlinks INTEGER NOT NULL,
  bio_crossref INTEGER NOT NULL,
  name_match_kind TEXT,
  shared_brands INTEGER NOT NULL,
  co_credit_vns INTEGER NOT NULL,
  ero_split REAL,
  evidence_json TEXT NOT NULL,
  sample_chars_json TEXT NOT NULL,
  sample_brands_json TEXT NOT NULL,
  listed_apart_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (sid_a, sid_b)
);

CREATE VIRTUAL TABLE search_index USING fts5(
  kind UNINDEXED,
  id UNINDEXED,
  title,
  alt_names,
  badge UNINDEXED,
  subtitle UNINDEXED,
  rank_score UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);
`);

db.exec('BEGIN');

// Insert producers
const insProd = db.prepare(
	`INSERT INTO producers (id, type, lang, name, latin, alias, description, vn_count, staff_count, seiyuu_count, first_year, last_year, ownership_group_id, full_component_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
let commercialCount = 0;
for (const p of producersRaw) {
	if (!p.id) continue;
	const ptype = p.type || 'co';
	if (ptype === 'co') commercialCount++;
	const py = prodYears.get(p.id);
	insProd.run(
		p.id,
		ptype,
		p.lang,
		p.name || p.latin || p.id,
		p.latin,
		p.alias,
		p.description,
		prodVnCount.get(p.id) || 0,
		prodCoreStaff.get(p.id)?.size || 0,
		prodSeiyuu.get(p.id)?.size || 0,
		py?.first ?? null,
		py?.last ?? null,
		ownComp.get(p.id) ?? null,
		fullComp.get(p.id) ?? null
	);
}

// Insert producers_relations
const insProdRel = db.prepare(
	`INSERT OR IGNORE INTO producers_relations (id, pid, relation, edge_kind) VALUES (?, ?, ?, ?)`
);
let explicitPairDirRows = 0;
for (const pr of prodRelsRaw) {
	if (!pr.id || !pr.pid || !pr.relation) continue;
	if (!prodMap.has(pr.id) || !prodMap.has(pr.pid)) continue;
	insProdRel.run(
		pr.id,
		pr.pid,
		pr.relation,
		OWNERSHIP_EDGE_RELS.has(pr.relation) ? 'ownership' : 'lineage'
	);
	explicitPairDirRows++;
}

// Insert staff & aliases
const insStaff = db.prepare(
	`INSERT INTO staff (id, main_aid, name, latin, gender, lang, prod, description, primary_discipline, roles_json, is_seiyuu, is_core_staff, brand_count, seiyuu_brand_count, vn_count, seiyuu_vn_count, first_year, last_year, alias_count, potential_alias_count, ero_rate)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
let seiyuuTotal = 0;
for (const s of staffRaw) {
	if (!s.id) continue;
	const main = sidToMain.get(s.id);
	const roles = [...(staffRoles.get(s.id) || [])];
	const seiyuuVnCount = staffSeiyuuVns.get(s.id)?.size || 0;
	const coreVnCount = staffCoreVns.get(s.id)?.size || 0;
	const allVnCount = staffAllVns.get(s.id)?.size || 0;
	const isSeiyuu = seiyuuVnCount > 0 ? 1 : 0;
	const isCore = coreVnCount > 0 ? 1 : 0;
	if (isSeiyuu) seiyuuTotal++;
	const disc =
		isSeiyuu && isCore ? 'dual' : isSeiyuu ? 'seiyuu' : isCore ? 'core' : 'other';
	const sy = staffYears.get(s.id);
	const brandCount = tenuresBySid.get(s.id)?.length || 0;
	const seiBrandCount = staffSeiyuuBrands.get(s.id)?.size || 0;

	insStaff.run(
		s.id,
		s.main ? Number(s.main) : null,
		main?.name || s.id,
		main?.latin || null,
		s.gender,
		s.lang,
		s.prod,
		s.description,
		disc,
		JSON.stringify(roles),
		isSeiyuu,
		isCore,
		brandCount,
		seiBrandCount,
		allVnCount,
		seiyuuVnCount,
		sy?.first ?? null,
		sy?.last ?? null,
		sidToAliases.get(s.id)?.length || 1,
		staffPotAliasCount.get(s.id) || 0,
		staffEroRate.get(s.id) ?? null
	);
}

const insAlias = db.prepare(
	`INSERT INTO staff_alias (aid, sid, name, latin, is_main) VALUES (?, ?, ?, ?, ?)`
);
for (const a of aidToAlias.values()) {
	insAlias.run(a.aid, a.sid, a.name, a.latin, a.isMain ? 1 : 0);
}

// Insert VNs
const insVn = db.prepare(
	`INSERT INTO vns (id, title, original, olang, devstatus, first_year, c_rating, c_votecount, c_image, has_ero, has_all_ages)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
for (const v of vnRaw) {
	if (!v.id) continue;
	const t = vnTitleMap.get(v.id)!;
	const e = vnHasEro.get(v.id) || { ero: false, allAges: false };
	insVn.run(
		v.id,
		t.title,
		t.original,
		v.olang,
		v.devstatus ? Number(v.devstatus) : null,
		vnFirstYear.get(v.id) ?? null,
		v.c_rating ? Number(v.c_rating) / 100 : null,
		v.c_votecount ? Number(v.c_votecount) : 0,
		v.c_image,
		e.ero ? 1 : 0,
		e.allAges ? 1 : 0
	);
}

// Insert vn_developers
const insVnDev = db.prepare(
	`INSERT INTO vn_developers (vid, pid, first_year, is_original_dev, is_publisher) VALUES (?, ?, ?, ?, ?)`
);
for (const [vid, map] of vnAllProdLinks) {
	for (const [pid, info] of map) {
		insVnDev.run(vid, pid, info.firstYear, info.isOrigDev ? 1 : 0, info.isPublisher ? 1 : 0);
	}
}

// Insert vn_relations
const insVnRel = db.prepare(
	`INSERT INTO vn_relations (vid1, vid2, relation, official) VALUES (?, ?, ?, ?)`
);
for (const vr of vnRelsRaw) {
	if (!vr.id || !vr.vid || !vr.relation) continue;
	insVnRel.run(vr.id, vr.vid, vr.relation, vr.official === 't' ? 1 : 0);
}

// Insert vn_staff_credits
const insVnStaff = db.prepare(
	`INSERT INTO vn_staff_credits (vid, sid, aid, alias_name, alias_latin, role, note, eid, is_core, first_year)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
for (const r of vnStaffRaw) {
	if (!r.id || !r.aid || !r.role) continue;
	const al = aidToAlias.get(Number(r.aid));
	if (!al) continue;
	const isCore = CORE_ROLES.has(r.role) && r.eid === null ? 1 : 0;
	insVnStaff.run(
		r.id,
		al.sid,
		al.aid,
		al.name,
		al.latin,
		r.role,
		r.note,
		r.eid !== null ? Number(r.eid) : null,
		isCore,
		vnFirstYear.get(r.id) ?? null
	);
}

// Insert vn_seiyuu_credits
const insVnSei = db.prepare(
	`INSERT INTO vn_seiyuu_credits (vid, cid, char_name, char_latin, sid, aid, alias_name, alias_latin, note, first_year)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
for (const r of vnSeiyuuRaw) {
	if (!r.id || !r.cid || !r.aid) continue;
	const al = aidToAlias.get(Number(r.aid));
	if (!al) continue;
	const cn = charNameMap.get(r.cid);
	insVnSei.run(
		r.id,
		r.cid,
		cn?.name || r.cid,
		cn?.latin || null,
		al.sid,
		al.aid,
		al.name,
		al.latin,
		r.note,
		vnFirstYear.get(r.id) ?? null
	);
}

// Insert extlinks
const insProdExt = db.prepare(
	`INSERT INTO producer_extlinks (pid, site, value, url) VALUES (?, ?, ?, ?)`
);
for (const pe of prodExtRaw) {
	if (!pe.id || !pe.link) continue;
	const e = extMap.get(pe.link);
	if (!e) continue;
	insProdExt.run(pe.id, e.site, e.value, extlinkUrl(e.site, e.value));
}

const insStaffExt = db.prepare(
	`INSERT INTO staff_extlinks (sid, site, value, url) VALUES (?, ?, ?, ?)`
);
for (const se of staffExtRaw) {
	if (!se.id || !se.link) continue;
	const e = extMap.get(se.link);
	if (!e) continue;
	insStaffExt.run(se.id, e.site, e.value, extlinkUrl(e.site, e.value));
}

// Insert staff_brand_tenure
const insTenure = db.prepare(
	`INSERT INTO staff_brand_tenure (sid, pid, is_seiyuu, vn_count, core_vn_count, seiyuu_vn_count, dev_vn_count, first_year, last_year, roles_json, aliases_json)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
for (const [k, acc] of tenureMap) {
	const [sid, pid] = k.split('|');
	insTenure.run(
		sid,
		pid,
		acc.seiyuuVns.size > 0 ? 1 : 0,
		acc.vns.size,
		acc.coreVns.size,
		acc.seiyuuVns.size,
		acc.devVns.size,
		acc.firstYear,
		acc.lastYear,
		JSON.stringify([...acc.roles]),
		JSON.stringify([...acc.aliases.values()])
	);
}

// Insert staff_brand_transitions
const insTrans = db.prepare(
	`INSERT INTO staff_brand_transitions (sid, from_pid, to_pid, is_seiyuu, from_first_year, from_last_year, to_first_year, to_last_year, gap_years, from_roles_json, to_roles_json, alias_changed, is_core_move)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
for (const t of transitions) {
	insTrans.run(
		t.sid,
		t.fromPid,
		t.toPid,
		t.isSeiyuu,
		t.fromFirstYear,
		t.fromLastYear,
		t.toFirstYear,
		t.toLastYear,
		t.gapYears,
		t.fromRolesJson,
		t.toRolesJson,
		t.aliasChanged,
		t.isCoreMove
	);
}

// Insert brand_relations_inferred
const insInfBrand = db.prepare(
	`INSERT INTO brand_relations_inferred (pid_a, pid_b, inferred_type, direction, confidence, confidence_tier, explicit_relation, explicit_dist, shared_core_staff, scored_core_staff, low_mob_core_staff, co_dev_only_staff, weighted_core_score, containment_a_in_b, containment_b_in_a, max_containment, jaccard_core, shared_seiyuu, weighted_seiyuu_score, co_dev_vns, cross_vn_relations, shared_extlinks, year_overlap, flow_a_to_b, flow_b_to_a, evidence_json, top_shared_json)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
for (const r of inferredBrandRows) {
	insInfBrand.run(
		r.pidA,
		r.pidB,
		r.inferredType,
		r.direction,
		r.confidence,
		r.confidenceTier,
		r.explicitRelation,
		r.explicitDist,
		r.sharedCoreStaff,
		r.scoredCoreStaff,
		r.lowMobCoreStaff,
		r.coDevOnlyStaff,
		r.weightedCoreScore,
		r.containmentAInB,
		r.containmentBInA,
		r.maxContainment,
		r.jaccardCore,
		r.sharedSeiyuu,
		r.weightedSeiyuuScore,
		r.coDevVns,
		r.crossVnRelations,
		r.sharedExtlinks,
		r.yearOverlap,
		r.flowAToB,
		r.flowBToA,
		JSON.stringify(r.evidence),
		JSON.stringify(r.topShared)
	);
}

// Insert potential_aliases
const insPotAlias = db.prepare(
	`INSERT INTO potential_aliases (sid_a, sid_b, category, confidence, confidence_tier, shared_chars, same_vn_shared_chars, shared_extlinks, bio_crossref, name_match_kind, shared_brands, co_credit_vns, ero_split, evidence_json, sample_chars_json, sample_brands_json, listed_apart_json)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
for (const r of potentialAliasRows) {
	insPotAlias.run(
		r.sidA,
		r.sidB,
		r.category,
		r.confidence,
		r.confidenceTier,
		r.sharedChars,
		r.sameVnSharedChars,
		r.sharedExtlinks,
		r.bioCrossref,
		r.nameMatchKind,
		r.sharedBrands,
		r.coCreditVns,
		r.eroSplit,
		JSON.stringify(r.evidence),
		JSON.stringify(r.sampleChars),
		JSON.stringify(r.sampleBrands),
		JSON.stringify(r.listedApart)
	);
}

// Populate FTS5 search index
console.log(`[${elapsed()}] Building FTS5 search index...`);
const insSearch = db.prepare(
	`INSERT INTO search_index (kind, id, title, alt_names, badge, subtitle, rank_score) VALUES (?, ?, ?, ?, ?, ?, ?)`
);

for (const p of producersRaw) {
	if (!p.id) continue;
	const vnC = prodVnCount.get(p.id) || 0;
	const stC = prodCoreStaff.get(p.id)?.size || 0;
	const title = p.latin || p.name || p.id;
	const alts = [p.name, p.alias?.replace(/\n/g, ' ')].filter(Boolean).join(' ');
	const py = prodYears.get(p.id);
	const span = py?.first ? (py.first === py.last ? `${py.first}` : `${py.first}–${py.last}`) : '';
	const sub = [p.lang?.toUpperCase(), span, vnC ? plural(vnC, 'VN') : ''].filter(Boolean).join(' · ');
	insSearch.run('producer', p.id, title, alts, p.type || 'co', sub, vnC * 5 + stC * 3 + (p.type === 'co' ? 100 : 0));
}

for (const s of staffRaw) {
	if (!s.id) continue;
	const main = sidToMain.get(s.id);
	const title = main?.latin || main?.name || s.id;
	const allAlts = (sidToAliases.get(s.id) || [])
		.flatMap((a) => [a.name, a.latin])
		.filter(Boolean)
		.join(' ');
	const seiC = staffSeiyuuVns.get(s.id)?.size || 0;
	const allC = staffAllVns.get(s.id)?.size || 0;
	const bC = tenuresBySid.get(s.id)?.length || 0;
	const badge = seiC > 0 && (staffCoreVns.get(s.id)?.size || 0) > 0 ? 'dual' : seiC > 0 ? 'seiyuu' : 'staff';
	const roles = [...(staffRoles.get(s.id) || [])].slice(0, 3).join(', ');
	const sub = [roles, bC ? plural(bC, 'brand') : '', allC ? plural(allC, 'VN') : '']
		.filter(Boolean)
		.join(' · ');
	insSearch.run('staff', s.id, title, allAlts, badge, sub, allC * 4 + bC * 6);
}

for (const v of vnRaw) {
	if (!v.id) continue;
	const t = vnTitleMap.get(v.id)!;
	const yr = vnFirstYear.get(v.id);
	const votes = v.c_votecount ? Number(v.c_votecount) : 0;
	const sub = [v.olang?.toUpperCase(), yr ? `${yr}` : '', votes ? plural(votes, 'vote') : '']
		.filter(Boolean)
		.join(' · ');
	insSearch.run('vn', v.id, t.title, t.original || '', 'vn', sub, Math.min(5000, votes));
}

// Insert metadata
const insMeta = db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?)`);
const unlinkedInferred = inferredBrandRows.filter((r) => r.explicitDist === null).length;
const metaEntries: [string, string][] = [
	['dump_timestamp', dumpTimestamp],
	['built_at', new Date().toISOString()],
	['producers_total', String(producersRaw.length)],
	['commercial_producers', String(commercialCount)],
	['staff_total', String(staffRaw.length)],
	['seiyuu_total', String(seiyuuTotal)],
	['aliases_total', String(aidToAlias.size)],
	['vns_total', String(vnRaw.length)],
	['explicit_relation_pairs', String(Math.floor(explicitPairDirRows / 2))],
	['inferred_brand_links', String(inferredBrandRows.length)],
	['unlinked_inferred_brand_links', String(unlinkedInferred)],
	['potential_alias_count', String(potentialAliasRows.length)],
	[
		'potential_seiyuu_alias_count',
		String(potentialAliasRows.filter((x) => x.category === 'seiyuu').length)
	],
	[
		'potential_staff_alias_count',
		String(potentialAliasRows.filter((x) => x.category !== 'seiyuu').length)
	]
];
for (const [k, v] of metaEntries) insMeta.run(k, v);

db.exec('COMMIT');

console.log(`[${elapsed()}] Creating SQLite indexes...`);
db.exec(`
CREATE INDEX idx_producers_type ON producers(type, vn_count DESC);
CREATE INDEX idx_prod_rel_id ON producers_relations(id);
CREATE INDEX idx_prod_rel_pid ON producers_relations(pid);
CREATE INDEX idx_staff_alias_sid ON staff_alias(sid);
CREATE INDEX idx_staff_disc ON staff(primary_discipline, brand_count DESC);
CREATE INDEX idx_staff_pot ON staff(potential_alias_count DESC);
CREATE INDEX idx_vn_dev_pid ON vn_developers(pid, is_original_dev);
CREATE INDEX idx_vn_dev_vid ON vn_developers(vid, is_original_dev);
CREATE INDEX idx_vn_rel_v1 ON vn_relations(vid1);
CREATE INDEX idx_vn_rel_v2 ON vn_relations(vid2);
CREATE INDEX idx_vn_staff_sid ON vn_staff_credits(sid);
CREATE INDEX idx_vn_staff_vid ON vn_staff_credits(vid);
CREATE INDEX idx_vn_sei_sid ON vn_seiyuu_credits(sid);
CREATE INDEX idx_vn_sei_vid ON vn_seiyuu_credits(vid);
CREATE INDEX idx_vn_sei_cid ON vn_seiyuu_credits(cid);
CREATE INDEX idx_prod_ext_pid ON producer_extlinks(pid);
CREATE INDEX idx_staff_ext_sid ON staff_extlinks(sid);
CREATE INDEX idx_tenure_pid ON staff_brand_tenure(pid, vn_count DESC);
CREATE INDEX idx_tenure_sid ON staff_brand_tenure(sid, first_year);
CREATE INDEX idx_trans_from ON staff_brand_transitions(from_pid);
CREATE INDEX idx_trans_to ON staff_brand_transitions(to_pid);
CREATE INDEX idx_trans_sid ON staff_brand_transitions(sid);
CREATE INDEX idx_inf_a ON brand_relations_inferred(pid_a, confidence DESC);
CREATE INDEX idx_inf_b ON brand_relations_inferred(pid_b, confidence DESC);
CREATE INDEX idx_inf_conf ON brand_relations_inferred(confidence DESC);
CREATE INDEX idx_inf_type ON brand_relations_inferred(inferred_type, confidence DESC);
CREATE INDEX idx_pot_a ON potential_aliases(sid_a, confidence DESC);
CREATE INDEX idx_pot_b ON potential_aliases(sid_b, confidence DESC);
CREATE INDEX idx_pot_conf ON potential_aliases(category, confidence DESC);
`);

db.close();
if (fs.existsSync(OUT_DB)) fs.unlinkSync(OUT_DB);
fs.renameSync(TMP_DB, OUT_DB);

const sizeMb = (fs.statSync(OUT_DB).size / (1024 * 1024)).toFixed(1);
console.log(`[${elapsed()}] Done! Built ${OUT_DB} (${sizeMb} MiB).`);

if (CLEAN_DUMP) {
	const archivePath = path.join(DATA_DIR, 'vndb-db-latest.tar.zst');
	fs.rmSync(DUMP_DIR, { recursive: true, force: true });
	if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
	console.log(`[${elapsed()}] Cleaned temporary raw dump files from ${DATA_DIR}.`);
}
