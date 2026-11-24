<script lang="ts" generics="T extends string">
	import RoleMark from '../people/RoleMark.svelte';

	/**
	 * A tonal track with a raised thumb for the selected item (DESIGN §5.10). On a
	 * narrow screen the group scrolls sideways instead of clipping its last option.
	 */
	interface Option {
		value: T;
		label: string;
		count?: number | string;
		/** Shape glyph: squares are dev credits, circles are voice credits. */
		shape?: 'square' | 'circle';
		title?: string;
	}
	interface Props {
		options: Option[];
		value: T;
		label: string;
		size?: 'sm' | 'md';
		onchange?: (value: T) => void;
		class?: string;
	}
	let { options, value = $bindable(), label, size = 'md', onchange, class: klass = '' }: Props = $props();

	function pick(v: T) {
		if (v === value) return;
		value = v;
		onchange?.(v);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault();
		const i = options.findIndex((o) => o.value === value);
		const next = options[(i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
		pick(next.value);
		const group = e.currentTarget as HTMLElement;
		queueMicrotask(() => group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
	}
</script>

<div
	role="radiogroup"
	aria-label={label}
	tabindex="-1"
	class="tab-strip inline-flex max-w-full gap-0.5 rounded-sm border border-rule bg-surface-sunken p-0.5 {klass}"
	{onkeydown}
>
	{#each options as opt (opt.value)}
		{@const selected = opt.value === value}
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			tabindex={selected ? 0 : -1}
			title={opt.title}
			class="inline-flex shrink-0 items-center gap-1.5 rounded-xs whitespace-nowrap transition-colors duration-[120ms] {size ===
			'sm'
				? 'min-h-8 px-2 text-xs md:min-h-6'
				: 'h-8 px-3 text-sm md:h-7'} {selected
				? 'bg-selected font-medium text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)]'
				: 'text-ink-3 hover:text-ink'}"
			onclick={() => pick(opt.value)}
		>
			{#if opt.shape}
				<!-- Selected: solid, in the thumb's own text colour (full contrast in both themes). -->
				<RoleMark role={opt.shape === 'circle' ? 'seiyuu' : 'dev'} size={8} variant={selected ? 'filled' : 'auto'} inherit={selected} />
			{/if}
			{opt.label}
			{#if opt.count !== undefined}
				<span class="tnum font-mono text-2xs {selected ? 'text-ink-2' : 'text-ink-3'}">{opt.count}</span>
			{/if}
		</button>
	{/each}
</div>
