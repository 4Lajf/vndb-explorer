/**
 * Personal display preferences (theme, name order). They are not URL state:
 * DESIGN §7.4 keeps them in localStorage. The server always renders the
 * defaults; `init()` runs after hydration and applies the stored choice.
 *
 * Theme: dark is the default. `light` and `system` are explicit choices and
 * are both stored, so a reader with nothing stored always gets dark, whatever
 * the OS prefers. The inline script in app.html applies the same rule before
 * first paint.
 */

export type ThemeChoice = 'light' | 'dark' | 'system';
export type NameOrder = 'latin' | 'original';

// app.html reads THEME_KEY too, before first paint: keep the two in step.
const THEME_KEY = 'vndb-explorer:theme';
const NAME_ORDER_KEY = 'vndb-explorer:name-order';

/**
 * Keys of the light-first v1. The name order is carried over. The theme is
 * not: a `light` stored there was v1's default, not a choice, and it would
 * pin a returning reader to light instead of the dark default.
 */
const V1_THEME_KEY = 'keifu:theme';
const V1_NAME_ORDER_KEY = 'keifu:name-order';

function systemTheme(): 'light' | 'dark' {
	if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
	return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Move the v1 name order to its new key and drop both v1 keys. A no-op once done. */
function migrateV1(): void {
	const order = localStorage.getItem(V1_NAME_ORDER_KEY);
	if (order !== null && localStorage.getItem(NAME_ORDER_KEY) === null) {
		localStorage.setItem(NAME_ORDER_KEY, order);
	}
	localStorage.removeItem(V1_NAME_ORDER_KEY);
	localStorage.removeItem(V1_THEME_KEY);
}

class Preferences {
	theme = $state<ThemeChoice>('dark');
	nameOrder = $state<NameOrder>('latin');
	/** What is actually painted right now. */
	resolvedTheme = $state<'light' | 'dark'>('dark');
	/** True when scrolled past the Home hero search so TopBar takes over Ctrl+K cleanly. */
	homeBarSearchActive = $state(false);
	ready = $state(false);

	/** Read stored choices. Call once from the root layout, in the browser. */
	init(): () => void {
		try {
			migrateV1();
			const t = localStorage.getItem(THEME_KEY);
			this.theme = t === 'light' || t === 'system' ? t : 'dark';
			this.nameOrder = localStorage.getItem(NAME_ORDER_KEY) === 'original' ? 'original' : 'latin';
		} catch {
			/* storage unavailable: defaults stand */
		}
		this.apply();
		this.ready = true;

		const mq = window.matchMedia?.('(prefers-color-scheme: light)');
		const onChange = () => {
			if (this.theme === 'system') this.apply();
		};
		mq?.addEventListener('change', onChange);
		return () => mq?.removeEventListener('change', onChange);
	}

	private apply(): void {
		this.resolvedTheme = this.theme === 'system' ? systemTheme() : this.theme;
		if (typeof document === 'undefined') return;
		const root = document.documentElement;
		root.setAttribute('data-theme', this.resolvedTheme);
		// The browser chrome follows the page: theme-color is the canvas token of
		// the theme just applied, read back so no colour is repeated here. If the
		// stylesheet has not resolved, the value app.html set stays.
		const canvas = getComputedStyle(root).getPropertyValue('--canvas').trim();
		if (canvas) {
			document.querySelector('meta[name="theme-color"]')?.setAttribute('content', canvas);
		}
	}

	setTheme(next: ThemeChoice): void {
		this.theme = next;
		try {
			// Every choice is stored: with nothing stored the theme is dark, so
			// "system" has to be written down to be remembered.
			localStorage.setItem(THEME_KEY, next);
		} catch {
			/* ignore */
		}
		this.apply();
	}

	setNameOrder(next: NameOrder): void {
		// Read by `shownName` and `NamePair` through this store: nothing on the
		// document needs to change.
		this.nameOrder = next;
		try {
			localStorage.setItem(NAME_ORDER_KEY, next);
		} catch {
			/* ignore */
		}
	}
}

export const prefs = new Preferences();

/**
 * Resolve a romanised/original pair for display under the reader's name order.
 * `name` is the romanised form (or the only form); `original` is the
 * original-script form when it differs.
 */
export function orderName(
	name: string,
	original: string | null | undefined,
	order: NameOrder
): { primary: string; secondary: string | null; primaryIsOriginal: boolean } {
	if (original && original !== name) {
		return order === 'original'
			? { primary: original, secondary: name, primaryIsOriginal: true }
			: { primary: name, secondary: original, primaryIsOriginal: false };
	}
	return { primary: name, secondary: null, primaryIsOriginal: false };
}

/**
 * The one name to print where there is room for a single form (an SVG label, a
 * tooltip, a sentence). Reads the reader's name order, so it is reactive where
 * a template or `$derived` calls it.
 */
export function shownName(name: string, original?: string | null): string {
	return orderName(name, original, prefs.nameOrder).primary;
}

/**
 * Both brand names of a pair under the reader's name order, in the shape
 * `inferredVerdict` and `brandEvidence` take. Reactive like `shownName`.
 */
export function shownPairNames(link: {
	nameA: string;
	nameB: string;
	originalA?: string | null;
	originalB?: string | null;
}): { a: string; b: string } {
	return { a: shownName(link.nameA, link.originalA), b: shownName(link.nameB, link.originalB) };
}
