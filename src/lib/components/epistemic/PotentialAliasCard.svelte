<script lang="ts">
	import ConfidenceMeter from './ConfidenceMeter.svelte';
	import EvidenceList from './EvidenceList.svelte';
	import NamePair from '../identity/NamePair.svelte';
	import YearSpan from '../identity/YearSpan.svelte';
	import DisciplineBadge from '../identity/DisciplineBadge.svelte';
	import StaffVnsButton from '../people/StaffVnsButton.svelte';
	import type { PotentialAliasCandidate } from '#lib/types.ts';
	import { tierLabel, toScore } from '#lib/relations.ts';
	import { aliasEvidence } from '#lib/evidence.ts';
	import { aliasPairHref, pct, plural } from '#lib/util.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';

	/**
	 * A potential alias of the person on this page (DESIGN §5.4, §8.3): one flat
	 * row inside an inferred `EpistemicZone`. The zone supplies the pencil frame,
	 * the `Inferred` badge and the "Potential aliases" heading once; each row carries only
	 * what differs: the other record, its tier, its score and its evidence.
	 * Always a link to a *separate* `staff.id`, never merged into the confirmed list.
	 */
	interface Props {
		candidate: PotentialAliasCandidate;
		/** The staff record whose page this is. */
		selfSid: string;
		overlayActive?: boolean;
		onoverlay?: (sid: string | null) => void;
	}
	let { candidate, selfSid, overlayActive = false, onoverlay }: Props = $props();

	const selfIsA = $derived(candidate.sidA === selfSid);
	const other = $derived(
		selfIsA
			? {
					sid: candidate.sidB,
					name: candidate.nameB,
					original: candidate.originalB ?? null,
					lang: candidate.langB,
					discipline: candidate.disciplineB,
					vnCount: candidate.vnCountB,
					brandCount: candidate.brandCountB ?? 0,
					first: candidate.firstYearB,
					last: candidate.lastYearB,
					eroRate: candidate.eroRateB
				}
			: {
					sid: candidate.sidA,
					name: candidate.nameA,
					original: candidate.originalA ?? null,
					lang: candidate.langA,
					discipline: candidate.disciplineA,
					vnCount: candidate.vnCountA,
					brandCount: candidate.brandCountA ?? 0,
					first: candidate.firstYearA,
					last: candidate.lastYearA,
					eroRate: candidate.eroRateA
				}
	);
	const score = $derived(toScore(candidate.confidence));
	const evidence = $derived(aliasEvidence(candidate, shownName));
</script>

<article
	class="border-b border-dashed border-inferred/30 px-4 py-3.5 last:border-b-0"
	aria-label="Potential alias, not confirmed: {other.name}. Confidence {score} of 100, {tierLabel(candidate.confidenceTier).toLowerCase()}."
>
	<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
		<div class="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
			<span class="min-w-0 text-md font-semibold">
				<NamePair name={other.name} original={other.original} lang={other.lang} href="/staff/{other.sid}" />
			</span>
			<DisciplineBadge kind={other.discipline} dense />
		</div>
		<ConfidenceMeter {score} tier={candidate.confidenceTier} showTier />
	</div>

	<p class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-3">
		<YearSpan from={other.first} to={other.last} />
		<StaffVnsButton
			count={other.vnCount}
			label={plural(other.vnCount, 'VN')}
			title={shownName(other.name, other.original)}
			subtitle="Visual novels credited on"
			endpoint="/api/proof/staff-vns?sid={encodeURIComponent(other.sid)}"
			moreHref="/staff/{other.sid}#credits"
			moreLabel="Open full credits →"
			align="left"
			class="text-xs text-ink-3"
		/>
		{#if other.brandCount}<span>{plural(other.brandCount, 'brand')}</span>{/if}
		<span>{candidate.sharedBrands} shared with this record</span>
		{#if other.eroRate != null}
			<span>{pct(other.eroRate)} 18+ only</span>
		{/if}
	</p>

	<EvidenceList
		items={evidence}
		notes={candidate.evidence}
		proof={{
			kind: 'alias',
			sidA: candidate.sidA,
			sidB: candidate.sidB,
			nameA: shownName(candidate.nameA, candidate.originalA),
			nameB: shownName(candidate.nameB, candidate.originalB)
		}}
		class="mt-2.5"
	/>

	<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
		{#if onoverlay}
			<button
				type="button"
				class="btn btn-sm {overlayActive ? 'btn-primary' : 'border-dashed border-inferred/70'}"
				aria-pressed={overlayActive}
				onclick={() => onoverlay?.(overlayActive ? null : other.sid)}
			>
				{overlayActive ? 'Remove overlay' : 'Overlay on timeline'}
			</button>
		{/if}
		<a class="btn-ghost text-sm" href="/?trace={selfSid}&compareTrace={other.sid}">Trace both on Atlas →</a>
		<a class="btn-ghost text-sm" href={aliasPairHref(candidate.sidA, candidate.sidB)}>Compare careers</a>
		<a class="btn-ghost text-sm" href="/staff/{other.sid}">Open profile</a>
	</div>
</article>
