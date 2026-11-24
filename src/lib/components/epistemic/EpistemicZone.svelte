<script lang="ts">
	import type { Snippet } from 'svelte';
	import EpistemicBadge from './EpistemicBadge.svelte';
	import type { Register } from '#lib/relations.ts';

	/**
	 * The edged, headed container every confirmed or inferred block sits in.
	 * Confirmed and inferred content never share ground (DESIGN §2.2 rule 3).
	 * The register is carried by the `VNDB` / `Inferred` badge, the edge (solid
	 * or dashed) and the header fill; the title itself is ink and the note
	 * secondary ink.
	 */
	interface Props {
		register: Register;
		title: string;
		note?: string;
		count?: number | string;
		/**
		 * Keep the heading for assistive tech only. For a zone that sits directly
		 * under a tab already carrying the same words and count: the badge, the
		 * dashed border and the note stay, the duplicate heading goes.
		 */
		headless?: boolean;
		/**
		 * Glyph inside the badge, when the register's own is too broad: a zone of
		 * potential aliases carries `≟`, not the generic inferred diamond.
		 */
		glyph?: 'confirmed' | 'inferred' | 'alias-potential';
		id?: string;
		class?: string;
		actions?: Snippet;
		children: Snippet;
	}
	let {
		register,
		title,
		note,
		count,
		headless = false,
		glyph,
		id,
		class: klass = '',
		actions,
		children
	}: Props = $props();
</script>

<section
	{id}
	class="sheet overflow-hidden {register === 'confirmed' ? 'zone-confirmed' : 'zone-inferred'} {klass}"
	aria-label="{register === 'confirmed' ? 'Confirmed in VNDB' : 'Inferred, not confirmed'}: {title}"
>
	<header
		class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b px-4 py-2.5 {register ===
		'inferred'
			? 'border-dashed border-inferred-edge bg-inferred-tint'
			: 'border-solid border-confirmed-edge bg-confirmed-tint'}"
	>
		<div class="min-w-0">
			<!-- Badge first, then the ink title: the register is read before the words. -->
			<div class="flex gap-x-2.5 gap-y-1 {headless ? 'items-start' : 'flex-wrap items-center'}">
				<EpistemicBadge {register} {glyph} />
				<h3 class={headless ? 'sr-only' : 'caption flex min-w-0 items-center gap-1.5 text-ink'}>
					<span>{title}</span>
					{#if count !== undefined}
						<!-- Secondary ink, not tertiary: on a hatch line of the inferred
						     header tertiary ink falls under 4.5:1. -->
						<span class="tnum font-mono text-ink-2">{count}</span>
					{/if}
				</h3>
				{#if note && headless}
					<p class="min-w-0 pt-0.5 text-xs text-ink-2 {register === 'inferred' ? 'italic' : ''}">{note}</p>
				{/if}
			</div>
			{#if note && !headless}
				<p class="mt-1 text-xs text-ink-2 {register === 'inferred' ? 'italic' : ''}">{note}</p>
			{/if}
		</div>
		{#if actions}
			<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>
		{/if}
	</header>
	<div>
		{@render children()}
	</div>
</section>
