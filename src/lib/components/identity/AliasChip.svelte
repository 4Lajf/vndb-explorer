<script lang="ts">
	import { shownName } from '#lib/stores/prefs.svelte.ts';

	export type AliasEntry = string | { name: string; original?: string | null };

	/**
	 * The alias-used pattern: `as [ alias ]` (or bare inside a "Credited as" column).
	 * When multiple aliases are supplied via `aliases`, clicking `+N` expands every
	 * alias inline so nothing is trapped behind a dead counter or hover tooltip.
	 */
	interface Props {
		alias?: string;
		/** Original-script form of the primary chip alias, when it differs. */
		original?: string | null;
		/** Full list of aliases used in this place. When length > 1, `+N` expands inline on click. */
		aliases?: readonly AliasEntry[];
		/** Fallback count when only a preview alias is available (no full list). */
		more?: number;
		/** Optional link target when `more > 0` without a full `aliases` list. */
		moreHref?: string;
		/** Hide the leading `as` tag (e.g. inside a "Credited as" column). */
		bare?: boolean;
		/** `≠` marker: the name differs from the one used on the other side. */
		differs?: boolean;
		title?: string;
	}
	let {
		alias = '',
		original = null,
		aliases,
		more = 0,
		moreHref,
		bare = false,
		differs = false,
		title
	}: Props = $props();

	let expanded = $state(false);

	const normalized = $derived.by(() => {
		if (aliases && aliases.length > 0) {
			return aliases.map((entry) => {
				const name = typeof entry === 'string' ? entry : entry.name;
				const orig = typeof entry === 'string' ? null : (entry.original ?? null);
				const shown = shownName(name, orig);
				const other = orig && orig !== name ? (shown === name ? orig : name) : null;
				return { name, orig, shown, other };
			});
		}
		if (!alias) return [];
		const shown = shownName(alias, original);
		const other = original && original !== alias ? (shown === alias ? original : alias) : null;
		return [{ name: alias, orig: original, shown, other }];
	});

	const hasExpandableList = $derived(normalized.length > 1);
	const extraCount = $derived(hasExpandableList ? normalized.length - 1 : more);
	const visibleItems = $derived(expanded ? normalized : normalized.slice(0, 1));
	const allNamesSummary = $derived(normalized.map((a) => a.shown).join(', '));
	const rootTitle = $derived(
		title ??
			(normalized.length === 1 && normalized[0].other
				? `${normalized[0].shown} · ${normalized[0].other}`
				: undefined)
	);
</script>

{#if normalized.length > 0}
	<span
		class="inline-flex max-w-full min-w-0 flex-wrap items-center gap-1 align-middle"
		title={rootTitle}
	>
		{#if !bare}
			<span class="text-2xs text-ink-3">as</span>
		{/if}
		{#each visibleItems as item, idx (item.name + '|' + (item.orig ?? '') + '|' + idx)}
			<span
				class="inline-flex h-[18px] max-w-[20ch] min-w-0 items-center rounded-xs border border-solid border-rule-strong bg-control px-1.5 text-xs text-ink"
				title={item.other ? `${item.shown} · ${item.other}` : undefined}
			>
				<span class="truncate" lang={item.shown !== item.name ? 'ja' : undefined}>{item.shown}</span>
			</span>
		{/each}
		{#if hasExpandableList}
			<button
				type="button"
				class="tnum inline-flex h-[18px] shrink-0 items-center rounded-xs border border-rule-strong bg-surface-sunken px-1.5 font-mono text-2xs text-ink-2 transition-colors duration-[120ms] hover:border-rule-hover hover:bg-control-hover hover:text-ink"
				aria-expanded={expanded}
				aria-label={expanded
					? 'Show fewer aliases'
					: `Show ${extraCount} more ${extraCount === 1 ? 'alias' : 'aliases'}: ${allNamesSummary}`}
				title={expanded ? 'Show fewer' : 'Show all aliases'}
				onclick={(e) => {
					e.stopPropagation();
					expanded = !expanded;
				}}
			>
				{expanded ? 'less' : `+${extraCount}`}
			</button>
		{:else if more > 0}
			{#if moreHref}
				<a
					href={moreHref}
					class="tnum inline-flex h-[18px] shrink-0 items-center rounded-xs border border-rule-strong bg-surface-sunken px-1.5 font-mono text-2xs text-ink-2 no-underline transition-colors duration-[120ms] hover:border-rule-hover hover:bg-control-hover hover:text-ink"
					title="See all {more + 1} names in Compare"
					onclick={(e) => e.stopPropagation()}
				>+{more}</a>
			{:else}
				<span class="tnum font-mono text-2xs text-ink-3">+{more}</span>
			{/if}
		{/if}
		{#if differs}
			<span
				class="text-xs font-semibold text-ink"
				role="img"
				aria-label="different name from the other brand"
				title="Different name at the other brand">≠</span
			>
		{/if}
	</span>
{/if}
