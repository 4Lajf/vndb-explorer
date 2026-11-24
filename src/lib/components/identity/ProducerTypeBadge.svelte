<script lang="ts">
	import type { ProducerType } from '#lib/types.ts';
	import { PRODUCER_TYPE_SHORT, PRODUCER_TYPE_WORD } from '#lib/util.ts';

	/** Company · Group · Individual in plain words, plus a lower-case language code. */
	interface Props {
		type: ProducerType | string;
		lang?: string | null;
		class?: string;
	}
	let { type, lang = null, class: klass = '' }: Props = $props();
</script>

<span class="inline-flex shrink-0 items-center gap-1.5 {klass}">
	<span
		class="inline-flex h-[18px] items-center rounded-xs border border-rule-strong px-1.5 text-2xs font-medium text-ink-2"
		title={PRODUCER_TYPE_WORD[type] ?? type}
	>
		{PRODUCER_TYPE_SHORT[type] ?? type}
	</span>
	{#if lang}
		<span class="font-mono text-2xs text-ink-3 lowercase" title="Primary language">{lang}</span>
	{/if}
</span>
