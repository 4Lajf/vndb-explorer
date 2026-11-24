<script module lang="ts">
	export type ProofContext =
		| {
				kind: 'brand';
				pidA: string;
				pidB: string;
				nameA: string;
				nameB: string;
		  }
		| {
				kind: 'alias';
				sidA: string;
				sidB: string;
				nameA: string;
				nameB: string;
		  };
</script>

<script lang="ts">
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import EvidenceTag from './EvidenceTag.svelte';
	import RolePills from '../people/RolePills.svelte';
	import StaffVnsButton from '../people/StaffVnsButton.svelte';
	import YearSpan from '../identity/YearSpan.svelte';
	import ProducerShape from '../identity/ProducerShape.svelte';
	import type { Evidence, EvidenceType } from '#lib/evidence.ts';
	import { EXPLICIT_META, KIND_COLOR } from '#lib/relations.ts';
	import { fetchProof } from '#lib/proof-cache.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';
	import { VN_RELATION_LABELS, num, plural, vndbHref, yearSpan } from '#lib/util.ts';
	import type { ExplicitRelationCode, ProducerType } from '#lib/types.ts';

	type BrandProofPayload =
		| {
				kind: 'people';
				total: number;
				people: Array<{
					sid: string;
					name: string;
					original: string | null;
					brandCount: number;
					vnsA: number;
					vnsB: number;
					firstYearA: number | null;
					lastYearA: number | null;
					firstYearB: number | null;
					lastYearB: number | null;
					rolesA: string[];
					rolesB: string[];
				}>;
		  }
		| {
				kind: 'vn_relations';
				total: number;
				pairs: Array<{
					vidA: string;
					titleA: string;
					originalA: string | null;
					yearA: number | null;
					relation: string;
					vidB: string;
					titleB: string;
					originalB: string | null;
					yearB: number | null;
				}>;
		  }
		| {
				kind: 'vns';
				total: number;
				vns: Array<{ vid: string; title: string; original: string | null; year: number | null }>;
		  }
		| {
				kind: 'extlinks';
				total: number;
				links: Array<{ site: string; value: string; url: string | null }>;
		  }
		| {
				kind: 'moves';
				total: number;
				aToB: Array<{
					sid: string;
					name: string;
					original: string | null;
					fromFirstYear?: number | null;
					fromLastYear: number | null;
					toFirstYear: number | null;
					toLastYear?: number | null;
					aliasChanged: boolean;
				}>;
				bToA: Array<{
					sid: string;
					name: string;
					original: string | null;
					fromFirstYear?: number | null;
					fromLastYear: number | null;
					toFirstYear: number | null;
					toLastYear?: number | null;
					aliasChanged: boolean;
				}>;
		  }
		| {
				kind: 'path';
				total: number;
				path: Array<{ id: string; name: string; original: string | null; relationFromPrev?: ExplicitRelationCode }>;
		  }
		| {
				kind: 'owners';
				chainA: Array<{ id: string; name: string; original: string | null; relation?: ExplicitRelationCode }>;
				chainB: Array<{ id: string; name: string; original: string | null; relation?: ExplicitRelationCode }>;
		  };

	type AliasProofPayload =
		| {
				kind: 'characters';
				total: number;
				characters: Array<{
					cid: string;
					name: string;
					original: string | null;
					sameVn: boolean;
					vnsA: Array<{ vid: string; title: string; original: string | null; year: number | null }>;
					vnsB: Array<{ vid: string; title: string; original: string | null; year: number | null }>;
				}>;
		  }
		| {
				kind: 'extlinks';
				total: number;
				links: Array<{ site: string; value: string; url: string | null }>;
		  }
		| {
				kind: 'bios';
				bios: Array<{ sid: string; name: string; original: string | null; description: string | null }>;
		  }
		| {
				kind: 'brands';
				total: number;
				brands: Array<{
					pid: string;
					name: string;
					original: string | null;
					type: ProducerType;
					vnsA: number;
					vnsB: number;
					firstYearA: number | null;
					lastYearA: number | null;
					firstYearB: number | null;
					lastYearB: number | null;
				}>;
		  }
		| {
				kind: 'co_credits';
				total: number;
				vns: Array<{
					vid: string;
					title: string;
					original: string | null;
					year: number | null;
					rolesA: string[];
					rolesB: string[];
				}>;
		  }
		| {
				kind: 'listed_apart';
				total: number;
				sites: Array<{
					site: string;
					a: Array<{ value: string; url: string | null }>;
					b: Array<{ value: string; url: string | null }>;
				}>;
		  };

	type ProofPayload = BrandProofPayload | AliasProofPayload;

	const BRAND_PROOF_TYPES = new Set<EvidenceType>([
		'shared_staff',
		'containment',
		'shared_seiyuu',
		'shared_series',
		'co_release',
		'shared_link',
		'staff_flow',
		'explicit_2hop',
		'separate_owners'
	]);
	const ALIAS_PROOF_TYPES = new Set<EvidenceType>([
		'shared_character',
		'shared_link',
		'bio_xref',
		'shared_brands',
		'complementary_timeline',
		'name_overlap',
		'co_credit',
		'listed_apart'
	]);

	/**
	 * An inference shows its work (DESIGN §2.2 rule 5): tags in a row, and the
	 * selected tag's plain-English explanation + full clickable proof records directly below.
	 */
	interface Props {
		items: Evidence[];
		max?: number;
		/** The classifier's own itemised notes, shown verbatim under "Scoring notes". */
		notes?: string[];
		/** Context needed to fetch the full underlying proof when a chip is opened. */
		proof?: ProofContext;
		class?: string;
	}
	let { items, max, notes = [], proof, class: klass = '' }: Props = $props();

	const panelId = $props.id();
	let openType = $state<string | null>(null);
	let showAll = $state(false);
	let expandedProof = $state(false);
	let expandedCharVns = $state<Record<string, boolean>>({});
	let proofLoading = $state(false);
	let proofError = $state<string | null>(null);
	let proofData = $state<ProofPayload | null>(null);

	const shown = $derived(max && !showAll ? items.slice(0, max) : items);
	const hiddenCount = $derived(items.length - shown.length);
	const open = $derived(
		openType === '__notes' ? null : (items.find((e) => e.type === openType) ?? null)
	);

	function proofUrlFor(type: EvidenceType): string | null {
		if (!proof) return null;
		if (proof.kind === 'brand' && BRAND_PROOF_TYPES.has(type)) {
			return `/api/proof/brand-pair?a=${encodeURIComponent(proof.pidA)}&b=${encodeURIComponent(proof.pidB)}&type=${encodeURIComponent(type)}`;
		}
		if (proof.kind === 'alias' && ALIAS_PROOF_TYPES.has(type)) {
			return `/api/proof/alias-pair?a=${encodeURIComponent(proof.sidA)}&b=${encodeURIComponent(proof.sidB)}&type=${encodeURIComponent(type)}`;
		}
		return null;
	}

	async function toggle(type: string) {
		if (openType === type) {
			openType = null;
			return;
		}
		openType = type;
		expandedProof = false;
		proofData = null;
		proofError = null;
		if (type === '__notes') return;
		const url = proofUrlFor(type as EvidenceType);
		if (!url) return;
		proofLoading = true;
		try {
			const res = await fetchProof<ProofPayload>(url);
			if (openType === type) proofData = res;
		} catch {
			if (openType === type) proofError = 'Could not load underlying records.';
		} finally {
			if (openType === type) proofLoading = false;
		}
	}

	const PROOF_SLICE = 12;
</script>

{#if items.length === 0 && notes.length === 0}
	<p class="text-xs text-ink-3">No itemised evidence recorded for this inference.</p>
{:else}
	<div class={klass}>
		<ul class="flex flex-wrap items-center gap-1.5" aria-label="Evidence">
			{#each shown as ev (ev.type)}
				<li class="max-w-full">
					<EvidenceTag
						evidence={ev}
						open={openType === ev.type}
						controls={panelId}
						onclick={() => toggle(ev.type)}
					/>
				</li>
			{/each}
			{#if hiddenCount > 0}
				<li>
					<button type="button" class="btn-ghost min-h-8 px-1 text-xs md:min-h-6" onclick={() => (showAll = true)}>
						+{hiddenCount} more
					</button>
				</li>
			{/if}
			{#if notes.length > 0}
				<li>
					<button
						type="button"
						class="btn-ghost min-h-8 px-1 text-xs text-ink-2 md:min-h-6"
						aria-expanded={openType === '__notes'}
						aria-controls={panelId}
						onclick={() => toggle('__notes')}
					>
						Scoring notes ({notes.length})
					</button>
				</li>
			{/if}
		</ul>

		<div id={panelId} aria-live="polite">
			{#if open}
				<div class="mt-2 rounded-sm bg-surface-sunken px-3 py-2.5 text-xs text-ink-2">
					<p class="max-w-(--container-reading) text-ink">{open.detail}</p>

					{#if proofLoading}
						<p class="mt-2 text-2xs text-ink-3">Loading full proof…</p>
					{:else if proofError}
						<p class="mt-2 text-2xs text-danger">{proofError}</p>
					{:else if proofData}
						{#if proofData.kind === 'people'}
							{@const list = expandedProof ? proofData.people : proofData.people.slice(0, PROOF_SLICE)}
							<ul class="mt-2 divide-y divide-rule border-t border-rule">
								{#each list as p (p.sid)}
									<li class="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-1.5">
										<a class="link font-medium" href="/staff/{p.sid}">{shownName(p.name, p.original)}</a>
										<RolePills roles={[...new Set([...p.rolesA, ...p.rolesB])]} max={3} />
										<span class="tnum ml-auto inline-flex flex-wrap items-center gap-1 font-mono text-2xs text-ink-3">
											{#if proof && proof.kind === 'brand'}
												<span>{proof.nameA}:</span>
												<StaffVnsButton
													count={p.vnsA}
													label={plural(p.vnsA, 'VN')}
													title="{shownName(p.name, p.original)} at {proof.nameA}"
													endpoint="/api/proof/staff-vns?sid={encodeURIComponent(p.sid)}&pid={encodeURIComponent(proof.pidA)}"
													moreHref="/staff/{p.sid}#credits"
													class="text-2xs"
												/>
												<span>· {proof.nameB}:</span>
												<StaffVnsButton
													count={p.vnsB}
													label={plural(p.vnsB, 'VN')}
													title="{shownName(p.name, p.original)} at {proof.nameB}"
													endpoint="/api/proof/staff-vns?sid={encodeURIComponent(p.sid)}&pid={encodeURIComponent(proof.pidB)}"
													moreHref="/staff/{p.sid}#credits"
													class="text-2xs"
												/>
												<span>· {plural(p.brandCount, 'brand')}</span>
											{:else}
												{plural(p.brandCount, 'brand')} total
											{/if}
										</span>
									</li>
								{/each}
							</ul>
							{#if proofData.people.length > PROOF_SLICE}
								<button type="button" class="btn-ghost mt-1.5 text-2xs" onclick={() => (expandedProof = !expandedProof)}>
									{expandedProof ? 'Show fewer' : `Show all ${num(proofData.people.length)} people`}
								</button>
							{/if}

						{:else if proofData.kind === 'vn_relations'}
							{@const list = expandedProof ? proofData.pairs : proofData.pairs.slice(0, PROOF_SLICE)}
							{#if list.length === 0}
								<p class="mt-2 text-2xs text-ink-3">No official cross-brand VN relations found.</p>
							{:else}
								<ul class="mt-2 divide-y divide-rule border-t border-rule">
									{#each list as pair (pair.vidA + pair.vidB)}
										<li class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5">
											<a class="link font-medium" href="/vn/{pair.vidA}">{shownName(pair.titleA, pair.originalA)}</a>
											{#if pair.yearA}<span class="tnum font-mono text-2xs text-ink-3">({pair.yearA})</span>{/if}
											<span class="rounded-xs border border-rule-strong bg-surface px-1.5 py-0.5 text-2xs text-ink-2">
												{VN_RELATION_LABELS[pair.relation] ?? pair.relation}
											</span>
											<a class="link font-medium" href="/vn/{pair.vidB}">{shownName(pair.titleB, pair.originalB)}</a>
											{#if pair.yearB}<span class="tnum font-mono text-2xs text-ink-3">({pair.yearB})</span>{/if}
										</li>
									{/each}
								</ul>
								{#if proofData.pairs.length > PROOF_SLICE}
									<button type="button" class="btn-ghost mt-1.5 text-2xs" onclick={() => (expandedProof = !expandedProof)}>
										{expandedProof ? 'Show fewer' : `Show all ${num(proofData.pairs.length)} VN relations`}
									</button>
								{/if}
							{/if}

						{:else if proofData.kind === 'vns'}
							{@const list = expandedProof ? proofData.vns : proofData.vns.slice(0, PROOF_SLICE)}
							<ul class="mt-2 divide-y divide-rule border-t border-rule">
								{#each list as v (v.vid)}
									<li class="flex items-baseline gap-2 py-1.5">
										<span class="tnum w-[4ch] shrink-0 font-mono text-2xs text-ink-3">{v.year ?? '—'}</span>
										<a class="link font-medium" href="/vn/{v.vid}">{shownName(v.title, v.original)}</a>
									</li>
								{/each}
							</ul>
							{#if proofData.vns.length > PROOF_SLICE}
								<button type="button" class="btn-ghost mt-1.5 text-2xs" onclick={() => (expandedProof = !expandedProof)}>
									{expandedProof ? 'Show fewer' : `Show all ${num(proofData.vns.length)} visual novels`}
								</button>
							{/if}

						{:else if proofData.kind === 'extlinks'}
							<ul class="mt-2 divide-y divide-rule border-t border-rule">
								{#each proofData.links as l (l.site + l.value)}
									<li class="flex items-baseline gap-2 py-1.5">
										<span class="w-20 shrink-0 text-2xs text-ink-3">{l.site}</span>
										{#if l.url && /^https?:\/\//i.test(l.url)}
											<a class="link inline-flex items-center gap-0.5 font-mono text-2xs" href={l.url} target="_blank" rel="noopener noreferrer">
												{l.value}<ArrowUpRight size={10} />
											</a>
										{:else}
											<span class="font-mono text-2xs text-ink">{l.value}</span>
										{/if}
									</li>
								{/each}
							</ul>

						{:else if proofData.kind === 'moves'}
							{@const nameA = proof?.kind === 'brand' ? proof.nameA : 'Brand A'}
							{@const nameB = proof?.kind === 'brand' ? proof.nameB : 'Brand B'}
							<div class="mt-2 grid gap-3 border-t border-rule pt-2 md:grid-cols-2">
								{#if proofData.aToB.length > 0}
									{@const listA = expandedProof ? proofData.aToB : proofData.aToB.slice(0, PROOF_SLICE)}
									<div>
										<p class="mb-1 text-2xs font-medium text-ink-3">{nameA} → {nameB} ({proofData.aToB.length})</p>
										<ul class="divide-y divide-rule">
											{#each listA as m (m.sid)}
												{@const overlap = m.fromLastYear != null && m.toFirstYear != null && m.fromLastYear > m.toFirstYear}
												{@const spanFrom = yearSpan(m.fromFirstYear ?? m.fromLastYear, m.fromLastYear, true)}
												{@const spanTo = yearSpan(m.toFirstYear, m.toLastYear ?? m.toFirstYear, true)}
												<li class="flex items-center justify-between gap-2 py-1">
													<a class="link font-medium" href="/staff/{m.sid}">{shownName(m.name, m.original)}</a>
													<span
														class="tnum shrink-0 font-mono text-2xs text-ink-3"
														title={overlap
															? `Overlapping tenures: ${nameA} (${yearSpan(m.fromFirstYear ?? m.fromLastYear, m.fromLastYear)}) · ${nameB} (${yearSpan(m.toFirstYear, m.toLastYear ?? m.toFirstYear)})`
															: `Last credit at ${nameA} in ${m.fromLastYear ?? '?'}; first credit at ${nameB} in ${m.toFirstYear ?? '?'}`}
													>
														{#if overlap}
															{spanFrom} / {spanTo}
														{:else}
															{m.fromLastYear ?? '?'} → {m.toFirstYear ?? '?'}
														{/if}{#if m.aliasChanged} <span class="text-ink" title="Name changed">⇄ name</span>{/if}
													</span>
												</li>
											{/each}
										</ul>
									</div>
								{/if}
								{#if proofData.bToA.length > 0}
									{@const listB = expandedProof ? proofData.bToA : proofData.bToA.slice(0, PROOF_SLICE)}
									<div>
										<p class="mb-1 text-2xs font-medium text-ink-3">{nameB} → {nameA} ({proofData.bToA.length})</p>
										<ul class="divide-y divide-rule">
											{#each listB as m (m.sid)}
												{@const overlap = m.fromLastYear != null && m.toFirstYear != null && m.fromLastYear > m.toFirstYear}
												{@const spanFrom = yearSpan(m.fromFirstYear ?? m.fromLastYear, m.fromLastYear, true)}
												{@const spanTo = yearSpan(m.toFirstYear, m.toLastYear ?? m.toFirstYear, true)}
												<li class="flex items-center justify-between gap-2 py-1">
													<a class="link font-medium" href="/staff/{m.sid}">{shownName(m.name, m.original)}</a>
													<span
														class="tnum shrink-0 font-mono text-2xs text-ink-3"
														title={overlap
															? `Overlapping tenures: ${nameB} (${yearSpan(m.fromFirstYear ?? m.fromLastYear, m.fromLastYear)}) · ${nameA} (${yearSpan(m.toFirstYear, m.toLastYear ?? m.toFirstYear)})`
															: `Last credit at ${nameB} in ${m.fromLastYear ?? '?'}; first credit at ${nameA} in ${m.toFirstYear ?? '?'}`}
													>
														{#if overlap}
															{spanFrom} / {spanTo}
														{:else}
															{m.fromLastYear ?? '?'} → {m.toFirstYear ?? '?'}
														{/if}{#if m.aliasChanged} <span class="text-ink" title="Name changed">⇄ name</span>{/if}
													</span>
												</li>
											{/each}
										</ul>
									</div>
								{/if}
							</div>
							{#if proofData.aToB.length > PROOF_SLICE || proofData.bToA.length > PROOF_SLICE}
								<button type="button" class="btn-ghost mt-1.5 text-2xs" onclick={() => (expandedProof = !expandedProof)}>
									{expandedProof ? 'Show fewer' : `Show all ${num(proofData.total)} moves`}
								</button>
							{/if}

						{:else if proofData.kind === 'path' && proofData.path.length > 0}
							<ol class="mt-2 flex flex-wrap items-center gap-y-1.5 border-t border-rule pt-2">
								{#each proofData.path as node, i (node.id)}
									{#if i > 0 && node.relationFromPrev}
										{@const meta = EXPLICIT_META[node.relationFromPrev]}
										<li class="flex items-center" title="{meta.label}: {meta.meaning}">
											<span class="inline-block h-0.5 w-2.5" style="background: {KIND_COLOR[meta.kind]}"></span>
											<span class="rounded-xs border px-1 text-2xs font-medium text-ink" style="border-color: {KIND_COLOR[meta.kind]}">{meta.code}</span>
											<span class="inline-block h-0.5 w-2.5" style="background: {KIND_COLOR[meta.kind]}"></span>
										</li>
									{/if}
									<li>
										<a class="inline-flex h-6 items-center rounded-xs border border-rule-strong bg-surface px-2 text-xs text-ink no-underline hover:border-rule-hover" href="/producer/{node.id}">
											{shownName(node.name, node.original)}
										</a>
									</li>
								{/each}
							</ol>

						{:else if proofData.kind === 'owners'}
							<div class="mt-2 grid gap-2 border-t border-rule pt-2">
								{#each [proofData.chainA, proofData.chainB] as chain, ci (ci)}
									{#if chain.length > 0}
										<div class="flex flex-wrap items-center gap-1.5">
											{#each chain as node, i (node.id)}
												{#if i > 0}<span class="text-2xs text-ink-3">→ owned by →</span>{/if}
												<a class="link font-medium" href="/producer/{node.id}">{shownName(node.name, node.original)}</a>
											{/each}
										</div>
									{/if}
								{/each}
							</div>

						{:else if proofData.kind === 'characters'}
							{@const list = expandedProof ? proofData.characters : proofData.characters.slice(0, PROOF_SLICE)}
							{@const nameA = proof?.kind === 'alias' ? proof.nameA : 'Record A'}
							{@const nameB = proof?.kind === 'alias' ? proof.nameB : 'Record B'}
							<ul class="mt-2 divide-y divide-rule border-t border-rule">
								{#each list as ch (ch.cid)}
									{@const expA = !!expandedCharVns[`a|${ch.cid}`]}
									{@const expB = !!expandedCharVns[`b|${ch.cid}`]}
									{@const listA = expA ? ch.vnsA : ch.vnsA.slice(0, 4)}
									{@const listB = expB ? ch.vnsB : ch.vnsB.slice(0, 4)}
									<li class="py-1.5">
										<div class="flex flex-wrap items-center gap-2">
											<a class="link inline-flex items-center gap-0.5 font-medium" href={vndbHref(ch.cid)} target="_blank" rel="noopener noreferrer">
												{shownName(ch.name, ch.original)}<ArrowUpRight size={10} />
											</a>
											{#if ch.sameVn}
												<span class="rounded-xs border border-rule-strong bg-surface px-1.5 text-2xs text-ink-3">same VN</span>
											{/if}
										</div>
										<p class="mt-0.5 text-2xs text-ink-3">
											<span class="text-ink-2">{nameA}:</span>
											{#each listA as v, i (v.vid)}{i > 0 ? ', ' : ' '}<a class="link-quiet" href="/vn/{v.vid}">{shownName(v.title, v.original)}</a>{#if v.year} ({v.year}){/if}{/each}{#if ch.vnsA.length > 4} <button type="button" class="link font-mono text-2xs" onclick={() => (expandedCharVns[`a|${ch.cid}`] = !expA)}>{expA ? 'less' : `+${ch.vnsA.length - 4}`}</button>{/if}
											<span class="mx-1.5">·</span>
											<span class="text-ink-2">{nameB}:</span>
											{#each listB as v, i (v.vid)}{i > 0 ? ', ' : ' '}<a class="link-quiet" href="/vn/{v.vid}">{shownName(v.title, v.original)}</a>{#if v.year} ({v.year}){/if}{/each}{#if ch.vnsB.length > 4} <button type="button" class="link font-mono text-2xs" onclick={() => (expandedCharVns[`b|${ch.cid}`] = !expB)}>{expB ? 'less' : `+${ch.vnsB.length - 4}`}</button>{/if}
										</p>
									</li>
								{/each}
							</ul>
							{#if proofData.characters.length > PROOF_SLICE}
								<button type="button" class="btn-ghost mt-1.5 text-2xs" onclick={() => (expandedProof = !expandedProof)}>
									{expandedProof ? 'Show fewer' : `Show all ${num(proofData.characters.length)} shared characters`}
								</button>
							{/if}

						{:else if proofData.kind === 'bios'}
							<div class="mt-2 grid gap-2 border-t border-rule pt-2">
								{#each proofData.bios as b (b.sid)}
									{#if b.description}
										<div class="rounded-xs border border-rule bg-surface px-2.5 py-1.5">
											<p class="mb-0.5 font-medium text-ink">
												<a class="link" href="/staff/{b.sid}">{shownName(b.name, b.original)}</a>
											</p>
											<p class="line-clamp-4 whitespace-pre-line text-2xs text-ink-2">{b.description}</p>
										</div>
									{/if}
								{/each}
							</div>

						{:else if proofData.kind === 'brands'}
							{@const list = expandedProof ? proofData.brands : proofData.brands.slice(0, PROOF_SLICE)}
							{@const nameA = proof?.kind === 'alias' ? proof.nameA : 'Record A'}
							{@const nameB = proof?.kind === 'alias' ? proof.nameB : 'Record B'}
							<ul class="mt-2 divide-y divide-rule border-t border-rule">
								{#each list as b (b.pid)}
									<li class="flex flex-wrap items-center justify-between gap-2 py-1.5">
										<span class="inline-flex items-center gap-1.5">
											<ProducerShape type={b.type} size={9} />
											<a class="link font-medium" href="/producer/{b.pid}">{shownName(b.name, b.original)}</a>
										</span>
										<span class="tnum inline-flex flex-wrap items-center gap-1 font-mono text-2xs text-ink-3">
											{#if proof && proof.kind === 'alias'}
												<span>{nameA}:</span>
												<StaffVnsButton
													count={b.vnsA}
													label={plural(b.vnsA, 'VN')}
													title="{nameA} at {shownName(b.name, b.original)}"
													endpoint="/api/proof/staff-vns?sid={encodeURIComponent(proof.sidA)}&pid={encodeURIComponent(b.pid)}"
													moreHref="/staff/{proof.sidA}#credits"
													class="text-2xs"
												/>
												<span>(<YearSpan from={b.firstYearA} to={b.lastYearA} tight />) · {nameB}:</span>
												<StaffVnsButton
													count={b.vnsB}
													label={plural(b.vnsB, 'VN')}
													title="{nameB} at {shownName(b.name, b.original)}"
													endpoint="/api/proof/staff-vns?sid={encodeURIComponent(proof.sidB)}&pid={encodeURIComponent(b.pid)}"
													moreHref="/staff/{proof.sidB}#credits"
													class="text-2xs"
												/>
												<span>(<YearSpan from={b.firstYearB} to={b.lastYearB} tight />)</span>
											{:else}
												{nameA}: {plural(b.vnsA, 'VN')} · {nameB}: {plural(b.vnsB, 'VN')}
											{/if}
										</span>
									</li>
								{/each}
							</ul>
							{#if proofData.brands.length > PROOF_SLICE}
								<button type="button" class="btn-ghost mt-1.5 text-2xs" onclick={() => (expandedProof = !expandedProof)}>
									{expandedProof ? 'Show fewer' : `Show all ${num(proofData.brands.length)} shared studios`}
								</button>
							{/if}

						{:else if proofData.kind === 'co_credits'}
							{@const list = expandedProof ? proofData.vns : proofData.vns.slice(0, PROOF_SLICE)}
							{@const nameA = proof?.kind === 'alias' ? proof.nameA : 'Record A'}
							{@const nameB = proof?.kind === 'alias' ? proof.nameB : 'Record B'}
							<ul class="mt-2 divide-y divide-rule border-t border-rule">
								{#each list as v (v.vid)}
									<li class="flex flex-wrap items-center justify-between gap-2 py-1.5">
										<span class="flex items-baseline gap-2">
											<span class="tnum font-mono text-2xs text-ink-3">{v.year ?? '—'}</span>
											<a class="link font-medium" href="/vn/{v.vid}">{shownName(v.title, v.original)}</a>
										</span>
										<span class="flex flex-wrap items-center gap-2 text-2xs text-ink-3">
											<span class="inline-flex items-center gap-1">{nameA}: <RolePills roles={v.rolesA} max={2} /></span>
											<span class="inline-flex items-center gap-1">{nameB}: <RolePills roles={v.rolesB} max={2} /></span>
										</span>
									</li>
								{/each}
							</ul>
							{#if proofData.vns.length > PROOF_SLICE}
								<button type="button" class="btn-ghost mt-1.5 text-2xs" onclick={() => (expandedProof = !expandedProof)}>
									{expandedProof ? 'Show fewer' : `Show all ${num(proofData.vns.length)} co-credited VNs`}
								</button>
							{/if}

						{:else if proofData.kind === 'listed_apart'}
							{@const nameA = proof?.kind === 'alias' ? proof.nameA : 'Record A'}
							{@const nameB = proof?.kind === 'alias' ? proof.nameB : 'Record B'}
							<ul class="mt-2 divide-y divide-rule border-t border-rule">
								{#each proofData.sites as s (s.site)}
									<li class="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5">
										<span class="w-20 shrink-0 font-medium text-ink">{s.site}</span>
										<span>
											<span class="text-ink-3">{nameA}:</span>
											{#each s.a as x, i (x.value)}{i > 0 ? ', ' : ' '}{#if x.url}<a class="link font-mono text-2xs" href={x.url} target="_blank" rel="noopener noreferrer">{x.value}<ArrowUpRight size={9} class="inline" /></a>{:else}<span class="font-mono text-2xs">{x.value}</span>{/if}{/each}
										</span>
										<span>
											<span class="text-ink-3">{nameB}:</span>
											{#each s.b as x, i (x.value)}{i > 0 ? ', ' : ' '}{#if x.url}<a class="link font-mono text-2xs" href={x.url} target="_blank" rel="noopener noreferrer">{x.value}<ArrowUpRight size={9} class="inline" /></a>{:else}<span class="font-mono text-2xs">{x.value}</span>{/if}{/each}
										</span>
									</li>
								{/each}
							</ul>
						{/if}
					{:else if open.items && open.items.length > 0}
						<ul class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
							{#each open.items as item (item.label + (item.href ?? ''))}
								<li>
									{#if item.href}
										<a
											class="link inline-flex items-center gap-0.5"
											href={item.href}
											target={item.external ? '_blank' : undefined}
											rel={item.external ? 'noopener noreferrer' : undefined}
										>
											{item.label}
											{#if item.external}<ArrowUpRight size={10} />{/if}
										</a>
									{:else}
										{item.label}
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{:else if openType === '__notes'}
				<div class="mt-2 rounded-sm bg-surface-sunken px-3 py-2 text-xs text-ink-2">
					<p class="mb-1 font-medium text-ink-3">How this was scored</p>
					<ul class="list-disc space-y-0.5 pl-4">
						{#each notes as note, i (i)}
							<li>{note}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</div>
{/if}
