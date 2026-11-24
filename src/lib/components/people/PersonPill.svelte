<script lang="ts">
	import RoleMark from './RoleMark.svelte';
	import PotentialAliasFlag from '../epistemic/PotentialAliasFlag.svelte';
	import NamePair from '../identity/NamePair.svelte';

	/**
	 * The clickable person token (DESIGN §5.7). Seiyuu pills use the circle
	 * mark, so a mixed list scans by shape.
	 */
	interface Props {
		sid: string;
		name: string;
		original?: string | null;
		/** Role key for the leading mark. */
		role?: string;
		isSeiyuu?: boolean;
		/** Mono year text, e.g. `2004 → 2006`. */
		years?: string;
		potentialAliasCount?: number;
		/** Tag for a name change across the move. */
		note?: string;
		class?: string;
	}
	let {
		sid,
		name,
		original = null,
		role,
		isSeiyuu = false,
		years,
		potentialAliasCount = 0,
		note,
		class: klass = ''
	}: Props = $props();
</script>

<a
	href="/staff/{sid}"
	class="inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-pill border border-rule-strong bg-control px-2 text-sm text-ink no-underline transition-colors duration-[120ms] hover:border-rule-hover hover:bg-control-hover {klass}"
>
	<RoleMark role={isSeiyuu ? 'seiyuu' : (role ?? 'dev')} size={8} variant={role || isSeiyuu ? 'auto' : 'hollow'} />
	<NamePair {name} {original} variant="compact" class="truncate" />
	{#if years}
		<span class="tnum shrink-0 font-mono text-2xs text-ink-3">{years}</span>
	{/if}
	{#if note}
		<span class="shrink-0 text-2xs text-ink-2">{note}</span>
	{/if}
	{#if potentialAliasCount > 0}
		<PotentialAliasFlag count={potentialAliasCount} plain />
	{/if}
</a>
