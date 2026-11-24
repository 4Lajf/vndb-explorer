<script lang="ts">
	import CareerTimeline from '../viz/CareerTimeline.svelte';
	import type {
		PotentialAliasCandidate,
		StaffBrandTrack,
		StaffTimelineEvent,
		StaffTransition
	} from '#lib/types.ts';
	import { toScore } from '#lib/relations.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';

	/**
	 * In-place candidate comparison (DESIGN §8.6): record A's career as solid
	 * marks, record B overlaid as hollow dashed marks on the same axes. Shows the
	 * two patterns that matter: careers that interleave without sharing a
	 * release, and identical studio sequences. Drawn bare: it sits inside the
	 * pair's own row, so it adds no card of its own.
	 */
	interface Props {
		pair: PotentialAliasCandidate;
	}
	let { pair }: Props = $props();

	interface StaffPayload {
		timelineEvents: StaffTimelineEvent[];
		brandTracks: StaffBrandTrack[];
		transitions: StaffTransition[];
	}
	let data = $state<StaffPayload | null>(null);
	let error = $state<string | null>(null);
	let attempt = $state(0);
	let overlaySid = $state<string | null>(null);

	$effect(() => {
		void attempt;
		const sid = pair.sidA;
		const controller = new AbortController();
		data = null;
		error = null;
		fetch(`/api/staff/${encodeURIComponent(sid)}`, { signal: controller.signal })
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then((body: StaffPayload) => {
				data = {
					timelineEvents: body.timelineEvents ?? [],
					brandTracks: body.brandTracks ?? [],
					transitions: body.transitions ?? []
				};
				overlaySid = pair.sidB;
			})
			.catch((err: unknown) => {
				if ((err as Error)?.name === 'AbortError') return;
				error = `Could not load the career of ${shownName(pair.nameA, pair.originalA)}.`;
			});
		return () => controller.abort();
	});
</script>

<div class="mt-3">
	{#if error}
		<p class="border-l-2 border-danger px-3 py-2 text-sm text-ink-2" role="alert">
			{error}
			<button type="button" class="btn-ghost ml-2 text-xs" onclick={() => (attempt += 1)}>Retry</button>
		</p>
	{:else if !data}
		<div class="border-t border-rule py-4" aria-busy="true">
			<div class="skeleton h-3 w-[60%]"></div>
			<div class="skeleton mt-3 h-24 w-full"></div>
			<div class="skeleton mt-3 h-3 w-[35%]"></div>
			<span class="sr-only">Loading both careers…</span>
		</div>
	{:else}
		<CareerTimeline
			bare
			id="pair-{pair.sidA}-{pair.sidB}"
			title="Careers: {shownName(pair.nameA, pair.originalA)} (solid) and {shownName(pair.nameB, pair.originalB)} (dashed)"
			events={data.timelineEvents}
			tracks={data.brandTracks}
			transitions={data.transitions}
			personName={pair.nameA}
			candidates={[
				{
					sid: pair.sidB,
					name: pair.nameB,
					original: pair.originalB ?? null,
					tier: pair.confidenceTier,
					score: toScore(pair.confidence)
				}
			]}
			bind:overlaySid
		/>
	{/if}
</div>
