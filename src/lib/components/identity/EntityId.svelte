<script lang="ts">
	/** VNDB id as a mono suffix (`p42`, `s1`, `v17`): visibly machine-exact. */
	interface Props {
		id: string;
		class?: string;
	}
	let { id, class: klass = '' }: Props = $props();

	const KIND: Record<string, string> = {
		p: 'VNDB producer ID',
		s: 'VNDB staff ID',
		v: 'VNDB visual novel ID'
	};
	// The prefix says what the record is; an id of any other shape gets no tooltip.
	const title = $derived(/^[psv]\d+$/i.test(id) ? KIND[id[0].toLowerCase()] : undefined);
</script>

<span class="tnum shrink-0 font-mono text-2xs text-ink-3 {klass}" {title}>{id}</span>
