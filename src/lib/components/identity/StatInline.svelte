<script lang="ts">
	/** `132 VNs   418 staff   291 seiyuu   1999–2024`: spacing separates, no dot chain. */
	interface Props {
		items: Array<{ value: string | number; label?: string; mono?: boolean; title?: string }>;
		class?: string;
	}
	let { items, class: klass = '' }: Props = $props();
</script>

<p class="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-base {klass}">
	{#each items as item, i (i)}
		<span class="whitespace-nowrap" title={item.title}>
			<span class="font-semibold text-ink {item.mono ? 'tnum font-mono text-sm font-medium' : ''}" class:term={!!item.title && !item.label}
				>{item.value}</span
			>{#if item.label}<span class="ml-1 text-ink-3" class:term={!!item.title}>{item.label}</span>{/if}
		</span>
	{/each}
</p>
