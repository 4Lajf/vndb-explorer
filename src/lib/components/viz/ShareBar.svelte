<script lang="ts">
	import { pct } from '#lib/util.ts';

	/** Thin single-colour share bar with the value in mono (DESIGN §6.5). */
	interface Props {
		/** 0..1 */
		value: number;
		width?: number;
		height?: number;
		showValue?: boolean;
		label?: string;
		class?: string;
	}
	let { value, width = 64, height = 4, showValue = true, label, class: klass = '' }: Props = $props();
	const v = $derived(Math.max(0, Math.min(1, value || 0)));
</script>

<span class="inline-flex shrink-0 items-center gap-2 {klass}">
	<span
		class="inline-block overflow-hidden rounded-full bg-surface-hover"
		style="width: {width}px; height: {height}px"
		role="img"
		aria-label="{label ?? 'Share'} {pct(v)}"
	>
		<span class="block h-full rounded-full bg-ink-2 {v > 0 ? 'min-w-[2px]' : ''}" style="width: {(v * 100).toFixed(1)}%"></span>
	</span>
	{#if showValue}
		<span class="tnum w-[4ch] text-right font-mono text-xs text-ink-2" aria-hidden="true">{pct(v)}</span>
	{/if}
</span>
