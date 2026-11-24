<script lang="ts">
	import type { ConfidenceTier } from '#lib/types.ts';
	import { TIER_COLOR, tierLabel, tierRange } from '#lib/relations.ts';

	/** Tier word with its ordinal-ramp block: ramp step + word, never colour alone. */
	interface Props {
		tier: ConfidenceTier;
		class?: string;
	}
	let { tier, class: klass = '' }: Props = $props();
</script>

<span
	class="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap text-ink-2 {klass}"
	title="{tierLabel(tier)} ({tierRange(tier)}/100)"
>
	<span
		class="inline-block h-3 w-[3px] rounded-[1.5px]"
		style="background: {TIER_COLOR[tier]}"
		aria-hidden="true"
	></span>
	{tierLabel(tier)}
</span>
