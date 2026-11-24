<script lang="ts">
	import { onMount } from 'svelte';
	import EpistemicGlyph from '../epistemic/EpistemicGlyph.svelte';

	/** Sticky in-page section nav with scroll-spy; counts in mono (DESIGN §8.2). */
	interface Section {
		id: string;
		label: string;
		count?: number | string;
		/** Inferred count, shown after the glyph of its kind. */
		inferred?: number;
		/** `inferred` (◇?) for brand relations, `alias-potential` (≟) for alias candidates. */
		inferredKind?: 'inferred' | 'alias-potential';
	}
	interface Props {
		sections: Section[];
		label?: string;
	}
	let { sections, label = 'Sections' }: Props = $props();

	let active = $state('');

	onMount(() => {
		// Watch each heading's whole <section>, not the heading alone: a tall chart
		// keeps its tab lit for as long as any of it is under the sticky bar.
		const idByEl = new Map<Element, string>();
		const order: string[] = [];
		for (const s of sections) {
			const el = document.getElementById(s.id);
			if (!el) continue;
			const region = el.closest('section') ?? el;
			idByEl.set(idByEl.has(region) ? el : region, s.id);
			order.push(s.id);
		}
		if (!order.length) return;
		active = order[0];
		const inBand = new Set<string>();
		const observer = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					const id = idByEl.get(e.target);
					if (!id) continue;
					if (e.isIntersecting) inBand.add(id);
					else inBand.delete(id);
				}
				// The last section to have reached the reading band is the current one.
				const current = order.findLast((id) => inBand.has(id));
				if (current) active = current;
			},
			{ rootMargin: '-104px 0px -60% 0px', threshold: 0 }
		);
		for (const el of idByEl.keys()) observer.observe(el);
		return () => observer.disconnect();
	});
</script>

<!-- The baseline rule is an inset shadow, so the active tab's underline sits on
     it without a negative margin: nothing overflows, nothing scrolls vertically. -->
<nav
	aria-label={label}
	class="no-print sticky top-12 z-20 -mx-4 bg-canvas/85 px-4 shadow-[inset_0_-1px_0_var(--rule)] backdrop-blur-md md:-mx-6 md:px-6 lg:-mx-8 lg:px-8"
>
	<ul class="tab-strip flex h-10 items-stretch gap-5">
		{#each sections as s (s.id)}
			<li class="flex shrink-0">
				<a
					href="#{s.id}"
					aria-current={active === s.id ? 'location' : undefined}
					class="inline-flex items-center gap-1.5 border-b-2 text-sm whitespace-nowrap no-underline transition-colors duration-[120ms] {active ===
					s.id
						? 'border-ink font-medium text-ink'
						: 'border-transparent text-ink-3 hover:text-ink'}"
				>
					{s.label}
					{#if s.count !== undefined}
						<span class="tnum font-mono text-2xs text-ink-3">{s.count}</span>
					{/if}
					{#if s.inferred}
						<span
							class="tnum inline-flex items-center gap-0.5 font-mono text-2xs text-inferred"
							title={s.inferredKind === 'alias-potential'
								? `${s.inferred} potential, not confirmed`
								: `${s.inferred} inferred`}
						>
							<EpistemicGlyph kind={s.inferredKind ?? 'inferred'} size={10} />{s.inferred}
						</span>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
</nav>
