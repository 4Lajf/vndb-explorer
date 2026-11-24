<script lang="ts">
	/**
	 * `18+` in a 1px box; all-ages is unmarked unless `showAllAges`. A VN with
	 * no rated release at all is neither: it prints a dash, never "all-ages".
	 */
	interface Props {
		hasEro: boolean;
		hasAllAges?: boolean;
		showAllAges?: boolean;
	}
	let { hasEro, hasAllAges = false, showAllAges = false }: Props = $props();
</script>

{#if hasEro}
	<span
		class="tnum inline-flex h-[18px] shrink-0 items-center rounded-xs border border-ink-2 px-1 font-mono text-2xs font-medium text-ink"
		title={hasAllAges ? 'Has both 18+ and all-ages releases' : '18+ releases only'}
	>
		18+{#if hasAllAges}<span class="text-ink-3">&nbsp;/ all</span>{/if}
	</span>
{:else if !hasAllAges}
	<span class="text-ink-4" title="No rated release recorded">—</span>
{:else if showAllAges}
	<span class="text-2xs text-ink-3">all-ages</span>
{/if}
