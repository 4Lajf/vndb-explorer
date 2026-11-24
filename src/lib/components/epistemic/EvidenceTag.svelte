<script lang="ts">
	import Users from '@lucide/svelte/icons/users';
	import CircleDot from '@lucide/svelte/icons/circle-dot';
	import ChartGantt from '@lucide/svelte/icons/chart-gantt';
	import Library from '@lucide/svelte/icons/library';
	import LinkIcon from '@lucide/svelte/icons/link';
	import Disc from '@lucide/svelte/icons/disc-3';
	import Route from '@lucide/svelte/icons/route';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import Mic from '@lucide/svelte/icons/mic';
	import TextCursor from '@lucide/svelte/icons/text-cursor';
	import UserRound from '@lucide/svelte/icons/user-round';
	import BookOpenText from '@lucide/svelte/icons/book-open-text';
	import Scale from '@lucide/svelte/icons/scale';
	import CopyCheck from '@lucide/svelte/icons/copy-check';
	import Waypoints from '@lucide/svelte/icons/waypoints';
	import Split from '@lucide/svelte/icons/split';
	import Building2 from '@lucide/svelte/icons/building-2';
	import type { Component } from 'svelte';
	import type { Evidence, EvidenceType } from '#lib/evidence.ts';

	/**
	 * Evidence is a fact that supports an inference, so the tag is neutral,
	 * not sand (DESIGN §5.5). Every tag is a button that opens its detail.
	 */
	interface Props {
		evidence: Evidence;
		open?: boolean;
		controls?: string;
		onclick?: () => void;
	}
	let { evidence, open = false, controls, onclick }: Props = $props();

	const ICONS: Record<EvidenceType, Component<{ size?: number; class?: string }>> = {
		shared_staff: Users,
		containment: CircleDot,
		timeline: ChartGantt,
		shared_series: Library,
		shared_link: LinkIcon,
		co_release: Disc,
		explicit_2hop: Route,
		separate_owners: Building2,
		staff_flow: ArrowLeftRight,
		shared_seiyuu: Mic,
		shared_character: UserRound,
		bio_xref: BookOpenText,
		name_overlap: TextCursor,
		complementary_timeline: ChartGantt,
		shared_brands: Waypoints,
		rating_split: Scale,
		co_credit: CopyCheck,
		listed_apart: Split
	};
	const Icon = $derived(ICONS[evidence.type] ?? CircleDot);
</script>

<button
	type="button"
	class="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-xs px-1.5 py-1 text-xs md:min-h-6 md:py-0.5 text-ink transition-colors duration-[120ms] hover:bg-surface-hover {open
		? 'bg-surface-hover shadow-[inset_0_0_0_1px_var(--rule-strong)]'
		: 'bg-surface-sunken'} {evidence.counter ? 'border border-solid border-rule-strong' : ''}"
	aria-expanded={open}
	aria-controls={controls}
	title="{evidence.counter ? 'Against · ' : ''}Strength {evidence.strength}/3 · click for proof"
	{onclick}
>
	<Icon size={12} class="shrink-0 text-ink-3" />
	<span class="truncate">
		{#if evidence.counter}<span class="mr-1 text-ink-3">Against:</span>{/if}{evidence.label}
	</span>
	{#if evidence.value}
		<span class="tnum shrink-0 font-mono text-2xs text-ink-2">{evidence.value}</span>
	{/if}
	<!-- Three ascending bars, as in MobilityIndicator: round dots read as an ellipsis. -->
	<svg
		width="8"
		height="7"
		viewBox="0 0 8 7"
		class="shrink-0"
		role="img"
		aria-label="strength {evidence.strength} of 3"
	>
		{#each [3, 5, 7] as h, i (h)}
			<rect
				x={i * 3}
				y={7 - h}
				width="2"
				height={h}
				fill={i < evidence.strength ? 'var(--ink-2)' : 'var(--ink-4)'}
			/>
		{/each}
	</svg>
</button>
