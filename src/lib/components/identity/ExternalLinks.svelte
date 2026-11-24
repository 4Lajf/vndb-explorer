<script lang="ts">
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import type { ExtLink } from '#lib/util.ts';

	/** Wrapping row of text links with the north-east arrow; the rest behind `+n more`. */
	interface Props {
		links: ExtLink[];
		max?: number;
		class?: string;
	}
	let { links, max = 5, class: klass = '' }: Props = $props();
	let expanded = $state(false);
	const shown = $derived(expanded ? links : links.slice(0, max));
</script>

<ul class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm {klass}">
	{#each shown as l (l.href)}
		<li>
			<a class="link inline-flex items-center gap-0.5" href={l.href} target="_blank" rel="noopener noreferrer">
				{l.label}<ArrowUpRight size={11} class="text-ink-3" />
			</a>
		</li>
	{/each}
	{#if links.length > max}
		<li>
			<button type="button" class="btn-ghost text-ink-2" onclick={() => (expanded = !expanded)}>
				{expanded ? 'less' : `+${links.length - max} more`}
			</button>
		</li>
	{/if}
</ul>
