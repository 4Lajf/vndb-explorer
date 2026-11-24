<script lang="ts">
	import { roleMeta } from '#lib/roles.ts';

	/**
	 * Role mark (DESIGN §5.6). Squares are development credits, circles are
	 * voice credits: that holds in pills, timelines, rosters and legends.
	 * `role="dev"` is the neutral ink square for controls and search rows that
	 * mean development staff as a whole; role hues belong to real credits.
	 * `candidate` draws the pencil form: hollow with a dashed sand outline.
	 * `inherit` paints the mark in the surrounding text colour: on an inverse
	 * ground (a selected segmented button) the role hue would fall under 3:1.
	 */
	interface Props {
		role: string;
		size?: number;
		variant?: 'auto' | 'filled' | 'hollow' | 'candidate';
		/** Use `currentColor` instead of the role hue. */
		inherit?: boolean;
		class?: string;
	}
	let { role, size = 8, variant = 'auto', inherit = false, class: klass = '' }: Props = $props();

	const meta = $derived(roleMeta(role));
	const hollow = $derived(variant === 'hollow' || (variant === 'auto' && meta.fill === 'hollow'));
	const candidate = $derived(variant === 'candidate');
	const color = $derived(inherit ? 'currentColor' : meta.color);
	const stroke = $derived(candidate ? 'var(--inferred)' : color);
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 12 12"
	class="inline-block shrink-0 {klass}"
	aria-hidden="true"
>
	{#if meta.shape === 'circle'}
		<circle
			cx="6"
			cy="6"
			r={hollow || candidate ? 4.75 : 6}
			fill={hollow || candidate ? 'none' : color}
			{stroke}
			stroke-width={hollow || candidate ? 1.75 : 0}
			stroke-dasharray={candidate ? '2.4 1.6' : undefined}
		/>
	{:else}
		<rect
			x={hollow || candidate ? 1 : 0}
			y={hollow || candidate ? 1 : 0}
			width={hollow || candidate ? 10 : 12}
			height={hollow || candidate ? 10 : 12}
			rx="2"
			fill={hollow || candidate ? 'none' : color}
			{stroke}
			stroke-width={hollow || candidate ? 1.75 : 0}
			stroke-dasharray={candidate ? '2.4 1.6' : undefined}
		/>
	{/if}
</svg>
