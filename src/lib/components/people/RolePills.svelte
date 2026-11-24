<script lang="ts">
	import RolePill from './RolePill.svelte';
	import { roleMeta, sortRoles } from '#lib/roles.ts';

	/** Role pills in precedence order; overflow `+N` expands inline on click. */
	interface Props {
		roles: readonly string[];
		max?: number;
		/** Spell each role out instead of showing its three-letter code. */
		full?: boolean;
		class?: string;
	}
	let { roles, max = 4, full = false, class: klass = '' }: Props = $props();
	let expanded = $state(false);

	const sorted = $derived(sortRoles(roles));
	const hasMore = $derived(sorted.length > max);
	const visible = $derived(expanded ? sorted : sorted.slice(0, max));
	const hiddenLabels = $derived(
		sorted
			.slice(max)
			.map((r) => roleMeta(r).label)
			.join(', ')
	);
</script>

<span class="inline-flex flex-wrap items-center gap-1 {klass}">
	{#each visible as role (role)}
		<RolePill {role} {full} />
	{/each}
	{#if hasMore}
		<button
			type="button"
			class="tnum inline-flex h-[18px] shrink-0 items-center rounded-xs border border-rule-strong bg-surface-sunken px-1.5 font-mono text-2xs text-ink-2 transition-colors duration-[120ms] hover:border-rule-hover hover:bg-control-hover hover:text-ink"
			aria-expanded={expanded}
			aria-label={expanded
				? 'Show fewer roles'
				: `Show ${sorted.length - max} more roles: ${hiddenLabels}`}
			title={expanded ? 'Show fewer roles' : `Show more roles: ${hiddenLabels}`}
			onclick={(e) => {
				e.stopPropagation();
				expanded = !expanded;
			}}
		>
			{expanded ? 'less' : `+${sorted.length - max}`}
		</button>
	{/if}
</span>
