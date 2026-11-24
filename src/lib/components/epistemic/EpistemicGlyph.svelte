<script lang="ts">
	/**
	 * The four register glyphs (DESIGN §2.1). Inline SVG, never font characters:
	 *  - confirmed: filled check (solid square with a tick)
	 *  - inferred: hollow diamond with a `?`
	 *  - alias-confirmed: `=` (is the same person)
	 *  - alias-potential: `≟` (may be the same person)
	 */
	interface Props {
		kind: 'confirmed' | 'inferred' | 'alias-confirmed' | 'alias-potential';
		size?: number;
		/** Inherit the surrounding text colour instead of the register hue. */
		inherit?: boolean;
		label?: string;
		class?: string;
	}
	let { kind, size = 12, inherit = false, label, class: klass = '' }: Props = $props();

	const tone = $derived(
		inherit
			? ''
			: kind === 'confirmed' || kind === 'alias-confirmed'
				? 'text-confirmed'
				: 'text-inferred'
	);
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 12 12"
	class="inline-block shrink-0 {tone} {klass}"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	{#if kind === 'confirmed'}
		<rect x="1" y="1" width="10" height="10" rx="1.5" fill="currentColor" />
		<path
			d="M3.5 6.2 5.3 8 8.6 4.2"
			fill="none"
			stroke="var(--surface)"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	{:else if kind === 'inferred'}
		<path d="M6 0.9 11.1 6 6 11.1 0.9 6Z" fill="none" stroke="currentColor" stroke-width="1.1" />
		<path
			d="M4.8 4.9a1.25 1.25 0 1 1 1.9 1.05c-.45.3-.7.55-.7 1.05"
			fill="none"
			stroke="currentColor"
			stroke-width="1"
			stroke-linecap="round"
		/>
		<circle cx="6" cy="8.5" r="0.6" fill="currentColor" />
	{:else if kind === 'alias-confirmed'}
		<path
			d="M2.5 4.5h7M2.5 7.5h7"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
		/>
	{:else}
		<path
			d="M2.5 7.4h7M2.5 10h7"
			fill="none"
			stroke="currentColor"
			stroke-width="1.4"
			stroke-linecap="round"
		/>
		<path
			d="M4.9 2.3a1.15 1.15 0 1 1 1.75 0.95c-.4.26-.65.45-.65.85"
			fill="none"
			stroke="currentColor"
			stroke-width="0.95"
			stroke-linecap="round"
		/>
		<circle cx="6" cy="5.4" r="0.55" fill="currentColor" />
	{/if}
</svg>
