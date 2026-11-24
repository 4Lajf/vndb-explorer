<script module lang="ts">
	export interface PickedProducer {
		id: string;
		name: string;
		original?: string | null;
		type?: string;
		subtitle?: string;
	}
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import NamePair from '../identity/NamePair.svelte';
	import ProducerShape from '../identity/ProducerShape.svelte';
	import SlotTag from './SlotTag.svelte';
	import { LiveSearch } from '#lib/stores/search.svelte.ts';

	/** Scoped live search (brands only) for one Compare slot. */
	interface Props {
		side?: 'A' | 'B';
		value: PickedProducer | null;
		/** Hidden form field name, for a plain GET form. */
		name?: string;
		placeholder?: string;
		onpick?: (p: PickedProducer) => void;
		onclear?: () => void;
		class?: string;
	}
	let {
		side,
		value = $bindable(),
		name,
		placeholder = 'Pick a brand…',
		onpick,
		onclear,
		class: klass = ''
	}: Props = $props();

	const uidBase = $props.id();
	const listId = `${uidBase}-list`;
	const search = new LiveSearch('producer', 12);
	let input = $state<HTMLInputElement | null>(null);
	let open = $state(false);
	let active = $state(0);

	const rows = $derived(search.results);
	const hasQuery = $derived(search.query.trim().length > 0);
	// Rows on screen while a fetch is pending answer an older query.
	const settled = $derived(!search.loading && search.settledQuery === search.query);

	function pick(i: number) {
		const r = rows[i];
		if (!r) return;
		const picked: PickedProducer = {
			id: r.id,
			name: r.name,
			original: r.original,
			type: r.badge,
			subtitle: r.subtitle
		};
		value = picked;
		open = false;
		search.clear();
		onpick?.(picked);
	}

	function clear() {
		value = null;
		onclear?.();
		queueMicrotask(() => input?.focus());
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			open = true;
			if (rows.length) active = (active + 1) % rows.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (rows.length) active = (active - 1 + rows.length) % rows.length;
		} else if (e.key === 'Enter') {
			// Enter waits for the results of what was typed: it never picks a row left
			// over from the previous query. Inside a form it must not submit either.
			if (open && hasQuery) e.preventDefault();
			if (open && settled && rows[active]) pick(active);
		} else if (e.key === 'Escape' && open && hasQuery) {
			// The list is showing: Escape closes it and stops there, so a popover or
			// drawer around the picker stays open until a second Escape.
			e.preventDefault();
			e.stopPropagation();
			open = false;
		}
	}

	function onFocusOut(e: FocusEvent) {
		const next = e.relatedTarget as Node | null;
		if (!next || !(e.currentTarget as HTMLElement).contains(next)) open = false;
	}

	onDestroy(() => search.destroy());
</script>

<div class="relative min-w-0 {klass}" onfocusout={onFocusOut}>
	{#if name}<input type="hidden" {name} value={value?.id ?? ''} />{/if}

	{#if value}
		<div class="flex h-9 items-center gap-2 rounded-sm border border-rule-strong bg-control pr-0.5 pl-2.5">
			{#if side}<SlotTag {side} />{/if}
			{#if value.type}<ProducerShape type={value.type} size={10} />{/if}
			<span class="min-w-0 flex-1 text-sm">
				<NamePair name={value.name} original={value.original} variant="inline" />
			</span>
			<button
				type="button"
				class="inline-flex size-8 shrink-0 items-center justify-center rounded-xs text-ink-3 hover:bg-control-hover hover:text-ink md:size-7"
				aria-label="Clear brand {side ?? ''}"
				onclick={clear}
			>
				<X size={14} />
			</button>
		</div>
	{:else}
		<div class="relative">
			{#if side}
				<SlotTag {side} class="absolute top-1/2 left-2.5 -translate-y-1/2" />
			{/if}
			<input
				bind:this={input}
				type="search"
				role="combobox"
				aria-label={side ? `Brand ${side}` : 'Brand'}
				aria-autocomplete="list"
				aria-expanded={open && hasQuery}
				aria-controls={listId}
				aria-activedescendant={open && rows[active] ? `${uidBase}-opt-${active}` : undefined}
				autocomplete="off"
				spellcheck="false"
				{placeholder}
				value={search.query}
				oninput={(e) => {
					search.set(e.currentTarget.value);
					open = true;
					active = 0;
				}}
				onkeydown={onKeydown}
				onfocus={() => (open = true)}
				class="h-9 w-full rounded-sm border border-rule-strong bg-control pr-3 text-sm text-ink transition-colors duration-[120ms] hover:border-rule-hover {side
					? 'pl-9'
					: 'pl-3'}"
			/>
			{#if search.loading}
				<div class="refetch-bar absolute inset-x-0 -bottom-px" aria-hidden="true"></div>
			{/if}
		</div>

		{#if open && hasQuery}
			<div
				class="absolute inset-x-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-lg border border-rule-strong bg-surface-raised shadow-pop"
			>
				<div id={listId} role="listbox" aria-label="Brands" class="py-1">
					{#each rows as r, i (r.id)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div
							id="{uidBase}-opt-{i}"
							role="option"
							tabindex="-1"
							aria-selected={i === active}
							class="mx-1 flex h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-sm {i === active
								? 'bg-surface-hover'
								: ''}"
							onmousedown={(e) => e.preventDefault()}
							onmousemove={() => (active = i)}
							onclick={() => pick(i)}
						>
							<ProducerShape type={r.badge} size={10} />
							<span class="min-w-0 flex-1"
								><NamePair name={r.name} original={r.original} variant="inline" /></span
							>
							<span class="hidden shrink-0 text-xs text-ink-3 sm:block">{r.subtitle}</span>
						</div>
					{/each}
				</div>
				{#if rows.length === 0}
					<p class="px-3 py-2.5 text-sm text-ink-3" role="status">
						{#if search.failed}
							Search is unavailable right now.
						{:else if search.loading}
							Searching…
						{:else}
							No brand matches “{search.query.trim()}”.
						{/if}
					</p>
				{/if}
			</div>
		{/if}
	{/if}
</div>
