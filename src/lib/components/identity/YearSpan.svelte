<script lang="ts">
	import { yearSpan } from '#lib/util.ts';

	/** Mono, tabular year range with an en dash (DESIGN §5.8). */
	interface Props {
		from: number | null | undefined;
		to?: number | null | undefined;
		tight?: boolean;
		class?: string;
	}
	let { from, to = null, tight = false, class: klass = '' }: Props = $props();
</script>

<span class="tnum font-mono text-xs whitespace-nowrap text-ink-2 {klass}"
	>{yearSpan(from, to, tight)}</span
>
