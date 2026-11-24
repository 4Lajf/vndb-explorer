<script lang="ts">
	import ProofPopover from '../feedback/ProofPopover.svelte';
	import NamePair from '../identity/NamePair.svelte';
	import AliasChip from '../identity/AliasChip.svelte';
	import RolePills from './RolePills.svelte';
	import RatingTag from '../identity/RatingTag.svelte';
	import { fetchProof } from '#lib/proof-cache.ts';
	import { shownName } from '#lib/stores/prefs.svelte.ts';
	import { matchesText, num, plural } from '#lib/util.ts';

	export interface VnProofRow {
		vid: string;
		title: string;
		original: string | null;
		year: number | null;
		roles?: string[];
		penNames?: string[];
		hasEro?: boolean;
		hasAllAges?: boolean;
		pid?: string | null;
		producerName?: string | null;
		producerOriginal?: string | null;
	}

	/**
	 * Universal clickable VN count trigger: renders either a bare number (`28`)
	 * or a custom label (`28 VNs`) and opens a searchable popover listing every
	 * exact visual novel behind that count.
	 */
	interface Props {
		count: number;
		/** Optional custom trigger text (e.g. `28 VNs`). Defaults to formatted `count`. */
		label?: string;
		title: string;
		subtitle?: string;
		/** Remote endpoint to fetch when opened (e.g. `/api/proof/producer-vns?pid=...` or `/api/proof/staff-vns?...`). */
		endpoint?: string;
		/** Preloaded rows (zero fetch) when already in memory on the page. */
		localVns?: VnProofRow[];
		moreHref?: string;
		moreLabel?: string;
		onMoreClick?: () => void;
		align?: 'left' | 'right';
		class?: string;
	}
	let {
		count,
		label,
		title,
		subtitle,
		endpoint,
		localVns,
		moreHref,
		moreLabel = 'View full list →',
		onMoreClick,
		align = 'right',
		class: klass = ''
	}: Props = $props();

	let loading = $state(false);
	let error = $state<string | null>(null);
	let fetched = $state<VnProofRow[] | null>(null);
	let fetchedEndpoint = $state<string | null>(null);
	let query = $state('');
	let showAll = $state(false);

	const rows = $derived(localVns ?? (fetchedEndpoint === (endpoint ?? null) ? fetched : null) ?? []);
	const filteredRows = $derived(
		query.trim()
			? rows.filter((v) => matchesText(query, v.title, v.original, v.producerName, v.year ? String(v.year) : null))
			: rows
	);
	const visibleRows = $derived(showAll ? filteredRows : filteredRows.slice(0, 20));
	const triggerText = $derived(label ?? num(count));

	async function load() {
		showAll = false;
		query = '';
		if (localVns || !endpoint || loading) return;
		if (fetched && fetchedEndpoint === endpoint) return;
		loading = true;
		error = null;
		const target = endpoint;
		try {
			const res = await fetchProof<{ vns?: VnProofRow[] }>(target);
			fetched = res.vns ?? [];
			fetchedEndpoint = target;
		} catch {
			error = 'Could not load visual novels.';
		} finally {
			loading = false;
		}
	}
</script>

{#if count <= 0}
	<span class="text-ink-4 {klass}">{label ?? '0'}</span>
{:else}
	<ProofPopover {title} {subtitle} {align} widthClass="w-[min(27rem,calc(100vw-1.5rem))]" onopen={load}>
		{#snippet trigger({ open, toggle })}
			<button
				type="button"
				class="tnum inline-flex items-center rounded-xs px-1 py-0.5 text-ink underline decoration-dotted decoration-rule-hover underline-offset-3 transition-colors duration-[120ms] hover:bg-surface-hover hover:decoration-ink-2 {label
					? ''
					: 'font-mono'} {open ? 'bg-surface-hover' : ''} {klass}"
				aria-expanded={open}
				title="Click to see which {plural(count, 'VN')}"
				onclick={toggle}
			>
				{triggerText}
			</button>
		{/snippet}
		{#snippet children({ close })}
			{#if loading}
				<p class="py-2 text-ink-3">Loading visual novels…</p>
			{:else if error}
				<p class="py-2 text-danger">{error}</p>
			{:else if rows.length > 0}
				{#if rows.length > 8}
					<input
						type="search"
						bind:value={query}
						placeholder="Filter {num(rows.length)} VNs…"
						class="mb-2 h-7 w-full rounded-sm border border-rule-strong bg-control px-2 text-xs text-ink placeholder:text-ink-3 focus:border-focus focus:outline-none"
					/>
				{/if}
				{#if visibleRows.length === 0}
					<p class="py-2 text-ink-3">No matching visual novels.</p>
				{:else}
					<ul class="divide-y divide-rule">
						{#each visibleRows as v (v.vid)}
							<li class="py-1.5">
								<div class="flex items-baseline gap-2">
									<span class="tnum w-[4ch] shrink-0 font-mono text-2xs text-ink-3">{v.year ?? '—'}</span>
									<span class="min-w-0 flex-1 font-medium text-ink">
										<a class="link" href="/vn/{v.vid}" onclick={close}>
											<NamePair name={v.title} original={v.original} variant="inline" />
										</a>
									</span>
									{#if v.hasEro !== undefined || v.hasAllAges !== undefined}
										<RatingTag hasEro={!!v.hasEro} hasAllAges={!!v.hasAllAges} />
									{/if}
								</div>
								{#if (v.roles && v.roles.length > 0) || (v.penNames && v.penNames.length > 0) || v.producerName}
									<div class="mt-1 flex flex-wrap items-center gap-1.5 pl-[calc(4ch+0.5rem)]">
										{#if v.roles && v.roles.length > 0}
											<RolePills roles={v.roles} max={4} />
										{/if}
										{#if v.penNames && v.penNames.length > 0}
											<AliasChip aliases={v.penNames} bare />
										{/if}
										{#if v.producerName && v.pid}
											<a class="link-quiet text-2xs text-ink-3" href="/producer/{v.pid}" onclick={close}>
												{shownName(v.producerName, v.producerOriginal)}
											</a>
										{/if}
									</div>
								{/if}
							</li>
						{/each}
					</ul>
					{#if filteredRows.length > 20 && !showAll}
						<button
							type="button"
							class="btn-ghost mt-1.5 text-2xs"
							onclick={() => (showAll = true)}
						>
							Show all {num(filteredRows.length)} visual novels
						</button>
					{/if}
				{/if}
				{#if onMoreClick}
					<p class="mt-2 border-t border-rule pt-1.5 text-2xs">
						<button
							type="button"
							class="link"
							onclick={() => {
								close();
								onMoreClick?.();
							}}
						>
							{moreLabel}
						</button>
					</p>
				{:else if moreHref}
					<p class="mt-2 border-t border-rule pt-1.5 text-2xs">
						<a class="link" href={moreHref} onclick={close}>{moreLabel}</a>
					</p>
				{/if}
			{:else}
				<p class="py-2 text-ink-3">No visual novels recorded.</p>
			{/if}
		{/snippet}
	</ProofPopover>
{/if}
