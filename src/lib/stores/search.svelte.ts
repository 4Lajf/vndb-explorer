/**
 * Debounced live search against the Hono `/api/search` endpoint.
 * Shared by the global combobox and the brand pickers.
 */
import type { SearchResult } from '#lib/types.ts';

export type SearchKind = 'all' | 'producer' | 'staff' | 'vn';

const SCOPES: Record<string, SearchKind> = { p: 'producer', s: 'staff', v: 'vn' };

/** `p:key` → brands only; `s:maeda` → staff and seiyuu; `v:air` → visual novels. */
export function parseScope(raw: string): { kind: SearchKind; text: string } {
	const m = /^([psv]):\s*(.*)$/i.exec(raw.trim());
	if (m) return { kind: SCOPES[m[1].toLowerCase()], text: m[2] };
	return { kind: 'all', text: raw.trim() };
}

/** `p24 vs p1234` → a direct Compare jump. */
export function parseVersus(raw: string): { a: string; b: string } | null {
	const m = /^(p\d+)\s+(?:vs\.?|v\.?|×|x)\s+(p\d+)$/i.exec(raw.trim());
	return m ? { a: m[1].toLowerCase(), b: m[2].toLowerCase() } : null;
}

export class LiveSearch {
	query = $state('');
	results = $state<SearchResult[]>([]);
	loading = $state(false);
	failed = $state(false);
	/** The query the current `results` answer. */
	settledQuery = $state('');

	#timer: ReturnType<typeof setTimeout> | undefined;
	#controller: AbortController | null = null;
	#fixedKind: SearchKind;
	#limit: number;

	constructor(fixedKind: SearchKind = 'all', limit = 24) {
		this.#fixedKind = fixedKind;
		this.#limit = limit;
	}

	/** Update the query and schedule a fetch. */
	set(value: string): void {
		this.query = value;
		if (this.#timer) clearTimeout(this.#timer);
		const { text } = parseScope(value);
		// `p24 vs p49` is answered locally with one Compare row: nothing to fetch,
		// and the query is settled as typed.
		if (!text || parseVersus(value)) {
			this.#controller?.abort();
			this.results = [];
			this.loading = false;
			this.failed = false;
			this.settledQuery = text ? value : '';
			return;
		}
		this.loading = true;
		this.#timer = setTimeout(() => void this.#run(value), 140);
	}

	clear(): void {
		this.set('');
	}

	async #run(value: string): Promise<void> {
		const { kind, text } = parseScope(value);
		const effective = this.#fixedKind === 'all' ? kind : this.#fixedKind;
		this.#controller?.abort();
		const controller = new AbortController();
		this.#controller = controller;
		try {
			const params = new URLSearchParams({ q: text, limit: String(this.#limit) });
			if (effective !== 'all') params.set('kind', effective);
			const res = await fetch(`/api/search?${params}`, { signal: controller.signal });
			if (!res.ok) throw new Error(`search ${res.status}`);
			const body = (await res.json()) as { results: SearchResult[] };
			if (controller.signal.aborted) return;
			this.results = body.results ?? [];
			this.failed = false;
			this.settledQuery = value;
		} catch (err) {
			if ((err as Error)?.name === 'AbortError') return;
			this.results = [];
			this.failed = true;
			this.settledQuery = value;
		} finally {
			if (this.#controller === controller) this.loading = false;
		}
	}

	destroy(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#controller?.abort();
	}
}

export function resultHref(r: Pick<SearchResult, 'kind' | 'id'>): string {
	if (r.kind === 'producer') return `/producer/${r.id}`;
	if (r.kind === 'staff') return `/staff/${r.id}`;
	return `/vn/${r.id}`;
}
