<script lang="ts">
	import EpistemicGlyph from './EpistemicGlyph.svelte';
	import type { Register } from '#lib/relations.ts';

	/**
	 * The smallest statement of register (DESIGN §5.1), and the one mark that
	 * says it in a word: solid slate-blue `VNDB`, dashed hatched sand `Inferred`.
	 * It sits beside a title that stays ink. Hovering it says what the register
	 * means, so the badge needs no entry in the Key.
	 */
	interface Props {
		register: Register;
		/** Override the short label (`VNDB` / `Inferred`). */
		label?: string;
		/** `alias-potential` swaps the hollow diamond for `≟` on a block of alias candidates. */
		glyph?: 'confirmed' | 'inferred' | 'alias-potential';
		class?: string;
	}
	let { register, label, glyph, class: klass = '' }: Props = $props();
</script>

{#if register === 'confirmed'}
	<span
		class="caption inline-flex h-5 shrink-0 items-center gap-1 rounded-xs border border-solid border-confirmed/50 bg-confirmed-tint px-1.5 whitespace-nowrap text-confirmed {klass}"
		title="Stated in VNDB"
	>
		<EpistemicGlyph kind="confirmed" size={10} />
		{label ?? 'VNDB'}
	</span>
{:else}
	<span
		class="caption hatch-inferred inline-flex h-5 shrink-0 items-center gap-1 rounded-xs border border-dashed border-inferred/70 bg-inferred-tint px-1.5 whitespace-nowrap text-inferred {klass}"
		title={glyph === 'alias-potential'
			? 'Unconfirmed · separate VNDB records'
			: 'Inferred · not in VNDB'}
	>
		<EpistemicGlyph kind={glyph === 'alias-potential' ? 'alias-potential' : 'inferred'} size={10} />
		{label ?? 'Inferred'}
	</span>
{/if}
