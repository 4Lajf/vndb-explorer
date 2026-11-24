<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import BrandMark from './BrandMark.svelte';
	import GlobalSearch from './GlobalSearch.svelte';
	import ThemeSwitch from './ThemeSwitch.svelte';
	import NameOrderSwitch from './NameOrderSwitch.svelte';
	import EpistemicGlyph from '../epistemic/EpistemicGlyph.svelte';
	import { prefs } from '#lib/stores/prefs.svelte.ts';

	/** Contextual bar shown on deep-dive pages; the Atlas itself is 100% full-bleed with floating controls. */
	interface NavItem {
		href: string;
		label: string;
		match: (path: string) => boolean;
		glyph?: 'inferred' | 'alias-potential';
	}
	const NAV: NavItem[] = [
		{ href: '/overview', label: 'Overview', match: (p) => p === '/overview' },
		{
			href: '/discover/brands',
			label: 'Hidden Links',
			match: (p) => p.startsWith('/discover/brands'),
			glyph: 'inferred'
		},
		{
			href: '/discover/aliases',
			label: 'Potential Aliases',
			match: (p) => p.startsWith('/discover/aliases'),
			glyph: 'alias-potential'
		},
		{ href: '/compare', label: 'Compare', match: (p) => p.startsWith('/compare') }
	];

	const path = $derived(page.url.pathname as string);
	const onOverview = $derived(path === '/overview' && !page.error);
	let scrollY = $state(0);
	const showBarSearch = $derived(!onOverview || scrollY > 280);
	let menuOpen = $state(false);

	$effect(() => {
		prefs.homeBarSearchActive = onOverview && showBarSearch;
		return () => {
			prefs.homeBarSearchActive = false;
		};
	});

	afterNavigate(() => {
		menuOpen = false;
	});
</script>

<svelte:window bind:scrollY />

<header class="no-print sticky top-0 z-40 border-b border-rule bg-canvas/85 backdrop-blur-md">
	<div class="mx-auto flex h-12 max-w-page items-center gap-3 px-4 md:gap-4 md:px-6 lg:px-8">
		<a
			href="/"
			class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-rule-strong bg-control px-2.5 text-sm font-medium text-ink no-underline transition-colors hover:border-rule-hover hover:bg-control-hover"
			aria-label="Return to fullscreen Studio Atlas"
		>
			<ArrowLeft size={14} class="text-ink-2" />
			<span class="hidden sm:inline">Studio Atlas</span>
			<span class="inline sm:hidden">Atlas</span>
		</a>

		<a href="/" class="hidden shrink-0 no-underline lg:inline-flex" aria-label="VNDB Explorer">
			<BrandMark />
		</a>

		<nav aria-label="Primary" class="hidden md:block">
			<ul class="flex items-center gap-0.5">
				{#each NAV as item (item.href)}
					{@const current = item.match(path)}
					<li class="flex">
						<a
							href={item.href}
							aria-current={current ? 'page' : undefined}
							class="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-sm whitespace-nowrap no-underline transition-colors duration-[120ms] {current
								? 'bg-selected font-medium text-ink'
								: 'text-ink-2 hover:bg-control-hover hover:text-ink'}"
						>
							{#if item.glyph}<EpistemicGlyph kind={item.glyph} size={11} />{/if}
							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		<div class="min-w-0 flex-1">
			{#if showBarSearch}
				<GlobalSearch size="bar" hotkey={true} class="ml-auto max-w-[28rem]" />
			{/if}
		</div>

		<div class="hidden items-center gap-2 md:flex">
			<a
				href="/key"
				aria-current={path === '/key' ? 'page' : undefined}
				class="inline-flex h-8 items-center rounded-sm px-2.5 text-sm whitespace-nowrap no-underline transition-colors duration-[120ms] {path === '/key'
					? 'bg-selected font-medium text-ink'
					: 'text-ink-2 hover:bg-control-hover hover:text-ink'}"
				title="Help, symbols & glossary"
			>
				Help
			</a>
			<NameOrderSwitch />
			<ThemeSwitch />
		</div>

		<button
			type="button"
			class="inline-flex size-8 shrink-0 items-center justify-center rounded-sm border border-rule-strong bg-control text-ink hover:bg-control-hover md:hidden"
			aria-label={menuOpen ? 'Close menu' : 'Open menu'}
			aria-expanded={menuOpen}
			aria-controls="mobile-menu"
			onclick={() => (menuOpen = !menuOpen)}
		>
			{#if menuOpen}<X size={16} />{:else}<Menu size={16} />{/if}
		</button>
	</div>

	{#if menuOpen}
		<div id="mobile-menu" class="border-t border-rule bg-canvas px-4 pt-2 pb-4 md:hidden">
			<nav aria-label="Primary">
				<ul>
					{#each NAV as item (item.href)}
						{@const current = item.match(path)}
						<li>
							<a
								href={item.href}
								aria-current={current ? 'page' : undefined}
								class="flex h-10 items-center gap-2 rounded-sm px-2.5 text-base no-underline {current
									? 'bg-selected font-medium text-ink'
									: 'text-ink-2'}"
							>
								{#if item.glyph}<EpistemicGlyph kind={item.glyph} size={11} />{/if}
								{item.label}
							</a>
						</li>
					{/each}
				</ul>
			</nav>
			<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
				<span class="flex items-center gap-2 text-xs text-ink-3">Names <NameOrderSwitch /></span>
				<span class="flex items-center gap-2 text-xs text-ink-3">Theme <ThemeSwitch /></span>
				<a
					href="/key"
					aria-current={path === '/key' ? 'page' : undefined}
					class="btn no-underline"
				>
					Help
				</a>
			</div>
		</div>
	{/if}
</header>
