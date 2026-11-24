/**
 * Itemised evidence behind every inference (DESIGN §2.2 rule 5, §5.5).
 * An inferred badge is never shown without a reachable breakdown: these
 * builders turn the classifier's numbers into neutral, countable facts.
 */
import type { InferredBrandLink, PotentialAliasCandidate } from './types.ts';
import { timelineTag, type PairNames } from './relations.ts';
import { MOBILITY_THRESHOLDS } from './roles.ts';
import { plural } from './util.ts';

export type EvidenceType =
	| 'shared_staff'
	| 'containment'
	| 'timeline'
	| 'shared_series'
	| 'shared_link'
	| 'co_release'
	| 'explicit_2hop'
	| 'separate_owners'
	| 'staff_flow'
	| 'shared_seiyuu'
	| 'shared_character'
	| 'bio_xref'
	| 'name_overlap'
	| 'complementary_timeline'
	| 'shared_brands'
	| 'rating_split'
	| 'co_credit'
	| 'listed_apart';

export interface EvidenceItem {
	label: string;
	href?: string;
	external?: boolean;
}

export interface Evidence {
	type: EvidenceType;
	label: string;
	/** Mono value shown after the label. */
	value?: string;
	strength: 1 | 2 | 3;
	/** Plain-count explanation shown when the tag is opened. */
	detail: string;
	/** Underlying rows, when the dump carries them. */
	items?: EvidenceItem[];
	/** True for a fact that argues *against* the inference. */
	counter?: boolean;
}

function pct(v: number): string {
	return `${Math.round(v * 100)}%`;
}

/**
 * How the two directions of staff movement are written.
 *  - `focus`: read from the left brand, which is the page's subject: `out 5 / in 7`.
 *  - `slots`: the page labels the brands A and B: `A→B 5, B→A 7`.
 */
export type FlowStyle = 'focus' | 'slots';

/** One name for a romanised / original-script pair, in the reader's name order. */
export type ShownName = (name: string, original?: string | null) => string;

/**
 * Evidence for an inferred brand link, strongest first in the fixed order of §8.2.
 *
 * A stored link has a fixed A and B. `leftId` names the brand the reader sees
 * first (a producer page's focus, or slot A on Compare): when that is the
 * link's B, every directional value is turned round so it still reads left to
 * right. Without it the link's own A and B order is used.
 *
 * `names` are the brand names as the page prints them (the reader's name
 * order), keyed to the link's own A and B. `shown` does the same for the
 * people listed under an opened tag: pass `shownName`.
 */
export function brandEvidence(
	link: InferredBrandLink,
	leftId?: string,
	flowStyle: FlowStyle = leftId ? 'focus' : 'slots',
	names?: PairNames,
	shown: ShownName = (name) => name
): Evidence[] {
	const out: Evidence[] = [];
	const swap = leftId === link.pidB;
	const nameA = names?.a ?? link.nameA;
	const nameB = names?.b ?? link.nameB;
	const left = swap
		? { name: nameB, containment: link.containmentBInA, flowOut: link.flowBToA }
		: { name: nameA, containment: link.containmentAInB, flowOut: link.flowAToB };
	const right = swap
		? { name: nameA, containment: link.containmentAInB, flowOut: link.flowAToB }
		: { name: nameB, containment: link.containmentBInA, flowOut: link.flowBToA };
	const coDevOnly = link.coDevOnlyStaff ?? 0;
	/** Shared core staff who worked at both brands on titles the two did not make together. */
	const independent = link.sharedCoreStaff - coDevOnly;

	// The record places the two under different owners. When that is why the
	// pair reads as partners (and not as sisters or parent and imprint) it comes
	// first: it is the reason for the class, and must not sit in a hidden note.
	const ownersNote = (link.evidence ?? []).find(
		(e) =>
			e.startsWith('VNDB places each under a different parent company') ||
			e.startsWith('VNDB places the two in separate ownership groups')
	);
	if (ownersNote) {
		const reclassified = ownersNote.includes('read as a partnership');
		const placement = /\(([^()]*(?:\([^()]*\)[^()]*)*)\)/.exec(ownersNote)?.[1] ?? null;
		out.push({
			type: 'separate_owners',
			label: 'Separate owners in VNDB',
			strength: 3,
			detail:
				`VNDB's own relations place the two brands under different owners${placement ? ` (${placement})` : ''}.` +
				(reclassified
					? ' Sister brands and imprints share an owner, so the shared staff are read here as a partnership between separate companies.'
					: '') +
				(link.inferredType === 'partner' && link.coDevVns < 2
					? ' Short of recurring co-development, such a pair is never rated High.'
					: '')
		});
	}

	if (link.sharedCoreStaff > 0) {
		const wt = link.weightedCoreScore;
		out.push({
			type: 'shared_staff',
			label: 'Shared staff',
			value: `${link.sharedCoreStaff}`,
			strength: wt >= 5 ? 3 : wt >= 2 ? 2 : 1,
			detail:
				`${plural(link.sharedCoreStaff, 'core staff member')} credited at both brands` +
				(link.lowMobCoreStaff > 0
					? ` (${link.lowMobCoreStaff} of them work at ${MOBILITY_THRESHOLDS.anchoredMax} or fewer studios).`
					: '.') +
				(coDevOnly > 0
					? ` ${coDevOnly} shared only through co-developed titles; ${independent} worked at both on separate titles.`
					: ''),
			items: link.topShared
				.filter((p) => !p.isSeiyuu)
				.map((p) => ({ label: shown(p.name, p.original), href: `/staff/${p.sid}` }))
		});
	}

	// Containment is measured over the independent people, so it takes two of
	// them to say anything: the same floor the build script's own note uses.
	if (link.maxContainment >= 0.2 && independent >= 2) {
		const smaller = left.containment >= right.containment ? left.name : right.name;
		out.push({
			type: 'containment',
			label: 'Staff overlap',
			value: `${pct(link.maxContainment)} of ${smaller}`,
			strength: link.maxContainment >= 0.6 ? 3 : link.maxContainment >= 0.35 ? 2 : 1,
			detail: `${pct(left.containment)} of ${left.name}'s credited core staff also appear at ${right.name}; ${pct(right.containment)} of ${right.name}'s appear at ${left.name}.${coDevOnly > 0 ? ' People shared only through co-developed titles are left out.' : ''} A lopsided pair is the usual signature of a sub-brand.`
		});
	}

	const tl = timelineTag(link);
	if (tl.kind !== 'unknown') {
		out.push({
			type: 'timeline',
			label: tl.label,
			strength:
				tl.kind === 'concurrent' ? (tl.years >= 5 ? 2 : 1) : link.inferredType === 'successor' ? 2 : 1,
			detail:
				tl.kind === 'concurrent'
					? tl.years === 1
						? 'The active spans share a single year: one brand was active for that year only, inside the other brand\'s run.'
						: `Both brands released visual novels in the same ${tl.years} years.`
					: tl.kind === 'handoff'
						? 'The active spans touch in a single year: one brand stops as the other starts.'
						: `The active spans do not overlap; ${Math.abs(tl.years)} year${Math.abs(tl.years) === 1 ? '' : 's'} separate them.`
		});
	}

	if (link.crossVnRelations > 0) {
		out.push({
			type: 'shared_series',
			label: 'Shared series',
			value: `×${link.crossVnRelations}`,
			strength: link.crossVnRelations >= 4 ? 3 : link.crossVnRelations >= 2 ? 2 : 1,
			detail: `${plural(link.crossVnRelations, 'VNDB relation')} (sequel, same series, fandisc, shared characters) connect a visual novel of one brand to a visual novel of the other.`
		});
	}

	if (link.sharedExtlinks > 0) {
		out.push({
			type: 'shared_link',
			label: 'Shared external link',
			value: `×${link.sharedExtlinks}`,
			strength: 3,
			detail: `${plural(link.sharedExtlinks, 'external link')} (website or account) recorded in VNDB for both brands.`
		});
	}

	if (link.coDevVns > 0) {
		out.push({
			type: 'co_release',
			label: 'Co-developed VNs',
			value: `×${link.coDevVns}`,
			strength: link.coDevVns >= 3 ? 3 : link.coDevVns >= 2 ? 2 : 1,
			detail: `${plural(link.coDevVns, 'visual novel')} credit both brands as original developer.`
		});
	}

	if (left.flowOut > 0 || right.flowOut > 0) {
		// `left.flowOut` left the left brand for the right one; `right.flowOut` came the other way.
		const max = Math.max(left.flowOut, right.flowOut);
		// Core staff only, and not the freelancers at dozens of brands: a narrower
		// count than a timeline of everyone credited at both, and labelled as such.
		out.push({
			type: 'staff_flow',
			label: 'Core staff moves',
			value:
				flowStyle === 'focus'
					? `out ${left.flowOut} / in ${right.flowOut}`
					: `A→B ${left.flowOut}, B→A ${right.flowOut}`,
			strength: max >= 6 ? 3 : max >= 3 ? 2 : 1,
			detail: `${left.flowOut} core staff moved from ${left.name} to ${right.name}; ${right.flowOut} moved from ${right.name} to ${left.name}.`
		});
	}

	if (link.explicitDist != null && link.explicitDist >= 2) {
		out.push({
			type: 'explicit_2hop',
			label: `${link.explicitDist} hops apart in VNDB`,
			strength: link.explicitDist === 2 ? 2 : 1,
			detail:
				link.explicitDist === 2
					? 'VNDB does not link these two directly, but both connect to a common producer:'
					: `Shortest chain of VNDB producer relations connecting the two (${link.explicitDist} steps):`
		});
	}

	if (link.sharedSeiyuu > 0) {
		out.push({
			type: 'shared_seiyuu',
			label: 'Shared seiyuu',
			value: `${link.sharedSeiyuu}`,
			strength: link.weightedSeiyuuScore >= 12 ? 2 : 1,
			detail: `${plural(link.sharedSeiyuu, 'voice actor')} cast at both brands. Because voice actors routinely work across many studios, cast overlap alone is a weak clue.`,
			items: link.topShared
				.filter((p) => p.isSeiyuu)
				.map((p) => ({ label: shown(p.name, p.original), href: `/staff/${p.sid}` }))
		});
	}

	return out;
}

/**
 * A shared character's name. VNDB often keeps one entry per game for the same
 * character, so one name can stand for several shared entries: `Suginami (×4)`.
 */
export function sampleCharLabel(ch: { name: string; count?: number }): string {
	return ch.count && ch.count > 1 ? `${ch.name} (×${ch.count})` : ch.name;
}

const NAME_MATCH_LABEL: Record<string, string> = {
	exact_normalized: 'Same normalised name',
	swapped_order: 'Same name, order swapped'
};

/** Display names of the one-entry-per-person databases the build script checks. */
const AUTHORITY_LABEL: Record<string, string> = {
	anidb: 'AniDB',
	wikidata: 'Wikidata',
	vgmdb: 'VGMdb',
	mobygames: 'MobyGames',
	anison: 'Anison'
};

/** Evidence for a potential (unconfirmed) alias pair, strongest first. */
export function aliasEvidence(
	c: PotentialAliasCandidate,
	shown: ShownName = (name) => name
): Evidence[] {
	const out: Evidence[] = [];
	const raw = c.evidence ?? [];

	if (c.sharedChars > 0) {
		out.push({
			type: 'shared_character',
			label: 'Shared character',
			value: `×${c.sharedChars}`,
			strength: c.sharedChars >= 2 ? 3 : 2,
			detail:
				`Both records are credited as the voice of ${plural(c.sharedChars, 'character')}.` +
				(c.sameVnSharedChars > 0
					? ` ${c.sameVnSharedChars} of those within the same visual novel, which can also mean a recast or a shared role.`
					: ' Never within the same visual novel: different releases credit different records.'),
			items: (c.sampleChars ?? []).map((ch) => ({
				label: sampleCharLabel(ch),
				href: `https://vndb.org/${ch.cid}`,
				external: true
			}))
		});
	}

	if (c.sharedExtlinks > 0) {
		const quote = raw.find((e) => e.toLowerCase().startsWith('shared external link'));
		out.push({
			type: 'shared_link',
			label: 'Shared external link',
			value: `×${c.sharedExtlinks}`,
			strength: 3,
			detail: quote ?? `${plural(c.sharedExtlinks, 'external link')} recorded in VNDB for both records.`
		});
	}

	if (c.bioCrossref) {
		const quote = raw.find((e) => e.toLowerCase().includes('bio cross-reference'));
		out.push({
			type: 'bio_xref',
			label: 'Bio cross-reference',
			strength: 3,
			detail: quote ?? "One record's VNDB description mentions the other."
		});
	}

	if (c.nameMatchKind) {
		const withStudio = c.sharedBrands > 0;
		out.push({
			type: 'name_overlap',
			label: withStudio
				? 'Name match + studio overlap'
				: (NAME_MATCH_LABEL[c.nameMatchKind] ?? 'Name match'),
			strength: withStudio ? 2 : 1,
			detail: `${NAME_MATCH_LABEL[c.nameMatchKind] ?? 'The names match'} after normalising spacing, case and romanisation${
				withStudio ? `, and both records are credited at ${plural(c.sharedBrands, 'shared brand')}` : ''
			}. Namesakes exist, so a name alone is weak.`
		});
	}

	if (c.sharedBrands > 0) {
		const items = (c.sampleBrands ?? []).map((b) => ({
			label: shown(b.name, b.original),
			href: `/producer/${b.pid}`
		}));
		// `coCreditVns` excludes releases where both voice the same character, so
		// "never on the same VN" also needs `sameVnSharedChars` to be zero.
		if (c.coCreditVns === 0 && c.sameVnSharedChars === 0) {
			out.push({
				type: 'complementary_timeline',
				label: 'Never co-credited, same studios',
				value: `×${c.sharedBrands}`,
				strength: c.sharedBrands >= 3 ? 2 : 1,
				detail: `Both records are credited at ${plural(c.sharedBrands, 'brand')} yet never on the same visual novel. One person under two names would produce exactly this pattern.`,
				items
			});
		} else if (!c.nameMatchKind || c.coCreditVns === 0) {
			out.push({
				type: 'shared_brands',
				label: 'Shared brands',
				value: `×${c.sharedBrands}`,
				strength: c.sharedBrands >= 4 ? 2 : 1,
				detail: `Both records are credited at ${plural(c.sharedBrands, 'brand')}.`,
				items
			});
		}
	}

	// Same rule as the build script: it reports (and scores) the split from 0.45
	// up, and only when at least one of the two records has voice credits. Between
	// two development records the split is neither scored nor shown.
	if (
		c.eroSplit != null &&
		c.eroSplit >= 0.45 &&
		(c.seiyuuVnCountA > 0 || c.seiyuuVnCountB > 0)
	) {
		const quote = raw.find((e) => e.includes('R18/all-ages split'));
		out.push({
			type: 'rating_split',
			label: '18+ / all-ages split',
			value: pct(c.eroSplit),
			strength: c.eroSplit >= 0.7 ? 2 : 1,
			detail:
				quote ??
				'One record works almost only on 18+ titles and the other on all-ages titles: a common reason for keeping two names.'
		});
	}

	if (c.coCreditVns > 0) {
		out.push({
			type: 'co_credit',
			label: 'Co-credited',
			value: `×${c.coCreditVns}`,
			strength: 1,
			counter: true,
			detail: `The two records are credited in different parts on ${plural(c.coCreditVns, 'visual novel')}. That argues against one person, unless a release credits the same person twice. Releases where both voice the same character are not counted here.`
		});
	}

	const apart = c.listedApart ?? [];
	if (apart.length > 0) {
		const sites = apart.map((s) => AUTHORITY_LABEL[s] ?? s);
		// A strict personal ID or a bio statement outweighs the listings: the fact
		// is still shown, with what the classifier did about it.
		const note = raw.find((e) => e.startsWith('Note: listed as separate people'));
		const overridden = note?.includes('kept as the stronger evidence') ?? false;
		out.push({
			type: 'listed_apart',
			label: `Separate entries on ${sites.join(', ')}`,
			strength: apart.length >= 2 ? 3 : 2,
			counter: true,
			detail:
				`${sites.join(' and ')} ${apart.length === 1 ? 'keeps' : 'each keep'} one entry per person, and ${apart.length === 1 ? 'it lists' : 'they list'} these two records under different entries. That argues against one person, though a pen name sometimes gets an entry of its own.` +
				(overridden
					? ' The score is not lowered here: a shared personal ID or a VNDB bio statement is the stronger evidence.'
					: ' The score is lowered for it, and the pair is never rated High.')
		});
	}

	return out;
}

/** Hedged one-liner for a potential alias pair. Never asserts identity. */
export function aliasVerdict(c: PotentialAliasCandidate): string {
	if (c.confidenceTier === 'high') return 'Likely the same person under two VNDB records.';
	if (c.confidenceTier === 'medium') return 'Possibly the same person under two VNDB records.';
	return 'Weak signal: these two records may belong to one person.';
}
