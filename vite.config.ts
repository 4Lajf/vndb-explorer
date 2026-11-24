import adapter from '@sveltejs/adapter-node';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// SvelteKit 3 no longer reads svelte.config.js: project configuration is passed
// to the sveltekit() plugin. Svelte 5 compiles TypeScript natively, so no
// preprocessor is needed. `$lib` is gone too: `#lib/*` is a package.json subpath
// import (see "imports" in package.json).
export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter()
		})
	]
});
