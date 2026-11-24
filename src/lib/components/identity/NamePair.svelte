<script lang="ts">
	import { orderName, prefs } from '#lib/stores/prefs.svelte.ts';

	/**
	 * Renders every romanised / original-script pair (DESIGN §4.3).
	 * `name` is the romanised form (or the only form); `original` is the
	 * original-script form when it differs. The reader's name order swaps them.
	 * The original-script span always carries `lang` and a font utility so the
	 * right Han glyph variant and CJK stack resolve.
	 */
	interface Props {
		name: string;
		original?: string | null;
		lang?: string | null;
		variant?: 'stacked' | 'inline' | 'compact';
		href?: string;
		/** Underline the link at rest (default: only on hover, as in tables). */
		underline?: boolean;
		class?: string;
	}
	let {
		name,
		original = null,
		lang = null,
		variant = 'inline',
		href,
		underline = false,
		class: klass = ''
	}: Props = $props();

	const pair = $derived(orderName(name, original, prefs.nameOrder));
	const font = 'font-sans';
	// Fall back to Japanese: the corpus is overwhelmingly ja, and a lang tag is
	// needed for correct Han glyph variants.
	const cjkLang = $derived(lang && lang !== 'en' ? lang : 'ja');
	const primaryLang = $derived(pair.primaryIsOriginal ? cjkLang : undefined);
	const secondaryLang = $derived(pair.secondary && !pair.primaryIsOriginal ? cjkLang : undefined);
	const title = $derived(pair.secondary ? `${pair.primary} · ${pair.secondary}` : pair.primary);
</script>

{#snippet primary()}
	<span lang={primaryLang} class={primaryLang ? font : ''}>{pair.primary}</span>
{/snippet}

{#if variant === 'stacked'}
	<span class="block {klass}">
		<span class="block text-2xl font-semibold tracking-tighter text-ink">
			{#if href}<a {href} class="link-quiet">{@render primary()}</a>{:else}{@render primary()}{/if}
		</span>
		{#if pair.secondary}
			<span lang={secondaryLang} class="mt-1 block font-sans text-md text-ink-2">
				{pair.secondary}
			</span>
		{/if}
	</span>
{:else if variant === 'compact'}
	{#if href}
		<a {href} {title} class="{underline ? 'link' : 'link-quiet'} {klass}"
			>{@render primary()}</a
		>
	{:else}
		<span {title} class={klass}>{@render primary()}</span>
	{/if}
{:else}
	<span class="inline-flex max-w-full min-w-0 items-baseline gap-1.5 {klass}">
		{#if href}
			<a {href} class="{underline ? 'link' : 'link-quiet'} min-w-0 shrink truncate text-ink"
				>{@render primary()}</a
			>
		{:else}
			<span class="min-w-0 shrink truncate">{@render primary()}</span>
		{/if}
		{#if pair.secondary}
			<!-- The second script gives way first: its shrink factor is so much the
			     larger that the primary name is clipped only once this is used up. -->
			<span
				lang={secondaryLang}
				class="{font} min-w-0 shrink-[9999] truncate text-[0.92em] font-normal text-ink-3"
			>
				{pair.secondary}
			</span>
		{/if}
	</span>
{/if}
