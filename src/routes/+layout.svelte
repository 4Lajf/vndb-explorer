<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Minimize2 from '@lucide/svelte/icons/minimize-2';
	import X from '@lucide/svelte/icons/x';
	import type { LayoutData } from './$types';
	import StudioLandscape, { type AtlasExternalTarget } from '#lib/components/viz/StudioLandscape.svelte';
	import GlobalSearch from '#lib/components/shell/GlobalSearch.svelte';
	import EpistemicGlyph from '#lib/components/epistemic/EpistemicGlyph.svelte';
	import { prefs } from '#lib/stores/prefs.svelte.ts';
	import { buildQuery } from '#lib/util.ts';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	onMount(() => prefs.init());

	const path = $derived(page.url.pathname as string);
	const isOverlayOpen = $derived(path !== '/' || !!page.error);
	let expanded = $state(false);
	let sheetScrollEl = $state<HTMLDivElement | null>(null);
	/** Remember the floating/fullscreen sheet the user came from when opening a live Atlas trail/spotlight. */
	let returnSheetUrl = $state<string | null>(null);

	afterNavigate((nav) => {
		if (nav.to?.url.pathname !== nav.from?.url.pathname) {
			sheetScrollEl?.scrollTo({ top: 0 });
		}
		const fromPath = nav.from?.url.pathname;
		const toPath = nav.to?.url.pathname;
		if (fromPath && fromPath !== '/' && toPath === '/') {
			const sp = nav.to!.url.searchParams;
			if (sp.has('trace') || sp.has('vn') || sp.has('compare')) {
				returnSheetUrl = `${nav.from!.url.pathname}${nav.from!.url.search}${nav.from!.url.hash}`;
			} else {
				returnSheetUrl = null;
			}
		} else if (toPath && toPath !== '/') {
			returnSheetUrl = null;
		}
	});

	function returnToPreviousSheet() {
		const target = returnSheetUrl;
		returnSheetUrl = null;
		if (target) void goto(target);
	}

	const DEFAULTS = { producerType: 'co', lang: 'all', minConfidence: '0.55' };
	const atlasPending = $derived(navigating.to?.url.pathname === '/');

	function onScopeChange(patch: { producerType?: 'co' | 'all'; lang?: string; minConfidence?: number }) {
		const sp = page.url.searchParams;
		const next: Record<string, string | null> = {
			producerType: patch.producerType ?? data.atlas.filters.producerType,
			lang: patch.lang ?? data.atlas.filters.lang,
			minConfidence: String(patch.minConfidence ?? data.atlas.filters.minConfidence),
			mode: sp.get('mode'),
			focus: sp.get('focus'),
			trace: sp.get('trace'),
			compareTrace: sp.get('compareTrace'),
			compare: sp.get('compare'),
			vn: sp.get('vn')
		};
		const qs = buildQuery(next, DEFAULTS);
		void goto(`/${qs}`, { reset: false, replaceState: true });
	}

	/** Keep the persistent live Atlas synchronized with whichever floating detail sheet is open. */
	const initialAtlasMode = $derived<'all' | 'explicit' | 'hidden'>(
		page.url.pathname === '/'
			? page.url.searchParams.get('mode') === 'hidden'
				? 'hidden'
				: page.url.searchParams.get('mode') === 'explicit'
					? 'explicit'
					: 'all'
			: 'all'
	);
	const externalTarget = $derived.by<AtlasExternalTarget>(() => {
		const sp = page.url.searchParams;
		if (path === '/') {
			const rawMode = sp.get('mode');
			const urlMode: 'all' | 'explicit' | 'hidden' =
				rawMode === 'hidden' ? 'hidden' : rawMode === 'explicit' ? 'explicit' : 'all';
			const trace = sp.get('trace')?.trim().toLowerCase();
			if (trace) {
				const cmp = sp.get('compareTrace')?.trim().toLowerCase() || null;
				return { key: `atlas-trace:${urlMode}:${trace}:${cmp ?? ''}`, kind: 'trace', id: trace, secondId: cmp, mode: urlMode };
			}
			const vn = sp.get('vn')?.trim().toLowerCase();
			if (vn) return { key: `atlas-vn:${urlMode}:${vn}`, kind: 'vn', id: vn, mode: urlMode };
			const cmp = sp.get('compare')?.trim().toLowerCase();
			if (cmp) {
				const m = cmp.match(/^(p\d+)-(p\d+)$/i);
				if (m) return { key: `atlas-cmp:${urlMode}:${m[1]}-${m[2]}`, kind: 'compare', id: m[1], secondId: m[2], mode: urlMode };
			}
			const focus = sp.get('focus')?.trim().toLowerCase();
			if (focus) {
				const scopeKey = `${data.atlas.filters.producerType}:${data.atlas.filters.lang}:${data.atlas.filters.minConfidence}`;
				return { key: `atlas-focus:${urlMode}:${scopeKey}:${focus}`, kind: 'focus', id: focus, mode: urlMode };
			}
			return { key: `atlas-idle:${urlMode}`, kind: 'none', mode: urlMode };
		}
		const prodMatch = path.match(/^\/producer\/(p\d+)$/i);
		if (prodMatch) return { key: `sheet-prod:${prodMatch[1].toLowerCase()}`, kind: 'focus', id: prodMatch[1].toLowerCase() };
		const staffMatch = path.match(/^\/staff\/(s\d+)$/i);
		if (staffMatch) {
			const ov = sp.get('overlay')?.trim().toLowerCase() || null;
			return { key: `sheet-staff:${staffMatch[1].toLowerCase()}:${ov ?? ''}`, kind: 'trace', id: staffMatch[1].toLowerCase(), secondId: ov };
		}
		const vnMatch = path.match(/^\/vn\/(v\d+)$/i);
		if (vnMatch) return { key: `sheet-vn:${vnMatch[1].toLowerCase()}`, kind: 'vn', id: vnMatch[1].toLowerCase() };
		if (path === '/compare') {
			const a = sp.get('a')?.trim().toLowerCase();
			const b = sp.get('b')?.trim().toLowerCase();
			if (a && b && a !== b) return { key: `sheet-cmp:${a}-${b}`, kind: 'compare', id: a, secondId: b };
			if (a) return { key: `sheet-cmp-a:${a}`, kind: 'focus', id: a };
			if (b) return { key: `sheet-cmp-b:${b}`, kind: 'focus', id: b };
		}
		if (path.startsWith('/discover/brands')) return { key: 'sheet-hidden', kind: 'hidden' };
		return { key: `sheet-other:${path}`, kind: 'none' };
	});

	/** Preserve context when closing a detail sheet back to the live Atlas. */
	function closeToAtlas() {
		const sp = page.url.searchParams;
		const prodMatch = path.match(/^\/producer\/(p\d+)$/i);
		if (prodMatch) {
			void goto(`/?focus=${prodMatch[1].toLowerCase()}`);
			return;
		}
		const staffMatch = path.match(/^\/staff\/(s\d+)$/i);
		if (staffMatch) {
			const ov = sp.get('overlay')?.trim().toLowerCase();
			void goto(`/?trace=${staffMatch[1].toLowerCase()}${ov ? `&compareTrace=${ov}` : ''}`);
			return;
		}
		const vnMatch = path.match(/^\/vn\/(v\d+)$/i);
		if (vnMatch) {
			void goto(`/?vn=${vnMatch[1].toLowerCase()}`);
			return;
		}
		if (path === '/compare') {
			const a = sp.get('a')?.trim().toLowerCase();
			const b = sp.get('b')?.trim().toLowerCase();
			if (a && b && a !== b) {
				void goto(`/?compare=${a}-${b}`);
				return;
			}
		}
		void goto('/');
	}

	function onKeydown(e: KeyboardEvent) {
		if (!isOverlayOpen) return;
		if (e.key === 'Escape') {
			const tag = (document.activeElement as HTMLElement | null)?.tagName;
			if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
			// Let any open ProofPopover close first before closing the floating sheet.
			if (document.querySelector('[role="dialog"]')) return;
			e.preventDefault();
			closeToAtlas();
		}
	}

	const SHEET_NAV: Array<{ href: string; label: string; match: (p: string) => boolean; glyph?: 'inferred' | 'alias-potential' }> = [
		{ href: '/overview', label: 'Overview', match: (p) => p === '/overview' },
		{ href: '/popularity', label: 'Popularity', match: (p) => p.startsWith('/popularity') },
		{ href: '/discover/brands', label: 'Hidden Links', match: (p) => p.startsWith('/discover/brands'), glyph: 'inferred' },
		{ href: '/discover/aliases', label: 'Aliases', match: (p) => p.startsWith('/discover/aliases'), glyph: 'alias-potential' },
		{ href: '/compare', label: 'Compare', match: (p) => p.startsWith('/compare') }
	];
</script>

<svelte:window onkeydown={onKeydown} />

<svelte:head>
	<meta
		name="description"
		content="Explore the visual novel studio landscape across time, trace staff VN-by-VN, and surface brand relationships VNDB does not record."
	/>
</svelte:head>

<a
	href="#main"
	class="sr-only z-50 rounded-sm bg-surface-inverse px-3 py-2 text-sm text-ink-inverse focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
>
	Skip to content
</a>

<!-- ── Persistent Full-Bleed Studio Atlas (always alive underneath!) ── -->
<div class="fixed inset-0 h-screen w-screen overflow-hidden bg-canvas {isOverlayOpen ? 'blur-[2px]' : ''}">
	<StudioLandscape
		nodes={data.atlas.graph.nodes}
		edges={data.atlas.graph.edges}
		dumpYear={data.atlas.graph.dumpYear}
		dumpDate={data.dumpDate}
		initialMode={initialAtlasMode}
		producerType={data.atlas.filters.producerType}
		lang={data.atlas.filters.lang}
		minConfidence={data.atlas.filters.minConfidence}
		pending={atlasPending}
		backdropMode={isOverlayOpen}
		{externalTarget}
		{returnSheetUrl}
		onReturnToSheet={returnToPreviousSheet}
		{onScopeChange}
	/>
</div>

<!-- ── Centered Floating Overlay Sheet for all Detail & Discovery Routes ── -->
{#if isOverlayOpen}
	<div
		class="fixed inset-0 z-40 flex items-center justify-center {expanded
			? 'p-0'
			: 'p-2 sm:p-4 md:p-6'}"
	>
		<!-- Plain scrim (Atlas wrapper handles the subtle blur so Chromium never hits nested backdrop-filter glitches). -->
		<div
			class="absolute inset-0 bg-canvas/52"
			role="presentation"
			onclick={closeToAtlas}
		></div>
		<div
			id="main"
			class="relative z-10 flex flex-col border border-rule-strong bg-canvas shadow-2xl transition-[width,height] duration-150 {expanded
				? 'h-dvh w-screen rounded-none border-0'
				: 'h-[min(90dvh,58rem)] w-[min(70rem,calc(100vw-1rem))] rounded-xl sm:w-[min(70rem,calc(100vw-2rem))]'}"
		>
			<!-- 44px sheet header. The card itself does not clip, so the search dropdown may run past its edge. -->
			<header
				class="no-print relative z-10 flex h-11 shrink-0 items-center gap-2 border-b border-rule bg-surface px-2 sm:px-3 {expanded
					? ''
					: 'rounded-t-[11px]'}"
			>
				<button
					type="button"
					class="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-rule-strong bg-control px-2 text-xs font-medium text-ink hover:border-rule-hover hover:bg-control-hover"
					onclick={closeToAtlas}
					title="Return to live Studio Atlas (Esc)"
				>
					<ArrowLeft size={13} />
					<span>Atlas</span>
				</button>

				<nav aria-label="Views" class="hidden items-center gap-0.5 lg:flex">
					{#each SHEET_NAV as item (item.href)}
						{@const current = item.match(path)}
						<a
							href={item.href}
							aria-current={current ? 'page' : undefined}
							class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs whitespace-nowrap no-underline transition-colors {current
								? 'bg-surface-sunken font-medium text-ink ring-1 ring-rule-strong'
								: 'text-ink-2 hover:bg-control-hover hover:text-ink'}"
						>
							{#if item.glyph}<EpistemicGlyph kind={item.glyph} size={10} />{/if}
							{item.label}
						</a>
					{/each}
				</nav>

				<div class="min-w-0 flex-1">
					<GlobalSearch size="bar" hotkey={true} class="mx-auto max-w-[24rem]" />
				</div>

				<div class="flex shrink-0 items-center gap-1">
					<a
						href="/key"
						class="hidden h-7 items-center rounded-md px-2 text-xs text-ink-2 no-underline hover:bg-control-hover hover:text-ink sm:inline-flex {path === '/key'
							? 'bg-surface-sunken font-medium text-ink'
							: ''}"
						title="Help, symbols & glossary"
					>
						Help
					</a>
					<button
						type="button"
						class="inline-flex size-7 items-center justify-center rounded-md text-ink-2 hover:bg-surface-hover hover:text-ink"
						aria-label={expanded ? 'Restore floating window' : 'Expand to fullscreen'}
						title={expanded ? 'Restore floating card' : 'Expand to fullscreen'}
						onclick={() => (expanded = !expanded)}
					>
						{#if expanded}<Minimize2 size={14} />{:else}<Maximize2 size={14} />{/if}
					</button>
					<button
						type="button"
						class="inline-flex size-7 items-center justify-center rounded-md text-ink-2 hover:bg-surface-hover hover:text-ink"
						aria-label="Close to Atlas"
						title="Close to Atlas (Esc)"
						onclick={closeToAtlas}
					>
						<X size={15} />
					</button>
				</div>
			</header>

			<!-- Scrollable Detail Content -->
			<div
				bind:this={sheetScrollEl}
				class="relative z-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1 pb-8 md:px-7 {expanded
					? ''
					: 'rounded-b-[11px]'}"
			>
				{#key page.url.pathname}
					{@render children()}
				{/key}
				<p class="mt-8 border-t border-rule pt-3 text-right font-mono text-2xs text-ink-3">
					VNDB dump {data.dumpDate}
				</p>
			</div>
		</div>
	</div>
{/if}
