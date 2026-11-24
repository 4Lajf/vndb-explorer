<script lang="ts" generics="T extends string">
	import EpistemicGlyph from '../epistemic/EpistemicGlyph.svelte';
	import RoleMark from '../people/RoleMark.svelte';
	import type { Register } from '#lib/relations.ts';

	/**
	 * Text tabs on a rule-strong baseline (DESIGN §5.10). Tabs that hold inferred
	 * content carry the hollow diamond; confirmed tabs carry the check. The
	 * baseline is an inset shadow, so the selected underline sits on it without a
	 * negative margin and the strip never scrolls vertically.
	 */
	interface Tab {
		value: T;
		label: string;
		count?: number | string;
		register?: Register;
		shape?: 'square' | 'circle';
		title?: string;
	}
	interface Props {
		tabs: Tab[];
		value: T;
		label: string;
		/** id prefix: tab `${idBase}-tab-${value}` controls panel `${idBase}-panel-${value}`. */
		idBase: string;
		onchange?: (value: T) => void;
		/** Drop the baseline rule (when the tabs sit inside a toolbar that has its own). */
		bare?: boolean;
		class?: string;
	}
	let {
		tabs,
		value = $bindable(),
		label,
		idBase,
		onchange,
		bare = false,
		class: klass = ''
	}: Props = $props();

	function pick(v: T) {
		if (v === value) return;
		value = v;
		onchange?.(v);
	}

	function onkeydown(e: KeyboardEvent) {
		const i = tabs.findIndex((t) => t.value === value);
		let next = i;
		if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
		else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = tabs.length - 1;
		else return;
		e.preventDefault();
		pick(tabs[next].value);
		const list = e.currentTarget as HTMLElement;
		queueMicrotask(() => list.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
	}
</script>

<div
	role="tablist"
	aria-label={label}
	tabindex="-1"
	class="tab-strip flex items-end gap-5 {bare
		? ''
		: 'shadow-[inset_0_-1px_0_var(--rule)]'} {klass}"
	{onkeydown}
>
	{#each tabs as tab (tab.value)}
		{@const selected = tab.value === value}
		<button
			type="button"
			role="tab"
			id="{idBase}-tab-{tab.value}"
			aria-selected={selected}
			aria-controls="{idBase}-panel-{tab.value}"
			tabindex={selected ? 0 : -1}
			title={tab.title}
			class="inline-flex h-9 shrink-0 items-center gap-1.5 border-b-2 text-sm whitespace-nowrap transition-colors duration-[120ms] {selected
				? 'border-ink font-medium text-ink'
				: 'border-transparent text-ink-3 hover:text-ink'}"
			onclick={() => pick(tab.value)}
		>
			{#if tab.register}
				<EpistemicGlyph kind={tab.register} size={11} />
			{:else if tab.shape}
				<RoleMark role={tab.shape === 'circle' ? 'seiyuu' : 'dev'} size={8} />
			{/if}
			{tab.label}
			{#if tab.count !== undefined}
				<span class="tnum font-mono text-2xs text-ink-3">{tab.count}</span>
			{/if}
		</button>
	{/each}
</div>
