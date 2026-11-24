<script lang="ts">
	import type { ConfidenceTier } from '#lib/types.ts';
	import { TIER_SCALE, tierForConfidence, tierLabel } from '#lib/relations.ts';

	/**
	 * One language for every inferred score, always in the sand family
	 * (DESIGN §5.3). Confidence changes the meter, never the register.
	 */
	interface Props {
		/** 0–100. */
		score: number;
		tier?: ConfidenceTier;
		dense?: boolean;
		showTier?: boolean;
		class?: string;
	}
	let { score, tier, dense = false, showTier = false, class: klass = '' }: Props = $props();

	const clamped = $derived(Math.max(0, Math.min(100, Math.round(score))));
	const filled = $derived(Math.max(0, Math.min(5, Math.ceil(clamped / 20))));
	// Prefer the tier the classifier stored; fall back to the same floors it uses.
	const resolvedTier = $derived<ConfidenceTier>(tier ?? tierForConfidence(clamped / 100));
	const word = $derived(tierLabel(resolvedTier));
</script>

<span
	class="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap {klass}"
	role="img"
	aria-label="Confidence {clamped} of 100, {word.toLowerCase()}"
	title="Confidence {clamped}/100 ({word}) · {TIER_SCALE}"
>
	<span class="tnum inline-block w-[3ch] text-right font-mono text-xs text-ink" aria-hidden="true"
		>{clamped}</span
	>
	<span
		class="inline-flex items-center gap-[2px] {clamped < 25 ? 'opacity-65' : ''}"
		aria-hidden="true"
	>
		{#each [0, 1, 2, 3, 4] as i (i)}
			<span
				class="inline-block rounded-[1.5px] {dense ? 'h-1 w-1.5' : 'h-1.5 w-2'} {i < filled
					? 'bg-inferred-mark'
					: 'bg-inferred-mark/20'}"
			></span>
		{/each}
	</span>
	{#if showTier}
		<span class="text-xs text-ink-2" aria-hidden="true">{word}</span>
	{/if}
</span>
