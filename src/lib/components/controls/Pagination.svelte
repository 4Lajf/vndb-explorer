<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { num } from '#lib/util.ts';

	/** URL-driven pagination: every page is a plain link, so a finding can be shared. */
	interface Props {
		page: number;
		pageSize: number;
		total: number;
		/** Build the href for a page number. */
		href: (page: number) => string;
		class?: string;
	}
	let { page, pageSize, total, href, class: klass = '' }: Props = $props();

	const pages = $derived(Math.max(1, Math.ceil(total / pageSize)));
	const from = $derived(total === 0 ? 0 : (page - 1) * pageSize + 1);
	const to = $derived(Math.min(total, page * pageSize));
	const windowed = $derived.by(() => {
		const set = new Set<number>([1, pages, page - 1, page, page + 1]);
		const list = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
		const out: Array<number | 'gap'> = [];
		let prev = 0;
		for (const p of list) {
			if (p - prev > 1) out.push('gap');
			out.push(p);
			prev = p;
		}
		return out;
	});
	const cell =
		'tnum inline-flex h-7 min-w-7 items-center justify-center rounded-sm px-1.5 font-mono text-xs no-underline';
</script>

<nav class="flex flex-wrap items-center justify-between gap-3 {klass}" aria-label="Pagination">
	<p class="tnum font-mono text-xs text-ink-3">
		{num(from)}–{num(to)} of {num(total)}
	</p>
	{#if pages > 1}
		<ul class="flex items-center gap-1">
			<li>
				{#if page > 1}
					<a class="{cell} text-ink hover:bg-surface-hover" href={href(page - 1)} aria-label="Previous page"
						><ChevronLeft size={14} /></a
					>
				{:else}
					<span class="{cell} text-ink-4" aria-hidden="true"><ChevronLeft size={14} /></span>
				{/if}
			</li>
			{#each windowed as p, i (i)}
				<li>
					{#if p === 'gap'}
						<span class="{cell} text-ink-3" aria-hidden="true">…</span>
					{:else if p === page}
						<span class="{cell} bg-selected font-medium text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)]" aria-current="page">{p}</span>
					{:else}
						<a class="{cell} text-ink-2 hover:bg-surface-hover hover:text-ink" href={href(p)}>{p}</a>
					{/if}
				</li>
			{/each}
			<li>
				{#if page < pages}
					<a class="{cell} text-ink hover:bg-surface-hover" href={href(page + 1)} aria-label="Next page"
						><ChevronRight size={14} /></a
					>
				{:else}
					<span class="{cell} text-ink-4" aria-hidden="true"><ChevronRight size={14} /></span>
				{/if}
			</li>
		</ul>
	{/if}
</nav>
