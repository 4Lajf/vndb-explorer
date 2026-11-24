<script lang="ts">
	import type { ProducerType } from '#lib/types.ts';
	import { PRODUCER_TYPE_WORD } from '#lib/util.ts';

	/** Producer-type shape key: company circle · amateur group rounded square · individual diamond. */
	interface Props {
		type: ProducerType | string;
		size?: number;
		class?: string;
	}
	let { type, size = 10, class: klass = '' }: Props = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 12 12"
	fill="var(--surface)"
	stroke="currentColor"
	stroke-width="1.5"
	class="inline-block shrink-0 text-ink {klass}"
	role="img"
	aria-label={PRODUCER_TYPE_WORD[type] ?? 'Producer'}
>
	{#if type === 'ng'}
		<rect x="1.5" y="1.5" width="9" height="9" rx="2.5" />
	{:else if type === 'in'}
		<path d="M6 1 11 6 6 11 1 6Z" stroke-linejoin="round" />
	{:else}
		<circle cx="6" cy="6" r="4.5" />
	{/if}
</svg>
