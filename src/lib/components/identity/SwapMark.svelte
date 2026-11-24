<script lang="ts">
	/**
	 * Name-switch mark: two opposed arrows. A person kept working but changed the
	 * name they are credited under. Diamonds are reserved for the inferred
	 * register and for individual producers, so a switch never borrows one.
	 */
	interface Props {
		size?: number;
		class?: string;
	}
	let { size = 10, class: klass = '' }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 10 10" class="inline-block shrink-0 {klass}" aria-hidden="true">
	<path
		d="M1.5 3.2H8.5M6.6 1.3 8.5 3.2M8.5 6.8H1.5M3.4 8.7 1.5 6.8"
		fill="none"
		stroke="currentColor"
		stroke-width="1.2"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
</svg>
