<script lang="ts">
	import type { Snippet } from 'svelte';
	import EpistemicGlyph from '../epistemic/EpistemicGlyph.svelte';
	import EpistemicBadge from '../epistemic/EpistemicBadge.svelte';
	import type { Register } from '#lib/relations.ts';

	/** `text-lg` section heading above a hairline, optional count and controls. */
	interface Props {
		title: string;
		id?: string;
		count?: number | string;
		/**
		 * Marks a section that is wholly inferred (or wholly VNDB) with its
		 * `Inferred` / `VNDB` badge after the title. The title stays ink.
		 */
		register?: Register;
		/** Glyph inside the badge (`≟` for potential aliases); alone before the title when there is no register. */
		glyph?: 'confirmed' | 'inferred' | 'alias-potential';
		note?: string;
		level?: 2 | 3;
		/** No rule and a tight gap: the body below supplies its own top edge. */
		flush?: boolean;
		class?: string;
		actions?: Snippet;
	}
	let {
		title,
		id,
		count,
		register,
		glyph,
		note,
		level = 2,
		flush = false,
		class: klass = '',
		actions
	}: Props = $props();

	const plainFigure = $derived(typeof count === 'number' || /^[\d.,\s]+$/.test(String(count ?? '')));
</script>

<header class="{flush ? 'mb-2' : 'mb-4 border-b border-rule pb-2.5'} {klass}">
	<div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
		<svelte:element
			this={level === 2 ? 'h2' : 'h3'}
			{id}
			class="flex min-w-0 items-baseline gap-2 font-semibold text-ink {flush
				? 'text-md'
				: 'text-lg tracking-tight'}"
		>
			{#if glyph && !register}
				<EpistemicGlyph kind={glyph} size={13} class="self-center" />
			{/if}
			<span class="truncate">{title}</span>
			{#if count !== undefined}
				<!-- Mono is for a bare figure. A count that is a phrase ("19 total, 9 core")
				     is prose and stays in the sans. -->
				<span class="tnum text-xs font-normal tracking-normal text-ink-3 {plainFigure ? 'font-mono' : ''}">{count}</span>
			{/if}
			{#if register}
				<EpistemicBadge {register} {glyph} class="self-center" />
			{/if}
		</svelte:element>
		{#if actions}
			<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
		{/if}
	</div>
	{#if note}
		<p class="mt-1 max-w-(--container-reading) text-sm text-ink-2">{note}</p>
	{/if}
</header>
