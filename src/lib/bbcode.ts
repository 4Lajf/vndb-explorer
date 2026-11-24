/**
 * Safe VNDB BBCode tokenizer.
 *
 * Descriptions and notes come from a public dump, so they are never rendered
 * with `{@html}`. This turns the text into a flat list of whitelisted tokens
 * (text, line break, link) that `RichText.svelte` renders as real elements.
 * Anything not on the whitelist is dropped as markup but its inner text is kept.
 */

export type RichToken =
	| { type: 'text'; text: string }
	| { type: 'break' }
	| { type: 'link'; href: string; text: string; external: boolean };

const VNDB_ORIGIN = 'https://vndb.org';

/** Internal route for a VNDB path we can show ourselves (`/p24`, `/s28`, `/v17`). */
function internalRoute(path: string): string | null {
	const m = /^\/?([psv])(\d+)(?:[/?#.].*)?$/i.exec(path);
	if (!m) return null;
	const id = `${m[1].toLowerCase()}${m[2]}`;
	if (id.startsWith('p')) return `/producer/${id}`;
	if (id.startsWith('s')) return `/staff/${id}`;
	return `/vn/${id}`;
}

/**
 * Resolve a BBCode URL to a safe href. Only http(s) and VNDB-relative paths
 * survive; `javascript:`, `data:` and anything unparseable return null.
 */
export function resolveBbcodeHref(raw: string): { href: string; external: boolean } | null {
	const value = raw.trim().replace(/^["']|["']$/g, '');
	if (!value) return null;

	if (value.startsWith('/') && !value.startsWith('//')) {
		const internal = internalRoute(value);
		if (internal) return { href: internal, external: false };
		return { href: `${VNDB_ORIGIN}${value}`, external: true };
	}

	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

	if (url.hostname === 'vndb.org' || url.hostname === 'www.vndb.org') {
		const internal = internalRoute(url.pathname);
		if (internal) return { href: internal, external: false };
	}
	return { href: url.href, external: true };
}

/** Bare VNDB ids in running text (`v17`, `p24`) are left as text: no guessing. */
function pushText(out: RichToken[], text: string): void {
	if (!text) return;
	const parts = text.split(/\r?\n/);
	parts.forEach((part, i) => {
		if (i > 0) out.push({ type: 'break' });
		if (part) {
			const last = out[out.length - 1];
			if (last && last.type === 'text') last.text += part;
			else out.push({ type: 'text', text: part });
		}
	});
}

/** Strip any tag-like markup from a fragment, keeping its text. */
function stripTags(text: string): string {
	return text.replace(/\[\/?[a-z]+(?:=[^\]]*)?\]/gi, '');
}

const URL_OPEN = /\[url=([^\]]*)\]/i;
const URL_CLOSE = /\[\/url\]/i;

export function tokenizeBbcode(input: string | null | undefined): RichToken[] {
	const out: RichToken[] = [];
	if (!input) return out;
	let rest = String(input);

	// Hard cap: the dump is trusted for size but not for shape.
	if (rest.length > 20000) rest = rest.slice(0, 20000);

	while (rest.length > 0) {
		const open = URL_OPEN.exec(rest);
		if (!open) {
			pushText(out, stripTags(rest));
			break;
		}
		pushText(out, stripTags(rest.slice(0, open.index)));
		const afterOpen = rest.slice(open.index + open[0].length);
		const close = URL_CLOSE.exec(afterOpen);
		if (!close) {
			// Unclosed tag: keep the remaining text, drop the markup.
			pushText(out, stripTags(afterOpen));
			break;
		}
		const label = stripTags(afterOpen.slice(0, close.index)).replace(/\s+/g, ' ').trim();
		const resolved = resolveBbcodeHref(open[1]);
		if (resolved && label) {
			out.push({ type: 'link', href: resolved.href, text: label, external: resolved.external });
		} else {
			pushText(out, label);
		}
		rest = afterOpen.slice(close.index + close[0].length);
	}

	// Collapse runs of 3+ breaks to a paragraph gap, trim leading/trailing breaks.
	const collapsed: RichToken[] = [];
	let breaks = 0;
	for (const tok of out) {
		if (tok.type === 'break') {
			breaks++;
			if (breaks <= 2) collapsed.push(tok);
		} else {
			breaks = 0;
			collapsed.push(tok);
		}
	}
	while (collapsed[0]?.type === 'break') collapsed.shift();
	while (collapsed[collapsed.length - 1]?.type === 'break') collapsed.pop();
	return collapsed;
}
