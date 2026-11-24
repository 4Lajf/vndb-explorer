<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import SectionNav from '#lib/components/shell/SectionNav.svelte';
	import EpistemicBadge from '#lib/components/epistemic/EpistemicBadge.svelte';
	import EpistemicGlyph from '#lib/components/epistemic/EpistemicGlyph.svelte';
	import RelationBadge from '#lib/components/epistemic/RelationBadge.svelte';
	import TierBadge from '#lib/components/epistemic/TierBadge.svelte';
	import ProducerShape from '#lib/components/identity/ProducerShape.svelte';
	import SwapMark from '#lib/components/identity/SwapMark.svelte';
	import MobilityIndicator from '#lib/components/people/MobilityIndicator.svelte';
	import RoleMark from '#lib/components/people/RoleMark.svelte';
	import RolePill from '#lib/components/people/RolePill.svelte';
	import ClassEdge from '#lib/components/relations/ClassEdge.svelte';
	import {
		EXPLICIT_META,
		INFERRED_META,
		INFERRED_TYPES,
		SEIYUU_DRIVEN_MEANING,
		TIMELINE_MEANING,
		TWO_HOP_MEANING,
		inferredClassLabel,
		tierRange
	} from '#lib/relations.ts';
	import {
		ALL_DEV_STAFF_HINT,
		CO_MOVER_HINT,
		CORE_STAFF_HINT,
		DISCIPLINE_MEANING,
		EDITION_CREDIT_HINT,
		LENS_MEANING,
		MOBILITY_MEANING,
		MOBILITY_RANGE_LABEL,
		MOBILITY_SCORING_CAP,
		VNDB_SCORE_HINT,
		roleMeta,
		type Mobility
	} from '#lib/roles.ts';
	import type { ConfidenceTier } from '#lib/types.ts';

	const TIERS: ConfidenceTier[] = ['high', 'medium', 'speculative'];
	const MOBILITY: Array<{ level: Mobility; label: string; sample: number }> = [
		{ level: 'anchored', label: 'Anchored', sample: 3 },
		{ level: 'mobile', label: 'Mobile', sample: 9 },
		{ level: 'itinerant', label: 'Itinerant', sample: 24 }
	];
	const CORE_ROLES = ['director', 'scenario', 'chardesign', 'art', 'music'] as const;
	const OTHER_ROLES = ['songs', 'seiyuu', 'staff', 'translator', 'editor', 'qa'] as const;
	const SECTIONS = [
		{ id: 'relations', label: 'Relationships & labels' },
		{ id: 'scores', label: 'Scores & mobility' },
		{ id: 'shapes', label: 'Shapes, roles & aliases' },
		{ id: 'search', label: 'Search & IDs' }
	];

	let backHref = $state('/');
	afterNavigate(({ from }) => {
		if (from && from.url.pathname !== '/key') {
			backHref = `${from.url.pathname}${from.url.search}${from.url.hash}`;
		}
	});
</script>

<svelte:head>
	<title>Help &amp; reference · VNDB Explorer</title>
</svelte:head>

{#snippet code(text: string)}
	<kbd class="rounded-xs border border-rule bg-surface-sunken px-1.5 py-0.5 text-2xs text-ink"
		>{text}</kbd
	>
{/snippet}

<header class="pt-7 pb-5">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold tracking-tighter text-ink">Help &amp; reference</h1>
		<a class="btn-ghost text-xs" href={backHref}>
			<ArrowLeft size={13} /> {backHref === '/' ? 'Back to Home' : 'Back to previous page'}
		</a>
	</div>
	<p class="mt-2 max-w-(--container-reading) text-base text-ink-2">
		Every relationship class, edge label, score, symbol and search shortcut used across VNDB
		Explorer. Terms like <span class="text-ink">producer</span>, <span class="text-ink">brand</span>,
		and <span class="text-ink">studio</span> all refer to VNDB producer entries (<span class="font-mono text-xs text-ink">p…</span>).
	</p>
</header>

<SectionNav sections={SECTIONS} label="Help sections" />

<div class="mt-6 grid gap-6 lg:grid-cols-2">
	<!-- 1. Brand relationship types & edge labels -->
	<section id="relations" class="sheet p-5 lg:col-span-2" aria-labelledby="key-relations">
		<div class="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
			<div>
				<h2 id="key-relations" class="text-lg font-semibold tracking-tight text-ink">
					Brand relationship types &amp; edge labels
				</h2>
				<p class="mt-0.5 text-sm text-ink-2">
					How this tool classifies inferred studio links, alongside VNDB's own explicit relations
					and the one-word label each carries on maps, graphs and tables.
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-3 text-xs text-ink-3">
				<span class="inline-flex items-center gap-1.5"
					><EpistemicBadge register="confirmed" /> stated in VNDB</span
				>
				<span class="inline-flex items-center gap-1.5"
					><EpistemicBadge register="inferred" /> inferred by this tool</span
				>
			</div>
		</div>

		<div class="mt-4 grid gap-6 lg:grid-cols-2">
			<div>
				<p class="caption text-ink-3">
					Inferred classes <span class="font-normal">(the <span class="font-mono text-ink">?</span> marks a hypothesis, never a VNDB fact)</span>
				</p>
				<dl class="mt-3 grid gap-3 text-sm text-ink-2">
					{#each INFERRED_TYPES as t (t)}
						{@const meta = INFERRED_META[t]}
						<div class="rounded-sm border border-rule bg-surface-sunken/40 px-3.5 py-2.5">
							<dt class="flex flex-wrap items-center gap-x-2 gap-y-1">
								<ClassEdge type={t} arrow={meta.arrowNote ? 'right' : 'none'} />
								{@render code(meta.code)}
								<span class="font-medium text-ink">{inferredClassLabel(t)}</span>
							</dt>
							<dd class="mt-1.5 leading-relaxed">
								{meta.meaning}{meta.arrowNote ? ` ${meta.arrowNote}` : ''}
							</dd>
						</div>
					{/each}
					<div class="rounded-sm border border-rule bg-surface-sunken/40 px-3.5 py-2.5">
						<dt class="flex flex-wrap items-center gap-x-2 gap-y-1">
							<ClassEdge type="sister" seiyuuDriven />
							<span class="font-medium text-ink">Dotted line (seiyuu-driven)</span>
						</dt>
						<dd class="mt-1.5 leading-relaxed">{SEIYUU_DRIVEN_MEANING}</dd>
					</div>
				</dl>
			</div>

			<div>
				<p class="caption text-ink-3">VNDB's own explicit relations &amp; edge labels</p>
				<dl class="mt-3 grid gap-3 text-sm text-ink-2">
					<div class="rounded-sm border border-rule bg-surface-sunken/40 px-3.5 py-2.5">
						<dt class="flex flex-wrap items-center gap-1.5">
							<RelationBadge kind="ownership" register="confirmed" label={EXPLICIT_META.par.label} arrow={EXPLICIT_META.par.arrow} dense />
							{@render code(EXPLICIT_META.par.code)}
							<span class="text-xs text-ink-3">/</span>
							<RelationBadge kind="ownership" register="confirmed" label={EXPLICIT_META.sub.label} arrow={EXPLICIT_META.sub.arrow} dense />
							{@render code(EXPLICIT_META.sub.code)}
						</dt>
						<dd class="mt-1.5 leading-relaxed">
							<span class="font-medium text-ink">Parent company / Subsidiary:</span> two separate
							companies where one owns the other.
						</dd>
					</div>
					<div class="rounded-sm border border-rule bg-surface-sunken/40 px-3.5 py-2.5">
						<dt class="flex flex-wrap items-center gap-1.5">
							<RelationBadge kind="ownership" register="confirmed" label={EXPLICIT_META.ipa.label} arrow={EXPLICIT_META.ipa.arrow} dense />
							{@render code(EXPLICIT_META.ipa.code)}
							<span class="text-xs text-ink-3">/</span>
							<RelationBadge kind="ownership" register="confirmed" label={EXPLICIT_META.imp.label} arrow={EXPLICIT_META.imp.arrow} dense />
							{@render code(EXPLICIT_META.imp.code)}
						</dt>
						<dd class="mt-1.5 leading-relaxed">
							<span class="font-medium text-ink">Parent brand / Imprint:</span> {EXPLICIT_META.imp.meaning}
						</dd>
					</div>
					<div class="rounded-sm border border-rule bg-surface-sunken/40 px-3.5 py-2.5">
						<dt class="flex flex-wrap items-center gap-1.5">
							<RelationBadge kind="lineage" register="confirmed" label={EXPLICIT_META.ori.label} arrow={EXPLICIT_META.ori.arrow} dense />
							{@render code(EXPLICIT_META.ori.code)}
							<span class="text-xs text-ink-3">/</span>
							<RelationBadge kind="lineage" register="confirmed" label={EXPLICIT_META.spa.label} arrow={EXPLICIT_META.spa.arrow} dense />
							{@render code(EXPLICIT_META.spa.code)}
						</dt>
						<dd class="mt-1.5 leading-relaxed">
							A separate studio founded by staff who split off from an earlier studio (not a rename).
						</dd>
					</div>
					<div class="rounded-sm border border-rule bg-surface-sunken/40 px-3.5 py-2.5">
						<dt class="flex flex-wrap items-center gap-1.5">
							<RelationBadge kind="lineage" register="confirmed" label={EXPLICIT_META.old.label} arrow={EXPLICIT_META.old.arrow} dense />
							{@render code(EXPLICIT_META.old.code)}
							<span class="text-xs text-ink-3">/</span>
							<RelationBadge kind="lineage" register="confirmed" label={EXPLICIT_META.new.label} arrow={EXPLICIT_META.new.arrow} dense />
							{@render code(EXPLICIT_META.new.code)}
						</dt>
						<dd class="mt-1.5 leading-relaxed">
							The same studio continuing under a new name.
						</dd>
					</div>
					<div class="rounded-sm border border-rule bg-surface-sunken/40 px-3.5 py-2.5">
						<dt class="flex items-center gap-2">
							{@render code('2-hop')}
							<span class="font-medium text-ink">Indirect VNDB connection</span>
						</dt>
						<dd class="mt-1.5 leading-relaxed">{TWO_HOP_MEANING}</dd>
					</div>
				</dl>
			</div>
		</div>
	</section>

	<!-- 2. Scores, overlap and mobility -->
	<section id="scores" class="sheet p-5" aria-labelledby="key-scores">
		<h2 id="key-scores" class="text-lg font-semibold tracking-tight text-ink">
			Scores, overlap &amp; mobility
		</h2>
		<dl class="mt-4 grid gap-4 text-sm text-ink-2">
			<div>
				<dt class="font-medium text-ink">Confidence tiers (0–100)</dt>
				<dd class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
					{#each TIERS as tier (tier)}
						<span class="inline-flex items-center gap-1.5">
							<TierBadge {tier} />
							<span class="tnum font-mono text-xs text-ink">{tierRange(tier)}</span>
						</span>
					{/each}
				</dd>
				<dd class="mt-1 leading-relaxed">
					How strongly the evidence supports an inference, not how close two brands are.
				</dd>
			</div>
			<div>
				<dt class="flex items-center gap-2 font-medium text-ink">
					<span>Evidence strength bars</span>
					<svg width="8" height="7" viewBox="0 0 8 7" aria-hidden="true">
						<rect x="0" y="4" width="2" height="3" fill="var(--ink-2)" />
						<rect x="3" y="2" width="2" height="5" fill="var(--ink-2)" />
						<rect x="6" y="0" width="2" height="7" fill="var(--ink-2)" />
					</svg>
				</dt>
				<dd class="mt-1 leading-relaxed">
					Inside evidence chips, 1 to 3 ascending bars mark how strong that individual clue is
					(3 bars = strongest). Click any chip to read the full detail behind it.
				</dd>
			</div>
			<div>
				<dt class="font-medium text-ink">{@render code('wt')} weighted overlap</dt>
				<dd class="mt-1 leading-relaxed">
					Shared core staff counted by mobility weight instead of raw headcount: anchored staff
					weigh more. People shared only through a co-developed title, and freelancers credited at
					more than {MOBILITY_SCORING_CAP} brands, are left out of scoring.
				</dd>
			</div>
			<div>
				<dt class="font-medium text-ink">Staff overlap (containment)</dt>
				<dd class="mt-1 leading-relaxed">
					Share of the smaller brand's core staff also credited at the larger brand on separate
					titles. High and lopsided overlap is the signature of a sub-brand.
				</dd>
			</div>
			<div>
				<dt class="font-medium text-ink">Timeline overlap</dt>
				<dd class="mt-1 grid gap-1 leading-relaxed">
					<span><span class="font-medium text-ink">Concurrent:</span> {TIMELINE_MEANING.concurrent}</span>
					<span><span class="font-medium text-ink">Handoff:</span> {TIMELINE_MEANING.handoff}</span>
					<span><span class="font-medium text-ink">Sequential:</span> {TIMELINE_MEANING.sequential}</span>
				</dd>
			</div>
			<div>
				<dt class="font-medium text-ink">VNDB score</dt>
				<dd class="mt-1 leading-relaxed">{VNDB_SCORE_HINT}</dd>
			</div>
			<div>
				<dt class="font-medium text-ink">Mobility (how many brands a person works at)</dt>
				<dd class="mt-2 grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
					{#each MOBILITY as m (m.level)}
						<span class="mt-0.5 flex items-center"><MobilityIndicator brandCount={m.sample} /></span>
						<span class="leading-relaxed">
							<span class="font-medium text-ink">{m.label}</span>
							<span class="tnum text-xs text-ink-3">({MOBILITY_RANGE_LABEL[m.level]})</span> —
							{MOBILITY_MEANING[m.level]}
						</span>
					{/each}
				</dd>
			</div>
		</dl>
	</section>

	<!-- 3. Shapes, roles & aliases -->
	<section id="shapes" class="sheet p-5" aria-labelledby="key-shapes">
		<h2 id="key-shapes" class="text-lg font-semibold tracking-tight text-ink">
			Shapes, roles &amp; aliases
		</h2>
		<dl class="mt-4 grid grid-cols-[3.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3.5 text-sm text-ink-2">
			<dt class="mt-1 flex items-center gap-1.5" aria-hidden="true">
				<RoleMark role="dev" size={10} /><RoleMark role="staff" size={10} /><RoleMark
					role="seiyuu"
					size={10}
				/>
			</dt>
			<dd class="leading-relaxed">
				<span class="font-medium text-ink">People</span>: filled square = core dev staff, hollow
				square = non-core dev, circle = seiyuu (voice actor).
			</dd>

			<dt id="roles" class="mt-0.5 text-xs font-medium text-ink-3">Core roles</dt>
			<dd class="flex flex-wrap gap-1.5">
				{#each CORE_ROLES as r (r)}
					<span class="inline-flex items-center gap-1 rounded-xs border border-rule bg-surface-sunken/50 pr-1.5 text-xs text-ink-2">
						<RolePill role={r} /><span>{roleMeta(r).label}</span>
					</span>
				{/each}
			</dd>

			<dt class="mt-0.5 text-xs font-medium text-ink-3">Other</dt>
			<dd class="flex flex-wrap gap-1.5">
				{#each OTHER_ROLES as r (r)}
					<span class="inline-flex items-center gap-1 rounded-xs border border-rule bg-surface-sunken/50 pr-1.5 text-xs text-ink-2">
						<RolePill role={r} /><span>{roleMeta(r).label}</span>
					</span>
				{/each}
			</dd>

			<dt class="mt-1 flex items-center gap-1.5" aria-hidden="true">
				<ProducerShape type="co" size={10} /><ProducerShape type="ng" size={10} /><ProducerShape
					type="in"
					size={10}
				/>
			</dt>
			<dd class="leading-relaxed">
				<span class="font-medium text-ink">Brands</span>: circle = company, rounded square =
				amateur group, diamond = individual.
			</dd>

			<dt class="mt-1 flex items-center"><EpistemicGlyph kind="alias-confirmed" size={13} /></dt>
			<dd class="leading-relaxed">
				<span class="font-medium text-ink">Confirmed alias</span>: another credited name recorded
				under the same VNDB staff entry (e.g. {@render code('s28')}).
			</dd>

			<dt class="mt-1 flex items-center"><EpistemicGlyph kind="alias-potential" size={13} /></dt>
			<dd class="leading-relaxed">
				<span class="font-medium text-ink">Potential alias</span>: a separate VNDB staff entry
				that may be the same person — inferred and never merged.
			</dd>

			<dt class="mt-1 flex items-center gap-1.5">
				<SwapMark size={12} class="text-ink" />
				<span class="font-mono text-xs font-semibold text-ink">≠</span>
			</dt>
			<dd class="leading-relaxed">
				<span class="font-medium text-ink">Pen-name switch</span>: confirmed alias changed when
				moving between brands ({@render code('≠')} marks the differing name in Compare tables).
			</dd>
		</dl>

		<div class="mt-5 border-t border-rule pt-4">
			<h3 class="caption text-ink-3">People &amp; credit terms</h3>
			<dl class="mt-3 grid gap-2.5 text-sm text-ink-2">
				<div>
					<dt class="inline font-medium text-ink">Core staff:</dt>
					<dd class="inline leading-relaxed">
						{CORE_STAFF_HINT.replace(/^Core staff:\s*/i, '')} Brand headers show this count.
					</dd>
				</div>
				<div>
					<dt class="inline font-medium text-ink">All dev staff / Other staff:</dt>
					<dd class="inline leading-relaxed">
						{ALL_DEV_STAFF_HINT.replace(/^All dev staff:\s*/i, '')} Because a brand's Roster lists
						everyone credited on its visual novels, the Roster total is larger than the header's core
						staff count.
					</dd>
				</div>
				<div>
					<dt class="inline font-medium text-ink">Seiyuu &amp; Dual:</dt>
					<dd class="inline leading-relaxed">
						{DISCIPLINE_MEANING.seiyuu} {DISCIPLINE_MEANING.dual}
					</dd>
				</div>
				<div>
					<dt class="inline font-medium text-ink">Lens (Core staff vs + Seiyuu):</dt>
					<dd class="inline leading-relaxed">
						{LENS_MEANING.core} {LENS_MEANING.seiyuu}
					</dd>
				</div>
				<div>
					<dt class="inline font-medium text-ink">Edition credit:</dt>
					<dd class="inline leading-relaxed">{EDITION_CREDIT_HINT}</dd>
				</div>
				<div>
					<dt class="inline font-medium text-ink">Co-movers:</dt>
					<dd class="inline leading-relaxed">{CO_MOVER_HINT}</dd>
				</div>
			</dl>
		</div>
	</section>

	<!-- 4. Search shortcuts & VNDB IDs -->
	<section id="search" class="sheet p-5 lg:col-span-2" aria-labelledby="key-search">
		<div class="flex flex-wrap items-center gap-2.5">
			<h2 id="key-search" class="text-lg font-semibold tracking-tight text-ink">
				Search shortcuts &amp; VNDB IDs
			</h2>
			<span class="inline-flex items-center gap-1 text-xs text-ink-3">
				Focus search from anywhere with {@render code('Ctrl')}/{@render code('⌘')}+{@render code('K')}
			</span>
		</div>
		<dl class="mt-4 grid gap-3 text-sm text-ink-2 sm:grid-cols-2 lg:grid-cols-3">
			<div class="rounded-sm border border-rule bg-surface-sunken/40 px-3.5 py-2.5">
				<dt class="flex items-center gap-2">{@render code('p:key')}<span class="font-medium text-ink">Brands only</span></dt>
				<dd class="mt-1">Prefix with {@render code('p:')} to search producers and studios only.</dd>
			</div>
			<div class="rounded-sm border border-rule bg-surface-sunken/40 px-3.5 py-2.5">
				<dt class="flex items-center gap-2">{@render code('s:maeda')}<span class="font-medium text-ink">Staff &amp; seiyuu</span></dt>
				<dd class="mt-1">Prefix with {@render code('s:')} to search staff, aliases and voice actors.</dd>
			</div>
			<div class="rounded-sm border border-rule bg-surface-sunken/40 px-3.5 py-2.5">
				<dt class="flex items-center gap-2">{@render code('v:clannad')}<span class="font-medium text-ink">Visual novels</span></dt>
				<dd class="mt-1">Prefix with {@render code('v:')} to search visual novel titles only.</dd>
			</div>
			<div class="rounded-sm border border-rule bg-surface-sunken/40 px-3.5 py-2.5">
				<dt class="flex items-center gap-2">{@render code('p24 vs p49')}<span class="font-medium text-ink">Direct compare</span></dt>
				<dd class="mt-1">Type two producer IDs with {@render code('vs')} to jump straight into Compare.</dd>
			</div>
			<div class="rounded-sm border border-rule bg-surface-sunken/40 px-3.5 py-2.5 sm:col-span-2">
				<dt class="flex items-center gap-1.5">
					{@render code('p24')} {@render code('s28')} {@render code('v4')}
					<span class="ml-1 font-medium text-ink">VNDB ID prefixes</span>
				</dt>
				<dd class="mt-1">
					{@render code('p')} = producer (brand), {@render code('s')} = staff/seiyuu entry,
					{@render code('v')} = visual novel. Typing any VNDB ID jumps straight to that record.
				</dd>
			</div>
		</dl>
	</section>
</div>
