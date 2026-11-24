<script lang="ts">
	import type { InferredBrandType } from '#lib/types.ts';
	import { INFERRED_META, inferredTitle } from '#lib/relations.ts';

	/**
	 * Dashed edge glyph in the class hue with its hedged class and direction:
	 * `┄Sub-brand?┄▶` points at the sub-brand (or the successor); sister and
	 * partner carry no arrow. Dotted when the link is seiyuu-driven. The class is
	 * always spelled out (`Sub-brand?`, `Sister?`), never abbreviated.
	 */
	interface Props {
		type: InferredBrandType;
		/** Which side the arrowhead points at, reading A (left) → B (right). */
		arrow?: 'left' | 'right' | 'none';
		seiyuuDriven?: boolean;
		/** Joint titles of the pair, when known: a partner link is defined by having them or not. */
		coDevVns?: number | null;
		class?: string;
	}
	let { type, arrow = 'none', seiyuuDriven = false, coDevVns = null, class: klass = '' }: Props = $props();

	const meta = $derived(INFERRED_META[type]);
	const dash = $derived(seiyuuDriven ? '1 3.5' : '5 3');
	const aria = $derived(
		`Inferred: ${meta.label}${arrow === 'right' ? ', pointing right' : arrow === 'left' ? ', pointing left' : ''}`
	);
	// The hover says what the class means, not just its name again.
	const title = $derived(
		inferredTitle({ inferredType: type, coDevVns }, { arrow: arrow !== 'none', seiyuuDriven })
	);
</script>

<span class="inline-flex shrink-0 items-center whitespace-nowrap {klass}" role="img" aria-label={aria} {title}>
	<svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true">
		{#if arrow === 'left'}
			<path d="M6 1.5 1 5 6 8.5Z" fill={meta.color} />
		{/if}
		<line x1={arrow === 'left' ? 6 : 0} x2="18" y1="5" y2="5" stroke={meta.color} stroke-width="1.5" stroke-dasharray={dash} stroke-linecap={seiyuuDriven ? 'round' : 'butt'} />
	</svg>
	<span
		class="mx-0.5 inline-flex h-4 items-center rounded-xs border border-dashed px-1 text-2xs font-medium text-ink"
		style="border-color: {meta.color}"
		aria-hidden="true"
		>{meta.short}</span
	>
	<svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true">
		<line x1="0" x2={arrow === 'right' ? 12 : 18} y1="5" y2="5" stroke={meta.color} stroke-width="1.5" stroke-dasharray={dash} stroke-linecap={seiyuuDriven ? 'round' : 'butt'} />
		{#if arrow === 'right'}
			<path d="M12 1.5 17 5 12 8.5Z" fill={meta.color} />
		{/if}
	</svg>
</span>
