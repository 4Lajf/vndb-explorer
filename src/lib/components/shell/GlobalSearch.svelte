<script lang="ts">
	import { onDestroy } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import Search from '@lucide/svelte/icons/search';
	import NamePair from '../identity/NamePair.svelte';
	import ProducerShape from '../identity/ProducerShape.svelte';
	import RoleMark from '../people/RoleMark.svelte';
	import PotentialAliasFlag from '../epistemic/PotentialAliasFlag.svelte';
	import { LiveSearch, parseScope, parseVersus, resultHref } from '#lib/stores/search.svelte.ts';
	import type { SearchResult } from '#lib/types.ts';

	/**
	 * Unified search combobox (DESIGN §7.2). Grouped results; the leading mark
	 * doubles as the type key: producer-type shape for brands, square for core
	 * staff, circle for seiyuu, rectangle for visual novels.
	 */
	interface Props {
		size?: 'hero' | 'bar';
		/** Bind Ctrl/⌘+K to this instance. */
		hotkey?: boolean;
		class?: string;
	}
	let { size = 'bar', hotkey = true, class: klass = '' }: Props = $props();

	const uidBase = $props.id();
	const listId = `${uidBase}-list`;
	const hintId = `${uidBase}-hint`;
	const search = new LiveSearch('all', 30);

	let input = $state<HTMLInputElement | null>(null);
	let open = $state(false);
	let active = $state(0);

	interface Row {
		key: string;
		href: string;
		result: SearchResult | null;
		versus?: { a: string; b: string };
		scopePrompt?: { prefix: 'p' | 's' | 'v'; label: string; count: number };
	}
	interface Group {
		label: string;
		rows: Row[];
	}

	const versus = $derived(parseVersus(search.query));
	const scope = $derived(parseScope(search.query));

	const groups = $derived.by<Group[]>(() => {
		const out: Group[] = [];
		if (versus) {
			out.push({
				label: 'Compare',
				rows: [
					{
						key: 'versus',
						href: `/compare?a=${versus.a}&b=${versus.b}`,
						result: null,
						versus
					}
				]
			});
			return out;
		}
		const scoped = scope.kind !== 'all';
		const per = scoped ? 24 : 6;
		const take = (label: string, list: SearchResult[], prefix: 'p' | 's' | 'v') => {
			if (!list.length) return;
			const slice: Row[] = list
				.slice(0, per)
				.map((r) => ({ key: `${r.kind}:${r.id}`, href: resultHref(r), result: r }));
			if (!scoped && list.length > per) {
				slice.push({
					key: `more:${prefix}:${label}`,
					href: '',
					result: null,
					scopePrompt: { prefix, label: label.toLowerCase(), count: list.length }
				});
			}
			out.push({ label, rows: slice });
		};
		const rs = search.results;
		take(
			'Brands',
			rs.filter((r) => r.kind === 'producer'),
			'p'
		);
		take(
			'Staff',
			rs.filter((r) => r.kind === 'staff' && r.badge !== 'seiyuu'),
			's'
		);
		take(
			'Seiyuu',
			rs.filter((r) => r.kind === 'staff' && r.badge === 'seiyuu'),
			's'
		);
		take(
			'Visual novels',
			rs.filter((r) => r.kind === 'vn'),
			'v'
		);
		return out;
	});
	const rows = $derived(groups.flatMap((g) => g.rows));
	const hasQuery = $derived(scope.text.length > 0 || versus !== null);
	const settled = $derived(!search.loading && search.settledQuery === search.query);

	$effect(() => {
		// Keep the active row in range as results change.
		if (active >= rows.length) active = Math.max(0, rows.length - 1);
	});

	function onInput(e: Event) {
		search.set((e.currentTarget as HTMLInputElement).value);
		open = true;
		active = 0;
	}

	function go(row: Row) {
		if (row.scopePrompt) {
			search.set(`${row.scopePrompt.prefix}:${scope.text}`);
			open = true;
			active = 0;
			input?.focus();
			return;
		}
		open = false;
		search.clear();
		input?.blur();
		void goto(row.href);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			open = true;
			if (rows.length) active = (active + 1) % rows.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (rows.length) active = (active - 1 + rows.length) % rows.length;
		} else if (e.key === 'Home' && open && rows.length) {
			e.preventDefault();
			active = 0;
		} else if (e.key === 'End' && open && rows.length) {
			e.preventDefault();
			active = rows.length - 1;
		} else if (e.key === 'Enter') {
			const row = rows[active];
			// Rows still on screen while a fetch is pending answer an older query:
			// Enter waits for the one that was typed. A versus row needs no fetch.
			if (open && row && (settled || versus !== null)) {
				e.preventDefault();
				go(row);
			}
		} else if (e.key === 'Escape') {
			if (open) {
				e.preventDefault();
				open = false;
			} else if (search.query) {
				search.clear();
			}
		}
	}

	function onFocusOut(e: FocusEvent) {
		const next = e.relatedTarget as Node | null;
		if (!next || !(e.currentTarget as HTMLElement).contains(next)) open = false;
	}

	function useExample(q: string) {
		search.set(q);
		open = true;
		active = 0;
		input?.focus();
	}

	$effect(() => {
		if (!hotkey) return;
		const onGlobalKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				input?.focus();
				input?.select();
				open = true;
			}
		};
		window.addEventListener('keydown', onGlobalKey);
		return () => window.removeEventListener('keydown', onGlobalKey);
	});
	onDestroy(() => search.destroy());

	$effect(() => {
		// Scroll the active option into view inside the panel.
		if (!open) return;
		const row = rows[active];
		if (row) document.getElementById(`${uidBase}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
	});

	/** Examples under the hero box: the query, and what it does in plain words. */
	const EXAMPLES = [
		{
			q: 'Key',
			hint: 'a brand name',
			title: 'Search brands, staff, seiyuu and visual novels'
		},
		{ q: 's:maeda', hint: 'staff only', title: 'Prefix s: filters to staff and seiyuu' },
		{
			q: 'v:clannad',
			hint: 'visual novels only',
			title: 'Prefix v: filters to visual novels'
		}
	];

	/** The guide shown on focus, before anything is typed: each shortcut and an example to fill in. */
	const SHORTCUTS = [
		{ code: 'p:', text: 'brands and producers only', example: 'p:key', aside: 'e.g. p:key' },
		{ code: 's:', text: 'staff and seiyuu only', example: 's:maeda', aside: 'e.g. s:maeda' },
		{ code: 'v:', text: 'visual novels only', example: 'v:clannad', aside: 'e.g. v:clannad' }
	];

	const PLACEHOLDER = 'Search brands, staff, seiyuu, VNs';
	// The wide hero box has room to say that prefixes exist; the bar stays clean.
	const HERO_PLACEHOLDER = `${PLACEHOLDER}, or prefix p: brands · s: staff · v: VNs`;
	// Below `md` the hero box is too narrow for the long form, which would clip
	// mid-word. Assumed wide on the server: the hero is a desktop-first surface.
	const wide = new MediaQuery('min-width: 768px', true);
</script>

<div class="relative {klass}" onfocusout={onFocusOut}>
	<div class="relative">
		<Search
			size={16}
			class="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-3 {size === 'hero' ? 'left-3.5' : 'left-3'}"
		/>
		<input
			bind:this={input}
			type="search"
			role="combobox"
			aria-label="Search brands, staff, seiyuu, aliases and visual novels"
			aria-autocomplete="list"
			aria-expanded={open && hasQuery}
			aria-controls={listId}
			aria-describedby={hintId}
			aria-activedescendant={open && rows[active] ? `${uidBase}-opt-${active}` : undefined}
			autocomplete="off"
			spellcheck="false"
			placeholder={size === 'hero' && wide.current ? HERO_PLACEHOLDER : PLACEHOLDER}
			value={search.query}
			oninput={onInput}
			onkeydown={onKeydown}
			onfocus={() => (open = true)}
			onclick={() => (open = true)}
			class="w-full border border-rule-strong bg-control pr-3 text-ellipsis text-ink {hotkey
				? 'sm:pr-16'
				: ''} transition-colors duration-[120ms] hover:border-rule-hover {size ===
			'hero'
				? 'h-12 rounded-md bg-surface pl-10 text-md'
				: 'h-9 rounded-sm pl-9 text-sm'}"
		/>
		<!-- The shortcuts for a screen reader: the visible guide below is mouse-only. -->
		<p id={hintId} class="sr-only">
			Shortcuts: start with p: for brands only, s: for staff and seiyuu only, v: for visual novels
			only.
		</p>
		{#if hotkey}
			<kbd
				class="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-xs border border-rule bg-surface-sunken px-1.5 py-0.5 text-2xs text-ink-3 sm:block"
				>Ctrl K</kbd
			>
		{/if}
		{#if search.loading}
			<div class="refetch-bar absolute inset-x-0 -bottom-px" aria-hidden="true"></div>
		{/if}
	</div>

	{#if open && hasQuery}
		<div
			class="absolute inset-x-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-rule-strong bg-surface-raised shadow-pop"
		>
			<div id={listId} role="listbox" aria-label="Search results">
				{#each groups as group (group.label)}
					<div role="group" aria-label={group.label}>
						<p class="px-3 pt-2.5 pb-1 text-xs text-ink-3" aria-hidden="true">{group.label}</p>
						{#each group.rows as row (row.key)}
							{@const index = rows.indexOf(row)}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div
								id="{uidBase}-opt-{index}"
								role="option"
								tabindex="-1"
								aria-selected={index === active}
								class="mx-1 flex h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-sm {index === active
									? 'bg-surface-hover'
									: ''}"
								onmousedown={(e) => e.preventDefault()}
								onmousemove={() => (active = index)}
								onclick={() => go(row)}
							>
								{#if row.versus}
									<span class="font-mono text-xs text-ink-2">A</span>
									<span class="tnum font-mono text-sm">{row.versus.a}</span>
									<span class="text-ink-3">vs</span>
									<span class="font-mono text-xs text-ink-2">B</span>
									<span class="tnum font-mono text-sm">{row.versus.b}</span>
									<span class="ml-auto text-xs text-ink-3">Open Compare</span>
								{:else if row.scopePrompt}
									<span class="text-xs text-ink-2">
										Show more {row.scopePrompt.label} with
										<kbd class="ml-1 rounded-xs border border-rule bg-surface-sunken px-1 py-px text-2xs text-ink">{row.scopePrompt.prefix}:{scope.text}</kbd>
									</span>
									<span class="tnum ml-auto font-mono text-2xs text-ink-3">{row.scopePrompt.count} loaded</span>
								{:else if row.result}
									{@const r = row.result}
									<span class="flex w-3 shrink-0 justify-center">
										{#if r.kind === 'producer'}
											<ProducerShape type={r.badge} size={10} />
										{:else if r.kind === 'staff'}
											<RoleMark role={r.badge === 'seiyuu' ? 'seiyuu' : 'dev'} size={9} />
										{:else}
											<svg width="11" height="8" viewBox="0 0 11 8" aria-hidden="true"
												><rect x="0.75" y="0.75" width="9.5" height="6.5" rx="1" fill="none" stroke="var(--ink-2)" stroke-width="1.5" /></svg
											>
										{/if}
									</span>
									<span class="min-w-0 flex-1">
										<NamePair name={r.name} original={r.original} variant="inline" />
									</span>
									{#if r.badge === 'dual'}
										<span class="shrink-0 text-xs text-ink-3" title="Development and voice credits">Dual</span>
									{/if}
									{#if r.potentialAliasCount}
										<PotentialAliasFlag count={r.potentialAliasCount} plain />
									{/if}
									<span class="hidden shrink-0 truncate text-xs text-ink-3 sm:block sm:max-w-[40%]"
										>{r.subtitle}</span
									>
								{/if}
							</div>
						{/each}
					</div>
				{/each}
			</div>

			{#if rows.length === 0}
				<div class="px-3 py-3 text-sm text-ink-3" role="status">
					{#if search.failed}
						<span class="text-danger">Search is unavailable right now.</span> Try again in a moment.
					{:else if !settled}
						Searching…
					{:else}
						No match for “{scope.text}”.
					{/if}
				</div>
			{/if}

			{#if scope.kind !== 'all' && search.results.length > 24}
				<p class="border-t border-rule px-3 py-1.5 text-2xs text-ink-3">
					Showing top 24 matches — type more characters to narrow.
				</p>
			{/if}

			<div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule px-3 py-2 text-2xs text-ink-3">
				<span aria-hidden="true">↑↓ move</span>
				<span aria-hidden="true">Enter open</span>
				<span aria-hidden="true">Esc close</span>
				<span class="ml-auto flex items-center gap-x-2 font-mono">
					{#each [
						{ prefix: 'p', label: 'p: brands', kind: 'producer' },
						{ prefix: 's', label: 's: staff', kind: 'staff' },
						{ prefix: 'v', label: 'v: VNs', kind: 'vn' }
					] as sc (sc.prefix)}
						<button
							type="button"
							tabindex="-1"
							class="rounded-xs px-1 py-0.5 transition-colors hover:bg-surface-hover hover:text-ink {scope.kind === sc.kind ? 'bg-surface-sunken text-ink' : ''}"
							onmousedown={(e) => e.preventDefault()}
							onclick={() => useExample(`${sc.prefix}:${scope.text}`)}
						>
							{sc.label}
						</button>
					{/each}
				</span>
			</div>
		</div>
	{/if}

	{#if open && !hasQuery}
		<!-- Nothing typed yet: the shortcuts, so the box explains itself on focus.
		     Not a listbox: these are examples to fill in, not results, and the
		     combobox stays collapsed. Like the result rows they are mouse targets
		     that keep focus in the input; Esc closes the panel from there. -->
		<div
			class="absolute inset-x-0 top-full z-50 mt-1 rounded-lg border border-rule-strong bg-surface-raised shadow-pop"
			role="group"
			aria-label="Search shortcuts"
		>
			<p class="px-3 pt-2.5 pb-1 text-xs text-ink-3">Search shortcuts</p>
			<ul class="px-1">
				{#each SHORTCUTS as s (s.code)}
					<li>
						<button
							type="button"
							tabindex="-1"
							class="flex min-h-9 w-full items-center gap-2.5 rounded-sm px-2 py-1 text-left text-sm hover:bg-surface-hover"
							title="Fill in “{s.example}”"
							onmousedown={(e) => e.preventDefault()}
							onclick={() => useExample(s.example)}
						>
							<span class="w-[5.75rem] shrink-0">
								<kbd class="rounded-xs border border-rule bg-surface-sunken px-1 py-px font-mono text-2xs text-ink">{s.code}</kbd>
							</span>
							<span class="min-w-0 flex-1 text-ink-2">{s.text}</span>
							<span class="hidden shrink-0 font-mono text-xs text-ink-3 sm:block">{s.aside}</span>
						</button>
					</li>
				{/each}
			</ul>
			<div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 border-t border-rule px-3 py-2 text-2xs text-ink-3" aria-hidden="true">
				<span>Type to search</span><span>Select a row to fill it in</span><span>Esc close</span>
			</div>
		</div>
	{/if}

	{#if size === 'hero'}
		<!-- Each example carries what it does, so `s:maeda` reads before it is tried. -->
		<p class="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-ink-3">
			<span>Try:</span>
			{#each EXAMPLES as ex (ex.q)}
				<span class="inline-flex items-baseline gap-1.5">
					<button type="button" class="link font-mono text-xs" title={ex.title} onclick={() => useExample(ex.q)}>{ex.q}</button>
					<span class="text-xs">{ex.hint}</span>
				</span>
			{/each}
		</p>
	{/if}
</div>
