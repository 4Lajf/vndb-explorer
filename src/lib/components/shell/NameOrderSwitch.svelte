<script lang="ts">
	import { prefs, type NameOrder } from '#lib/stores/prefs.svelte.ts';

	/** Name order: Romanised first / 原文 first. Swaps primary and secondary everywhere. */
	const OPTIONS: Array<{ value: NameOrder; glyph: string; label: string; lang?: string }> = [
		{ value: 'latin', glyph: 'Aa', label: 'Romanised names first' },
		{ value: 'original', glyph: 'あ', label: 'Original-script names first (原文)', lang: 'ja' }
	];
</script>

<!-- A group of toggle buttons, each its own tab stop. Not a radiogroup: that
     role promises one tab stop and arrow-key movement. -->
<div
	role="group"
	aria-label="Name order"
	class="inline-flex shrink-0 gap-0.5 rounded-sm border border-rule bg-surface-sunken p-0.5"
>
	{#each OPTIONS as opt (opt.value)}
		{@const selected = prefs.nameOrder === opt.value}
		<button
			type="button"
			aria-pressed={selected}
			aria-label={opt.label}
			title={opt.label}
			class="inline-flex h-8 min-w-8 items-center justify-center rounded-xs px-1.5 text-xs font-medium transition-colors duration-[120ms] md:h-7 md:min-w-7 {selected
				? 'bg-selected text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)]'
				: 'text-ink-3 hover:text-ink'}"
			onclick={() => prefs.setNameOrder(opt.value)}
		>
			<span lang={opt.lang} class="font-sans">{opt.glyph}</span>
		</button>
	{/each}
</div>
