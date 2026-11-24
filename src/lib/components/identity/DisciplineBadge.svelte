<script lang="ts">
	import type { StaffDiscipline } from '#lib/types.ts';
	import { DISCIPLINE_MEANING } from '#lib/roles.ts';

	/**
	 * Discipline pill for identity headers (DESIGN §5.6): Core Dev (square),
	 * Seiyuu (circle) or Dual (both). Shape is the channel; hue only reinforces.
	 */
	interface Props {
		kind: StaffDiscipline;
		dense?: boolean;
		class?: string;
	}
	let { kind, dense = false, class: klass = '' }: Props = $props();

	const label = $derived(
		kind === 'seiyuu' ? 'Seiyuu' : kind === 'dual' ? 'Dual' : kind === 'core' ? 'Core Dev' : 'Other staff'
	);
</script>

<span
	class="inline-flex shrink-0 items-center gap-1.5 rounded-xs border bg-control font-medium whitespace-nowrap text-ink {dense
		? 'h-[18px] px-1.5 text-2xs'
		: 'h-[22px] px-2 text-xs'} {kind === 'seiyuu' ? 'border-role-seiyuu/70' : 'border-rule-hover'} {klass}"
	title={DISCIPLINE_MEANING[kind] ?? DISCIPLINE_MEANING.other}
>
	{#if kind !== 'seiyuu'}
		<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
			<rect
				x="0.75"
				y="0.75"
				width="6.5"
				height="6.5"
				rx="1"
				fill={kind === 'other' ? 'none' : 'var(--ink)'}
				stroke="var(--ink)"
				stroke-width="1.5"
			/>
		</svg>
	{/if}
	{#if kind === 'seiyuu' || kind === 'dual'}
		<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
			<circle cx="4" cy="4" r="4" fill="var(--role-seiyuu)" />
		</svg>
	{/if}
	{label}
</span>
