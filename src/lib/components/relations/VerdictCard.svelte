<script lang="ts">
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import EpistemicGlyph from '../epistemic/EpistemicGlyph.svelte';
	import EpistemicBadge from '../epistemic/EpistemicBadge.svelte';
	import RelationBadge from '../epistemic/RelationBadge.svelte';
	import ConfidenceMeter from '../epistemic/ConfidenceMeter.svelte';
	import EvidenceList from '../epistemic/EvidenceList.svelte';
	import ContainmentBars from './ContainmentBars.svelte';
	import type { ExplicitRelationCode, InferredBrandLink, ProducerSummary } from '#lib/types.ts';
	import {
		EXPLICIT_META,
		INFERRED_META,
		inferredDirectionHint,
		inferredLabel,
		inferredTitle,
		explicitTitle,
		KIND_COLOR,
		inferredVerdict,
		toScore
	} from '#lib/relations.ts';
	import { brandEvidence } from '#lib/evidence.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';
	import { vndbHref } from '#lib/util.ts';

	/**
	 * Diagnostic verdict (DESIGN §8.4). One card, two halves that never merge
	 * into one sentence: what VNDB states (ink) and what staff overlap suggests
	 * (pencil). Side by side on a wide screen, stacked on a narrow one. Each half
	 * opens with its register badge on its own ground, and the seam between them
	 * is the inferred half's dashed edge: the pencil side is fenced off, never
	 * continuous with the record.
	 */
	interface PathNode {
		id: string;
		name: string;
		original?: string | null;
		relationFromPrev?: ExplicitRelationCode;
	}
	interface Props {
		a: ProducerSummary;
		b: ProducerSummary;
		explicitPath: PathNode[] | null;
		inferred: InferredBrandLink | null;
	}
	let { a, b, explicitPath, inferred }: Props = $props();

	const hops = $derived(explicitPath ? explicitPath.length - 1 : null);
	const direct = $derived(hops === 1 ? (explicitPath![1].relationFromPrev ?? null) : null);
	// A → parent → B through a shared owner: VNDB's own two-hop sister.
	const sharedParent = $derived.by(() => {
		if (hops !== 2 || !explicitPath) return false;
		const up = explicitPath[1].relationFromPrev;
		const down = explicitPath[2].relationFromPrev;
		return (up === 'par' || up === 'ipa') && (down === 'sub' || down === 'imp');
	});

	const score = $derived(inferred ? toScore(inferred.confidence) : 0);
	// Names in every sentence follow the reader's name order, like the headings above.
	const shownA = $derived(shownName(a.name, a.original));
	const shownB = $derived(shownName(b.name, b.original));
	// The same two names keyed to the stored pair, which may be the other way round.
	const names = $derived(
		inferred
			? inferred.pidA === a.id
				? { a: shownA, b: shownB }
				: { a: shownB, b: shownA }
			: undefined
	);
	const verdict = $derived(inferred ? inferredVerdict(inferred, a.id, names) : '');
	const directionHint = $derived(inferred ? inferredDirectionHint(inferred, names) : null);
	// Read from slot A, whichever way round the classifier stored the pair.
	const evidence = $derived(inferred ? brandEvidence(inferred, a.id, 'slots', names, shownName) : []);
	// Containment in A/B order, whichever way the stored pair is oriented.
	const containment = $derived(
		inferred
			? inferred.pidA === a.id
				? { aInB: inferred.containmentAInB, bInA: inferred.containmentBInA }
				: { aInB: inferred.containmentBInA, bInA: inferred.containmentAInB }
			: null
	);
</script>

<div class="sheet overflow-hidden">
	{#if a.id === b.id}
		<div class="px-4 py-3 text-sm text-ink">The same producer on both sides.</div>
	{:else if direct}
		{@const meta = EXPLICIT_META[direct]}
		<!-- Ground truth wins: when VNDB already directly links A and B, never show a contradictory inferred verdict. -->
		<section aria-label="Confirmed in VNDB">
			<header class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-solid border-confirmed-edge bg-confirmed-tint px-4 py-2.5">
				<EpistemicBadge register="confirmed" />
				<RelationBadge kind={meta.kind} register="confirmed" label={meta.label} arrow={meta.arrow} title={explicitTitle(direct)} />
				<span class="text-sm font-medium text-ink">{meta.sentence(shownB, shownA)}</span>
				<span class="ml-auto flex items-center gap-3 text-xs">
					<a class="link inline-flex items-center gap-0.5" href={vndbHref(a.id)} target="_blank" rel="noopener noreferrer" title="Open {shownA} on VNDB">VNDB A<ArrowUpRight size={10} /></a>
					<a class="link inline-flex items-center gap-0.5" href={vndbHref(b.id)} target="_blank" rel="noopener noreferrer" title="Open {shownB} on VNDB">VNDB B<ArrowUpRight size={10} /></a>
				</span>
			</header>
			{#if containment || evidence.length > 0}
				<div class="space-y-2.5 px-4 py-3">
					{#if containment}
						<ContainmentBars aInB={containment.aInB} bInA={containment.bInA} nameA={shownA} nameB={shownB} />
					{/if}
					{#if evidence.length > 0 && inferred}
						<EvidenceList
							items={evidence}
							max={3}
							proof={{ kind: 'brand', pidA: a.id, pidB: b.id, nameA: shownA, nameB: shownB }}
						/>
					{/if}
				</div>
			{/if}
		</section>
	{:else}
		<div class="grid md:grid-cols-2">
			<!-- In VNDB: ink -->
			<section aria-label="Confirmed in VNDB">
				<header class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-solid border-confirmed-edge bg-confirmed-tint px-4 py-2">
					<EpistemicBadge register="confirmed" />
					<h3 class="caption text-ink">Record</h3>
					<span class="ml-auto flex items-center gap-3 text-xs">
						<a class="link inline-flex items-center gap-0.5" href={vndbHref(a.id)} target="_blank" rel="noopener noreferrer" title="Open {shownA} on VNDB">VNDB A<ArrowUpRight size={10} /></a>
						<a class="link inline-flex items-center gap-0.5" href={vndbHref(b.id)} target="_blank" rel="noopener noreferrer" title="Open {shownB} on VNDB">VNDB B<ArrowUpRight size={10} /></a>
					</span>
				</header>
				<div class="px-4 py-3">
					{#if explicitPath && hops && hops > 1}
						<p class="text-sm text-ink-2">
							<span class="font-medium text-ink">{hops}-hop path</span>{sharedParent ? ' (shared parent)' : ''}
						</p>
						<ol class="mt-2 flex flex-wrap items-center gap-y-1.5" aria-label="Shortest chain of VNDB relations">
							{#each explicitPath as node, i (node.id)}
								{#if i > 0 && node.relationFromPrev}
									{@const meta = EXPLICIT_META[node.relationFromPrev]}
									<li class="flex items-center" title={meta.sentence(shownName(node.name, node.original), shownName(explicitPath[i - 1].name, explicitPath[i - 1].original))} aria-label="{meta.label}:">
										<span class="inline-block h-0.5 w-3" style="background: {KIND_COLOR[meta.kind]}"></span>
										<span class="rounded-xs border px-1 text-2xs font-medium text-ink" style="border-color: {KIND_COLOR[meta.kind]}">{meta.code}</span>
										<span class="inline-block h-0.5 w-3" style="background: {KIND_COLOR[meta.kind]}"></span>
									</li>
								{/if}
								<li>
									<a
										href="/producer/{node.id}"
										class="inline-flex h-6 items-center rounded-xs border border-rule-strong bg-control px-2 text-sm text-ink no-underline hover:border-rule-hover hover:bg-control-hover"
									>
										{shownName(node.name, node.original)}
									</a>
								</li>
							{/each}
						</ol>
					{:else}
						<p class="text-sm text-ink-3">No direct link in VNDB.</p>
					{/if}
				</div>
			</section>

			<!-- Inferred: pencil -->
			<section
				class="border-t border-dashed border-inferred-edge md:border-t-0 md:border-l"
				aria-label="Inferred, not confirmed"
			>
				<header class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-dashed border-inferred-edge bg-inferred-tint px-4 py-2">
					<EpistemicBadge register="inferred" />
					<h3 class="caption text-ink">Overlap signal</h3>
				</header>
				<div class="px-4 py-3">
					{#if inferred}
						{@const meta = INFERRED_META[inferred.inferredType]}
						<div class="flex flex-wrap items-center gap-2.5" aria-label="Inferred: {verdict} Confidence {score} of 100.">
							<RelationBadge kind={meta.kind} register="inferred" label={inferredLabel(inferred)} title={inferredTitle(inferred, { seiyuuDriven: inferred.seiyuuDriven })} />
							<ConfidenceMeter {score} tier={inferred.confidenceTier} showTier />
						</div>
						{#if directionHint}
							<p class="mt-1.5 text-xs text-ink-2 italic">{directionHint}</p>
						{/if}
						<EvidenceList
							items={evidence}
							max={3}
							notes={inferred.evidence}
							proof={{ kind: 'brand', pidA: a.id, pidB: b.id, nameA: shownA, nameB: shownB }}
							class="mt-2.5"
						/>
					{:else}
						<p class="text-sm text-ink-3">No inferred relationship.</p>
					{/if}
				</div>
			</section>
		</div>

		{#if containment}
			<div class="border-t border-rule px-4 py-2.5">
				<ContainmentBars aInB={containment.aInB} bInA={containment.bInA} nameA={shownA} nameB={shownB} />
			</div>
		{/if}
	{/if}
</div>
