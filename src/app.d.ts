// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		interface PageData {
			dumpTimestamp?: string;
			dumpDate?: string;
			/** Calendar year of the dump: the fixed "now" for charts. */
			dumpYear?: number;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
