<script lang="ts">
	import EpistemicGlyph from './EpistemicGlyph.svelte';

	/**
	 * Compact indicator for rosters and credits (DESIGN §5.4): a dashed hollow
	 * chip with `≟` and a count. It never names the candidate as an alias; it
	 * links to the person's own alias panel, where each candidate is a separate
	 * `staff.id` framed as a candidate.
	 *
	 * The linked chip is 16px tall; a pseudo-element extends its hit area to 32px
	 * for touch. Its border stays dashed in every state: solid is the confirmed
	 * register, so hover darkens the dashes instead.
	 */
	interface Props {
		count: number;
		/** The staff record whose candidates this flag points at. */
		sid?: string;
		/** Plain marker without a link (inside an element that is already a link). */
		plain?: boolean;
		class?: string;
	}
	let { count, sid, plain = false, class: klass = '' }: Props = $props();

	const label = $derived(
		`${count} unconfirmed alias ${count === 1 ? 'lead' : 'leads'}`
	);
	const cls =
		'hatch-inferred inline-flex h-4 shrink-0 items-center gap-0.5 rounded-xs border border-dashed border-inferred/70 bg-inferred-tint px-1 align-middle font-mono text-2xs font-medium text-inferred';
</script>

{#if count > 0}
	{#if sid && !plain}
		<a
			href="/staff/{sid}#aliases"
			class="{cls} relative no-underline before:absolute before:-inset-x-1 before:-inset-y-2 hover:border-inferred {klass}"
			title={label}
			aria-label={label}
		>
			<EpistemicGlyph kind="alias-potential" size={10} inherit />
			{#if count > 1}<span class="tnum">{count}</span>{/if}
		</a>
	{:else}
		<span class="{cls} {klass}" title={label} role="img" aria-label={label}>
			<EpistemicGlyph kind="alias-potential" size={10} inherit />
			{#if count > 1}<span class="tnum">{count}</span>{/if}
		</span>
	{/if}
{/if}
