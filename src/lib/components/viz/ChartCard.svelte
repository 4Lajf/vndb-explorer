<script lang="ts">
	import type { Snippet } from 'svelte';
	import SectionHeader from '../shell/SectionHeader.svelte';
	import SegmentedControl from '../controls/SegmentedControl.svelte';
	import type { Register } from '#lib/relations.ts';

	/**
	 * Wraps every chart (DESIGN §6): a `surface` sheet, a legend strip, and a
	 * table-view twin reachable from a toggle in the header. Tooltips never gate
	 * information: the same values are in the table view.
	 */
	interface Props {
		title: string;
		id?: string;
		count?: number | string;
		note?: string;
		register?: Register;
		view?: 'chart' | 'table';
		/** Label of the chart side of the toggle: Chart, Graph, Flow… */
		chartLabel?: string;
		/** Dim the body while a refetch is in flight; no skeleton flash. */
		pending?: boolean;
		/**
		 * No sheet around the body: for a chart embedded in a row or card that
		 * already has its own frame, so a card never nests inside a card.
		 */
		bare?: boolean;
		/** Below `md` show the table twin only, and hide the chart/table toggle. */
		narrowTable?: boolean;
		controls?: Snippet;
		/** Filters that apply to both the chart and its table twin. */
		toolbar?: Snippet;
		legend?: Snippet;
		chart: Snippet;
		table: Snippet;
		footer?: Snippet;
	}
	let {
		title,
		id,
		count,
		note,
		register,
		view = $bindable('chart'),
		chartLabel = 'Chart',
		pending = false,
		bare = false,
		narrowTable = false,
		controls,
		toolbar,
		legend,
		chart,
		table,
		footer
	}: Props = $props();
</script>

<section aria-labelledby={id}>
	<SectionHeader {title} {id} {count} {note} {register} level={bare ? 3 : 2} flush={bare}>
		{#snippet actions()}
			{#if controls}{@render controls()}{/if}
			<SegmentedControl
				label="{title}: view"
				size="sm"
				class={narrowTable ? 'hidden md:inline-flex' : ''}
				bind:value={view}
				options={[
					{ value: 'chart', label: chartLabel },
					{ value: 'table', label: 'Table' }
				]}
			/>
		{/snippet}
	</SectionHeader>

	<div class="relative overflow-hidden {bare ? 'border-t border-rule' : 'sheet'}">
		{#if pending}
			<div class="refetch-bar absolute inset-x-0 top-0 z-10" aria-hidden="true"></div>
		{/if}
		<div class="transition-opacity duration-150 {pending ? 'opacity-60' : ''}" aria-busy={pending}>
			{#if toolbar}{@render toolbar()}{/if}
			{#if view === 'chart'}
				<div class={narrowTable ? 'hidden md:block' : ''}>
					{@render chart()}
					{#if legend}
						<div class="border-t border-rule py-2.5 text-xs text-ink-2 {bare ? '' : 'px-4'}">
							{@render legend()}
						</div>
					{/if}
				</div>
				{#if narrowTable}
					<div class="md:hidden">{@render table()}</div>
				{/if}
			{:else}
				{@render table()}
			{/if}
		</div>
		{#if footer}
			<div class="border-t border-rule">{@render footer()}</div>
		{/if}
	</div>
</section>
