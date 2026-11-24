<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import NamePair from '../identity/NamePair.svelte';
	import ProducerTypeBadge from '../identity/ProducerTypeBadge.svelte';
	import ProducerShape from '../identity/ProducerShape.svelte';
	import YearSpan from '../identity/YearSpan.svelte';
	import AliasChip from '../identity/AliasChip.svelte';
	import EpistemicGlyph from '../epistemic/EpistemicGlyph.svelte';
	import RelationBadge from '../epistemic/RelationBadge.svelte';
	import ConfidenceMeter from '../epistemic/ConfidenceMeter.svelte';
	import EvidenceList from '../epistemic/EvidenceList.svelte';
	import PersonPill from '../people/PersonPill.svelte';
	import StaffVnsButton from '../people/StaffVnsButton.svelte';
	import RolePills from '../people/RolePills.svelte';
	import RoleMark from '../people/RoleMark.svelte';
	import MobilityIndicator from '../people/MobilityIndicator.svelte';
	import type { InferredBrandLink } from '#lib/types.ts';
	import {
		EXPLICIT_META,
		INFERRED_META,
		TWO_HOP_MEANING,
		inferredDirectionHint,
		inferredLabel,
		inferredTitle,
		explicitForFocus,
		inferredVerdict,
		linkAgreement,
		toScore
	} from '#lib/relations.ts';
	import { brandEvidence } from '#lib/evidence.ts';
	import { ALIAS_USED_HINT, CORE_STAFF_HINT, MOBILITY_HINT, SEIYUU_HINT, primaryRole } from '#lib/roles.ts';
	import { shownName, shownPairNames } from '#lib/stores/prefs.svelte.ts';
	import { compareHref, plural } from '#lib/util.ts';

	/**
	 * One inferred relation of the focus brand (DESIGN §8.2). Pencil register:
	 * dashed badge, italic hedged verdict, confidence meter and itemised
	 * evidence. If VNDB already records a relation for the pair it is stated in
	 * ink, read from the focus brand's side, with whether the inference
	 * corroborates or differs.
	 */
	interface Props {
		link: InferredBrandLink;
		focusId: string;
		focusName: string;
		focusOriginal?: string | null;
		/** Page lens: voice cast counts only under "+ Seiyuu". */
		includeSeiyuu?: boolean;
	}
	let { link, focusId, focusName, focusOriginal = null, includeSeiyuu = false }: Props = $props();

	const uidBase = $props.id();
	let expanded = $state(false);

	const focusIsA = $derived(link.pidA === focusId);
	const target = $derived(
		focusIsA
			? {
					id: link.pidB,
					name: link.nameB,
					original: link.originalB ?? null,
					type: link.typeB,
					lang: link.langB,
					first: link.firstYearB,
					last: link.lastYearB
				}
			: {
					id: link.pidA,
					name: link.nameA,
					original: link.originalA ?? null,
					type: link.typeA,
					lang: link.langA,
					first: link.firstYearA,
					last: link.lastYearA
				}
	);
	const meta = $derived(INFERRED_META[link.inferredType]);
	const score = $derived(toScore(link.confidence));
	// Every sentence on the card names the brands in the reader's name order.
	const names = $derived(shownPairNames(link));
	const focusShown = $derived(shownName(focusName, focusOriginal));
	const targetShown = $derived(shownName(target.name, target.original));
	const verdict = $derived(inferredVerdict(link, focusId, names));
	const directionHint = $derived(inferredDirectionHint(link, names));
	// Read from the focus brand: "out" leaves it, "in" arrives at it.
	const evidence = $derived(brandEvidence(link, focusId, 'focus', names, shownName));
	// VNDB stores the relation as B's role relative to A: read it from the focus.
	const explicit = $derived(explicitForFocus(link, focusId));
	const agree = $derived(linkAgreement(link, focusId));

	// Core staff and seiyuu are two overlapping sets (a dual record is in both),
	// so they are reported side by side and never added into one "people" total.
	const showSeiyuu = $derived(includeSeiyuu || link.seiyuuDriven === true);
	const sharedLabel = $derived(
		showSeiyuu && link.sharedSeiyuu > 0
			? `${link.sharedCoreStaff} core, ${link.sharedSeiyuu} seiyuu shared`
			: `${link.sharedCoreStaff} shared core staff`
	);
	/**
	 * The name a person carries at one of the two brands. Primary or not is the
	 * build script's call, made by VNDB alias id; rows built before ids were kept
	 * fall back to comparing the romanised strings.
	 */
	function aliasSide(p: (typeof link.topShared)[number], side: 'A' | 'B') {
		const name = side === 'A' ? p.aliasA : p.aliasB;
		const fullList = side === 'A' ? p.aliasesA : p.aliasesB;
		if (!name && (!fullList || fullList.length === 0)) return null;
		const nonPrimary = side === 'A' ? p.aliasNonPrimaryA : p.aliasNonPrimaryB;
		const count = (side === 'A' ? p.aliasCountA : p.aliasCountB) ?? 1;
		return {
			name: name ?? fullList?.[0]?.name ?? '',
			original: (side === 'A' ? p.aliasOriginalA : p.aliasOriginalB) ?? null,
			aliases: fullList && fullList.length > 0 ? fullList : undefined,
			nonPrimary: nonPrimary ?? name !== p.name,
			more: Math.max(0, count - 1)
		};
	}
	// Names as used here (focus) and there (target).
	const people = $derived(
		link.topShared
			.filter((p) => showSeiyuu || !p.isSeiyuu)
			.map((p) => ({
				...p,
				aliasHere: aliasSide(p, focusIsA ? 'A' : 'B'),
				aliasThere: aliasSide(p, focusIsA ? 'B' : 'A'),
				yearsHere: focusIsA ? p.yearsA : p.yearsB,
				yearsThere: focusIsA ? p.yearsB : p.yearsA
			}))
	);
	const listedCore = $derived(people.filter((p) => !p.isSeiyuu).length);
	const listedSeiyuu = $derived(people.length - listedCore);
	const moreExist = $derived(
		link.sharedCoreStaff > listedCore || (showSeiyuu && link.sharedSeiyuu > listedSeiyuu)
	);
	const hiddenPillCount = $derived.by(() => {
		const shown = Math.min(5, people.length);
		const totalInLens = showSeiyuu
			? Math.max(people.length, link.sharedCoreStaff + link.sharedSeiyuu)
			: Math.max(people.length, link.sharedCoreStaff);
		return Math.max(people.length - shown, moreExist ? totalInLens - shown : 0);
	});
</script>

<article
	class="border-b border-dashed border-inferred/30 px-4 py-2.5 last:border-b-0"
	aria-label="Inferred: {verdict} Confidence {score} of 100."
>
	<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
		<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
			<ProducerShape type={target.type} size={10} />
			<span class="min-w-0 text-sm font-semibold">
				<NamePair name={target.name} original={target.original} lang={target.lang} href="/producer/{target.id}" />
			</span>
			<YearSpan from={target.first} to={target.last} class="text-2xs" />
			{#if link.explicitDist === 2}
				<span class="inline-flex items-center gap-1 text-2xs text-ink-3" title={TWO_HOP_MEANING}>
					<EpistemicGlyph kind="confirmed" size={9} /> 2-hop
				</span>
			{/if}
			{#if link.seiyuuDriven}
				<span class="inline-flex items-center gap-1 text-2xs text-ink-3" title="Voice-cast overlap only">
					<RoleMark role="seiyuu" size={7} /> cast only
				</span>
			{/if}
		</div>
		<div class="flex shrink-0 flex-wrap items-center gap-2.5">
			<RelationBadge kind={meta.kind} register="inferred" label={inferredLabel(link)} title={inferredTitle(link, { seiyuuDriven: link.seiyuuDriven })} />
			<ConfidenceMeter {score} tier={link.confidenceTier} dense />
			<a class="btn-ghost text-xs" href={compareHref(focusId, target.id)}>Compare</a>
		</div>
	</div>
	{#if directionHint}
		<p class="mt-1 text-xs text-ink-2 italic">{directionHint}</p>
	{/if}

	<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
		<EvidenceList
			items={evidence}
			max={3}
			proof={{ kind: 'brand', pidA: focusId, pidB: target.id, nameA: focusShown, nameB: targetShown }}
		/>
		{#if people.length > 0}
			<button
				type="button"
				class="btn-ghost ml-auto h-6 px-1.5 text-2xs text-ink-2"
				aria-expanded={expanded}
				aria-controls="{uidBase}-people"
				title={expanded ? 'Hide shared people' : 'Expand shared people'}
				onclick={() => (expanded = !expanded)}
			>
				<ChevronRight size={11} class="transition-transform duration-[180ms] {expanded ? 'rotate-90' : ''}" />
				{sharedLabel}
			</button>
		{:else if link.coDevVns > 0}
			<span class="ml-auto inline-flex items-center gap-1 text-2xs text-ink-3">
				<StaffVnsButton
					count={link.coDevVns}
					label={plural(link.coDevVns, 'co-dev VN')}
					title="{focusShown} & {targetShown}"
					subtitle="Co-developed visual novels"
					endpoint="/api/proof/brand-pair?a={encodeURIComponent(focusId)}&b={encodeURIComponent(target.id)}&type=codev"
					moreHref={compareHref(focusId, target.id)}
					moreLabel="Open Compare →"
					align="right"
					class="text-2xs"
				/>
			</span>
		{/if}
	</div>

	{#if expanded}
		<!-- Full-bleed inside the row: the row's own dividers frame it, no box of its own. -->
		<div id="{uidBase}-people" class="scroll-x -mx-4 mt-2.5 -mb-2.5 border-t border-rule">
			<table class="ledger">
				<caption class="sr-only">People credited at both {focusShown} and {targetShown}</caption>
				<thead>
					<tr>
						<th scope="col">Person</th>
						<th scope="col">Roles</th>
						<th scope="col" title={ALIAS_USED_HINT}><span class="term">Name at {focusShown}</span></th>
						<th scope="col" title={ALIAS_USED_HINT}><span class="term">Name at {targetShown}</span></th>
						<th scope="col">Years here</th>
						<th scope="col">Years there</th>
						<th scope="col" title={MOBILITY_HINT}><span class="term">Mobility</span></th>
					</tr>
				</thead>
				<tbody>
					{#each people as p (p.sid)}
						<!-- Over every alias of both tenures, by alias id: never the first name of each. -->
						{@const differs = p.aliasSwitched ?? (!!p.aliasHere && !!p.aliasThere && p.aliasHere.name !== p.aliasThere.name)}
						<tr class={differs ? 'bg-surface-sunken' : ''}>
							<td class="max-w-[16rem]">
								<span class="flex items-center gap-2">
									<RoleMark role={p.isSeiyuu ? 'seiyuu' : primaryRole(p.roles)} size={8} />
									<NamePair name={p.name} original={p.original} href="/staff/{p.sid}" />
								</span>
							</td>
							<td><RolePills roles={p.isSeiyuu && !p.roles.includes('seiyuu') ? [...p.roles, 'seiyuu'] : p.roles} max={3} /></td>
							<td>{#if p.aliasHere && (differs || p.aliasHere.nonPrimary)}<AliasChip alias={p.aliasHere.name} original={p.aliasHere.original} aliases={p.aliasHere.aliases} more={p.aliasHere.more} moreHref={compareHref(focusId, target.id)} bare />{:else}<span class="text-ink-4" title="Primary name">—</span>{/if}</td>
							<td>{#if p.aliasThere && (differs || p.aliasThere.nonPrimary)}<AliasChip alias={p.aliasThere.name} original={p.aliasThere.original} aliases={p.aliasThere.aliases} more={p.aliasThere.more} moreHref={compareHref(focusId, target.id)} bare {differs} />{:else}<span class="text-ink-4" title="Primary name">—</span>{/if}</td>
							<td><YearSpan from={p.yearsHere?.[0]} to={p.yearsHere?.[1]} tight /></td>
							<td><YearSpan from={p.yearsThere?.[0]} to={p.yearsThere?.[1]} tight /></td>
							<td><MobilityIndicator brandCount={p.brandCount} sid={p.sid} personName={shownName(p.name, p.original)} /></td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if moreExist}
				<p class="border-t border-rule px-4 py-2 text-xs text-ink-3">
					Showing the {people.length} highest-weighted.
					<a class="link" href={compareHref(focusId, target.id)}>See everyone in Compare</a>
				</p>
			{/if}
		</div>
	{/if}
</article>
