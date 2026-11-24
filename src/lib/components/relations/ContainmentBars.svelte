<script lang="ts">
	import SlotTag from './SlotTag.svelte';
	import { CORE_STAFF_HINT } from '#lib/roles.ts';
	import { pct } from '#lib/util.ts';

	/**
	 * Two stacked containment bars (DESIGN §6.5). Full bar = that brand's
	 * credited core staff; filled part = share also found at the other brand.
	 * Lopsided containment is the visual signature of a sub-brand.
	 */
	interface Props {
		/** Share of A's staff also at B (0..1). */
		aInB: number;
		/** Share of B's staff also at A (0..1). */
		bInA: number;
		nameA: string;
		nameB: string;
		/** Show A/B slot tags (Compare page) or plain names. */
		tags?: boolean;
		barWidth?: number;
		class?: string;
	}
	let { aInB, bInA, nameA, nameB, tags = true, barWidth = 120, class: klass = '' }: Props = $props();

	const rows = $derived([
		{ side: 'A' as const, other: 'B' as const, v: aInB, self: nameA, otherName: nameB },
		{ side: 'B' as const, other: 'A' as const, v: bInA, self: nameB, otherName: nameA }
	]);
</script>

<dl class="grid gap-1.5 {klass}">
	{#each rows as r (r.side)}
		{@const v = Math.max(0, Math.min(1, r.v || 0))}
		<!-- On a phone the sentence wraps under the bar: the A-in-B tag then lines up
		     with the bar's own line instead of floating beside the wrapped text. -->
		<div class="flex flex-wrap items-start gap-x-2.5 gap-y-0.5 text-xs sm:items-center">
			<dt class="mt-0.5 flex w-[4.5rem] shrink-0 items-center gap-1 text-ink-2 sm:mt-0">
				{#if tags}
					<SlotTag side={r.side} /><span>in</span><SlotTag side={r.other} />
				{:else}
					<span class="truncate" title="{r.self} in {r.otherName}">{r.side} in {r.other}</span>
				{/if}
			</dt>
			<dd class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-0.5 sm:flex-nowrap">
				<span
					class="inline-block h-1.5 shrink-0 overflow-hidden rounded-full bg-surface-hover"
					style="width: {barWidth}px"
					role="img"
					aria-label="{pct(v)} of {r.self}'s staff also at {r.otherName}"
				>
					<span class="block h-full rounded-full bg-ink-2" style="width: {(v * 100).toFixed(1)}%"></span>
				</span>
				<span class="tnum w-[4ch] shrink-0 text-right font-mono text-ink">{pct(v)}</span>
				<span class="basis-full text-ink-3 sm:min-w-0 sm:basis-auto sm:truncate">of {r.self}'s <span class="term" title={CORE_STAFF_HINT}>core staff</span> also at {r.otherName}</span>
			</dd>
		</div>
	{/each}
</dl>
