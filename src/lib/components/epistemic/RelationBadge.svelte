<script lang="ts">
	import KindIcon from './KindIcon.svelte';
	import { KIND_COLOR, type Register, type RelationKind } from '#lib/relations.ts';

	/**
	 * Relation class badge (DESIGN §5.2). Hue is shared between registers:
	 * an explicit imprint and an inferred sub-brand are both ownership violet;
	 * solid vs dashed + hatch tells them apart.
	 */
	interface Props {
		kind: RelationKind;
		register: Register;
		label: string;
		/** Leading direction glyph for explicit ownership and lineage. */
		arrow?: string;
		dense?: boolean;
		title?: string;
	}
	let { kind, register, label, arrow, dense = false, title }: Props = $props();
</script>

<span
	class="rel-badge {register} {dense ? 'dense' : ''}"
	style="--hue: {KIND_COLOR[kind]}"
	{title}
>
	<KindIcon {kind} size={dense ? 10 : 12} />
	{#if arrow}<span class="font-mono" aria-hidden="true">{arrow}</span>{/if}
	<span>{label}</span>
</span>

<style>
	.rel-badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 20px;
		padding: 0 8px;
		border-radius: 4px;
		font-size: 0.75rem;
		line-height: 1rem;
		font-weight: 500;
		color: var(--ink);
		white-space: nowrap;
		flex-shrink: 0;
	}
	.rel-badge.dense {
		height: 18px;
		padding: 0 5px;
		gap: 4px;
		font-size: 0.6875rem;
	}
	.rel-badge.confirmed {
		border: 1px solid color-mix(in oklab, var(--hue) 70%, transparent);
		background: color-mix(in oklab, var(--hue) 13%, transparent);
	}
	.rel-badge.inferred {
		border: 1px dashed var(--hue);
		background-image: repeating-linear-gradient(
			135deg,
			color-mix(in oklab, var(--hue) 22%, transparent) 0 1px,
			transparent 1px 7px
		);
	}
</style>
