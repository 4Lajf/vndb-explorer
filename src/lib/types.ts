export type ProducerType = 'co' | 'ng' | 'in';

export type ExplicitRelationCode =
	| 'imp'
	| 'ipa'
	| 'sub'
	| 'par'
	| 'spa'
	| 'ori'
	| 'old'
	| 'new';

export type InferredBrandType = 'subbrand' | 'sister' | 'successor' | 'partner';
export type ConfidenceTier = 'high' | 'medium' | 'speculative';
export type StaffDiscipline = 'core' | 'seiyuu' | 'dual' | 'other';

export interface CorpusStats {
	dumpTimestamp: string;
	builtAt: string;
	producersTotal: number;
	commercialProducers: number;
	staffTotal: number;
	seiyuuTotal: number;
	aliasesTotal: number;
	vnsTotal: number;
	explicitRelationPairs: number;
	inferredBrandLinks: number;
	unlinkedInferredBrandLinks: number;
	potentialAliasCount: number;
	potentialSeiyuuAliasCount: number;
	potentialStaffAliasCount: number;
}

export interface SearchResult {
	kind: 'producer' | 'staff' | 'vn';
	id: string;
	name: string;
	original: string | null;
	subtitle: string;
	badge: string;
	extra?: string;
	/** Number of potential (inferred, unconfirmed) alias candidates for a staff record. */
	potentialAliasCount?: number;
}

export interface ProducerSummary {
	id: string;
	type: ProducerType;
	lang: string | null;
	name: string;
	latin: string | null;
	alias: string | null;
	vnCount: number;
	staffCount: number;
	seiyuuCount: number;
	firstYear: number | null;
	lastYear: number | null;
	/** Original-script name when it differs from the romanised display name. */
	original?: string | null;
}

export interface ExplicitRelationItem {
	pid: string;
	name: string;
	latin: string | null;
	type: ProducerType;
	lang: string | null;
	relation: ExplicitRelationCode;
	edgeKind: 'ownership' | 'lineage';
	firstYear: number | null;
	lastYear: number | null;
	vnCount: number;
	/** Credited core staff, for the graph's Inspector. */
	staffCount?: number;
	original?: string | null;
}

export interface SharedPersonPreview {
	sid: string;
	name: string;
	latin: string | null;
	/** Original-script name when it differs from `name`. */
	original?: string | null;
	roles: string[];
	brandCount: number;
	isSeiyuu: boolean;
	/** The name to show for the tenure at A: a pen name before the primary name. */
	aliasA?: string | null;
	aliasOriginalA?: string | null;
	/** By VNDB alias id: `aliasA` is not the record's primary name. */
	aliasNonPrimaryA?: boolean;
	/** How many aliases the person was credited under at A. */
	aliasCountA?: number;
	/** Full list of aliases credited at A when > 1 (hydrated on detail views). */
	aliasesA?: Array<{ name: string; original?: string | null }>;
	aliasB?: string | null;
	aliasOriginalB?: string | null;
	aliasNonPrimaryB?: boolean;
	aliasCountB?: number;
	/** Full list of aliases credited at B when > 1 (hydrated on detail views). */
	aliasesB?: Array<{ name: string; original?: string | null }>;
	/** Credited at both brands, under no alias in common (by alias id, over every alias). */
	aliasSwitched?: boolean;
	yearsA?: [number | null, number | null];
	yearsB?: [number | null, number | null];
	hasPotentialAlias?: boolean;
}

export interface InferredBrandLink {
	pidA: string;
	nameA: string;
	latinA: string | null;
	typeA: ProducerType;
	langA: string | null;
	firstYearA: number | null;
	lastYearA: number | null;
	staffCountA: number;
	pidB: string;
	nameB: string;
	latinB: string | null;
	typeB: ProducerType;
	langB: string | null;
	firstYearB: number | null;
	lastYearB: number | null;
	staffCountB: number;
	inferredType: InferredBrandType;
	direction: 'a_to_b' | 'b_to_a' | 'bidirectional';
	confidence: number;
	confidenceTier: ConfidenceTier;
	explicitRelation: ExplicitRelationCode | null;
	explicitDist: number | null;
	/** Every core staff member credited at both brands: the count Compare lists. */
	sharedCoreStaff: number;
	/**
	 * The subset the classifier scored: people credited at more than 50 brands
	 * generate no pair and carry no weight, so they are counted but not scored.
	 */
	scoredCoreStaff: number;
	lowMobCoreStaff: number;
	/**
	 * Shared core staff whose only link between the two brands is a co-developed
	 * VN (a subset of `sharedCoreStaff`). Scored as part of the co-development.
	 */
	coDevOnlyStaff: number;
	/** Weight of the independent shared core staff: co-dev-only people excluded. */
	weightedCoreScore: number;
	/** Containment counts independent shared core staff only. */
	containmentAInB: number;
	containmentBInA: number;
	maxContainment: number;
	jaccardCore: number;
	sharedSeiyuu: number;
	weightedSeiyuuScore: number;
	coDevVns: number;
	crossVnRelations: number;
	sharedExtlinks: number;
	yearOverlap: number;
	flowAToB: number;
	flowBToA: number;
	evidence: string[];
	topShared: SharedPersonPreview[];
	originalA?: string | null;
	originalB?: string | null;
	vnCountA?: number;
	vnCountB?: number;
	/** True when the link only clears the display filter once voice-cast overlap is counted. */
	seiyuuDriven?: boolean;
}

export interface MigrationPartner {
	pid: string;
	name: string;
	latin: string | null;
	type: ProducerType;
	count: number;
	/** Moves with a core credit at both ends. With `seiyuuCount` it can fall short of `count`. */
	coreCount: number;
	seiyuuCount: number;
	avgGapYears: number | null;
	explicitRelation: ExplicitRelationCode | null;
	people: Array<{
		sid: string;
		name: string;
		original?: string | null;
		isSeiyuu: boolean;
		fromFirstYear?: number | null;
		fromLastYear: number | null;
		toFirstYear: number | null;
		toLastYear?: number | null;
		aliasChanged: boolean;
		gapYears?: number | null;
	}>;
	original?: string | null;
	minGapYears?: number | null;
	maxGapYears?: number | null;
}

/** Head counts for the migration diagram's centre pillar and its residual buckets. */
export interface MigrationSummary {
	totalPeople: number;
	corePeople: number;
	seiyuuPeople: number;
	/** People with no recorded earlier brand before their first credit here. */
	debutedHereCount: number;
	/** People with no recorded later brand and no credit here in the last 3 years. */
	noLaterCreditsCount: number;
	/** People with no recorded later brand and a credit here in the last 3 years. */
	stillActiveCount: number;
	latestYear: number;
}

export interface BrandRosterMember {
	sid: string;
	name: string;
	latin: string | null;
	gender: string | null;
	primaryDiscipline: StaffDiscipline;
	isSeiyuu: boolean;
	isCoreStaff: boolean;
	vnCountAtBrand: number;
	coreVnCountAtBrand: number;
	seiyuuVnCountAtBrand: number;
	/** Distinct VNs here with any development (non-voice) credit. */
	devVnCountAtBrand: number;
	firstYear: number | null;
	lastYear: number | null;
	roles: string[];
	aliasesAtBrand: string[];
	/** By VNDB alias id, not by romanised string. */
	usedNonPrimaryAlias: boolean;
	/** The aliases at this brand that are not the primary name, as labels. */
	penNames: string[];
	totalBrands: number;
	potentialAliasCount: number;
	original?: string | null;
}

export interface BrandGraphNode {
	id: string;
	name: string;
	latin: string | null;
	type: ProducerType;
	vnCount: number;
	staffCount: number;
	firstYear: number | null;
	lastYear: number | null;
	isCenter?: boolean;
	isExplicitNeighbor?: boolean;
	original?: string | null;
}

export interface BrandGraphEdge {
	source: string;
	target: string;
	kind: 'explicit_ownership' | 'explicit_lineage' | 'inferred';
	label: string;
	relationCode?: ExplicitRelationCode;
	inferredType?: InferredBrandType;
	confidence?: number;
	sharedCoreStaff?: number;
	sharedSeiyuu?: number;
	coDevVns?: number;
	direction?: 'a_to_b' | 'b_to_a' | 'bidirectional';
	explicitRelation?: ExplicitRelationCode | null;
	seiyuuDriven?: boolean;
}

export interface PotentialAliasCandidate {
	sidA: string;
	nameA: string;
	latinA: string | null;
	genderA: string | null;
	langA: string | null;
	disciplineA: StaffDiscipline;
	vnCountA: number;
	seiyuuVnCountA: number;
	firstYearA: number | null;
	lastYearA: number | null;
	eroRateA: number | null;
	sidB: string;
	nameB: string;
	latinB: string | null;
	genderB: string | null;
	langB: string | null;
	disciplineB: StaffDiscipline;
	vnCountB: number;
	seiyuuVnCountB: number;
	firstYearB: number | null;
	lastYearB: number | null;
	eroRateB: number | null;
	category: 'seiyuu' | 'staff' | 'mixed';
	confidence: number;
	confidenceTier: ConfidenceTier;
	sharedChars: number;
	sameVnSharedChars: number;
	sharedExtlinks: number;
	bioCrossref: boolean;
	nameMatchKind: string | null;
	sharedBrands: number;
	/**
	 * VNs that credit both records in *different* parts. Releases where both voice
	 * the same character are counted under `sameVnSharedChars`, not here.
	 */
	coCreditVns: number;
	eroSplit: number | null;
	evidence: string[];
	/**
	 * One-entry-per-person databases (site keys: `anidb`, `wikidata`, `vgmdb`,
	 * `mobygames`, `anison`) that keep a separate entry for each record. Counter-
	 * evidence: by that database's account these are two people.
	 */
	listedApart?: string[];
	/** Distinct names: `count` is how many shared character entries carry that name. */
	sampleChars?: Array<{ cid: string; name: string; count?: number }>;
	sampleBrands?: Array<{ pid: string; name: string; original?: string | null }>;
	originalA?: string | null;
	originalB?: string | null;
	brandCountA?: number;
	brandCountB?: number;
}

/** One name a person was credited under on a timeline event. */
export interface EventAlias {
	name: string;
	/** Original-script form when it differs from `name`. */
	original: string | null;
	/** Not the record's primary name. */
	isNonPrimary: boolean;
	/**
	 * A pen name romanised exactly like the primary name (麻枝 准 beside 前田 純,
	 * both "Maeda Jun"): only the script tells the two apart, so labels print it.
	 */
	sameRomanisation?: boolean;
	/** Used on a development credit of the event. */
	dev: boolean;
	/** Used on a voice credit of the event. */
	voice: boolean;
}

export interface StaffTimelineEvent {
	vid: string;
	vnTitle: string;
	vnOriginal: string | null;
	year: number | null;
	/** Original developer. Null for edition credits and for VNs with no developer. */
	pid: string | null;
	producerName: string | null;
	producerOriginal: string | null;
	producerType: ProducerType | null;
	roles: string[];
	isSeiyuu: boolean;
	characters: Array<{ cid: string; name: string; original?: string | null }>;
	/**
	 * Every alias credited on this event. One VN can credit a person under two
	 * names (a voice part under a stage name, a song under another): all are kept.
	 */
	aliases: EventAlias[];
	/** The alias to show where there is room for one: a pen name before the primary name. */
	aliasUsed: string;
	/** Any alias on the event is not the primary name. */
	isNonPrimaryAlias: boolean;
	hasEro: boolean;
	hasAllAges: boolean;
	/** A credit on a later edition (port, localisation): it carries no brand. */
	isEdition?: boolean;
}

export interface StaffBrandTrack {
	pid: string;
	name: string;
	latin: string | null;
	type: ProducerType;
	vnCount: number;
	coreVnCount: number;
	seiyuuVnCount: number;
	firstYear: number | null;
	lastYear: number | null;
	roles: string[];
	aliasesUsed: string[];
	/** By VNDB alias id, not by romanised string. */
	usedNonPrimaryAlias: boolean;
	/** The aliases at this brand that are not the primary name, as labels. */
	penNames: string[];
	shareOfCareer: number;
	original?: string | null;
}

export interface StaffTransition {
	fromPid: string;
	fromName: string;
	fromOriginal?: string | null;
	toPid: string;
	toName: string;
	toOriginal?: string | null;
	fromFirstYear: number | null;
	fromLastYear: number | null;
	toFirstYear: number | null;
	toLastYear: number | null;
	gapYears: number | null;
	aliasChanged: boolean;
	explicitRelation: ExplicitRelationCode | null;
}

export interface StaffCollaborator {
	sid: string;
	name: string;
	latin: string | null;
	primaryDiscipline: StaffDiscipline;
	sharedVns: number;
	sharedBrands: number;
	brandNames: string[];
	brands: Array<{ pid: string; name: string; original: string | null }>;
	roles: string[];
	potentialAliasCount: number;
	original?: string | null;
}

export interface PopularPersonEntry {
	id: string;
	name: string;
	original: string | null;
	roles: string[];
	totalVotes: number;
	weightedRating: number | null;
	vnCount: number;
	brandCount: number;
	firstYear: number | null;
	lastYear: number | null;
	aliasCount: number;
	potentialAliasCount: number;
	topVnId: string | null;
	topVnTitle: string | null;
	topVnOriginal: string | null;
	topVnVotes: number;
}

export interface PopularStudioEntry {
	id: string;
	name: string;
	original: string | null;
	type: ProducerType;
	lang: string | null;
	totalVotes: number;
	weightedRating: number | null;
	vnCount: number;
	staffCount: number;
	firstYear: number | null;
	lastYear: number | null;
	topVnId: string | null;
	topVnTitle: string | null;
	topVnOriginal: string | null;
}

export interface PopularVnEntry {
	id: string;
	title: string;
	original: string | null;
	firstYear: number | null;
	rating: number | null;
	votes: number;
	hasEro: boolean;
	hasAllAges: boolean;
	developerId: string | null;
	developerName: string | null;
	developerOriginal: string | null;
}

export interface CareerRecordEntry {
	id: string;
	name: string;
	original: string | null;
	roles: string[];
	isSeiyuu: boolean;
	firstYear: number | null;
	lastYear: number | null;
	spanYears: number;
	vnCount: number;
	brandCount: number;
	aliasCount: number;
	potentialAliasCount: number;
}

export interface DecadeStatEntry {
	decade: number;
	label: string;
	vnCount: number;
	totalVotes: number;
	weightedRating: number | null;
	eroPct: number;
}

export interface PopularityRankings {
	summary: {
		totalVotes: number;
		ratedVns: number;
		weightedAvgRating: number | null;
		eroPct: number;
		creatorsTotal: number;
		seiyuuTotal: number;
	};
	popularCreators: PopularPersonEntry[];
	topRatedCreators: PopularPersonEntry[];
	popularSeiyuu: PopularPersonEntry[];
	topRatedSeiyuu: PopularPersonEntry[];
	popularStudios: PopularStudioEntry[];
	topRatedStudios: PopularStudioEntry[];
	topVnsByVotes: PopularVnEntry[];
	topVnsByRating: PopularVnEntry[];
	longestCareers: CareerRecordEntry[];
	mostAliases: CareerRecordEntry[];
	decades: DecadeStatEntry[];
}
