<script lang="ts">
	import { KIND_COLOR, type RelationKind } from '#lib/relations.ts';

	/** Relation-kind icons on a 16px grid, 1.5px stroke (DESIGN §5.2). */
	interface Props {
		kind: RelationKind;
		size?: number;
	}
	let { kind, size = 12 }: Props = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 16 16"
	fill="none"
	stroke={KIND_COLOR[kind]}
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	class="inline-block shrink-0"
	aria-hidden="true"
>
	{#if kind === 'ownership'}
		<!-- nested squares -->
		<rect x="1.75" y="1.75" width="12.5" height="12.5" rx="1.5" />
		<rect x="5.25" y="5.25" width="5.5" height="5.5" rx="0.75" />
	{:else if kind === 'sister'}
		<!-- two circles joined by a bar above -->
		<path d="M4 8V3.5h8V8" />
		<circle cx="4" cy="11" r="2.5" />
		<circle cx="12" cy="11" r="2.5" />
	{:else if kind === 'lineage'}
		<!-- branching arrow -->
		<path d="M2 12h4c2.5 0 3.5-1.5 3.5-4V3" />
		<path d="M6.75 5.5 9.5 2.75 12.25 5.5" />
		<path d="M6 12h7.5" />
	{:else}
		<!-- interlocking rings -->
		<circle cx="5.75" cy="8" r="3.75" />
		<circle cx="10.25" cy="8" r="3.75" />
	{/if}
</svg>
