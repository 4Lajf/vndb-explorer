<script lang="ts">
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Link2 from '@lucide/svelte/icons/link-2';
	import AliasPairCompare from './AliasPairCompare.svelte';
	import EpistemicGlyph from '../epistemic/EpistemicGlyph.svelte';
	import ConfidenceMeter from '../epistemic/ConfidenceMeter.svelte';
	import EvidenceList from '../epistemic/EvidenceList.svelte';
	import NamePair from '../identity/NamePair.svelte';
	import YearSpan from '../identity/YearSpan.svelte';
	import DisciplineBadge from '../identity/DisciplineBadge.svelte';
	import StaffVnsButton from '../people/StaffVnsButton.svelte';
	import type { PotentialAliasCandidate, StaffDiscipline } from '#lib/types.ts';
	import { tierLabel, toScore } from '#lib/relations.ts';
	import { aliasEvidence, sampleCharLabel } from '#lib/evidence.ts';
	import { fetchProof } from '#lib/proof-cache.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';
	import { aliasPairHref, pct, plural, vndbHref } from '#lib/util.ts';

	/**
	 * One candidate pair: two equal-height identity panels side by side with `≟`
	 * and a dashed connector between them, followed by one unified evidence strip.
	 */
	interface Props {
		pair: PotentialAliasCandidate;
		expanded?: boolean;
	}
	let { pair, expanded = $bindable(false) }: Props = $props();

	const uidBase = $props.id();
	const score = $derived(toScore(pair.confidence));
	const evidence = $derived(aliasEvidence(pair, shownName));
	const smaller = $derived(
		Math.max(1, Math.min(pair.brandCountA || Infinity, pair.brandCountB || Infinity))
	);
	const overlapBase = $derived(Number.isFinite(smaller) ? smaller : Math.max(1, pair.sharedBrands));
	const shownCharCount = $derived(
		(pair.sampleChars ?? []).reduce((n, ch) => n + (ch.count ?? 1), 0)
	);
	const extraChars = $derived(Math.max(0, pair.sharedChars - shownCharCount));
	const extraBrands = $derived(
		Math.max(0, pair.sharedBrands - (pair.sampleBrands?.length ?? 0))
	);

	let allBrands = $state<Array<{ pid: string; name: string; original?: string | null }> | null>(null);
	let brandsOpen = $state(false);
	let brandsLoading = $state(false);
	let allChars = $state<Array<{ cid: string; name: string; original?: string | null }> | null>(null);
	let charsOpen = $state(false);
	let charsLoading = $state(false);

	async function toggleAllBrands() {
		if (brandsOpen) {
			brandsOpen = false;
			return;
		}
		brandsOpen = true;
		if (allBrands || brandsLoading) return;
		brandsLoading = true;
		try {
			const res = await fetchProof<{ brands?: Array<{ pid: string; name: string; original?: string | null }> }>(
				`/api/proof/alias-pair?a=${encodeURIComponent(pair.sidA)}&b=${encodeURIComponent(pair.sidB)}&type=shared_brands`
			);
			allBrands = res.brands ?? [];
		} catch {
			allBrands = pair.sampleBrands ?? [];
		} finally {
			brandsLoading = false;
		}
	}

	async function toggleAllChars() {
		if (charsOpen) {
			charsOpen = false;
			return;
		}
		charsOpen = true;
		if (allChars || charsLoading) return;
		charsLoading = true;
		try {
			const res = await fetchProof<{ characters?: Array<{ cid: string; name: string; original?: string | null }> }>(
				`/api/proof/alias-pair?a=${encodeURIComponent(pair.sidA)}&b=${encodeURIComponent(pair.sidB)}&type=shared_character`
			);
			allChars = res.characters ?? [];
		} catch {
			allChars = (pair.sampleChars ?? []).map((c) => ({ cid: c.cid, name: c.name, original: null }));
		} finally {
			charsLoading = false;
		}
	}

	interface Panel {
		sid: string;
		name: string;
		original: string | null;
		lang: string | null;
		discipline: StaffDiscipline;
		vnCount: number;
		seiyuuVnCount: number;
		brandCount: number;
		first: number | null;
		last: number | null;
		eroRate: number | null;
	}
	const panels = $derived<[Panel, Panel]>([
		{
			sid: pair.sidA,
			name: pair.nameA,
			original: pair.originalA ?? null,
			lang: pair.langA,
			discipline: pair.disciplineA,
			vnCount: pair.vnCountA,
			seiyuuVnCount: pair.seiyuuVnCountA,
			brandCount: pair.brandCountA ?? 0,
			first: pair.firstYearA,
			last: pair.lastYearA,
			eroRate: pair.eroRateA
		},
		{
			sid: pair.sidB,
			name: pair.nameB,
			original: pair.originalB ?? null,
			lang: pair.langB,
			discipline: pair.disciplineB,
			vnCount: pair.vnCountB,
			seiyuuVnCount: pair.seiyuuVnCountB,
			brandCount: pair.brandCountB ?? 0,
			first: pair.firstYearB,
			last: pair.lastYearB,
			eroRate: pair.eroRateB
		}
	]);
</script>

{#snippet identity(p: Panel)}
	<div class="flex min-w-0 flex-1 flex-col justify-between rounded-sm bg-surface-sunken px-3 py-2.5">
		<div>
			<div class="flex items-center gap-2">
				<span class="min-w-0 flex-1 text-md font-semibold">
					<NamePair name={p.name} original={p.original} lang={p.lang} href="/staff/{p.sid}" />
				</span>
				<a
					class="btn-ghost shrink-0 text-2xs text-ink-3"
					href={vndbHref(p.sid)}
					target="_blank"
					rel="noopener noreferrer"
					title="Open on VNDB"
				>
					VNDB<ArrowUpRight size={10} />
				</a>
			</div>
			<p class="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-3">
				<DisciplineBadge kind={p.discipline} dense />
				<YearSpan from={p.first} to={p.last} />
				{#if p.brandCount}<span>{plural(p.brandCount, 'brand')}</span>{/if}
				<StaffVnsButton
					count={p.vnCount}
					label={plural(p.vnCount, 'VN')}
					title={shownName(p.name, p.original)}
					subtitle="Visual novels credited on"
					endpoint="/api/proof/staff-vns?sid={encodeURIComponent(p.sid)}"
					moreHref="/staff/{p.sid}#credits"
					moreLabel="Open full credits →"
					align="left"
					class="text-xs text-ink-3"
				/>
			</p>
		</div>
		{#if p.eroRate != null && (pair.seiyuuVnCountA > 0 || pair.seiyuuVnCountB > 0)}
			<div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-ink-3">
				<span class="inline-flex h-1.5 w-20 overflow-hidden rounded-full bg-surface-hover">
					<span class="block h-full rounded-full bg-ink-2" style="width: {(p.eroRate * 100).toFixed(0)}%"></span>
				</span>
				<span><span class="tnum font-mono text-ink-2">{pct(p.eroRate)}</span> 18+ only</span>
				<span><span class="tnum font-mono text-ink-2">{pct(1 - p.eroRate)}</span> all-ages / mixed</span>
			</div>
		{/if}
	</div>
{/snippet}

<article
	class="border-b border-dashed border-inferred/30 px-4 py-3.5 last:border-b-0"
	aria-label="Potential alias, not confirmed: {pair.nameA} and {pair.nameB}. Confidence {score} of 100, {tierLabel(pair.confidenceTier).toLowerCase()}."
>
	<!-- Side-by-side equal-height identity panels lead immediately for fast visual scan -->
	<div class="flex flex-col items-stretch gap-2 md:flex-row md:gap-0">
		{@render identity(panels[0])}
		<div class="flex shrink-0 flex-row items-center justify-center gap-2 md:w-28 md:flex-col md:gap-1">
			<div class="flex w-full items-center justify-center" aria-hidden="true">
				<span class="hidden h-0 flex-1 border-t border-dashed border-inferred/70 md:block"></span>
				<span class="inline-flex size-6 items-center justify-center">
					<EpistemicGlyph kind="alias-potential" size={15} />
				</span>
				<span class="hidden h-0 flex-1 border-t border-dashed border-inferred/70 md:block"></span>
			</div>
			<ConfidenceMeter {score} tier={pair.confidenceTier} dense showTier />
		</div>
		{@render identity(panels[1])}
	</div>

	<div class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
		<EvidenceList
			items={evidence}
			notes={pair.evidence}
			proof={{
				kind: 'alias',
				sidA: pair.sidA,
				sidB: pair.sidB,
				nameA: shownName(pair.nameA, pair.originalA),
				nameB: shownName(pair.nameB, pair.originalB)
			}}
		/>
	</div>

	<div class="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-2">
		<button
			type="button"
			class="btn-ghost text-xs font-medium text-ink"
			aria-expanded={expanded}
			aria-controls="{uidBase}-compare"
			onclick={() => (expanded = !expanded)}
		>
			<ChevronRight size={13} class="transition-transform duration-[180ms] {expanded ? 'rotate-90' : ''}" />
			{expanded ? 'Hide career comparison' : 'Compare careers'}
		</button>
		{#if pair.sharedBrands > 0}
			{@const shownBrands = brandsOpen && allBrands ? allBrands : (pair.sampleBrands ?? [])}
			<span class="tnum text-ink-3" title="Shared studios / smaller entry's total">
				Studios: <span class="font-mono text-ink-2">{pair.sharedBrands} of {overlapBase}</span>
				{#if shownBrands.length}
					({#each shownBrands as br, i (br.pid)}{i > 0 ? ', ' : ''}<a class="link" href="/producer/{br.pid}" title={br.original ? `${br.name} · ${br.original}` : undefined}>{shownName(br.name, br.original)}</a>{/each}{#if extraBrands > 0}{#if brandsOpen}{' '}<button type="button" class="link font-mono text-2xs" aria-expanded={true} onclick={toggleAllBrands}>{brandsLoading ? '…' : 'less'}</button>{:else}, <button type="button" class="link font-mono text-2xs" aria-expanded={false} title="Show all shared studios" onclick={toggleAllBrands}>+{extraBrands}</button>{/if}{/if})
				{/if}
			</span>
		{/if}
		{#if pair.sampleChars?.length}
			<span class="text-ink-3">
				Characters:
				{#if charsOpen && allChars}
					{#each allChars as ch, i (ch.cid)}{i > 0 ? ', ' : ''}<a class="link inline-flex items-center gap-0.5" href={vndbHref(ch.cid)} target="_blank" rel="noopener noreferrer">{shownName(ch.name, ch.original)}<ArrowUpRight size={10} class="text-ink-3" /></a>{/each}
				{:else}
					{#each pair.sampleChars as ch, i (ch.cid)}{i > 0 ? ', ' : ''}<a class="link inline-flex items-center gap-0.5" href={vndbHref(ch.cid)} target="_blank" rel="noopener noreferrer" title={ch.count && ch.count > 1 ? `${ch.count} VNDB character entries` : undefined}>{sampleCharLabel(ch)}<ArrowUpRight size={10} class="text-ink-3" /></a>{/each}
				{/if}{#if extraChars > 0}{' '}<button type="button" class="link font-mono text-2xs" aria-expanded={charsOpen} title={charsOpen ? 'Show fewer characters' : 'Show all shared characters'} onclick={toggleAllChars}>{charsOpen ? (charsLoading ? '…' : 'less') : `+${extraChars}`}</button>{/if}
			</span>
		{/if}
		<span class="ml-auto flex items-center gap-3">
			<a
				class="btn-ghost inline-flex items-center gap-1 text-2xs text-ink-2"
				href="/?trace={pair.sidA}&compareTrace={pair.sidB}"
				title="Trace both on Atlas"
			>
				Trace both on Atlas →
			</a>
			<a
				class="btn-ghost inline-flex items-center gap-1 text-2xs text-ink-3"
				href={aliasPairHref(pair.sidA, pair.sidB)}
			>
				<Link2 size={11} /> Permalink
			</a>
		</span>
	</div>

	<div id="{uidBase}-compare">
		{#if expanded}
			<AliasPairCompare {pair} />
		{/if}
	</div>
</article>
