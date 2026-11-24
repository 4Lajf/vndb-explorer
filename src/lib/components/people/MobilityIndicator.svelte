<script lang="ts">
	import ProofPopover from '../feedback/ProofPopover.svelte';
	import NamePair from '../identity/NamePair.svelte';
	import ProducerShape from '../identity/ProducerShape.svelte';
	import YearSpan from '../identity/YearSpan.svelte';
	import RolePills from './RolePills.svelte';
	import StaffVnsButton from './StaffVnsButton.svelte';
	import { fetchProof } from '#lib/proof-cache.ts';
	import { MOBILITY_MEANING, MOBILITY_RANGE_LABEL, mobilityLevel } from '#lib/roles.ts';
	import type { ProducerType } from '#lib/types.ts';
	import { plural } from '#lib/util.ts';

	interface StaffBrandsProof {
		sid: string;
		total: number;
		brands: Array<{
			pid: string;
			name: string;
			original: string | null;
			type: ProducerType;
			vnCount: number;
			firstYear: number | null;
			lastYear: number | null;
			roles: string[];
		}>;
	}

	/**
	 * Three horizontal dots (1 = Anchored, 2 = Mobile, 3 = Itinerant) + plain
	 * `{n} brands` count. When `sid` is provided, clicking opens the exact list
	 * of studios this person has worked at.
	 */
	interface Props {
		brandCount: number;
		sid?: string;
		personName?: string;
		/** Render only the clickable count number (for numeric table columns like Home's Brands). */
		numericOnly?: boolean;
		class?: string;
	}
	let { brandCount, sid, personName, numericOnly = false, class: klass = '' }: Props = $props();
	const m = $derived(mobilityLevel(brandCount));

	let loading = $state(false);
	let error = $state<string | null>(null);
	let proof = $state<StaffBrandsProof | null>(null);

	async function load() {
		if (!sid || proof || loading) return;
		loading = true;
		error = null;
		try {
			proof = await fetchProof<StaffBrandsProof>(`/api/proof/staff-brands?sid=${encodeURIComponent(sid)}`);
		} catch {
			error = 'Could not load studio list.';
		} finally {
			loading = false;
		}
	}
</script>

{#snippet dots()}
	<svg width="16" height="7" viewBox="0 0 16 7" role="img" aria-label={m.label}>
		<circle cx="2.5" cy="3.5" r="2" fill={m.bars >= 1 ? 'var(--ink)' : 'none'} stroke={m.bars >= 1 ? 'none' : 'var(--ink-4)'} stroke-width="1" />
		<circle cx="8" cy="3.5" r="2" fill={m.bars >= 2 ? 'var(--ink)' : 'none'} stroke={m.bars >= 2 ? 'none' : 'var(--ink-4)'} stroke-width="1" />
		<circle cx="13.5" cy="3.5" r="2" fill={m.bars >= 3 ? 'var(--ink)' : 'none'} stroke={m.bars >= 3 ? 'none' : 'var(--ink-4)'} stroke-width="1" />
	</svg>
{/snippet}

{#if brandCount <= 0}
	<span
		class="text-ink-4 {klass}"
		title="Edition credits only"
	>
		—
	</span>
{:else if sid}
	<ProofPopover
		title={personName ? `Studios of ${personName}` : 'Studios credited at'}
		subtitle="{m.label} ({MOBILITY_RANGE_LABEL[m.level]}) · {plural(brandCount, 'brand')}"
		align="right"
		onopen={load}
	>
		{#snippet trigger({ open, toggle })}
			<button
				type="button"
				class="inline-flex shrink-0 items-center gap-1.5 rounded-xs px-1 py-0.5 whitespace-nowrap transition-colors duration-[120ms] hover:bg-surface-hover {open
					? 'bg-surface-hover'
					: ''} {klass}"
				aria-expanded={open}
				title="{m.label} · click for studios"
				onclick={toggle}
			>
				{#if numericOnly}
					<span class="tnum font-mono font-medium text-ink underline decoration-dotted decoration-rule-hover underline-offset-3">{brandCount}</span>
				{:else}
					{@render dots()}
					<span class="tnum font-mono text-2xs text-ink-2 underline decoration-dotted decoration-rule-hover underline-offset-3"
						>{brandCount} <span class="font-sans text-ink-3">{brandCount === 1 ? 'brand' : 'brands'}</span></span
					>
				{/if}
			</button>
		{/snippet}
		{#snippet children({ close })}
			{#if loading}
				<p class="py-2 text-ink-3">Loading studios…</p>
			{:else if error}
				<p class="py-2 text-danger">{error}</p>
			{:else if proof && proof.brands.length > 0}
				<ul class="divide-y divide-rule">
					{#each proof.brands as b (b.pid)}
						<li class="flex items-center justify-between gap-2 py-1.5">
							<span class="flex min-w-0 items-center gap-1.5">
								<ProducerShape type={b.type} size={9} />
								<span class="min-w-0 truncate font-medium text-ink">
									<NamePair name={b.name} original={b.original} href="/producer/{b.pid}" variant="compact" />
								</span>
							</span>
							<span class="flex shrink-0 items-center gap-2 text-2xs text-ink-3">
								<RolePills roles={b.roles} max={2} />
								<YearSpan from={b.firstYear} to={b.lastYear} tight />
								<StaffVnsButton
									count={b.vnCount}
									label={plural(b.vnCount, 'VN')}
									title="{personName ?? sid} at {b.name}"
									endpoint="/api/proof/staff-vns?sid={encodeURIComponent(sid)}&pid={encodeURIComponent(b.pid)}"
									moreHref="/staff/{sid}#credits"
									class="text-2xs text-ink-2"
								/>
							</span>
						</li>
					{/each}
				</ul>
				<p class="mt-2 border-t border-rule pt-1.5 text-2xs text-ink-3">
					<a class="link" href="/staff/{sid}#affinity" onclick={close}>Open full career profile →</a>
				</p>
			{:else}
				<p class="py-2 text-ink-3">No original-developer studios recorded.</p>
			{/if}
		{/snippet}
	</ProofPopover>
{:else}
	<span
		class="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap {klass}"
		title="{m.label} ({MOBILITY_RANGE_LABEL[m.level]})"
	>
		{@render dots()}
		<span class="tnum font-mono text-2xs text-ink-2"
			>{brandCount} <span class="font-sans text-ink-3">{brandCount === 1 ? 'brand' : 'brands'}</span></span
		>
	</span>
{/if}
