<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Empty states (DESIGN §7.5):
	 *  - expected: one quiet line, no chrome ("No explicit relations in VNDB.")
	 *  - inferred: says why and what would change it, with loosening actions
	 *  - sparse:   neutral hatched notice, distinct from "looked and found nothing"
	 */
	interface Props {
		kind?: 'expected' | 'inferred' | 'sparse';
		message: string;
		class?: string;
		actions?: Snippet;
	}
	let { kind = 'expected', message, class: klass = '', actions }: Props = $props();
</script>

{#if kind === 'sparse'}
	<div class="rounded-md border border-dashed border-rule-strong bg-surface-sunken/40 px-4 py-3 text-sm text-ink-2 {klass}">
		<p>{message}</p>
		{#if actions}<div class="mt-2 flex flex-wrap gap-3">{@render actions()}</div>{/if}
	</div>
{:else}
	<div class="px-4 py-3 text-sm text-ink-3 {klass}">
		<p>{message}</p>
		{#if actions}<div class="mt-2 flex flex-wrap gap-3">{@render actions()}</div>{/if}
	</div>
{/if}
