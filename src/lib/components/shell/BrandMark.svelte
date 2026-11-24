<script lang="ts">
	/**
	 * The mark (DESIGN §1.4): a monochrome monogram of what the tool does. One
	 * studio at the top of a small family tree, with two lines down from it: a
	 * solid one to a filled node (stated in VNDB) and a dashed one to a hollow
	 * node (inferred). Drawn in ink on the page's own ground, so it needs no
	 * colour of its own and never reads as data.
	 */
	interface Props {
		size?: number;
		wordmark?: boolean;
	}
	let { size = 22, wordmark = true }: Props = $props();
</script>

<span class="inline-flex items-center gap-2">
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		class="shrink-0 text-ink"
		aria-hidden="true"
	>
		<rect width="24" height="24" rx="7" fill="currentColor" />
		<g fill="none" stroke="var(--canvas)" stroke-width="1.6" stroke-linecap="round">
			<path d="M10.7 9.1 8.2 14.3" />
			<path d="M13.3 9.1 15.8 14.3" stroke-dasharray="1.4 2.1" />
			<circle cx="17" cy="16.8" r="2.1" />
		</g>
		<circle cx="12" cy="6.9" r="2.7" fill="var(--canvas)" />
		<circle cx="7" cy="16.8" r="2.7" fill="var(--canvas)" />
	</svg>
	{#if wordmark}
		<span class="text-base font-semibold tracking-tight whitespace-nowrap text-ink">VNDB Explorer</span>
	{/if}
</span>
