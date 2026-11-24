/** Small formatting and URL helpers shared by pages and components. */

const NUM = new Intl.NumberFormat('en-US');

/** Thousands separators: 31,033. */
export function num(v: number | null | undefined): string {
	if (v == null || Number.isNaN(v)) return '—';
	return NUM.format(v);
}

/** Percent without decimals from a 0..1 share. */
export function pct(v: number | null | undefined): string {
	if (v == null || Number.isNaN(v)) return '—';
	return `${Math.round(v * 100)}%`;
}

/** Year range with an en dash; `tight` shortens a same-century end year (2004–07). */
export function yearSpan(
	from: number | null | undefined,
	to: number | null | undefined,
	tight = false
): string {
	if (!from && !to) return '—';
	if (from && !to) return `${from}–`;
	if (!from && to) return `–${to}`;
	if (from === to) return `${from}`;
	if (tight && Math.floor(from! / 100) === Math.floor(to! / 100)) {
		return `${from}–${String(to! % 100).padStart(2, '0')}`;
	}
	return `${from}–${to}`;
}

/** Signed year delta with unit: −2y, +1y, same yr. */
export function yearDelta(v: number | null | undefined, sign: 'auto' | 'minus' | 'plus' = 'auto'): string {
	if (v == null || Number.isNaN(v)) return '—';
	const r = Math.round(v * 10) / 10;
	if (r === 0) return 'same yr';
	const abs = Math.abs(r);
	const s = sign === 'minus' ? '−' : sign === 'plus' ? '+' : r < 0 ? '−' : '+';
	return `${s}${abs}y`;
}

/** The dump timestamp as a calendar date only (2026-11-23). */
export function dumpDate(ts: string | null | undefined): string {
	if (!ts) return 'unknown date';
	const m = /^(\d{4}-\d{2}-\d{2})/.exec(ts);
	return m ? m[1] : ts;
}

/** The dump's calendar year: the fixed "now" for every recency cut-off. */
export function dumpYear(ts: string | null | undefined): number | null {
	const m = /^(\d{4})-\d{2}/.exec(ts ?? '');
	return m ? Number(m[1]) : null;
}

/** Count with its noun, agreeing in number: 1 brand, 12 brands, 1,204 VNs. */
export function plural(n: number, one: string, many = `${one}s`): string {
	return `${num(n)} ${n === 1 ? one : many}`;
}

/** Link to one candidate pair on the alias page, opened and expanded. */
export function aliasPairHref(sidA: string, sidB: string): string {
	return `/discover/aliases?pair=${encodeURIComponent(`${sidA}-${sidB}`)}`;
}

/** Build a query string, skipping empty values and values equal to their default. */
export function buildQuery(
	params: Record<string, string | number | boolean | null | undefined>,
	defaults: Record<string, string | number | boolean> = {}
): string {
	const sp = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value === null || value === undefined || value === '') continue;
		if (key in defaults && String(defaults[key]) === String(value)) continue;
		if (value === false) continue;
		sp.set(key, value === true ? '1' : String(value));
	}
	const s = sp.toString();
	return s ? `?${s}` : '';
}

export function compareHref(a: string, b: string): string {
	return `/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
}

export function vndbHref(id: string): string {
	return `https://vndb.org/${encodeURIComponent(id)}`;
}

const SITE_LABELS: Record<string, string> = {
	website: 'Official site',
	twitter: 'X / Twitter',
	bsky: 'Bluesky',
	bluesky: 'Bluesky',
	wikidata: 'Wikidata',
	wp: 'Wikipedia',
	wikipedia: 'Wikipedia',
	egs: 'ErogameScape',
	egs_creator: 'ErogameScape',
	anidb: 'AniDB',
	vgmdb: 'VGMdb',
	youtube: 'YouTube',
	pixiv: 'pixiv',
	itch_dev: 'itch.io',
	patreon: 'Patreon',
	instagram: 'Instagram',
	tumblr: 'Tumblr',
	facebook: 'Facebook',
	steam_curator: 'Steam',
	mobygames_comp: 'MobyGames',
	gamefaqs_comp: 'GameFAQs',
	discogs: 'Discogs',
	musicbrainz: 'MusicBrainz',
	fanbox: 'FANBOX',
	skeb: 'Skeb',
	cien: 'Ci-en',
	booth: 'BOOTH',
	booth_pub: 'BOOTH',
	scloud: 'SoundCloud',
	twitch: 'Twitch',
	dlsite: 'DLsite',
	kofi: 'Ko-fi',
	substar: 'SubscribeStar',
	vk: 'VK',
	bgmtv: 'Bangumi',
	imdb: 'IMDb',
	mbrainz: 'MusicBrainz',
	nijie: 'Nijie',
	weibo: 'Weibo',
	bilibili: 'bilibili'
};

/** Most useful first (DESIGN §8.2 identity header). */
const SITE_PRIORITY = ['website', 'wikidata', 'wp', 'wikipedia', 'twitter', 'bsky', 'egs', 'egs_creator'];

export interface ExtLink {
	site: string;
	label: string;
	href: string;
}

/**
 * External links from the dump. Only rows with a ready http(s) URL are linked;
 * the rest are dropped rather than guessed.
 */
export function externalLinks(
	rows: Array<{ site: string; value: string; url: string | null }>
): ExtLink[] {
	const raw: Array<{ site: string; baseLabel: string; value: string; href: string }> = [];
	const seen = new Set<string>();
	for (const r of rows) {
		let href = r.url;
		if (!href && r.site === 'website' && /^https?:\/\//i.test(r.value)) href = r.value;
		if (!href || !/^https?:\/\//i.test(href)) continue;
		if (seen.has(href)) continue;
		seen.add(href);
		raw.push({
			site: r.site,
			baseLabel: SITE_LABELS[r.site] ?? r.site.replace(/_/g, ' '),
			value: r.value,
			href
		});
	}
	const rank = (s: string) => {
		const i = SITE_PRIORITY.indexOf(s);
		return i === -1 ? SITE_PRIORITY.length : i;
	};
	raw.sort((a, b) => rank(a.site) - rank(b.site));
	const labelCounts = new Map<string, number>();
	for (const item of raw) labelCounts.set(item.baseLabel, (labelCounts.get(item.baseLabel) ?? 0) + 1);
	const labelIndex = new Map<string, number>();
	return raw.map((item) => {
		if ((labelCounts.get(item.baseLabel) ?? 0) <= 1) {
			return { site: item.site, label: item.baseLabel, href: item.href };
		}
		const n = (labelIndex.get(item.baseLabel) ?? 0) + 1;
		labelIndex.set(item.baseLabel, n);
		// Distinguish duplicate accounts on the same platform (e.g. two X / Twitter handles).
		const handle =
			item.site === 'twitter' && /^[A-Za-z0-9_]{1,20}$/.test(item.value)
				? `@${item.value}`
				: `#${n}`;
		return { site: item.site, label: `${item.baseLabel} (${handle})`, href: item.href };
	});
}

/** Case-insensitive, script-agnostic "contains" for client-side text filters. */
export function matchesText(query: string, ...fields: Array<string | null | undefined>): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	return fields.some((f) => f != null && f.toLowerCase().includes(q));
}

/** Stable id for aria wiring. */
let uidCounter = 0;
export function uid(prefix = 'k'): string {
	uidCounter += 1;
	return `${prefix}-${uidCounter}`;
}

export function clamp(v: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, v));
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const wrapped = (...args: A) => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => fn(...args), ms);
	};
	wrapped.cancel = () => {
		if (timer) clearTimeout(timer);
	};
	return wrapped;
}

export const RATING_LABEL = { ero: '18+', allAges: 'All ages' } as const;

export const VN_RELATION_LABELS: Record<string, string> = {
	seq: 'Sequel',
	preq: 'Prequel',
	ser: 'Same series',
	side: 'Side story',
	par: 'Parent story',
	alt: 'Alternative version',
	char: 'Shares characters',
	set: 'Same setting',
	fan: 'Fandisc',
	orig: 'Original game'
};

export const VN_RELATION_ORDER = ['preq', 'seq', 'ser', 'par', 'side', 'fan', 'orig', 'alt', 'char', 'set'];

export const PRODUCER_TYPE_WORD: Record<string, string> = {
	co: 'Company',
	ng: 'Amateur group',
	in: 'Individual'
};

/** One-word form for badges, where space is tight. */
export const PRODUCER_TYPE_SHORT: Record<string, string> = {
	co: 'Company',
	ng: 'Group',
	in: 'Individual'
};

/** Compact count for a tight label: 68,512 → 68.5k. Exact below 10,000. */
export function numShort(v: number | null | undefined): string {
	if (v == null || Number.isNaN(v)) return '—';
	if (Math.abs(v) < 10_000) return NUM.format(v);
	if (Math.abs(v) < 1_000_000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
	return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}
