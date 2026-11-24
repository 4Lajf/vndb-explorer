<script lang="ts">
	/** A = filled tag, B = outlined tag; the same everywhere on Compare (DESIGN §6.4). */
	interface Props {
		side: 'A' | 'B';
		class?: string;
	}
	let { side, class: klass = '' }: Props = $props();
</script>

<span
	class="inline-flex size-4 shrink-0 items-center justify-center rounded-xs font-mono text-2xs font-semibold {side ===
	'A'
		? 'bg-surface-inverse text-ink-inverse'
		: 'border border-ink-2 text-ink'} {klass}"
	aria-label="Brand {side}">{side}</span
>
