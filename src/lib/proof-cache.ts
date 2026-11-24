/**
 * Tiny client-side cache for on-demand proof lookups (/api/proof/*).
 * Deduplicates in-flight requests so opening the same proof twice is instant.
 */
const resolved = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

export async function fetchProof<T>(url: string): Promise<T> {
	if (resolved.has(url)) return resolved.get(url) as T;
	const existing = inflight.get(url);
	if (existing) return existing as Promise<T>;
	const p = fetch(url)
		.then((res) => {
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return res.json() as Promise<T>;
		})
		.then((data) => {
			resolved.set(url, data);
			inflight.delete(url);
			return data;
		})
		.catch((err) => {
			inflight.delete(url);
			throw err;
		});
	inflight.set(url, p);
	return p;
}
