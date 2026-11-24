<script lang="ts">
	import { num } from '#lib/util.ts';

	/**
	 * Corpus strip tile (DESIGN §6.5). Values are ink in the sans, never coloured;
	 * labels are sentence case in tertiary ink, so six of them in a row do not
	 * shout. An inferred value keeps its subtle dashed underline.
	 */
	interface Props {
		label: string;
		value: number | null;
		/** Optional pre-formatted display string (e.g. "7.82" or "64%"); falls back to `num(value)`. */
		display?: string;
		inferred?: boolean;
		/** Kept for backwards compatibility with callers; no longer renders a badge in the tile. */
		glyph?: 'inferred' | 'alias-potential';
		href?: string;
		/** Optional tooltip explaining what the tile counts. */
		title?: string;
		/**
		 * Line under the value. Several parts are joined by a middle dot and may
		 * wrap between parts, never inside one, so a narrow tile clips nothing.
		 */
		sub?: string | string[];
	}
	let { label, value, display, inferred = false, href, title, sub }: Props = $props();
	const subParts = $derived(sub === undefined ? [] : Array.isArray(sub) ? sub : [sub]);
	const shownValue = $derived(display ?? num(value));
</script>

<div class="flex min-w-0 flex-col bg-canvas px-3 py-3.5 xl:px-4">
	<div class="flex min-h-5 flex-wrap items-center justify-between gap-x-1.5 gap-y-1">
		<p class="text-xs font-medium text-ink-3">
			{#if title}<span class="term" {title}>{label}</span>{:else}{label}{/if}
		</p>
	</div>
	<p class="tnum mt-1.5 text-xl font-semibold tracking-tight text-ink">
		{#if href}
			<a
				{href}
				class="inline-flex items-baseline gap-1 no-underline hover:underline {inferred
					? 'border-b border-dashed border-inferred-mark'
					: 'border-b border-rule-strong'}"
				>{shownValue}<span class="text-xs font-normal text-ink-3" aria-hidden="true">→</span></a
			>
		{:else}
			<span class={inferred ? 'border-b border-dashed border-inferred-mark' : ''}>{shownValue}</span>
		{/if}
	</p>
	{#if subParts.length === 1}
		<p class="mt-0.5 truncate text-xs text-ink-3">{subParts[0]}</p>
	{:else if subParts.length > 1}
		<p class="mt-0.5 flex flex-wrap gap-x-1 text-xs text-ink-3">
			{#each subParts as part, i (part)}
				<span class="whitespace-nowrap">{part}{i < subParts.length - 1 ? ' ·' : ''}</span>
			{/each}
		</p>
	{/if}
</div>
